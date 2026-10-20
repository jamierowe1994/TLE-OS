import "server-only";
import { randomBytes } from "node:crypto";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import { bookScope } from "@/lib/scope";
import { certsKeyFor, held, managedBookFor } from "@/lib/managed-book-cache";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { listVault, VAULT_LABEL } from "@/lib/vault";
import { addrOf, isRoomAddress, parseAddress, sameHome } from "@/lib/address-parse";
import { houseByListing, housesIn, MANAGED_READERS, roomLabel } from "@/lib/houses";
import { sittingLets } from "@/lib/tenant-logins";
import { docTypeLabel, OTHER } from "@/lib/doc-types";
import { FIELDS } from "@/lib/property-facts";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { londonToday } from "@/lib/london-clock";
import { normaliseEmail, type OsUser } from "@/lib/users";
import { payPropTenantRows, personKey, ukPhone } from "@/lib/business/payprop-tenant-contacts";
import { rentKey } from "@/lib/business/payprop-portfolio";
import { record } from "@/lib/audit";
import type { ComplianceBook } from "@/lib/rex-compliance";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * ONE PLACE PER HOME, AND SEND IT TO THE TENANTS (Josel Banagua, 20 Oct 2026).
 *
 * Two tickets from the clean sweep: "can we add a tab or option to send
 * compliance and documents to tenants on TLE OS", and "is there a way for
 * the old tenancy emails to be displayed in the system as sometimes I need
 * to search the referencing form just to get their email addresses".
 *
 * The home's page (/portfolio/<listing>) already holds the people, the
 * certificates and the documents added on the OS. This adds the three things
 * it lacked:
 *
 *   recordFiles     the clean sweep's papers (documents/property-<os id>/...),
 *                   which only the clean sweep screen showed. Office only, the
 *                   same rule as lib/r2-access: landlord ID, references and
 *                   right to rent live there.
 *   pastTenants     who lived there before, with their email and mobile, from
 *                   PayProp's own tenant records (every tenancy it has run,
 *                   Inactive ones included) and the OS's tenancy archive.
 *   sendToTenants   pick documents, pick tenants, see the email, press Send.
 *
 * ── What may go to a tenant ──────────────────────────────────────────────
 *
 * Only what a tenant is owed about the home: its certificates, the tenancy
 * agreement, the deposit certificate and prescribed information, the
 * inventory, the RRA information sheet, the Easy Read Notes, the licence.
 * Never a reference, an ID, a right to rent document, a guarantor's papers,
 * the landlord's papers or an invoice: those are not offered at all, so they
 * cannot be ticked by mistake. On a shared house a room's own papers (its
 * agreement, its deposit) go only to that room's tenants, whatever is ticked.
 * An expired certificate, or one still with the compliance team for its
 * check, is shown and cannot be sent.
 *
 * ── The brakes ──────────────────────────────────────────────────────────
 *
 * sendAsAgent: from the sender's own Outlook where that is connected, our
 * sender otherwise, and "Email to landlords and tenants" (customer_email)
 * decides whether a real tenant is written to. A press, so the Automatic
 * tenant emails switch is not involved. Nothing goes from a test home or
 * while viewing as somebody. REX, PayProp and Propoly are read, never written.
 * Every send is kept in os_home_sends and shows on the home's activity.
 */

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_EMAIL_BYTES = 20 * 1024 * 1024;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/* ── who and which home ─────────────────────────────────────────────────── */

export interface HomeContext {
  me: OsUser;
  office: boolean;
  viewingAs: boolean;
  /** The listing the page describes: a room, the house's record, or the home. */
  home: ManagedProperty;
  /** The lets whose tenants count: the room, or every room of the house. */
  lets: ManagedProperty[];
  /** Every record at the address, for certificates and papers. */
  all: ManagedProperty[];
  title: string;
}

type Refusal = { error: string; status: number };

