import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexRows } from "@/lib/rex";
import { propertyIdForListing } from "@/lib/rex-landlord";
import { R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { sameHome } from "@/lib/address-parse";
import { PropolyWriteBlocked } from "@/lib/business/propoly";
import { getCase } from "@/lib/plc-store";
import { bytesOf, expiryFor, sendToDeal } from "@/lib/plc-propoly";
import { dealAddress, dealBook, newId, type DealLite } from "@/lib/propoly-mail";

/**
 * A LET'S CERTIFICATES, INTO ITS PROPOLY DEAL (owner only, 22 Oct 2026).
 *
 * Deals started before the OS went live (14 Oct 2026) never had documents
 * pushed: the PLC pack's push (lib/plc-propoly) only runs on a pack approved
 * in the OS. Kirstie is sending James a list of those deals rather than
 * uploading each certificate by hand. This takes one deal, finds the home's
 * gas safety, EICR and EPC wherever the OS can see them, and puts each into
 * its slot on the deal.
 *
 * Where a certificate is looked for, latest expiry wins:
 *   - the OS's own vault (os_certificates), for the home's REX and OS ids;
 *   - REX's compliance register, read only, where the entry has a file;
 *   - a PLC pack on the same home.
 *
 * Always looked at first ("Check"), which writes nothing. "Push" sends only
 * what Check showed, behind the same Propoly documents switch as the pack's
 * push. Propoly has no way to list a deal's documents, so a slot already
 * filled comes back "already there" rather than being known beforehand.
 */

export type DocKind = "gas" | "eicr" | "epc";

const KINDS: { kind: DocKind; label: string; slot: string; os: string[]; rex: string; plc: string }[] = [
  { kind: "gas", label: "Gas safety", slot: "DealGasSafetyAttachment", os: ["gas_safety"], rex: "gas_safety", plc: "gas-safety" },
  { kind: "eicr", label: "EICR", slot: "DealElectricalInstallationAttachment", os: ["eicr"], rex: "eicr", plc: "eicr" },
  { kind: "epc", label: "EPC", slot: "DealEpcAttachment", os: ["epc"], rex: "epc", plc: "epc" },
];

type Source =
  | { from: "os"; key: string; name: string }
  | { from: "rex"; url: string; name: string }
  | { from: "plc"; caseId: string; docKey: string; name: string };

export interface DocPlan {
  kind: DocKind;
  label: string;
  slot: string;
  /** What would go, or null with why not. */
  found: { where: "OS vault" | "REX" | "PLC pack"; name: string; expiry: string; expired: boolean } | null;
  note: string;
  outcome?: "uploaded" | "already" | "failed" | "skipped";
  source?: Source;
}

export interface DealDocsPlan {
  dealId: string;
  address: string;
  status: string;
  moveIn: string | null;
  propertyIds: string[];
  /** Set when REX could not be asked, so its certificates were not looked at. */
  rexNote: string | null;
  docs: DocPlan[];
}

export class DealDocsRefused extends Error {}

/** A uuid in a pasted Propoly link (a deal's, or a property's), or the uuid itself. */
export function dealIdFrom(raw: string): string | null {
  return raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)?.[0]?.toLowerCase() ?? null;
}

/**
 * The deal Kirstie means. Her list (21 Oct 2026) is Propoly PROPERTY links and
 * addresses, not deal links, so any of the three is taken: a deal's uuid, a
 * property's uuid (its live deal), or the address (the live deal on the same
 * home). Of several, a deal not cancelled or complete, then the one moving in
 * soonest from today.
 */
