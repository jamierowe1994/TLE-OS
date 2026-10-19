import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { getComplianceBook } from "@/lib/compliance-cache";
import { rexConfigured } from "@/lib/rex";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { hasDb, q } from "@/lib/db";
import {
  heldToNextTenancy, isOurs, isStaleRecord, renewalHeld, requiredCerts, statusOf, withCompliance,
  type CertKey, type CompProperty,
} from "@/lib/compliance";
import { CHECKING_LABEL } from "@/lib/cert-hold";
import { CATEGORY_CERT_TYPE, categoriesOf } from "@/lib/works-catalogue";
import { aboutSheet, idsFrom, noteExport, xlsxResponse } from "@/lib/exports";
import type { Value } from "@/lib/xlsx";

/**
 * POST /api/export/certificates { properties: [...], filters: "..." } → .xlsx
 *
 * Every certificate on the homes the Compliance page has on show, one row
 * each, most overdue first, with the contractor beside it so the list can be
 * filtered by contractor and rung through (Kirstie, 16 Oct 2026). Scoped as
 * /api/compliance is: the office gets the whole book, an agent their own.
 * See lib/exports for the rules. No landlord or tenant email or phone, and
 * only the contractor's NAME - their own number is on their record.
 *
 * THE CONTRACTOR, in this order:
 *   1. the contractor on an open planned job for that certificate in the OS;
 *   2. the business printed on the latest certificate filed in the OS
 *      (lib/cert-register reads it off gas and EICR certificates);
 *   3. the contractor on the last finished job for it.
 * Most certificates came from REX with neither, so most rows say nobody yet.
 * Read only: no works order, contractor or certificate is touched.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* REX's certificate types → ours (the same collapse as lib/rex-compliance). */
const TYPE_KEY: Record<string, CertKey> = {
  eicr: "eicr", gas_safety: "gas", epc: "epc",
  mandatory_hmo_license: "licence", additional_hmo_license: "licence", selective_hmo_license: "licence",
  emergency_lighting_fire_exit: "fire", portable_appliance_testing: "pat",
  smoke_alarms: "alarms", co_alarms: "alarms", legionella_risk_assessment: "legionella",
};

const OPEN = new Set(["reported", "approval", "approved", "scheduled"]);
const DONE = new Set(["done", "invoiced", "paid"]);

type Who = { name: string; from: string };

async function contractors(propertyIds: string[]): Promise<Map<string, Who>> {
  const out = new Map<string, Who>();
  if (!hasDb() || !propertyIds.length) return out;
  const open = new Map<string, Who>();
  const last = new Map<string, Who>();
  const onCert = new Map<string, Who>();
  try {
    const jobs = await q<{ property_id: string; category: string; status: string; contractor_name: string; ref: number }>(
      `SELECT property_id, category, status, contractor_name, ref FROM os_works_orders
        WHERE property_id = ANY($1::text[]) AND contractor_name <> '' AND kind = 'planned'
        ORDER BY created_at DESC`,
      [propertyIds]
    );
    for (const j of jobs) {
      for (const cat of categoriesOf(j.category)) {
        const k = TYPE_KEY[CATEGORY_CERT_TYPE[cat] ?? ""];
        if (!k) continue;
        const key = `${j.property_id}|${k}`;
        if (OPEN.has(j.status) && !open.has(key)) open.set(key, { name: j.contractor_name, from: `Booked, job ${j.ref}` });
        if (DONE.has(j.status) && !last.has(key)) last.set(key, { name: j.contractor_name, from: `Last job, ${j.ref}` });
      }
    }
    const certs = await q<{ property_id: string; type_id: string; business: string }>(
      `SELECT c.property_id, c.type_id, r.business
         FROM os_certificates c
         JOIN os_cert_register r ON r.subject_kind = 'certificate' AND r.subject_id = c.id
        WHERE c.property_id = ANY($1::text[]) AND r.business <> ''
        ORDER BY c.expiry DESC NULLS LAST, c.added_at DESC`,
      [propertyIds]
    );
    for (const c of certs) {
      const k = TYPE_KEY[c.type_id];
      const key = `${c.property_id}|${k}`;
      if (k && !onCert.has(key)) onCert.set(key, { name: c.business, from: "On the last certificate" });
    }
  } catch (e) {
    console.error("[export/certificates] contractors", e instanceof Error ? e.message : e);
  }
  for (const m of [last, onCert, open]) for (const [k, v] of m) out.set(k, v);
  return out;
}

const londonToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
function plusDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** What the row says, and where it sorts: the overdue first. */
function statusLine(p: CompProperty, k: CertKey): { text: string; rank: number } {
  const c = p.certs[k];
  if (c?.notNeeded) return { text: "Marked not needed", rank: 7 };
  if (k === "alarms" && c?.viaGas) return { text: "Covered by the gas record", rank: 6 };
  if (withCompliance(c) && ["expired", "missing", "urgent"].includes(statusOf(c))) return { text: CHECKING_LABEL, rank: 4 };
  if (renewalHeld(c)) return { text: "Renewal with the council", rank: 4 };
  if (heldToNextTenancy(c)) return { text: "Due at the next tenancy", rank: 4 };
  switch (statusOf(c)) {
    case "expired": return { text: "Expired", rank: 0 };
    case "urgent": return { text: "Due in 30 days", rank: 1 };
    case "watch": return { text: "Due in 90 days", rank: 3 };
    case "ok": return { text: "In date", rank: 5 };
    default:
      if (c?.undated) return { text: "On file, no date", rank: 2 };
      if (isStaleRecord(c)) return { text: "No current record", rank: 2 };
      return { text: "No record", rank: 2 };
  }
}

const SERVICE: Record<string, string> = { "Let Only": "Let only", "Rent Collect": "Rent collect" };
/* As the chips on the Compliance page name them. */
const NAME: Record<CertKey, string> = {
  gas: "Gas safety (CP12)", eicr: "EICR", epc: "EPC", licence: "HMO licence", fire: "Fire risk assessment",
  pat: "PAT testing", alarms: "Smoke & CO alarms", legionella: "Legionella risk assessment",
};
const NOBODY = "No contractor yet";

