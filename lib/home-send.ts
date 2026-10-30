import "server-only";
import { createHash, randomBytes } from "node:crypto";
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
import { standingForHome } from "@/lib/standing-documents";
import { FIELDS } from "@/lib/property-facts";
import { renderTleEmailLive } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";
import { footerFor, withFooter } from "@/lib/email-footer";
import { londonToday } from "@/lib/london-clock";
import { checkStatesFor, notYetSendable, type CertCheckState } from "@/lib/cert-check-state";
import { normaliseEmail, type OsUser } from "@/lib/users";
import { payPropTenancyCurrent, payPropTenantRows, personKey, ukPhone } from "@/lib/business/payprop-tenant-contacts";
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
  /* Not checked yet, or queried (James, 22 Oct 2026: Email Tenant is "blocked out until it's verified"). */
  const checks = vault.length ? await checkStatesFor(vault.map((v) => v.key)).catch(() => ({} as Record<string, CertCheckState>)) : {};
  const vaultKinds = new Set<string>();
  for (const v of vault) {
    const row = byKey.get(v.key);
    const expiry = ymd(row?.expiry ?? null);
    const blocked = row?.awaiting_check
      ? "With the compliance team for checking, so it can't be sent yet."
      : expiry && expiry < today ? `Expired on ${prettyDay(expiry)}, so it isn't sent.` : notYetSendable(checks[v.key]);
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

  /* 3b. The office's standing documents this home carries: the Easy Read
     Notes on a Scottish let (lib/standing-documents, 29 Oct 2026). Offered,
     not ticked, as they go before the lease rather than with every send. */
  const standing = await standingForHome({ address: addrOf(ctx.home), propertyId: String(ctx.home.propertyId ?? "") || null }).catch(() => []);
  for (const { info, doc } of standing) {
    if (!doc) continue;
    out.push({
      id: `standing:${info.kind}`, group: "Documents on this home", label: info.label, name: doc.fileName, expiry: null,
      sizeBytes: doc.sizeBytes || null, room: null, where: null, blocked: null, suggested: false, source: { r2: doc.r2Key },
    });
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

/** What the sender may change before it goes (Email Certificates, 20 Oct 2026). */
export interface EmailEdit { subject?: string | null; message?: string | null }

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 4000;

const homeLine = (ctx: HomeContext) => [ctx.title, ctx.home.locality].filter(Boolean).join(", ");

/**
 * The words the send screen opens with. Certificates only says certificates,
 * so a gas safety send reads as one. The greeting ("Hi Sophie,"), the list of
 * what is attached and the sign-off are added round it for each tenant, so the
 * same words can go to everyone in a house.
 */
export function defaultsFor(ctx: HomeContext, docs: SendDoc[]): { subject: string; message: string } {
  const live = docs.filter((d) => !d.blocked);
  const certsOnly = live.length > 0 && live.every((d) => d.group === "Certificates");
  const gasOnly = certsOnly && live.every((d) => /gas/i.test(d.label));
  const what = gasOnly ? (live.length === 1 ? "gas safety certificate" : "gas safety certificates") : certsOnly ? "certificates" : "documents";
  return {
    subject: `Your ${what} for ${homeLine(ctx)}`.slice(0, MAX_SUBJECT),
    message: `Here ${live.length === 1 ? "is your copy of the" : "are your copies of the"} ${what} for ${homeLine(ctx)}. ${live.length === 1 ? "It's" : "They're"} attached to this email.\n\nPlease keep ${live.length === 1 ? "it" : "them"} with your tenancy papers. If anything won't open, reply to this email and we'll send it another way.`,
  };
}

/** The sender's words as the email's paragraph: escaped, line breaks kept. */
const messageHtml = (text: string) => esc(text.trim()).replace(/\r\n/g, "\n").replace(/\n/g, "<br>");

export async function emailFor(ctx: HomeContext, tenant: SendTenant, docs: SendDoc[], edit: EmailEdit = {}): Promise<{ subject: string; html: string }> {
  const let_ = ctx.lets.find((l) => String(l.listingId) === tenant.listingId) ?? ctx.home;
  const items = docs.map((d) => `<li style="margin:0 0 4px">${esc(docLine(d))}</li>`).join("");
  const dflt = defaultsFor(ctx, docs);
  const message = String(edit.message ?? "").trim() ? String(edit.message).slice(0, MAX_MESSAGE) : dflt.message;
  const subject = String(edit.subject ?? "").trim() ? String(edit.subject).trim().replace(/\s+/g, " ").slice(0, MAX_SUBJECT) : dflt.subject;
  const out = await renderTleEmailLive("tenant-documents", {
    firstName: (tenant.name || "").trim().split(/\s+/)[0] || "there",
    agentName: ctx.me.name || "The Letting Experts",
    address: [let_.name, let_.locality].filter(Boolean).join(", "),
    messageHtml: messageHtml(message),
    docList: `<p style="margin:0 0 6px;font-weight:600">Attached to this email</p><ul style="margin:0;padding-left:18px">${items}</ul>`,
  });
  return { subject, html: out.html };
}

/** The documents a tenant gets: what was ticked, less another room's own papers. */
export const docsForTenant = (docs: SendDoc[], t: SendTenant) => docs.filter((d) => !d.blocked && (!d.room || d.room === t.listingId));

interface Attachment { filename: string; content: string; contentType: string; bytes: number; sha256: string }

async function bytesOf(d: SendDoc): Promise<Attachment | null> {
  const contentType = /\.pdf$/i.test(d.name) ? "application/pdf" : /\.png$/i.test(d.name) ? "image/png" : /\.jpe?g$/i.test(d.name) ? "image/jpeg" : "application/octet-stream";
  const pack = (buf: Buffer, type: string): Attachment => ({ filename: d.name, content: buf.toString("base64"), contentType: type, bytes: buf.length, sha256: createHash("sha256").update(buf).digest("hex") });
  try {
    if ("r2" in d.source) {
      const obj = await withR2((c) => c.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: (d.source as { r2: string }).r2 })));
      if ((obj.ContentLength ?? 0) > MAX_FILE_BYTES) return null;
      const bytes = await obj.Body?.transformToByteArray();
      return bytes ? pack(Buffer.from(bytes), contentType) : null;
    }
    const res = await fetch(d.source.rex, { cache: "no-store" });
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_FILE_BYTES) return null;
    return pack(buf, res.headers.get("content-type") || contentType);
  } catch {
    return null;
  }
}

