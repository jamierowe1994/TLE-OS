import { NextRequest, NextResponse } from "next/server";
import { stampsFor } from "@/lib/home-send";
import { checkStatesFor } from "@/lib/cert-check-state";
import { londonDay, londonToday } from "@/lib/london-clock";
import { whoIs } from "@/lib/admin";
import { EXPIRING_DAYS, getComplianceItemsFor, PROPERTY_COMPLIANCE, type ComplianceItem } from "@/lib/business/rex-stats";
import { matchProperty, pendingKeyFor, type MatchResult } from "@/lib/property-match";
import { listVault, type VaultFile } from "@/lib/vault";
import { rexConfigured } from "@/lib/rex";
import { checkingFor, osCertRows } from "@/lib/os-certs";
import { HELD_FOR_CHECK, type CertChecking } from "@/lib/cert-hold";
import { q } from "@/lib/db";
import { notNeededAll } from "@/lib/cert-not-needed";
import { HMO_SET, isStaleRecord, renewalHeld, renewalHoldEnds, requiredCerts, type Cert } from "@/lib/compliance";
import { heldComplianceBook } from "@/lib/compliance-cache";
import { isOsPropertyId } from "@/lib/os-properties";
import { managedBookFor } from "@/lib/managed-book-cache";
import { bookScope } from "@/lib/scope";
import { houseKeyOf, isRoomAddress } from "@/lib/address-parse";
import { homeFactsFor } from "@/lib/home-facts";
import { removedFor } from "@/lib/certificate-remove";
import { FIRE_SAFETY, FIRE_TYPE, certNameFor, fireKindIn } from "@/lib/cert-kinds";

/**
 * GET /api/property-file?property=<REX property id>
 * GET /api/property-file?address=<one line>
 *
 * One property's file, the same from every screen (James, 6 Sep 2026: "when
 * a file gets attached it will travel with it no matter where it goes"):
 * what REX requires of the home and where each stands, whether the
 * certificate itself is in REX, and the files the OS holds. By address, the
 * property is found with the backlog's matcher; an address REX does not
 * know yet still has a file - held against the address, moved onto the
 * property the day it exists.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** REX's compliance type → the vault folder the intake files it under. */
const VAULT_KEY: Record<string, string> = {
  gas_safety: "gas",
  eicr: "eicr",
  epc: "epc",
  mandatory_hmo_license: "licence",
  additional_hmo_license: "licence",
  selective_hmo_license: "licence",
  legionella_risk_assessment: "legionella",
  portable_appliance_testing: "pat",
  smoke_alarms: "alarms",
  co_alarms: "alarms",
  emergency_lighting_fire_exit: "fire",
};
/** Which REX type a dropped file of a vault kind is written as. */
const INTAKE_TYPE: Record<string, string> = {
  gas: "gas_safety",
  eicr: "eicr",
  epc: "epc",
  licence: "mandatory_hmo_license",
  legionella: "legionella_risk_assessment",
  pat: "portable_appliance_testing",
  alarms: "smoke_alarms",
  fire: "emergency_lighting_fire_exit",
};
/* Not certificates: the file panel is about the home's safety duties. */
const NOT_A_CERTIFICATE = new Set(["terms_of_business", "listing_proof_of_ownership"]);
const ORDER = ["gas_safety", "eicr", "epc", "mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license", "oil_safety", "smoke_alarms", "co_alarms", "emergency_lighting_fire_exit", "portable_appliance_testing", "legionella_risk_assessment"];

export interface FileRow {
  type: string;
  label: string;
  state: ComplianceItem["state"] | "held-here";
  expiry: string | null;
  issued: string | null;
  inRex: boolean;
  fileInRex: boolean;
  files: VaultFile[];
  /** Held on the house (or another room of it), not this room's own record. */
  fromHouse?: string;
  /** An HMO licence renewal at the council (Michael, 7 Oct 2026): not outstanding until holdEnds. */
  renewal?: { appliedOn: string; ref: string; holdEnds: string; by: string };
  /** A newer certificate with the compliance team for their check (lib/cert-hold, 9 Oct 2026). */
  checking?: CertChecking;
  /** The certificate shown was verified by the compliance team: the green tick. */
  verified?: { by: string; at: string };
  /** The last certificate taken off this row, and why (lib/certificate-remove). */
  removed?: { name: string; reason: "wrong" | "replaced"; by: string; at: string };
}