export async function POST(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here, so there are no certificates to download." }, { status: 503 });
  }
  try {
    const who = await whoIs(req);
    if (hasDb() && !who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    const office = !who.viewingAs && can(who.actor?.role ?? "agent", "see:everything");
    const scope = office ? null : await scopeForWho(req, who);
    if (scope?.unlinked) {
      return NextResponse.json({ ok: false, error: "Your login is not matched to your homes yet, so there is nothing to download. Ask James to link your account." }, { status: 403 });
    }
    const asked = await idsFrom(req, "properties");
    if (!asked) return NextResponse.json({ ok: false, error: "Nothing to download." }, { status: 400 });

    const { book } = await getComplianceBook();
    let mine: Set<string> | null = null;
    if (scope && !scope.everything) {
      const { book: own } = await managedBookFor(scope.rexUserId);
      mine = new Set(own.properties.map((p) => String(p.propertyId ?? "")).filter(Boolean));
    }
    const byId = new Map<string, CompProperty>();
    for (const p of book.properties) if (!byId.has(String(p.id))) byId.set(String(p.id), p);
    const homes: CompProperty[] = [];
    for (const id of asked.ids) {
      const p = byId.get(id);
      if (p && isOurs(p) && (!mine || mine.has(id))) homes.push(p);
    }

    const who2 = await contractors(homes.map((p) => String(p.id)));
    const today = londonToday();
    const lines = homes.flatMap((p) =>
      requiredCerts(p).map((k) => {
        const c = p.certs[k];
        const st = statusLine(p, k);
        const con = who2.get(`${p.id}|${k}`);
        return { p, k, c, st, con };
      })
    );
    lines.sort((a, b) =>
      a.st.rank - b.st.rank ||
      (a.c?.expires ?? Infinity) - (b.c?.expires ?? Infinity) ||
      a.p.name.localeCompare(b.p.name, "en-GB")
    );

    const rows: Value[][] = lines.map(({ p, k, c, st, con }) => [
      p.name,
      p.locality,
      NAME[k],
      st.text,
      c?.expires != null ? plusDays(today, c.expires) : null,
      c?.expires != null ? c.expires : null,
      c?.expires == null && !c?.undated ? "" : c?.attached ? "Yes" : "No",
      con?.name ?? NOBODY,
      con?.from ?? "",
      p.agent ?? "",
      p.landlord,
      p.tenant === null ? "Vacant" : p.tenant ?? "",
      p.service ? SERVICE[p.service] ?? p.service : "",
      p.hmo ? "Yes" : "No",
    ]);

    /* At a glance, per contractor: what is overdue and what is coming. */
    const tally = new Map<string, { expired: number; soon: number; missing: number; all: number }>();
    for (const l of lines) {
      const name = l.con?.name ?? NOBODY;
      const t = tally.get(name) ?? { expired: 0, soon: 0, missing: 0, all: 0 };
      if (l.st.rank === 0) t.expired++;
      else if (l.st.rank === 1) t.soon++;
      else if (l.st.rank === 2) t.missing++;
      t.all++;
      tally.set(name, t);
    }
    const byContractor: Value[][] = [...tally.entries()]
      .sort((a, b) => (a[0] === NOBODY ? 1 : b[0] === NOBODY ? -1 : b[1].expired - a[1].expired || b[1].soon - a[1].soon || a[0].localeCompare(b[0], "en-GB")))
      .map(([name, t]) => [name, t.expired, t.soon, t.missing, t.all]);

    await noteExport(req, who.actor, "Certificates", rows.length, asked.filters);

    const expired = lines.filter((l) => l.st.rank === 0).length;
    const soon = lines.filter((l) => l.st.rank === 1).length;
    const named = lines.filter((l) => l.con).length;
    return xlsxResponse("Certificates", [
      {
        name: "Certificates",
        columns: [
          { header: "Property", width: 34 },
          { header: "Area", width: 22 },
          { header: "Certificate", width: 24 },
          { header: "Status", width: 26 },
          { header: "Expires", kind: "date", width: 12 },
          { header: "Days left", kind: "number", width: 10 },
          { header: "Document on file", width: 15 },
          { header: "Contractor", width: 28 },
          { header: "Contractor from", width: 22 },
          { header: "Agent", width: 20 },
          { header: "Landlord", width: 24 },
          { header: "Tenant", width: 24 },
          { header: "Service", width: 12 },
          { header: "HMO", width: 6 },
        ],
        rows,
      },
      {
        name: "By contractor",
        columns: [
          { header: "Contractor", width: 30 },
          { header: "Expired", kind: "number", width: 9 },
          { header: "Due in 30 days", kind: "number", width: 14 },
          { header: "No record", kind: "number", width: 10 },
          { header: "All certificates", kind: "number", width: 15 },
        ],
        rows: byContractor,
      },
      aboutSheet([
        ["From", `Compliance, ${office || scope?.everything ? "the whole business" : `${scope?.label ?? "your"}'s homes`}, read live when you pressed the button.`],
        ["Filters on screen", asked.filters || "None"],
        ["Certificates", `${rows.length} on ${homes.length} homes: ${expired} expired, ${soon} due in 30 days. Most overdue first. Days left is negative once a certificate has run out.`],
        ["Filter by contractor", "Use the arrow on the Contractor column. The By contractor sheet counts each one."],
        ["Contractor", `Named on ${named} of ${rows.length}. It comes from an open planned job for that certificate, else the business printed on the last certificate filed in the OS, else the last finished job. Certificates held only in REX carry no contractor, so they say "${NOBODY}".`],
      ]),
    ]);
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The certificates didn't load, so the spreadsheet couldn't be made. Try again in a minute.") }, { status: 502 });
  }
}