/* ── the record of what went ────────────────────────────────────────────── */

/*
 * THE LEGAL RECORD (James, 20 Oct 2026: "record that on the system to show
 * that the certificate has been sent, the time and date, and stamp it for
 * legal purposes"). A landlord must give a tenant a copy of the gas safety
 * record within 28 days of the check, and before an incoming tenant moves in;
 * the day somebody asks whether that happened, this is the answer.
 *
 *   os_home_sends        one row per press: the home, who pressed, when, what
 *                        was ticked, the subject and the words as edited.
 *   os_home_send_emails  one row per email, written the moment it went (or
 *                        did not): the address, the exact subject and HTML as
 *                        sent, a SHA-256 of that HTML, each file attached with
 *                        where it came from, its size and a SHA-256 of its
 *                        bytes, which road it took, the provider's message id
 *                        where there is one, and what happened.
 *
 * Both are only ever added to. Nothing in the OS updates or deletes an email
 * row, so the record reads the same in five years as it did the day it went.
 * Each email also carries an X-TLE-OS-Send header with its row's id, so the
 * copy in the sender's Sent Items, and a reply that quotes it, can be matched.
 *
 * os_home_send_locks: one press per minute for the same email to the same
 * people. Claimed in one statement, so a double click, a retry, or a second
 * tab sends once.
 */