export async function resolveDeal(raw: string): Promise<string> {
  const deals = await dealBook();
  if (!deals) throw new DealDocsRefused("Propoly's book couldn't be read just now. Try again in a few minutes.");
  const uuid = dealIdFrom(raw);
  if (uuid && deals.some((d) => d.id === uuid)) return uuid;
  const rank = (d: DealLite) => {
    const s = d.startDate ? Date.parse(d.startDate) : NaN;
    const closed = d.statusKey === "cancelled" ? 2 : d.statusKey === "complete" ? 1 : 0;
    return closed * 1e15 + (Number.isFinite(s) ? Math.abs(s - Date.now()) : 1e14);
  };
  const pick = (list: DealLite[]) => list.sort((a, b) => rank(a) - rank(b))[0]?.id ?? null;
  if (uuid) {
    const onProperty = pick(deals.filter((d) => (d.propertyUuid ?? "").toLowerCase() === uuid));
    if (onProperty) return onProperty;
    throw new DealDocsRefused("No deal in the Propoly book the OS holds has that link, as a deal or as a property. Paste the address instead.");
  }
  const text = raw.trim();
  if (text.length < 6) throw new DealDocsRefused("Paste the deal's Propoly link, the property's link, or the address.");
  const byAddress = pick(deals.filter((d) => sameHome(dealAddress(d), text)));
  if (byAddress) return byAddress;
  throw new DealDocsRefused("No deal in the Propoly book the OS holds is on that address.");
}

async function dealOf(dealId: string): Promise<DealLite> {
  const deals = await dealBook();
  if (!deals) throw new DealDocsRefused("Propoly's book couldn't be read just now. Try again in a few minutes.");
  const d = deals.find((x) => x.id === dealId);
  if (!d) throw new DealDocsRefused("That deal isn't in the Propoly book the OS holds (it may be cancelled or very old).");
  return d;
}

/**
 * The home's ids: the OS's own and REX's, by address (os_properties, which
 * holds every REX PM home), a PLC pack on the same home, and the REX listing
 * the deal was matched to. A home new this autumn is often only on REX CRM,
 * with no os_properties row, so the last two matter (22 Oct 2026: 27 Addison
 * Road had neither of the first).
 */
async function homeIds(address: string, listingId: string | null): Promise<string[]> {
  const ids = new Set<string>();
  if (hasDb()) {
    const [props, packs] = await Promise.all([
      q<{ id: string; rex_property_id: string | null; address: string }>(`SELECT id, rex_property_id, address FROM os_properties WHERE active`).catch(() => []),
      q<{ rex_property_id: string | null; address: string }>(`SELECT rex_property_id, address FROM os_plc_cases WHERE rex_property_id IS NOT NULL`).catch(() => []),
    ]);
    for (const r of props) {
      if (!sameHome(r.address, address)) continue;
      ids.add(r.id);
      if (r.rex_property_id) ids.add(r.rex_property_id);
    }
    for (const r of packs) if (r.rex_property_id && sameHome(r.address, address)) ids.add(r.rex_property_id);
  }
  if (listingId) {
    const fromListing = await propertyIdForListing(listingId).catch(() => null);
    if (fromListing) ids.add(fromListing);
  }
  return [...ids];
}

const today = () => new Date().toISOString().slice(0, 10);
const plain = (s: string) => s.replace(/[^\w\s.()-]+/g, " ").replace(/\s+/g, " ").trim();

type Candidate = { where: "OS vault" | "REX" | "PLC pack"; expiry: string; name: string; source: Source };

