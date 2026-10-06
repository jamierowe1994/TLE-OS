import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexRows } from "@/lib/rex";
import { houseNameFrom, parseAddress, postcodeOf, sameDoor, type Parsed } from "@/lib/address-parse";
import { pmManagedHomes, type OsProperty } from "@/lib/os-properties";
import { managedBookFor } from "@/lib/managed-book-cache";
import { housesIn, MANAGED_READERS } from "@/lib/houses";

/**
 * THE WEEKLY BOOK HEALTH CHECK (James, 6 Oct 2026).
 *
 * "How do we make sure that these properties don't fall like this again,
 * where we've got missing properties, duplicate properties, all of that kind
 * of stuff? I can't really afford for that to happen again."
 *
 * 5b Newton Road showed £3,000 and three tenants for five rooms because the
 * 6 Sep certificate import tied rooms to each other's REX records, one room
 * was in REX twice, two were not in REX at all, and nothing ever said so. The
 * matcher is fixed; this is the part that notices the next time something
 * drifts, whatever causes it.
 *
 * It REPORTS and changes nothing. Every finding is a fact read from REX, REX
 * PM's list (os_properties) or the OS's own certificate store, with no model
 * involved, so it costs nothing to run and is never a guess.
 *
 *   duplicate     a room or home REX holds twice (same door, same postcode)
 *   unlinked      a home REX PM manages that has no REX record at all
 *   shared        two REX PM homes pointing at one REX record, different doors
 *   cert-dates    a certificate whose dates cannot both be right: valid for
 *                 longer than that certificate ever lasts, or expiring before
 *                 it was issued. Caught both Fenscape and Waverley Park.
 *   no-rent       a let room or home with no rent anywhere the OS can read
 */

export type HealthKind = "duplicate" | "unlinked" | "shared" | "cert-dates" | "no-rent";

export interface HealthFinding {
  /** Stable across weeks, so the email can say what is new. */
  key: string;
  kind: HealthKind;
  /** The home, as a person would say it. */
  title: string;
  /** What is wrong, in one sentence. */
  detail: string;
  /** Where to fix it, inside the OS, when there is somewhere. */
  href: string | null;
}

export const HEALTH_LABEL: Record<HealthKind, { title: string; fix: string }> = {
  duplicate: { title: "In REX twice", fix: "Merge or archive the spare record in REX, keeping the one the tenancy is on." },
  unlinked: { title: "Not in REX at all", fix: "Create the property in REX, then it links by itself on the next sync." },
  shared: { title: "Two homes on one REX record", fix: "Give each room or flat its own REX record." },
  "cert-dates": { title: "Certificate dates that cannot be right", fix: "Open the certificate and correct the expiry, or replace the file." },
  "no-rent": { title: "A let room with no rent", fix: "Add the rent to the room's listing in REX." },
};

/* The longest each certificate ever lasts, in months, plus a month's grace
   for an engineer dating the next visit a few weeks out. A gas record "valid"
   for 26 months is a wrong date or a wrong file, never a long certificate. */
const LIFE_MONTHS: Record<string, number> = {
  gas_safety: 13,
  eicr: 61,
  epc: 121,
  legionella_risk_assessment: 25,
  portable_appliance_testing: 61,
  mandatory_hmo_license: 61,
  additional_hmo_license: 61,
  selective_hmo_license: 61,
};
const CERT_LABEL: Record<string, string> = {
  gas_safety: "Gas safety",
  eicr: "EICR",
  epc: "EPC",
  legionella_risk_assessment: "Legionella risk assessment",
  portable_appliance_testing: "PAT test",
  mandatory_hmo_license: "HMO licence",
  additional_hmo_license: "HMO licence",
  selective_hmo_license: "Selective licence",
};