/**
 * The home, if it is in this person's book (the whole business for the
 * office, lib/scope bookScope; their own for an agent). `listings` is what
 * the page sends for Send out logins too: the room, or every room of the
 * house. Each must be in the book and at the same house as `listing`.
 */
export async function homeContext(req: NextRequest, listing: string, listings: string[]): Promise<HomeContext | Refusal> {
  if (!hasDb()) return { error: "No database on this environment.", status: 503 };
  const who = await whoIs(req).catch(() => null);
  const me = who?.actor;
  if (!me) return { error: "Sign in first.", status: 401 };
  const scope = await bookScope(req, who);
  if (scope.unlinked) return { error: "We can't tell which agent you are, so there's no book to send for.", status: 403 };
  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === listing);
  if (!home) return { error: "This home isn't in your book.", status: 404 };
  const house = houseByListing(housesIn(book.properties, MANAGED_READERS), MANAGED_READERS).get(String(home.listingId)) ?? null;
  const atHouse = new Set((house?.all ?? [home]).map((p) => String(p.listingId)));
  const asked = (listings.length ? listings : [listing]).filter((id) => atHouse.has(id));
  const picked = book.properties.filter((p) => asked.includes(String(p.listingId)));
  const lets = sittingLets(picked.length ? picked : [home]);
  const all = house ? [...(house.house ? [house.house] : []), ...house.rooms] : [home];
  const title = house && lets.length > 1 ? house.name : home.name;
  return { me, office: can(me.role, "see:everything"), viewingAs: Boolean(who?.viewingAs), home, lets, all, title };
}

export const isRefusal = (x: unknown): x is Refusal => Boolean(x && typeof x === "object" && "error" in x);

/* ── the home's records ─────────────────────────────────────────────────── */

const numeric = (id: string | null | undefined) => (/^\d+$/.test(String(id ?? "")) ? String(id) : null);
const ymd = (v: Date | string | null | undefined) => (v ? (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)) : null);
const prettyDay = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/** The listing a room-addressed record belongs to among these lets, or null. */
function roomOf(address: string, lets: ManagedProperty[]): ManagedProperty | null {
  return lets.find((l) => isRoomAddress(addrOf(l)) && sameHome(address, addrOf(l))) ?? null;
}

type OsRecord = { id: string; address: string; rex_property_id: string | null };

/** The OS's own property records (os_properties) behind these listings. */
async function osRecords(all: ManagedProperty[]): Promise<OsRecord[]> {
  const ids = [...new Set(all.map((p) => String(p.propertyId ?? "")).filter(Boolean))];
  if (!ids.length) return [];
  const rows = await q<OsRecord>(
    `SELECT id, address, rex_property_id FROM os_properties WHERE active AND (id = ANY($1) OR rex_property_id = ANY($1))`,
    [ids]
  ).catch(() => [] as OsRecord[]);
  /* Rooms share the house's REX property (Norwich Street's five rooms are one
     REX id), so a record counts only when its address is one of these doors. */
  return rows.filter((r) => all.some((p) => p.propertyId === r.id || sameHome(r.address, addrOf(p)) || (!isRoomAddress(r.address) && !isRoomAddress(addrOf(p)) && r.rex_property_id === p.propertyId)));
}

async function r2Files(prefix: string): Promise<{ key: string; size: number; at: string | null }[]> {
  if (!r2Configured) return [];
  const out: { key: string; size: number; at: string | null }[] = [];
  let token: string | undefined;
  do {
    const res = await withR2((c) => c.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, ContinuationToken: token })));
    for (const o of res.Contents ?? []) if (o.Key && !o.Key.endsWith("/")) out.push({ key: o.Key, size: o.Size ?? 0, at: o.LastModified ? new Date(o.LastModified).toISOString() : null });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/* The clean sweep's folders a tenant may be sent, and what each is called. */