export async function planDealDocuments(dealId: string): Promise<DealDocsPlan> {
  const d = await dealOf(dealId);
  const address = dealAddress(d);
  const propertyIds = await homeIds(address, d.listingId);
  const found = new Map<DocKind, Candidate[]>(KINDS.map((k) => [k.kind, []]));

  /* The OS's own vault. Never one still waiting for compliance's check. */
  if (hasDb() && propertyIds.length) {
    const rows = await q<{ type_id: string; expiry: string; name: string; r2_key: string }>(
      `SELECT type_id, expiry::text AS expiry, name, r2_key FROM os_certificates WHERE property_id = ANY($1) AND NOT awaiting_check`,
      [propertyIds]
    ).catch(() => []);
    for (const r of rows) {
      const k = KINDS.find((x) => x.os.includes(r.type_id));
      if (k && r.r2_key) found.get(k.kind)!.push({ where: "OS vault", expiry: r.expiry.slice(0, 10), name: r.name, source: { from: "os", key: r.r2_key, name: r.name } });
    }
  }

  /* REX's compliance register, by REX property id (numeric). Read only. */
  const rexIds = propertyIds.filter((id) => /^\d+$/.test(id));
  let rexNote: string | null = rexIds.length ? null : "No REX property found for this home, so REX's compliance register wasn't checked.";
  if (rexIds.length) {
    /* A page at a time: REX refuses any limit over 100 outright ("Search
       limit for the 'default' result format ... cannot exceed '100'
       records", 7 times on 22 Oct 2026 - this asked for 200), so the
       register was never checked at all. */
    const rows: Record<string, unknown>[] = [];
    for (let offset = 0; offset < 500; offset += 100) {
      const res = await rexCall("ComplianceEntries", "search", { criteria: [{ name: "parent_object_id", type: "in", value: rexIds }], limit: 100, offset }).catch(() => null);
      if (!res?.ok) {
        rexNote = "REX didn't answer, so its compliance register wasn't checked. Check again in a few minutes.";
        rows.length = 0;
        break;
      }
      const page = rexRows(res.result);
      rows.push(...page);
      if (page.length < 100) break;
    }
    for (const r of rows) {
      const type = String(r.type_id ?? "");
      const k = KINDS.find((x) => x.rex === type);
      const detail = ((r.details as Record<string, unknown> | null)?.[type] ?? {}) as Record<string, unknown>;
      const expiry = String(detail.expiry_date ?? "").slice(0, 10);
      const url = (r.file as { url?: string } | null)?.url;
      if (k && url && /^\d{4}-\d{2}-\d{2}$/.test(expiry)) {
        found.get(k.kind)!.push({ where: "REX", expiry, name: `${k.label} - ${d.propertyName.split(",")[0]}.pdf`, source: { from: "rex", url: url.startsWith("//") ? `https:${url}` : url, name: `${k.label} - ${d.propertyName.split(",")[0]}.pdf` } });
      }
    }
  }

  /* A PLC pack on the same home: its certificates and the dates read off them. */
  if (hasDb()) {
    const cases = await q<{ id: string; address: string }>(`SELECT id, address FROM os_plc_cases`).catch(() => []);
    for (const c of cases.filter((x) => sameHome(x.address, address))) {
      const pack = await getCase(c.id).catch(() => null);
      if (!pack) continue;
      for (const doc of pack.documents) {
        const k = KINDS.find((x) => x.plc === doc.checkId);
        const expiry = k ? expiryFor(pack, doc) : null;
        if (k && expiry && !doc.placeholder) found.get(k.kind)!.push({ where: "PLC pack", expiry, name: doc.name, source: { from: "plc", caseId: pack.id, docKey: doc.key, name: doc.name } });
      }
    }
  }

  const docs: DocPlan[] = KINDS.map((k) => {
    const best = found.get(k.kind)!.sort((a, b) => b.expiry.localeCompare(a.expiry))[0];
    if (!best) return { kind: k.kind, label: k.label, slot: k.slot, found: null, note: "No file with an expiry date found in the OS, REX or a PLC pack." };
    const expired = best.expiry < today();
    return {
      kind: k.kind, label: k.label, slot: k.slot,
      found: { where: best.where, name: best.name, expiry: best.expiry, expired },
      note: expired ? "The newest one on file has expired. Pushed anyway if you say so, but Propoly may refuse it." : "Ready to go.",
      source: best.source,
    };
  });
  return { dealId, address, status: d.status, moveIn: d.startDate ?? null, propertyIds, rexNote, docs };
}