const months = (from: string, to: string) => {
  const a = new Date(`${from.slice(0, 10)}T12:00:00`);
  const b = new Date(`${to.slice(0, 10)}T12:00:00`);
  return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + (b.getDate() - a.getDate()) / 31;
};
const pretty = (ymd: string) =>
  new Date(`${ymd.slice(0, 10)}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

type RexProp = { id: string; line: string; door: Parsed; postcode: string | null };

function rexLine(p: Record<string, unknown>): string {
  const s = (v: unknown) => (v == null ? "" : String(v).trim());
  const street = [s(p.adr_street_number), s(p.adr_street_name)].filter(Boolean).join(" ");
  return [s(p.adr_unit_number), street, s(p.adr_suburb_or_town), s(p.adr_postcode)].filter(Boolean).join(", ");
}

/** Every REX property at one postcode. REX is shared by six businesses, so callers keep only pairs touching ours. */
async function rexAtPostcode(postcode: string): Promise<RexProp[]> {
  const res = await rexCall("Properties", "search", {
    criteria: [{ name: "property.adr_postcode", value: postcode }],
    limit: 100,
  });
  if (!res.ok) throw new Error(res.error ?? `REX refused the search (HTTP ${res.status}).`);
  return (rexRows(res.result) as Record<string, unknown>[]).map((p) => {
    const line = rexLine(p);
    return { id: String(p.id), line, door: parseAddress(line), postcode: postcodeOf(line) };
  });
}

/** A few at a time: REX is the team's live system and this is a weekly job, not a race. */
async function eachLimited<T>(items: T[], n: number, fn: (t: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    while (queue.length) await fn(queue.shift()!);
  }));
}

export interface HealthReport {
  at: string;
  findings: HealthFinding[];
  /** Checks that could not run, said rather than read as "all clear". */
  failed: string[];
  homesChecked: number;
}

export async function bookHealth(): Promise<HealthReport> {
  const findings: HealthFinding[] = [];
  const failed: string[] = [];
  const homes: OsProperty[] = (await pmManagedHomes().catch(() => null)) ?? [];
  if (!homes.length) failed.push("REX PM's managed list could not be read, so the property checks did not run.");

  /* ── unlinked and shared, from REX PM's list alone ─────────────────── */
  const byRex = new Map<string, OsProperty[]>();
  for (const h of homes) {
    if (!h.rexPropertyId) {
      findings.push({
        key: `unlinked:${h.id}`,
        kind: "unlinked",
        title: h.name || h.address,
        detail: `REX PM manages it${h.ref ? ` (${h.ref})` : ""}, but REX has no property for it.`,
        href: `/portfolio?open=${encodeURIComponent(h.id)}`,
      });
      continue;
    }
    byRex.set(h.rexPropertyId, [...(byRex.get(h.rexPropertyId) ?? []), h]);
  }
  for (const [rexId, list] of byRex) {
    if (list.length < 2) continue;
    const doors = list.map((h) => parseAddress(h.address));
    const different = doors.some((d, i) => doors.some((e, j) => j > i && !sameDoor(d, e, true)));
    if (!different) continue;
    const rooms = list.every((h) => /\b(room|studio)\b/i.test(h.name || h.address));
    findings.push({
      key: `shared:${rexId}`,
      kind: "shared",
      /* Named from the plainest of them: REX PM's names wander ("Bristol/Room 65 166 ..."). */
      title: houseNameFrom(list.map((h) => h.name || h.address).reduce((a, b) => (b.length < a.length ? b : a))),
      detail: `${list.length} ${rooms ? "rooms" : "homes"} on REX PM's list all point at one REX property (${rexId}), so REX cannot tell them apart.`,
      href: null,
    });
  }

  /* ── duplicates in REX, one postcode at a time ───────────────────────── */
  const ours = new Set(homes.map((h) => h.rexPropertyId).filter(Boolean) as string[]);
  const postcodes = [...new Set(homes.map((h) => postcodeOf(h.address) ?? h.postcode).filter(Boolean) as string[])];
  let searchFailures = 0;
  const seenPair = new Set<string>();
  await eachLimited(postcodes, 4, async (pc) => {
    let props: RexProp[];
    try {
      props = await rexAtPostcode(pc);
    } catch {
      searchFailures++;
      return;
    }
    for (let i = 0; i < props.length; i++) {
      for (let j = i + 1; j < props.length; j++) {
        const a = props[i];
        const b = props[j];
        if (!ours.has(a.id) && !ours.has(b.id)) continue;
        /* Strict: same unit AND same building. A house and its own Room 1 are not a duplicate. */
        if (!sameDoor(a.door, b.door, false)) continue;
        if (a.door.unit == null && b.door.unit == null && a.door.building == null) continue;
        const key = `duplicate:${[a.id, b.id].sort().join("+")}`;
        if (seenPair.has(key)) continue;
        seenPair.add(key);
        findings.push({
          key,
          kind: "duplicate",
          title: a.line,
          detail: `REX holds this twice: ${a.id} and ${b.id}${b.line !== a.line ? ` (the second as "${b.line}")` : ""}.`,
          href: null,
        });
      }
    }
  });
  if (searchFailures) failed.push(`REX did not answer for ${searchFailures} of ${postcodes.length} postcodes, so duplicates there were not checked.`);

  /* ── certificate dates that cannot both be right ────────────────────── */
  if (hasDb()) {
    try {
      const certs = await q<{ id: string; property_id: string; property_name: string | null; type_id: string; issue: string | null; expiry: string }>(
        `SELECT DISTINCT ON (property_id, type_id) id, property_id, property_name, type_id, issue::text AS issue, expiry::text AS expiry
           FROM os_certificates ORDER BY property_id, type_id, expiry DESC`
      );
      const today = new Date().toISOString().slice(0, 10);
      /* A home REX holds twice has its certificates twice: say it once. */
      const certSeen = new Set<string>();
      for (const c of certs) {
        const life = LIFE_MONTHS[c.type_id];
        if (!life || !c.issue || !c.expiry) continue;
        /* Already expired is the tracker's job; this is about dates that hide an expiry. */
        if (c.expiry < today) continue;
        const span = months(c.issue, c.expiry);
        const wrong = c.expiry < c.issue ? "expires before it was issued" : span > life ? `is recorded as lasting ${Math.round(span)} months, and ${/^[aeiou]|^EICR|^EPC|^HMO/i.test(CERT_LABEL[c.type_id] ?? "") ? "an" : "a"} ${CERT_LABEL[c.type_id] ?? c.type_id} never lasts more than ${life - 1}` : null;
        if (!wrong) continue;
        const same = `${c.property_name}|${c.type_id}|${c.issue}|${c.expiry}`;
        if (certSeen.has(same)) continue;
        certSeen.add(same);
        findings.push({
          key: `cert-dates:${c.id}`,
          kind: "cert-dates",
          title: c.property_name || `A home with no address on record (${c.property_id})`,
          detail: `${CERT_LABEL[c.type_id] ?? c.type_id}: issued ${pretty(c.issue)}, recorded valid until ${pretty(c.expiry)} - it ${wrong}.`,
          href: `/compliance?open=${encodeURIComponent(c.property_id)}`,
        });
      }
    } catch (e) {
      failed.push(`The certificate store could not be read: ${e instanceof Error ? e.message : "unknown error"}.`);
    }
  }

  /* ── a let room with no rent, in a house whose other rooms have one ─────
     Not every let: much of the book's rent lives in PayProp, so "no rent in
     REX" alone is hundreds of rows of noise. A room is the clear case - 5b
     Newton Road's Room 3 read £0 beside four rooms at £725 to £775, and the
     house's total was wrong by a whole rent. */
  try {
    const { book } = await managedBookFor(null);
    for (const h of housesIn(book.properties, MANAGED_READERS).values()) {
      if (h.kind !== "rooms") continue;
      const paying = h.rooms.filter((r) => (r.rentMonthly ?? r.rent ?? 0) > 0);
      if (!paying.length) continue;
      for (const p of h.rooms) {
        if (!p.tenants.length || (p.rentMonthly ?? p.rent ?? 0) > 0) continue;
        findings.push({
          key: `no-rent:${p.propertyId ?? p.listingId}`,
          kind: "no-rent",
          title: [p.name, p.locality].filter(Boolean).join(", "),
          detail: `${p.tenants.map((t) => t.name).join(", ")} live${p.tenants.length === 1 ? "s" : ""} there and the other rooms have rents, but this one has none, so the house total is short.`,
          href: `/portfolio?open=${encodeURIComponent(String(p.listingId))}`,
        });
      }
    }
  } catch (e) {
    failed.push(`The Portfolio could not be read: ${e instanceof Error ? e.message : "unknown error"}.`);
  }

  const order: HealthKind[] = ["duplicate", "unlinked", "shared", "cert-dates", "no-rent"];
  findings.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.title.localeCompare(b.title, "en-GB"));
  return { at: new Date().toISOString(), findings, failed, homesChecked: homes.length };
}

/* ── last week's answer, so the email can say what is new ──────────────── */

const LAST_KEY = "book_health_last";

export async function lastReport(): Promise<HealthReport | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: HealthReport }>(`SELECT value FROM os_settings WHERE key = $1`, [LAST_KEY]).catch(() => []);
  return rows[0]?.value ?? null;
}

export async function saveReport(r: HealthReport): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2, NOW(), 'book-health')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [LAST_KEY, JSON.stringify(r)]
  );
}