let ready: Promise<void> | null = null;
/** Exported for readers of the record elsewhere (the compliance desk's Verified list). */
export function ensureTable(): Promise<void> {
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
    CREATE INDEX IF NOT EXISTS os_home_sends_property ON os_home_sends (property_id, at DESC);
    ALTER TABLE os_home_sends ADD COLUMN IF NOT EXISTS sent_by_email TEXT NOT NULL DEFAULT '';
    ALTER TABLE os_home_sends ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '';
    ALTER TABLE os_home_sends ADD COLUMN IF NOT EXISTS message TEXT NOT NULL DEFAULT '';
    ALTER TABLE os_home_sends ADD COLUMN IF NOT EXISTS done_at TIMESTAMPTZ;
    CREATE TABLE IF NOT EXISTS os_home_send_emails (
      id TEXT PRIMARY KEY,
      send_id TEXT NOT NULL,
      listing_id TEXT NOT NULL,
      tenant_listing_id TEXT,
      property_id TEXT,
      home TEXT NOT NULL DEFAULT '',
      sent_by_id TEXT,
      sent_by_name TEXT NOT NULL DEFAULT '',
      sent_by_email TEXT NOT NULL DEFAULT '',
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      to_name TEXT NOT NULL DEFAULT '',
      to_email TEXT NOT NULL DEFAULT '',
      subject TEXT NOT NULL DEFAULT '',
      html TEXT NOT NULL DEFAULT '',
      html_sha256 TEXT NOT NULL DEFAULT '',
      attachments JSONB NOT NULL DEFAULT '[]',
      via TEXT,
      message_id TEXT,
      sent BOOLEAN NOT NULL DEFAULT FALSE,
      detail TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS os_home_send_emails_send ON os_home_send_emails (send_id);
    CREATE INDEX IF NOT EXISTS os_home_send_emails_listing ON os_home_send_emails (listing_id, at DESC);
    CREATE INDEX IF NOT EXISTS os_home_send_emails_files ON os_home_send_emails USING GIN (attachments jsonb_path_ops);
    CREATE TABLE IF NOT EXISTS os_home_send_locks (
      fingerprint TEXT PRIMARY KEY,
      until TIMESTAMPTZ NOT NULL,
      by_id TEXT
    )`).then(() => undefined).catch((e) => {
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

export interface RecordedFile { id: string; label: string; name: string; expiry: string | null; source: string; bytes: number; sha256: string; certificateId: string | null }
export interface RecordedEmail {
  id: string; at: string; toName: string; toEmail: string; subject: string; html: string; htmlSha256: string;
  attachments: RecordedFile[]; via: string | null; messageId: string | null; sent: boolean; detail: string;
}
export interface SendRecord {
  id: string; listingId: string; home: string; at: string; doneAt: string | null;
  by: { id: string | null; name: string; email: string };
  subject: string; message: string; documents: { label: string; name: string; expiry: string | null }[];
  emails: RecordedEmail[];
  /** A send from before the full record was kept (the first hours of 20 Oct 2026): who and the outcome only. */
  earlier: SendResult[] | null;
}

/** One press, every email it made, for the record screen. */
export async function sendRecord(id: string): Promise<SendRecord | null> {
  if (!hasDb() || !/^[a-f0-9]{24}$/.test(id)) return null;
  await ensureTable();
  const [h] = await q<{ id: string; listing_id: string; home: string; at: Date; done_at: Date | null; sent_by_id: string | null; sent_by_name: string; sent_by_email: string; subject: string; message: string; documents: SendRecord["documents"]; results: SendResult[] }>(
    `SELECT id, listing_id, home, at, done_at, sent_by_id, sent_by_name, sent_by_email, subject, message, documents, results FROM os_home_sends WHERE id = $1`,
    [id]
  );
  if (!h) return null;
  const rows = await q<{ id: string; at: Date; to_name: string; to_email: string; subject: string; html: string; html_sha256: string; attachments: RecordedFile[]; via: string | null; message_id: string | null; sent: boolean; detail: string }>(
    `SELECT id, at, to_name, to_email, subject, html, html_sha256, attachments, via, message_id, sent, detail FROM os_home_send_emails WHERE send_id = $1 ORDER BY at`,
    [id]
  );
  return {
    id: h.id, listingId: h.listing_id, home: h.home, at: new Date(h.at).toISOString(), doneAt: h.done_at ? new Date(h.done_at).toISOString() : null,
    by: { id: h.sent_by_id, name: h.sent_by_name, email: h.sent_by_email }, subject: h.subject, message: h.message, documents: h.documents ?? [],
    earlier: rows.length === 0 && (h.results ?? []).length > 0 ? h.results : null,
    emails: rows.map((r) => ({ id: r.id, at: new Date(r.at).toISOString(), toName: r.to_name, toEmail: r.to_email, subject: r.subject, html: r.html, htmlSha256: r.html_sha256, attachments: r.attachments ?? [], via: r.via, messageId: r.message_id, sent: r.sent, detail: r.detail })),
  };
}

export interface FileStamp { sendId: string; at: string; by: string; to: string[] }

/**
 * The latest send of each of these files (R2 keys), for the line under a
 * certificate on the property file: "Sent to Sophie Bell, 20 Oct 2026 14:12 by Jo".
 */
export async function stampsFor(keys: string[]): Promise<Record<string, FileStamp>> {
  const out: Record<string, FileStamp> = {};
  if (!hasDb() || !keys.length) return out;
  await ensureTable();
  const rows = await q<{ key: string; send_id: string; at: Date; sent_by_name: string; to_name: string; to_email: string }>(
    `SELECT a->>'source' AS key, e.send_id, e.at, e.sent_by_name, e.to_name, e.to_email
       FROM os_home_send_emails e, jsonb_array_elements(e.attachments) a
      WHERE e.sent AND a->>'source' = ANY($1)
      ORDER BY e.at DESC LIMIT 500`,
    [keys.map((k) => `r2:${k}`)]
  ).catch(() => []);
  for (const r of rows) {
    const key = r.key.slice(3);
    const had = out[key];
    if (had && had.sendId !== r.send_id) continue;
    const who = r.to_name || r.to_email;
    if (!had) out[key] = { sendId: r.send_id, at: new Date(r.at).toISOString(), by: r.sent_by_name, to: [who] };
    else if (!had.to.includes(who)) had.to.push(who);
  }
  return out;
}

/** The same email to the same people, from the same home, once a minute. */
async function claim(fingerprint: string, byId: string): Promise<boolean> {
  const rows = await q<{ fingerprint: string }>(
    `INSERT INTO os_home_send_locks (fingerprint, until, by_id) VALUES ($1, NOW() + INTERVAL '60 seconds', $2)
     ON CONFLICT (fingerprint) DO UPDATE SET until = EXCLUDED.until, by_id = EXCLUDED.by_id WHERE os_home_send_locks.until < NOW()
     RETURNING fingerprint`,
    [fingerprint, byId]
  );
  return rows.length > 0;
}
const release = (fingerprint: string) => q(`DELETE FROM os_home_send_locks WHERE fingerprint = $1`, [fingerprint]).catch(() => undefined);

export class AlreadySending extends Error {}

/**
 * Send each ticked tenant their email, with their documents attached. One
 * email each, from the person pressing. Every press is kept, sent or not, and
 * every email is written down the moment it goes.
 */
export async function sendToTenants(ctx: HomeContext, docs: SendDoc[], tenants: SendTenant[], edit: EmailEdit = {}): Promise<{ results: SendResult[]; id: string }> {
  await ensureTable();
  const picked = docs.filter((d) => !d.blocked);
  const dflt = defaultsFor(ctx, picked);
  const subject = String(edit.subject ?? "").trim() || dflt.subject;
  const message = String(edit.message ?? "").trim() || dflt.message;

  const fingerprint = createHash("sha256")
    .update([String(ctx.home.listingId), picked.map((d) => d.id).sort().join(","), tenants.map((t) => t.key).sort().join(","), subject, message].join("\n"))
    .digest("hex");
  if (!(await claim(fingerprint, ctx.me.id))) throw new AlreadySending("That has just been sent. Give it a minute before sending the same again.");

  const id = randomBytes(12).toString("hex");
  const home = `${ctx.title}, ${ctx.home.locality}`;
  const byName = ctx.me.name || ctx.me.email;
  await q(
    `INSERT INTO os_home_sends (id, listing_id, property_id, home, sent_by_id, sent_by_name, sent_by_email, subject, message, documents, results)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'[]')`,
    [id, String(ctx.home.listingId), ctx.home.propertyId, home, ctx.me.id, byName, ctx.me.email ?? "", subject, message,
      JSON.stringify(picked.map((d) => ({ id: d.id, label: d.label, name: d.name, expiry: d.expiry })))]
  );

  const cache = new Map<string, Attachment | null>();
  const results: SendResult[] = [];
  const write = async (t: SendTenant, row: { emailId: string; subject: string; html: string; files: { d: SendDoc; f: Attachment }[]; via: string | null; messageId: string | null; sent: boolean; detail: string }) => {
    await q(
      `INSERT INTO os_home_send_emails (id, send_id, listing_id, tenant_listing_id, property_id, home, sent_by_id, sent_by_name, sent_by_email,
         to_name, to_email, subject, html, html_sha256, attachments, via, message_id, sent, detail)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [row.emailId, id, String(ctx.home.listingId), t.listingId, ctx.home.propertyId, home, ctx.me.id, byName, ctx.me.email ?? "",
        t.name, t.email ?? "", row.subject, row.html, row.html ? createHash("sha256").update(row.html).digest("hex") : "",
        JSON.stringify(row.files.map(({ d, f }): RecordedFile => ({
          id: d.id, label: d.label, name: d.name, expiry: d.expiry, bytes: f.bytes, sha256: f.sha256, certificateId: d.certificateId ?? null,
          /* Where the bytes were: the R2 key, or which REX certificate (never REX's file address, which is a signed link). */
          source: "r2" in d.source ? `r2:${d.source.r2}` : d.id,
        }))),
        row.via, row.messageId, row.sent, row.detail]
    ).catch((e) => console.error("[home-send] the record of an email could not be written", id, e));
  };

  try {
    for (const t of tenants) {
      const mine = docsForTenant(docs, t);
      const base = { key: t.key, name: t.name, email: t.email ?? "", documents: mine.map((d) => d.label) };
      const emailId = randomBytes(12).toString("hex");
      const none = { emailId, subject, html: "", files: [] as { d: SendDoc; f: Attachment }[], via: null, messageId: null, sent: false };
      if (!t.email) { const detail = "There is no email address on their record, so nobody was written to."; results.push({ ...base, sent: false, detail }); await write(t, { ...none, detail }); continue; }
      if (!mine.length) { const detail = "None of the documents ticked are for their room, so nothing was sent."; results.push({ ...base, sent: false, detail }); await write(t, { ...none, detail }); continue; }
      const files: { d: SendDoc; f: Attachment }[] = [];
      const missing: string[] = [];
      for (const d of mine) {
        if (!cache.has(d.id)) cache.set(d.id, await bytesOf(d));
        const f = cache.get(d.id);
        if (f) files.push({ d, f }); else missing.push(d.label);
      }
      if (missing.length) { const detail = `${missing.join(", ")} couldn't be read from storage, so nothing was sent. Try again in a minute.`; results.push({ ...base, sent: false, detail }); await write(t, { ...none, detail }); continue; }
      const total = files.reduce((n, x) => n + x.f.bytes, 0);
      if (total > MAX_EMAIL_BYTES) { const detail = "Together those files are too big for one email. Send them in two goes."; results.push({ ...base, sent: false, detail }); await write(t, { ...none, files, detail }); continue; }
      const email = await emailFor(ctx, t, mine, { subject, message });
      try {
        const r = await sendAsAgent({
          me: ctx.me, to: t.email, toName: t.name, subject: email.subject, html: email.html,
          attachments: files.map(({ f }) => ({ filename: f.filename, content: f.content, contentType: f.contentType })),
          headers: { "X-TLE-OS-Send": emailId },
        });
        /* From their Outlook the footer is added on the way out (lib/microsoft
           msSendMail), so the record holds the email as it actually left. */
        const footer = r.sent && r.via === "mailbox" ? await footerFor(ctx.me.id).catch(() => null) : null;
        results.push({ ...base, sent: r.sent, detail: r.detail });
        await write(t, { emailId, subject: email.subject, html: footer ? withFooter(email.html, footer) : email.html, files, via: r.via, messageId: r.messageId ?? null, sent: r.sent, detail: r.detail });
      } catch (e) {
        const detail = e instanceof Error ? `Not sent: ${e.message}` : "Not sent.";
        results.push({ ...base, sent: false, detail });
        await write(t, { emailId, subject: email.subject, html: email.html, files, via: null, messageId: null, sent: false, detail });
      }
    }
  } finally {
    await q(`UPDATE os_home_sends SET results = $2, done_at = NOW() WHERE id = $1`, [id, JSON.stringify(results)]).catch(() => undefined);
    /* Nothing went (switched off, no addresses): a second try needn't wait the minute. */
    if (!results.some((r) => r.sent)) await release(fingerprint);
  }

  /* A certificate's own history (lib/certificate-share) shows who has it. */
  for (const d of picked) {
    if (!d.certificateId) continue;
    for (const r of results.filter((x) => x.sent && x.documents.includes(d.label))) {
      await q(
        `INSERT INTO os_certificate_sends (id, certificate_id, property_id, type_id, role, name, address, sent, note)
         SELECT $1, c.id, c.property_id, c.type_id, 'tenant', $2, $3, true, $4 FROM os_certificates c WHERE c.id = $5`,
        [randomBytes(12).toString("hex"), r.name, r.email, `sent from the home's page by ${byName}`, d.certificateId]
      ).catch(() => undefined);
    }
  }
  const sent = results.filter((r) => r.sent).length;
  await record({
    kind: "tenant_documents_sent",
    actorId: ctx.me.id,
    actorEmail: ctx.me.email,
    detail: `Send to tenants, ${ctx.title}: ${sent} of ${results.length} sent (record ${id}). ${picked.map((d) => d.label).join(", ")}. ${results.map((r) => `${r.email || r.name} ${r.sent ? "sent" : "not sent"}`).join("; ")}`.slice(0, 1900),
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
    for (const pr of (Array.isArray(t.properties) ? t.properties : []) as Array<Record<string, unknown>>) {
      const addr = pr.address as Record<string, unknown> | undefined;
      const k1 = rentKey(str(pr.property_name), str(addr?.postal_code));
      const k2 = rentKey(str(addr?.first_line), str(addr?.postal_code));
      const home = keys.get(k1) ?? keys.get(k2);
      if (!home) continue;
      const ten = (pr.tenant ?? {}) as Record<string, unknown>;
      const end = str(ten.end_date).slice(0, 10) || null;
      if (payPropTenancyCurrent(t.status, end, today)) continue;
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