const RECORD_FOR_TENANTS: Record<string, string> = {
  doc_tenancy_agreement: "Tenancy agreement",
  doc_deposit_cert: "Deposit certificate and prescribed information",
  doc_inventory: "Inventory and check-in",
  doc_rra_sheet: "Renters' Rights Act information sheet",
  doc_prt_notes: "Easy Read Notes",
  doc_licence: "Licence",
  pat_expiry: "PAT certificate",
  legionella_expiry: "Legionella risk assessment",
  alarms_expiry: "Smoke and CO alarms",
  epc_rating: "Energy Performance Certificate",
};
/* A room's own papers, never to another room's tenant. */
const ROOM_OWN = new Set(["doc_tenancy_agreement", "doc_deposit_cert", "doc_inventory", "doc_rra_sheet", "doc_prt_notes"]);

const fieldLabel = (field: string) =>
  RECORD_FOR_TENANTS[field] ?? FIELDS.find((f) => f.key === field)?.label ?? field.replace(/^doc_/, "").replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const baseName = (key: string) => key.slice(key.lastIndexOf("/") + 1).replace(/^(rexpm|propoly|manual|flatfair|tds|mydeposits)-(\d+-)?/i, "").replace(/^\d{10,}-/, "");

export interface RecordFile {
  key: string;
  field: string;
  label: string;
  name: string;
  sizeBytes: number;
  at: string | null;
  /** "Room 2" on a shared house, when the paper is that room's. */
  where: string | null;
  url: string;
}

/** The clean sweep's papers for the home, grouped by what they are. Office only. */
export async function recordFiles(ctx: HomeContext): Promise<RecordFile[]> {
  if (!ctx.office) return [];
  const recs = await osRecords(ctx.all);
  const out: RecordFile[] = [];
  for (const r of recs) {
    const room = isRoomAddress(r.address) ? roomOf(r.address, ctx.all) : null;
    for (const f of await r2Files(`documents/property-${r.id}/`).catch(() => [])) {
      const field = f.key.split("/")[2] ?? "";
      out.push({
        key: f.key,
        field,
        label: fieldLabel(field),
        name: baseName(f.key),
        sizeBytes: f.size,
        at: f.at,
        where: room && ctx.all.length > 1 ? roomLabel(room) : null,
        url: `/api/r2/file?key=${encodeURIComponent(f.key)}`,
      });
    }
  }
  return out.sort((a, b) => a.label.localeCompare(b.label) || (b.at ?? "").localeCompare(a.at ?? ""));
}

/* ── what can be sent ───────────────────────────────────────────────────── */

export interface SendDoc {
  id: string;
  group: "Certificates" | "Documents on this home" | "From the clean sweep";
  label: string;
  name: string;
  /** YYYY-MM-DD, a certificate's expiry. */
  expiry: string | null;
  sizeBytes: number | null;
  /** The room listing this paper belongs to, or null for the whole home. */
  room: string | null;
  where: string | null;
  /** Why it can't be sent, when it can't. */
  blocked: string | null;
  /** Ticked when the list opens: in-date certificates. */
  suggested: boolean;
  /** Server side only: where the bytes are. */
  source: { r2: string } | { rex: string };
  certificateId?: string | null;
}

/* Documents added on the OS (lib/doc-types) a tenant may be sent. */
const FILE_TYPES_FOR_TENANTS = new Set(["gas_safety", "eicr", "epc", "licensing", "inventory", "holding_deposit_guide", OTHER]);

/* Certificates with no end date: an EPC runs ten years, an alarm test is a record. */
const NO_EXPIRY_NEEDED = new Set(["epc"]);