const LICENCE_TYPES = new Set(["mandatory_hmo_license", "additional_hmo_license", "selective_hmo_license"]);
/** The duties only an HMO carries (lib/compliance HMO_SET plus alarms). */
const HMO_ONLY = new Set<string>([...HMO_SET, "alarms"]);

type HouseSibling = { id: string; name: string; rex: { items: ComplianceItem[]; checked: boolean }; files: VaultFile[] };

/* The other doors of a shared house and what each holds, read side by side
   (9 Nov 2026: the rooms were read one after another). Started as soon as
   the property is known; which rows it fills is decided once this home's
   own rows are in (houseRowsFrom). */
async function houseSiblingsFor(req: NextRequest, propertyId: string): Promise<HouseSibling[]> {
  const scope = await bookScope(req).catch(() => null);
  if (!scope || scope.unlinked) return [];
  const { book } = await managedBookFor(scope.rexUserId).catch(() => ({ book: null }));
  if (!book) return [];
  const me = book.properties.find((p) => p.propertyId === propertyId);
  if (!me) return [];
  const myAddr = `${me.name}, ${me.locality}`;
  const key = houseKeyOf(myAddr);
  if (!key) return [];
  const siblings = book.properties.filter((p) => p.propertyId && p.propertyId !== propertyId && houseKeyOf(`${p.name}, ${p.locality}`) === key);
  if (!siblings.length || (!isRoomAddress(myAddr) && !siblings.some((p) => isRoomAddress(`${p.name}, ${p.locality}`)))) return [];
  /* The house itself first, then the rooms. */
  siblings.sort((a, b) => Number(isRoomAddress(`${a.name}, ${a.locality}`)) - Number(isRoomAddress(`${b.name}, ${b.locality}`)));
  return Promise.all(
    siblings.map(async (sib) => {
      /* A room the OS added (no REX record) holds its certificates in the OS,
         not REX (Rhiannon's shared house, ticket 3d213aee, 9 Nov 2026). */
      const sibId = sib.propertyId as string;
      const [rex, files] = await Promise.all([
        isOsPropertyId(sibId)
          ? osCertRows([sibId]).then((r) => ({ items: osItemsFrom(r), checked: true })).catch(() => ({ items: [] as ComplianceItem[], checked: false }))
          : getComplianceItemsFor(sibId).catch(() => ({ items: [] as ComplianceItem[], checked: false })),
        listVault(sibId).catch(() => [] as VaultFile[]),
      ]);
      return { id: sibId, name: sib.name, rex, files };
    })
  );
}

/* The OS's own certificates as rows: the latest expiry per type, named as
   REX names the type ("Gas safety", not "GAS") - and a fire certificate by
   its own kind, off its source line and file name (ticket 24053535). */
function osItemsFrom(certs: { type_id: string; expiry: string; issue: string | null; name?: string; source?: string }[]): ComplianceItem[] {
  const today = londonToday();
  const latest = new Map<string, { expiry: string; issue: string | null; name?: string; source?: string }>();
  for (const r of certs) if (!latest.has(r.type_id)) latest.set(r.type_id, r);
  return [...latest].map(([type, v]) => ({
    type,
    label: certNameFor(type, PROPERTY_COMPLIANCE[type] ?? Object.entries(INTAKE_TYPE).find(([, t]) => t === type)?.[0]?.toUpperCase() ?? type, v.source, v.name),
    state: v.expiry < today ? ("expired" as const) : ("valid" as const),
    expiry: v.expiry,
    issued: v.issue,
    notes: null,
  }));
}