export async function bytesFor(s: Source): Promise<{ bytes: Uint8Array; mime: string }> {
  if (s.from === "os") {
    if (!r2Configured) throw new Error("file storage isn't configured here");
    return withR2(async (client) => {
      const res = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: s.key }));
      const bytes = await res.Body?.transformToByteArray();
      if (!bytes) throw new Error("the stored file came back empty");
      return { bytes, mime: res.ContentType || "application/pdf" };
    });
  }
  if (s.from === "rex") {
    const res = await fetch(s.url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`REX's file answered ${res.status}`);
    return { bytes: new Uint8Array(await res.arrayBuffer()), mime: res.headers.get("content-type") || "application/pdf" };
  }
  const pack = await getCase(s.caseId);
  const doc = pack?.documents.find((x) => x.key === s.docKey);
  if (!doc) throw new Error("the PLC pack's file isn't there any more");
  const { bytes, type } = await bytesOf(doc);
  return { bytes, mime: type };
}

let ready: Promise<void> | null = null;
function ensureTable(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_deal_document_pushes (
      id TEXT PRIMARY KEY,
      deal_id TEXT NOT NULL,
      address TEXT NOT NULL DEFAULT '',
      by_email TEXT NOT NULL,
      at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      results JSONB NOT NULL DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS os_deal_document_pushes_deal ON os_deal_document_pushes (deal_id, at DESC)`).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/**
 * Push what Check found. `kinds` limits it (gas, EICR, EPC); an expired
 * certificate only goes when `includeExpired`. Every outcome is kept.
 */
export async function pushDealDocuments(dealId: string, by: string, opts: { kinds?: DocKind[]; includeExpired?: boolean } = {}): Promise<DealDocsPlan> {
  const plan = await planDealDocuments(dealId);
  for (const doc of plan.docs) {
    if (opts.kinds && !opts.kinds.includes(doc.kind)) { doc.outcome = "skipped"; doc.note = "Not asked for."; continue; }
    if (!doc.found || !doc.source) { doc.outcome = "skipped"; continue; }
    if (doc.found.expired && !opts.includeExpired) { doc.outcome = "skipped"; doc.note = "Expired, so left out."; continue; }
    try {
      const { bytes, mime } = await bytesFor(doc.source);
      const sent = await sendToDeal(dealId, { bytes, mime, type: doc.slot, fileName: plain(doc.found.name) || `${doc.label}.pdf`, expiry: doc.found.expiry });
      doc.outcome = sent.outcome;
      doc.note = sent.note;
    } catch (e) {
      if (e instanceof PropolyWriteBlocked) throw new DealDocsRefused("Pushing documents into Propoly is switched off (Admin, Switches).");
      doc.outcome = "failed";
      doc.note = e instanceof Error ? e.message : "upload failed";
    }
  }
  if (hasDb()) {
    await ensureTable();
    await q(`INSERT INTO os_deal_document_pushes (id, deal_id, address, by_email, results) VALUES ($1,$2,$3,$4,$5)`, [
      newId(), dealId, plan.address, by,
      JSON.stringify(plan.docs.map(({ source: _s, ...rest }) => rest)),
    ]);
  }
  return plan;
}

/** The pushes already made on deals, newest first, for the owner's page. */
export async function recentPushes(limit = 20): Promise<{ id: string; dealId: string; address: string; by: string; at: string; results: DocPlan[] }[]> {
  if (!hasDb()) return [];
  await ensureTable();
  const rows = await q<{ id: string; deal_id: string; address: string; by_email: string; at: Date; results: DocPlan[] }>(
    `SELECT * FROM os_deal_document_pushes ORDER BY at DESC LIMIT $1`,
    [limit]
  );
  return rows.map((r) => ({ id: r.id, dealId: r.deal_id, address: r.address, by: r.by_email, at: new Date(r.at).toISOString(), results: r.results }));
}

/** The plan as the screen sees it: where each file is, never its storage key or REX link. */
export function publicPlan(p: DealDocsPlan): DealDocsPlan {
  return { ...p, docs: p.docs.map(({ source: _s, ...rest }) => rest) };
}