export async function sendableDocs(ctx: HomeContext): Promise<SendDoc[]> {
  const out: SendDoc[] = [];
  const today = londonToday();
  const pids = [...new Set(ctx.all.map((p) => String(p.propertyId ?? "")).filter(Boolean))];

  /* 1. Certificates the OS holds (the vault), with their filed expiry. */
  const vault = (await Promise.all(pids.map((pid) => listVault(pid).catch(() => [])))).flat();
  const certRows = vault.length
    ? await q<{ id: string; r2_key: string; expiry: string | Date; awaiting_check: boolean | null }>(
        `SELECT id, r2_key, expiry::text AS expiry, awaiting_check FROM os_certificates WHERE r2_key = ANY($1)`,
        [vault.map((v) => v.key)]
      ).catch(() => [])
    : [];
  const byKey = new Map(certRows.map((c) => [c.r2_key, c]));
  const vaultKinds = new Set<string>();
  for (const v of vault) {
    const row = byKey.get(v.key);
    const expiry = ymd(row?.expiry ?? null);
    const blocked = row?.awaiting_check
      ? "With the compliance team for checking, so it can't be sent yet."
      : expiry && expiry < today ? `Expired on ${prettyDay(expiry)}, so it isn't sent.` : null;
    if (!blocked) vaultKinds.add(v.certKey);
    out.push({
      id: `vault:${v.key}`, group: "Certificates", label: v.label, name: v.name, expiry, sizeBytes: v.size, room: null, where: null,
      blocked, suggested: !blocked && Boolean(expiry || NO_EXPIRY_NEEDED.has(v.certKey)), source: { r2: v.key }, certificateId: row?.id ?? null,
    });
  }

  /* 2. A certificate only REX holds, from the compliance book as held (never
     a fresh walk). Offered only where the OS has no file of that kind. The
     file's address stays on the server. */
  const book = await held<ComplianceBook>(certsKeyFor(null)).catch(() => null);
  if (book) {
    for (const pid of pids) {
      const e = book.data.properties.find((x) => x.id === pid);
      for (const [k, c] of Object.entries(e?.certs ?? {})) {
        if (!c?.fileUrl || !c.attached || c.notRequired || c.inherited || vaultKinds.has(k)) continue;
        const expiry = c.expires == null ? null : new Date(book.at + c.expires * 864e5).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
        const blocked = expiry && expiry < today ? `Expired on ${prettyDay(expiry)}, so it isn't sent.` : null;
        out.push({
          id: `rex:${pid}:${k}`, group: "Certificates", label: VAULT_LABEL[k] ?? k, name: `${VAULT_LABEL[k] ?? k}.pdf`, expiry, sizeBytes: null,
          room: null, where: null, blocked, suggested: !blocked, source: { rex: c.fileUrl },
        });
        vaultKinds.add(k);
      }
    }
  }

  /* 3. Documents added on the OS (os_file_documents) at these doors. */
  const rexIds = pids.map(numeric).filter(Boolean) as string[];
  const streets = [...new Set(ctx.all.map((p) => parseAddress(addrOf(p)).street).filter(Boolean))];
  if (rexIds.length || streets.length) {
    const rows = await q<{ id: string; address: string; rex_property_id: string | null; type: string; name: string; file_name: string; r2_key: string; size_bytes: number }>(
      `SELECT id, address, rex_property_id, type, name, file_name, r2_key, size_bytes FROM os_file_documents
        WHERE removed_at IS NULL AND (rex_property_id = ANY($1) OR street = ANY($2)) ORDER BY at DESC LIMIT 400`,
      [rexIds, streets]
    ).catch(() => []);
    for (const r of rows) {
      if (!FILE_TYPES_FOR_TENANTS.has(r.type)) continue;
      const room = isRoomAddress(r.address) ? roomOf(r.address, ctx.lets) : null;
      const here = room || ctx.all.some((p) => sameHome(r.address, addrOf(p)) || (!isRoomAddress(r.address) && r.rex_property_id && r.rex_property_id === p.propertyId));
      if (!here) continue;
      out.push({
        id: `file:${r.id}`, group: "Documents on this home", label: r.type === OTHER ? r.name || "Other" : docTypeLabel(r.type),
        name: r.file_name, expiry: null, sizeBytes: Number(r.size_bytes) || null, room: room ? String(room.listingId) : null,
        where: room && ctx.lets.length > 1 ? roomLabel(room) : null, blocked: null, suggested: false, source: { r2: r.r2_key },
      });
    }
  }

  /* 4. The clean sweep's papers a tenant is owed. Office only. */
  if (ctx.office) {
    for (const f of await recordFiles(ctx).catch(() => [] as RecordFile[])) {
      if (!RECORD_FOR_TENANTS[f.field]) continue;
      const rec = f.where ? ctx.lets.find((l) => roomLabel(l) === f.where) ?? null : null;
      /* A room's own paper whose room is not among the tenants being written
         to is not offered: it is nobody here's. */
      if (ROOM_OWN.has(f.field) && f.where && !rec) continue;
      out.push({
        id: `record:${f.key}`, group: "From the clean sweep", label: f.label, name: f.name, expiry: null, sizeBytes: f.sizeBytes,
        room: ROOM_OWN.has(f.field) && rec ? String(rec.listingId) : null, where: f.where, blocked: f.sizeBytes > MAX_FILE_BYTES ? "Too big to email." : null,
        suggested: false, source: { r2: f.key },
      });
    }
  }
  for (const d of out) if (!d.blocked && d.sizeBytes != null && d.sizeBytes > MAX_FILE_BYTES) d.blocked = "Too big to email.";
  return out;
}