/* A shared house: the certificate is the building's. When a room's own
   record lacks a type, the house's row (or another room's) stands in for it,
   labelled with where it is held. */
function houseRowsFrom(siblings: HouseSibling[], seen: Set<string>): FileRow[] {
  const out: FileRow[] = [];
  const held = new Set(seen);
  for (const sib of siblings) {
    const byVaultKey = new Map<string, VaultFile[]>();
    for (const f of sib.files) byVaultKey.set(f.certKey, [...(byVaultKey.get(f.certKey) ?? []), f]);
    for (const it of sib.rex.items) {
      if (NOT_A_CERTIFICATE.has(it.type) || held.has(it.type) || it.state === "missing") continue;
      held.add(it.type);
      const vk = VAULT_KEY[it.type];
      out.push({ type: it.type, label: certNameFor(it.type, it.label, it.notes), state: it.state, expiry: it.expiry, issued: it.issued, inRex: Boolean(it.entryId), fileInRex: Boolean(it.hasDocument), files: vk ? byVaultKey.get(vk) ?? [] : [], fromHouse: sib.name });
    }
  }
  return out;
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const propertyParam = (req.nextUrl.searchParams.get("property") ?? "").trim();
  const address = (req.nextUrl.searchParams.get("address") ?? "").trim();
  const osOnly = isOsPropertyId(propertyParam);
  if (!/^\d+$/.test(propertyParam) && !osOnly && !address) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });

  let propertyId: string | null = /^\d+$/.test(propertyParam) || osOnly ? propertyParam : null;
  let match: MatchResult | null = null;
  if (!propertyId && address) {
    match = await matchProperty(address).catch(() => null);
    /* The same door only (6 Oct 2026): one target that is another room of the house is not this home. */
    if (match?.verdict === "confident" && match.link) propertyId = match.link.id;
  }

  const pendingKey = address ? pendingKeyFor(address) : null;
  /* EVERYTHING THAT ONLY NEEDS THE HOME, ASKED AT ONCE (9 Nov 2026: "speed
     up as much of the system as possible"). These ran one after another -
     REX, then the house's rooms, then four database reads in turn - and the
     property file was the slowest call on a home's page (1.3 s at the
     median last week). Each is used below exactly as before. */
  const pid = propertyId;
  const nothing = <T,>(v: T) => Promise.resolve(v);
  /* A room the OS added reads the house too (ticket 3d213aee, 9 Nov 2026):
     Room 3 of a shared house showed only its own fire certificate while
     Room 1 showed the gas, EICR, EPC, licence and alarms for the building. */
  const houseP = pid ? houseSiblingsFor(req, pid).catch(() => [] as HouseSibling[]) : nothing([] as HouseSibling[]);
  const osCertsP = osOnly && pid ? osCertRows([pid]).catch(() => []) : nothing([] as Awaited<ReturnType<typeof osCertRows>>);
  const checkingP = pid
    ? Promise.all([
        checkingFor([pid]).catch(() => new Map()),
        q<{ type_id: string; expiry: string; by_name: string; at: Date }>(
          `SELECT DISTINCT ON (c.type_id) c.type_id, c.expiry::text AS expiry, k.by_name, k.at
             FROM os_certificates c
             JOIN os_compliance_checks k ON k.kind = 'certificate' AND k.subject_id = c.id AND k.state = 'verified'
            WHERE c.property_id = $1 AND c.type_id = ANY($2) AND NOT c.awaiting_check
            ORDER BY c.type_id, c.expiry DESC`,
          [pid, [...HELD_FOR_CHECK]]
        ).catch(() => []),
      ])
    : null;
  const factsP = pid ? homeFactsFor(pid).catch(() => null) : nothing(null);
  const heldBookP = pid ? heldComplianceBook().catch(() => null) : nothing(null);
  const goneP = pid ? removedFor(pid).catch(() => []) : nothing([] as Awaited<ReturnType<typeof removedFor>>);
  const [rex, files, pendingFiles] = await Promise.all([
    propertyId && !osOnly ? getComplianceItemsFor(propertyId).catch(() => ({ items: [] as ComplianceItem[], checked: false })) : Promise.resolve({ items: [] as ComplianceItem[], checked: osOnly }),
    propertyId ? listVault(propertyId).catch(() => [] as VaultFile[]) : Promise.resolve([] as VaultFile[]),
    pendingKey ? listVault(pendingKey).catch(() => [] as VaultFile[]) : Promise.resolve([] as VaultFile[]),
  ]);

  const byVaultKey = new Map<string, VaultFile[]>();
  for (const f of [...files, ...pendingFiles]) byVaultKey.set(f.certKey, [...(byVaultKey.get(f.certKey) ?? []), f]);

  const rows: FileRow[] = [];
  const seenVault = new Set<string>();
  /* A home REX CRM does not hold: the OS's own certificates are its rows. */
  if (osOnly && propertyId) {
    for (const it of osItemsFrom(await osCertsP)) {
      const vk = VAULT_KEY[it.type];
      const own = vk ? byVaultKey.get(vk) ?? [] : [];
      if (vk) seenVault.add(vk);
      rows.push({ type: it.type, label: it.label, state: it.state, expiry: it.expiry, issued: it.issued, inRex: false, fileInRex: false, files: own });
    }
  }
  for (const it of rex.items) {
    if (NOT_A_CERTIFICATE.has(it.type)) continue;
    const vk = VAULT_KEY[it.type];
    const own = vk && !seenVault.has(vk) ? byVaultKey.get(vk) ?? [] : [];
    if (vk) seenVault.add(vk);
    /* REX's note on a fire entry says which certificate it is (ticket 24053535). */
    rows.push({ type: it.type, label: certNameFor(it.type, it.label, it.notes), state: it.state, expiry: it.expiry, issued: it.issued, inRex: Boolean(it.entryId), fileInRex: Boolean(it.hasDocument), files: own });
  }
  /* Files the OS holds that REX has no row for (an address still waiting on
     its property, or a type REX does not track here). */
  for (const [vk, own] of byVaultKey) {
    if (seenVault.has(vk)) continue;
    rows.push({ type: INTAKE_TYPE[vk] ?? vk, label: own[0]?.label ?? vk, state: "held-here", expiry: null, issued: null, inRex: false, fileInRex: false, files: own });
  }
  /* A room of a shared house reads the house's certificates where it has
     none of its own; a missing row on the room is replaced by the house's. */
  if (propertyId) {
    const own = new Set(rows.filter((r) => r.state !== "missing").map((r) => r.type));
    let fromHouse: FileRow[] = [];
    try {
      fromHouse = houseRowsFrom(await houseP, own);
    } catch {
      /* As before: a house that cannot be read adds nothing. */
    }
    for (const h of fromHouse) {
      const at = rows.findIndex((r) => r.type === h.type);
      if (at >= 0) rows[at] = h; else rows.push(h);
    }
  }
  /* Gas and EICR (lib/cert-hold): a newer one with the compliance team shows
     as "Being processed by the compliance team" beside whatever is live; the
     live one carries a green tick once they have verified it. */
  if (propertyId && checkingP) {
    const [checking, verified] = await checkingP;
    const held = (checking.get(propertyId) ?? {}) as Partial<Record<string, CertChecking>>;
    for (const type of HELD_FOR_CHECK) {
      const ch = held[type === "gas_safety" ? "gas" : type];
      const v = verified.find((x) => x.type_id === type);
      let row = rows.find((r) => r.type === type && !r.fromHouse);
      if (!row && ch) {
        row = { type, label: type === "gas_safety" ? "Gas safety" : "EICR", state: "missing", expiry: null, issued: null, inRex: false, fileInRex: false, files: [] };
        rows.push(row);
      }
      if (!row) continue;
      if (ch) row.checking = ch;
      if (v && row.expiry && row.expiry.slice(0, 10) === String(v.expiry).slice(0, 10)) row.verified = { by: v.by_name, at: new Date(v.at).toISOString() };
    }
  }
  /* What a person in the OS has said about the home (lib/home-facts, 19 Oct
     2026): no gas supply answers the gas row, and an EIC is the electrical
     certificate's name on a new build or a full rewire. */
  if (propertyId) {
    const facts = await factsP;
    if (facts?.gasSupply === "none") {
      for (const r of rows) if (r.type === "gas_safety" && (r.state === "missing" || r.state === "expired")) r.state = "not-required";
    }
    if (facts?.electrical === "eic") {
      for (const r of rows) if (r.type === "eicr") r.label = "Electrical (EIC)";
    }
    /* What the home owes is the Compliance page's rule, not REX's list of
       rows (20 Oct 2026, Rhiannon's Flat 11, Grand Banks: the Compliance page
       had it as not an HMO and Michael had marked the licence not needed, but
       the property page counted REX's licence row as outstanding). A duty the
       home does not have - the HMO set on a home that is not an HMO, legionella
       in England, anything marked not needed - is never outstanding here. */
    const held = await heldBookP;
    const home = held?.book.properties.find((p) => p.id === propertyId);
    const notHmo = facts?.homeType === "single" || (home ? !home.hmo : false);
    const owed = home ? new Set<string>(requiredCerts(home)) : null;
    for (const r of rows) {
      if (r.state !== "missing" && r.state !== "expired" && r.state !== "expiring") continue;
      const key = VAULT_KEY[r.type];
      if (!key) continue;
      if ((owed && !owed.has(key)) || (notHmo && HMO_ONLY.has(key))) r.state = "not-required";
    }
    /* What the Compliance page already holds for the home (Lianna Denholm,
       ticket ef3e6bec, 9 Nov 2026: a home's page said 3 certificates
       outstanding that the Compliance page did not). The book reads the
       clean sweep's dates, alarms evidenced by the gas safety record and
       certificates filed in the OS (lib/sweep-certs); these rows read REX
       alone, so a duty answered there stayed "No record" here. Where the
       book has a later answer than REX, the row takes it. */
    if (home && held) {
      const today = londonToday();
      const builtOn = londonDay(new Date(held.at).toISOString());
      for (const r of rows) {
        if (r.state !== "missing" && r.state !== "expired" && r.state !== "expiring") continue;
        const key = VAULT_KEY[r.type];
        const c = key ? (home.certs as Record<string, Cert | undefined>)[key] : undefined;
        if (!c) continue;
        if (c.undated && r.state === "missing") {
          r.state = "held-here";
          continue;
        }
        if (c.expires == null || isStaleRecord(c)) continue;
        const d = new Date(`${builtOn}T12:00:00Z`);
        d.setUTCDate(d.getUTCDate() + c.expires);
        const expiry = d.toISOString().slice(0, 10);
        if (r.expiry && r.expiry.slice(0, 10) >= expiry) continue;
        const days = Math.round((d.getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000);
        r.expiry = expiry;
        r.state = days < 0 ? "expired" : days <= EXPIRING_DAYS ? "expiring" : "valid";
      }
    }
  }
  /* What somebody took off (lib/certificate-remove, 20 Oct 2026): said on the
     row it came off, so a duty that has just gone back to missing explains
     itself. The newest per type. */
  if (propertyId) {
    const gone = await goneP;
    for (const r of rows) {
      const g = gone.find((x) => x.type === r.type);
      if (g) r.removed = { name: g.name, reason: g.reason, by: g.by, at: g.at };
    }
  }
  /* WHICH FIRE CERTIFICATE (Lianna Denholm, ticket 24053535, 11 Nov 2026):
     a fire risk assessment was shown as REX's type, "Emergency lighting /
     fire exit". REX's note named most rows above; where it did not (an entry
     made before the OS wrote one, a home REX does not hold), the OS's own
     record with the same date names it, then the files on the row if they
     all agree. Each file is named for itself too. Labels only: the row, its
     state and the outstanding count are as they were. */
  const fireRows = rows.filter((r) => r.type === FIRE_TYPE);
  if (propertyId && fireRows.length) {
    const ids = [propertyId, ...(await houseP.catch(() => [] as HouseSibling[])).map((s) => s.id)];
    const own = await q<{ expiry: string; name: string; source: string; r2_key: string }>(
      `SELECT expiry::text AS expiry, name, source, r2_key FROM os_certificates
        WHERE property_id = ANY($1) AND type_id = $2 AND NOT awaiting_check ORDER BY added_at DESC`,
      [ids, FIRE_TYPE]
    ).catch(() => []);
    const byKey = new Map(own.map((c) => [c.r2_key, c]));
    for (const r of fireRows) {
      for (const f of r.files) f.label = fireKindIn(byKey.get(f.key)?.source, f.name) ?? FIRE_SAFETY;
      if (r.label !== FIRE_SAFETY) continue;
      const sameDay = own.filter((c) => r.expiry && c.expiry.slice(0, 10) === r.expiry.slice(0, 10));
      const fromFiles = [...new Set(r.files.map((f) => f.label).filter((l) => l !== FIRE_SAFETY))];
      r.label = fireKindIn(...sameDay.flatMap((c) => [c.source, c.name])) ?? (fromFiles.length === 1 ? fromFiles[0] : FIRE_SAFETY);
    }
  }
  rows.sort((a, b) => (ORDER.indexOf(a.type) + 1 || 99) - (ORDER.indexOf(b.type) + 1 || 99));

  /* A licence renewal noted at the council holds the licence row off the
     outstanding count, as on the tracker and the Compliance page. */
  if (propertyId && rows.some((r) => LICENCE_TYPES.has(r.type) && (r.state === "expired" || r.state === "missing"))) {
    const mark = (await notNeededAll().catch(() => [])).find((n) => n.propertyId === propertyId && n.cert === "licence" && n.kind === "renewal_applied");
    if (mark?.appliedOn) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
      for (const r of rows) {
        if (!LICENCE_TYPES.has(r.type) || (r.state !== "expired" && r.state !== "missing")) continue;
        const expires = r.expiry ? Math.round((new Date(`${r.expiry.slice(0, 10)}T12:00:00Z`).getTime() - new Date(`${today}T12:00:00Z`).getTime()) / 86400000) : null;
        const ra = { by: mark.by, at: mark.at, appliedOn: mark.appliedOn, ref: mark.ref ?? "" };
        if (renewalHeld({ expires, attached: false, renewalApplied: ra })) r.renewal = { appliedOn: ra.appliedOn, ref: ra.ref, holdEnds: renewalHoldEnds(ra.appliedOn), by: ra.by };
      }
    }
  }

  /* Who each file has gone to (Email Certificates, lib/home-send): the line
     under a certificate that says when the tenants were sent it, and by whom. */
  const keys = rows.flatMap((r) => r.files.map((f) => f.key));
  /* Whether compliance has checked each file (lib/cert-check-state): Email
     Tenant waits on it (James, 22 Oct 2026). */
  const [sent, checks] = await Promise.all([
    stampsFor(keys).catch(() => ({})),
    checkStatesFor(keys).catch(() => ({})),
  ]);

  return NextResponse.json({
    ok: true,
    sent,
    checks,
    live: rexConfigured(),
    propertyId,
    pendingKey: propertyId ? null : pendingKey,
    checked: rex.checked,
    match: match ? { verdict: match.verdict, how: match.how, targets: match.targets, possible: match.possible } : null,
    rows,
    /* A renewal with the compliance team is not outstanding: the agent has done their part. */
    outstanding: rows.filter((r) => !r.renewal && !(r.checking && !r.checking.queried) && (r.state === "expired" || r.state === "expiring" || r.state === "missing")).length,
    checking: rows.filter((r) => r.checking && !r.checking.queried).length,
  });
}