/** What the browser is shown: everything but where the bytes are. */
export const forScreen = (d: SendDoc) => {
  const { source, certificateId, ...rest } = d;
  void source; void certificateId;
  return rest;
};

export interface SendTenant {
  key: string;
  name: string;
  email: string | null;
  listingId: string;
  where: string | null;
}

/** Every sitting tenant on these lets, one row each, the room named on a shared house. */
export function tenantsOf(ctx: HomeContext): SendTenant[] {
  const out: SendTenant[] = [];
  const seen = new Set<string>();
  for (const l of ctx.lets) {
    for (const t of l.tenants) {
      const email = t.email && EMAIL.test(t.email.trim()) ? normaliseEmail(t.email) : null;
      const key = `${l.listingId}|${email ?? `name:${t.name.toLowerCase()}`}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ key, name: t.name, email, listingId: String(l.listingId), where: ctx.lets.length > 1 && isRoomAddress(addrOf(l)) ? roomLabel(l) : null });
    }
  }
  return out.sort((a, b) => (a.where ?? "").localeCompare(b.where ?? "", "en-GB", { numeric: true }));
}

/* ── the email ──────────────────────────────────────────────────────────── */

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

function docLine(d: SendDoc): string {
  return d.expiry ? `${d.label}, runs to ${prettyDay(d.expiry)}` : d.label;
}

export async function emailFor(ctx: HomeContext, tenant: SendTenant, docs: SendDoc[], note: string): Promise<{ subject: string; html: string }> {
  const let_ = ctx.lets.find((l) => String(l.listingId) === tenant.listingId) ?? ctx.home;
  const items = docs.map((d) => `<li style="margin:0 0 4px">${esc(docLine(d))}</li>`).join("");
  return renderTleEmailLive("tenant-documents", {
    firstName: (tenant.name || "").trim().split(/\s+/)[0] || "there",
    agentName: ctx.me.name || "The Letting Experts",
    address: [let_.name, let_.locality].filter(Boolean).join(", "),
    docList: `<ul style="margin:0;padding-left:18px">${items}</ul>${note.trim() ? `<p style="margin:14px 0 0">${esc(note.trim()).replace(/\n/g, "<br>")}</p>` : ""}`,
  });
}

/** The documents a tenant gets: what was ticked, less another room's own papers. */
export const docsForTenant = (docs: SendDoc[], t: SendTenant) => docs.filter((d) => !d.blocked && (!d.room || d.room === t.listingId));

async function bytesOf(d: SendDoc): Promise<{ filename: string; content: string; contentType: string } | null> {
  const contentType = /\.pdf$/i.test(d.name) ? "application/pdf" : /\.png$/i.test(d.name) ? "image/png" : /\.jpe?g$/i.test(d.name) ? "image/jpeg" : "application/octet-stream";
  try {
    if ("r2" in d.source) {
      const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: (d.source as { r2: string }).r2 })));
      if ((obj.ContentLength ?? 0) > MAX_FILE_BYTES) return null;
      const bytes = await obj.Body?.transformToByteArray();
      return bytes ? { filename: d.name, content: Buffer.from(bytes).toString("base64"), contentType } : null;
    }
    const res = await fetch(d.source.rex, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_FILE_BYTES) return null;
    return { filename: d.name, content: buf.toString("base64"), contentType: res.headers.get("content-type") || contentType };
  } catch {
    return null;
  }
}

/* ── the record of what went ────────────────────────────────────────────── */

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_home_sends (
      id TEXT PRIMARY KEY,
      listing_id TEXT NOT NULL,
      property_id TEXT,
      home TEXT NOT NULL DEFAULT '',
      sent_by_id TEXT,
      sent_by_name TEXT NOT NULL DEFAULT '',
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      documents JSONB NOT NULL,
      results JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS os_home_sends_listing ON os_home_sends (listing_id, at DESC);
    CREATE INDEX IF NOT EXISTS os_home_sends_property ON os_home_sends (property_id, at DESC)`).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

export interface SendResult { key: string; name: string; email: string; sent: boolean; detail: string; documents: string[] }

export interface HomeSend {
  id: string;
  at: string;
  by: string;
  documents: string[];
  results: SendResult[];
}

/** What has been sent to this home's tenants, newest first. */
export async function sendsFor(ctx: HomeContext): Promise<HomeSend[]> {
  await ensureTable();
  const ids = [...new Set([...ctx.lets, ctx.home].map((l) => String(l.listingId)))];
  const rows = await q<{ id: string; at: Date; sent_by_name: string; documents: { label: string }[]; results: SendResult[] }>(
    `SELECT id, at, sent_by_name, documents, results FROM os_home_sends WHERE listing_id = ANY($1) ORDER BY at DESC LIMIT 50`,
    [ids]
  );
  return rows.map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), by: r.sent_by_name, documents: (r.documents ?? []).map((d) => d.label), results: r.results ?? [] }));
}

/**
 * Send each ticked tenant their email, with their documents attached. One
 * email each, from the person pressing. Every press is kept, sent or not.
 */
export async function sendToTenants(ctx: HomeContext, docs: SendDoc[], tenants: SendTenant[], note: string): Promise<{ results: SendResult[]; id: string }> {
  await ensureTable();
  const cache = new Map<string, Awaited<ReturnType<typeof bytesOf>>>();
  const results: SendResult[] = [];
  for (const t of tenants) {
    const mine = docsForTenant(docs, t);
    const base = { key: t.key, name: t.name, email: t.email ?? "", documents: mine.map((d) => d.label) };
    if (!t.email) { results.push({ ...base, sent: false, detail: "There is no email address on their record, so nobody was written to." }); continue; }
    if (!mine.length) { results.push({ ...base, sent: false, detail: "None of the documents ticked are for their room, so nothing was sent." }); continue; }
    const files: { filename: string; content: string; contentType: string }[] = [];
    const missing: string[] = [];
    for (const d of mine) {
      if (!cache.has(d.id)) cache.set(d.id, await bytesOf(d));
      const f = cache.get(d.id);
      if (f) files.push(f); else missing.push(d.label);
    }
    if (missing.length) { results.push({ ...base, sent: false, detail: `${missing.join(", ")} couldn't be read from storage, so nothing was sent. Try again in a minute.` }); continue; }
    const total = files.reduce((n, f) => n + Math.floor((f.content.length * 3) / 4), 0);
    if (total > MAX_EMAIL_BYTES) { results.push({ ...base, sent: false, detail: "Together those files are too big for one email. Send them in two goes." }); continue; }
    try {
      const { subject, html } = await emailFor(ctx, t, mine, note);
      const r = await sendAsAgent({ me: ctx.me, to: t.email, toName: t.name, subject, html, attachments: files });
      results.push({ ...base, sent: r.sent, detail: r.detail });
    } catch (e) {
      results.push({ ...base, sent: false, detail: e instanceof Error ? `Not sent: ${e.message}` : "Not sent." });
    }
  }

  const id = randomBytes(12).toString("hex");
  const picked = docs.filter((d) => !d.blocked);
  await q(
    `INSERT INTO os_home_sends (id, listing_id, property_id, home, sent_by_id, sent_by_name, documents, results) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [id, String(ctx.home.listingId), ctx.home.propertyId, `${ctx.title}, ${ctx.home.locality}`, ctx.me.id, ctx.me.name || ctx.me.email,
      JSON.stringify(picked.map((d) => ({ id: d.id, label: d.label, name: d.name, expiry: d.expiry }))), JSON.stringify(results)]
  );
  /* A certificate's own history (lib/certificate-share) shows who has it. */
  for (const d of picked) {
    if (!d.certificateId) continue;
    for (const r of results.filter((x) => x.sent && x.documents.includes(d.label))) {
      await q(
        `INSERT INTO os_certificate_sends (id, certificate_id, property_id, type_id, role, name, address, sent, note)
         SELECT $1, c.id, c.property_id, c.type_id, 'tenant', $2, $3, true, $4 FROM os_certificates c WHERE c.id = $5`,
        [randomBytes(12).toString("hex"), r.name, r.email, `sent from the home's page by ${ctx.me.name || ctx.me.email}`, d.certificateId]
      ).catch(() => undefined);
    }
  }
  const sent = results.filter((r) => r.sent).length;
  await record({
    kind: "tenant_documents_sent",
    actorId: ctx.me.id,
    actorEmail: ctx.me.email,
    detail: `Send to tenants, ${ctx.title}: ${sent} of ${results.length} sent. ${picked.map((d) => d.label).join(", ")}. ${results.map((r) => `${r.email || r.name} ${r.sent ? "sent" : "not sent"}`).join("; ")}`.slice(0, 1900),
  }).catch(() => undefined);
  return { results, id };
}

/* ── who lived here before ─────────────────────────────────────────────── */

export interface PastTenant {
  name: string;
  email: string | null;
  phone: string | null;
  /** YYYY-MM-DD, when known. */
  from: string | null;
  to: string | null;
  /** "PayProp", "the OS archive", or both. */
  source: string;
  where: string | null;
}

const str = (v: unknown) => String(v ?? "").trim();

/**
 * Who lived here before: PayProp's tenant records at this address that are no
 * longer a current tenancy (an Inactive tenant, or an end date gone by), and
 * the people on earlier lets the OS kept in its tenancy archive. Anybody
 * living there now is left out. Read only, every source.
 */
export async function pastTenants(ctx: HomeContext): Promise<{ people: PastTenant[]; payPropRead: boolean }> {
  const today = londonToday();
  const doors = ctx.lets.length ? ctx.lets : [ctx.home];
  const keys = new Map<string, ManagedProperty>();
  for (const p of [...doors, ...ctx.all]) {
    const k = rentKey(p.address || p.name, p.postcode);
    if (k && !keys.has(k)) keys.set(k, p);
  }
  const now = new Set(ctx.all.flatMap((p) => p.tenants.map((t) => personKey(t.name))).filter(Boolean));
  const found = new Map<string, PastTenant>();
  const add = (p: PastTenant) => {
    const k = personKey(p.name) || p.email || p.name.toLowerCase();
    if (!k || now.has(k)) return;
    const had = found.get(k);
    if (!had) { found.set(k, p); return; }
    /* PayProp's tenancy dates are the real ones; the archive only knows when
       the OS last saw the let, so its dates fill gaps and never overrule. */
    const [a, b] = had.source === "PayProp" ? [had, p] : p.source === "PayProp" ? [p, had] : [had, p];
    found.set(k, {
      ...a,
      email: a.email ?? b.email,
      phone: a.phone ?? b.phone,
      from: a.source === "PayProp" ? a.from ?? b.from : [a.from, b.from].filter(Boolean).sort()[0] ?? null,
      to: a.source === "PayProp" ? a.to ?? b.to : [a.to, b.to].filter(Boolean).sort().reverse()[0] ?? null,
      source: a.source === b.source ? a.source : `${a.source} and ${b.source}`,
    });
  };

  const rows = await payPropTenantRows().catch(() => [] as Array<Record<string, unknown>>);
  for (const t of rows) {
    const active = !str(t.status) || str(t.status) === "Active";
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      const addr = pr.address as Record<string, unknown> | undefined;
      const k1 = rentKey(str(pr.property_name), str(addr?.postal_code));
      const k2 = rentKey(str(addr?.first_line), str(addr?.postal_code));
      const home = keys.get(k1) ?? keys.get(k2);
      if (!home) continue;
      const ten = (pr.tenant ?? {}) as Record<string, unknown>;
      const end = str(ten.end_date).slice(0, 10) || null;
      if (active && (!end || end >= today)) continue;
      const display = str(t.display_name) || [str(t.first_name), str(t.last_name)].filter(Boolean).join(" ") || str(t.business_name);
      if (!display) continue;
      add({
        name: display,
        email: str(t.email_address) ? str(t.email_address).toLowerCase() : null,
        phone: ukPhone(t.mobile_number),
        from: str(ten.start_date).slice(0, 10) || null,
        to: end,
        source: "PayProp",
        where: ctx.lets.length > 1 && isRoomAddress(addrOf(home)) ? roomLabel(home) : null,
      });
    }
  }

  /* Earlier lets the OS archived (lib/tenancy-archive, since 9 Oct 2026),
     with whatever contact the book held for them then. */
  const pids = [...new Set(ctx.all.map((p) => String(p.propertyId ?? "")).filter(Boolean))];
  const current = new Set(ctx.all.map((p) => String(p.listingId)));
  if (pids.length) {
    const arch = await q<{ listing_id: string; let_since: string | Date | null; last_seen: Date; snapshot: ManagedProperty }>(
      `SELECT listing_id, let_since::text AS let_since, last_seen, snapshot FROM os_tenancy_archive WHERE property_id = ANY($1) ORDER BY last_seen DESC LIMIT 60`,
      [pids]
    ).catch(() => []);
    for (const a of arch) {
      if (current.has(String(a.listing_id))) continue;
      const snap = a.snapshot;
      if (!snap || !ctx.all.some((p) => sameHome(addrOf(snap), addrOf(p)))) continue;
      /* Still on the book (seen in the last three days): REX keeps an old
         let's listing, so when they left is not known from here. */
      const seen = ymd(a.last_seen);
      const stillShown = Date.now() - new Date(a.last_seen).getTime() < 3 * 864e5;
      for (const t of snap.tenants ?? []) {
        add({
          name: t.name,
          email: t.email && EMAIL.test(t.email) ? t.email.toLowerCase() : null,
          phone: t.phone ?? null,
          from: ymd(a.let_since),
          to: stillShown ? null : seen,
          source: "the OS archive",
          where: ctx.lets.length > 1 && isRoomAddress(addrOf(snap)) ? roomLabel(snap) : null,
        });
      }
    }
  }
  const people = [...found.values()].sort((a, b) => (b.to ?? "").localeCompare(a.to ?? "") || (b.from ?? "").localeCompare(a.from ?? ""));
  return { people, payPropRead: rows.length > 0 };
}
