import "server-only";
import { hasDb, q } from "@/lib/db";
import { notLetFrom } from "@/lib/not-let";
import { heldComplianceBookStrict } from "@/lib/compliance-cache";
import { sameAgent } from "@/lib/agent-name";
import { agentMoves } from "@/lib/agent-moves";
import { tidyAddress } from "@/lib/clean-sweep";
import { ACTIONS, GAP_LABEL, POSITION_LABEL, type ActionKey, type Gap, type Position } from "@/lib/deposit-words";

export { ACTIONS, GAP_LABEL, POSITION_LABEL, type ActionKey, type Gap, type Position };

/**
 * The deposit register for the Propertymark audit (Susan, 18 Nov 2026).
 *
 * "I need the full up to date portfolio report for my annual Propertymark
 * audit." Every let home, where its deposit is protected, the reference, the
 * amount, the date it went in, whether the certificate and prescribed
 * information are on file, and what is still missing, in one place on the OS
 * so the team can trace the gaps and the register stays current for the
 * lets that come after.
 *
 * WHERE EACH PART COMES FROM, read fresh on every request (no snapshot):
 *
 *  - The OS's own record of the home's deposit (os_property_facts:
 *    deposit_status, deposit_ref, deposit_amount, deposit_protected_on,
 *    deposit_registered_by, doc_deposit_cert, and the two added for this
 *    screen: deposit_pi_served_on, deposit_notes). The clean sweep filled it
 *    from Susan's September audit, TDS, mydeposits Scotland, Flatfair,
 *    Propoly and PayProp; anything typed on this screen is source 'manual'
 *    and wins. The OS owns this data.
 *  - Flatfair (os_flatbonds, env 'live', synced every 30 minutes): the
 *    England deposits TLE registers with TDS through Flatfair, and every
 *    no-deposit plan. Matched to a home by the reference or plan number on
 *    record first, then by the exact unit (room or flat, building number with
 *    its letter, street, postcode). One Flatfair record is claimed by one home
 *    only. A Flatfair tenancy that started after the home's recorded deposit
 *    is a NEW LET, and Flatfair speaks for it until someone types in the new
 *    let's details here.
 *  - Whether the agent has left: the compliance book as REX built it.
 *
 * WHAT IS NOT LIVE, and says so on the screen rather than guessing:
 *  - mydeposits Scotland, landlords' own schemes and TDS deposits registered
 *    outside Flatfair have no feed. Their values are what someone last
 *    recorded, with who and when beside them.
 *  - Flatfair has no "date protected". A new let's date is blank until it
 *    is typed in from the certificate.
 *
 * The review on 19 Nov 2026 found the first cut keyed homes the way rents
 * are keyed (first plain number + street), which put Room 1 at 5a, 5b and 5c of
 * one street on one key and handed one deposit to three homes; and that homes held on
 * the OS twice were counted twice. Hence unitKey, the one-claim rule and the
 * duplicate fold below.
 */

/* ── Types ───────────────────────────────────────────────────────────── */

export type Flat = {
  id: number;
  status: string;
  product: string;
  provider: string | null;
  type: string | null;
  ref: string | null;
  amount: number | null;
  start: string | null;
  branch: string | null;
  branchLeft: boolean | null;
  managedBy: string | null;
  piSigned: boolean;
  regCert: boolean;
};

export type Value = { value: string | null; source: string | null; at: string | null; by: string | null };

/**
 * "Mark as Complete" (Michael, 23 Nov 2026): he was writing a note on each
 * home that could not be put right (a deposit protected late because the
 * management was taken over, say) and it stayed in To Do, because only the
 * problem going away cleared it. A person can now say nothing more can be
 * done, with why. The fact stays on the register (late is still late); the
 * home leaves To Do and is counted as complete with a note.
 *
 * It covers what was flagged when it was signed. A new problem on the home,
 * or a new let, and it no longer holds: the home is back in To Do with the
 * old sign-off shown beside it.
 */
export type SignOff = {
  by: string | null;
  at: string;
  reason: string;
  /** False once something it did not cover has come up. */
  holds: boolean;
  /** What has come up since, when it no longer holds. */
  since: Gap[];
};

export type DepositRow = {
  id: string;
  address: string;
  postcode: string | null;
  country: "England" | "Scotland" | "Wales";
  service: "managed" | "let_only" | "rent_collect" | "unknown";
  paypropNo: string | null;
  agent: string | null;
  agentLeft: boolean | null;
  landlord: string | null;
  tenants: string | null;
  tenancyStart: string | null;
  position: Position;
  heldByTle: boolean;
  status: string | null;
  ref: string | null;
  amount: number | null;
  protectedOn: string | null;
  piServedOn: string | null;
  /** What shows the prescribed information was served: a typed date, Flatfair's signed copy, or the certificate file. */
  piEvidence: "date" | "flatfair" | "file" | null;
  /** The legal deadline the date protected was judged against, when a trustworthy start was found. */
  protectBy: string | null;
  certOnFile: boolean;
  registeredBy: string | null;
  notes: string | null;
  values: Partial<Record<"status" | "ref" | "amount" | "protectedOn" | "piServedOn" | "cert" | "registeredBy" | "notes", Value>>;
  flatfair: Flat | null;
  /** Other live Flatfair deposits at the same unit. */
  otherFlats: Flat[];
  /** The same home held as another OS record. */
  alsoRecords: { id: string; status: string | null }[];
  newLet: boolean;
  fromFlatfair: ("ref" | "amount" | "position")[];
  gaps: Gap[];
  action: ActionKey | null;
  done: boolean;
  /** What the home is flagged for, signed off or not. action is this, or null once a sign-off covers it. */
  flagged: ActionKey | null;
  signOff: SignOff | null;
  lastChecked: { at: string; by: string | null } | null;
};

export type Unmatched = {
  id: number;
  address: string;
  postcode: string | null;
  product: string;
  status: string;
  ref: string | null;
  amount: number | null;
  start: string | null;
  branch: string | null;
  branchLeft: boolean | null;
};

export type DepositRegister = {
  at: string;
  flatfairAt: string | null;
  recordAt: string | null;
  leaversKnown: boolean;
  leavers: string[];
  rows: DepositRow[];
  unmatched: Unmatched[];
};

/* ── Small helpers ───────────────────────────────────────────────────── */

const SCOT = /^(AB|DD|DG|EH|FK|G\d|HS|IV|KA|KW|KY|ML|PA|PH|TD|ZE)/i;
const WALES = /^(CF|SA|NP|LD|LL)\d/i;
const pc = (s: string | null | undefined) => (s ?? "").toUpperCase().replace(/\s+/g, "");
/** A reference as a bare key. A TDS number inside label text ("Deposit Reference EW36859350") is the number. */
const normRef = (s: string | null | undefined) => {
  const t = (s ?? "").toUpperCase();
  return t.match(/\bEW\d{8}\b/)?.[0] ?? t.replace(/[^A-Z0-9]/g, "");
};

/** A date as YYYY-MM-DD. A pg DATE arrives as local midnight, so read the local
 *  calendar day; toISOString would give the day before under UK summer time. */
function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  if (typeof d === "string") return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : iso(new Date(d));
  if (Number.isNaN(+d)) return null;
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function countryOf(postcode: string | null, address: string): DepositRow["country"] {
  const p = pc(postcode);
  if (p ? SCOT.test(p) : /\b(edinburgh|glasgow)\b/i.test(address)) return "Scotland";
  if (WALES.test(p)) return "Wales";
  return "England";
}

/** Money held as "£1,234.56", "950" or "950.00" → pounds. */
function money(s: string | null | undefined): number | null {
  if (!s) return null;
  const n = Number(String(s).replace(/[£,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

function addWorkingDays(start: string, n: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  let left = n;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

function addDays(start: string, n: number): string {
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The legal deadline to protect: 30 days in England and Wales, 30 working days in Scotland. */
export function protectBy(start: string, country: DepositRow["country"]): string {
  return country === "Scotland" ? addWorkingDays(start, 30) : addDays(start, 30);
}

/* os_flatbonds.deposit_amount holds Flatfair's figure as it comes, in PENCE
   (89423 is £894.23, five weeks of a £178.84 weekly rent), whatever the
   column's note in lib/db says. Measured on live, 19 Nov 2026. */
const penceToPounds = (v: number | string | null): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) / 100 : null;
};

/** A reference with a run of digits in it, not a label such as "LL holds" or "Plan". */
const looksLikeRef = (s: string | null) => Boolean(s && /\d{5,}/.test(s) && !/#|\bplan\b/i.test(s));

/** A Flatfair plan number named in a status or reference ("Flatfair plan #110969", "Plan #77564"). */
const planIdIn = (s: string | null | undefined): string | null => (s ?? "").match(/(?:#|plan\s*#?)\s*(\d{4,})/i)?.[1] ?? null;

const NOISE = new Set([
  "flat", "room", "rm", "apt", "apartment", "unit", "the", "street", "road", "avenue", "close", "court",
  "place", "drive", "lane", "way", "gardens", "rest", "house", "floor", "upper", "lower",
]);
const escapeRe = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * One letting unit: the room or flat, the building number WITH its letter,
 * the street and the postcode. "Room 1, 5a Any Road" and "Room 1/5a
 * Any Road" are one unit; "Room 1, 5b Any Road" is another, and so are
 * "Flat A" and "Flat C" at 41 Any Road.
 *
 * "a/b" reads by country. In Scotland it is building a, flat b ("Any Place
 * 17/7", "Any Rest 21/2, Edinburgh"), except before another
 * number, where "1/2, 12 Any Road" and "Any Street 2/11 59" are
 * flat 1/2 at 12 and flat 2/11 at 59. In England "3 / 26 Any Road" is
 * Room 3 at 26. Empty when no number or street.
 */
export function unitKey(address: string | null | undefined, postcode: string | null | undefined): string {
  const p = pc(postcode);
  const scot = p ? SCOT.test(p) : /\b(edinburgh|glasgow)\b/i.test(address ?? "");
  let s = ` ${(address ?? "").toLowerCase().replace(/['’.]/g, "").replace(/,/g, " , ")} `;
  if (p.length >= 5) s = s.replace(new RegExp(`${escapeRe(p.slice(0, -3))}\\s*${escapeRe(p.slice(-3))}`, "i"), " ");
  s = s.replace(/\b(\d+)\s+([a-z])\s*(?=[\/,])/g, "$1$2 ")       // "18 B / Any Road" → 18b
    .replace(/(\d+)\s*-\s*(\d+)/g, "$1-$2");                      // "4 - 6" → 4-6
  let unit = "";
  let bldgHint = "";
  const take = (re: RegExp, pick = 1) => {
    if (unit) return;
    const m = s.match(re);
    if (m) { unit = m[pick].replace(/\s+/g, ""); s = s.replace(m[0], " "); }
  };
  take(/\(([0-9a-z/ ]{1,8})\)/);                                                                     // 1 (3f2) Any Terrace
  take(/\b((?:top|ground|first|second|third|basement|upper|lower|garden)\s+floor)(?:\s+flat)?\b/);  // Top Floor Flat 41 Any Hill
  /* Room 1, Flat A, Apartment 1-2; a Scottish "Flat 0/1/3" keeps its slashes, an English "Room 1/5a" is room 1 at 5a. */
  take(scot
    ? /\b(?:room|rooom|rm|flat|apartment|apt|unit)\.?\s*(?:no\.?\s*)?(\d+(?:-\d+)?(?:\/\d+)*[a-z]?|[a-z])\b/
    : /\b(?:room|rooom|rm|flat|apartment|apt|unit)\.?\s*(?:no\.?\s*)?(\d+(?:-\d+)?[a-z]?|[a-z])\b/);
  take(/(?:^|\s)(\d+\s*\/\s*\d+)\s*,?\s+(?=\d+[a-z]?\s)/);                                   // 1/2, 12 Any Road; 2/11 59
  if (!unit) {
    const m = s.match(/(\d+[a-z]?)\s*\/\s*(\d+[a-z]?)/);
    if (m) {
      /* Scotland: building / flat. England: room / building. */
      if (scot) { unit = m[2]; bldgHint = m[1]; } else { unit = m[1]; bldgHint = m[2]; }
      s = s.replace(m[0], ` ${bldgHint} `);
    }
  }
  const words = s.split(/[^a-z0-9-]+/).filter(Boolean);
  const bldg = bldgHint || words.find((w) => /^\d+(-\d+)?[a-z]?$/.test(w));
  const street = words.find((w) => /^[a-z]{3,}$/.test(w) && !NOISE.has(w)) ?? words.find((w) => /^[a-z]{3,}$/.test(w));
  return bldg && street ? `${bldg}|${street}|${p}|${unit}` : "";
}

export function positionOf(status: string | null): Position | null {
  const s = (status ?? "").trim();
  if (!s) return null;
  if (/^archived/i.test(s)) return "archived";
  if (/not found|cannot be located|unprotected/i.test(s)) return "not_found";
  if (/^TLE\s*[-–]\s*TDS|^Protected with TDS/i.test(s)) return "tle_tds";
  if (/^TLE\s*[-–]\s*MDS|^TLE\s*[-–]\s*mydeposits/i.test(s)) return "tle_mds";
  if (/flatfair no deposit|^No deposit \(Flatfair|deposit replacement/i.test(s)) return "flatfair_plan";
  if (/^Landlord\b/i.test(s)) return "landlord_scheme";
  if (/^Market only/i.test(s)) return "landlord_holds";
  if (/^Management transfer/i.test(s)) return "transfer";
  if (/^No deposit/i.test(s)) return "no_deposit";
  return "check";
}

/* ── The read ───────────────────────────────────────────────────────── */

type PropRow = {
  id: string;
  address: string | null;
  postcode: string | null;
  payprop_no: string | null;
  service_level: string | null;
  management: string | null;
  landlord_name: string | null;
  agent_name: string | null;
  tenant_names: string | null;
};

type FactRow = {
  property_id: string;
  field: string;
  value: string | null;
  file_key: string | null;
  source: string | null;
  captured_at: Date | null;
  captured_by: string | null;
  verified_at: Date | null;
  verified_by: string | null;
};

type FlatRow = {
  id: number;
  status: string;
  product_type: string | null;
  deposit_provider: string | null;
  deposit_type: string | null;
  registration_number: string | null;
  deposit_amount: number | string | null;
  start_date: Date | string | null;
  address: string | null;
  postcode: string | null;
  branch_name: string | null;
  managed_by: string | null;
  docs: string[] | null;
  fetched_at: Date | null;
};

/** What a sign-off on this row covers: why it is flagged, and each thing missing. */
export function signOffCovers(r: Pick<DepositRow, "flagged" | "gaps">): string[] {
  return [`act:${r.flagged}`, ...r.gaps];
}

/** Every field this register reads off a home. */
export const DEPOSIT_FIELDS = [
  "deposit_status", "deposit_ref", "deposit_amount", "deposit_protected_on", "deposit_registered_by",
  "doc_deposit_cert", "deposit_pi_served_on", "deposit_notes",
] as const;
const READ_FIELDS = [...DEPOSIT_FIELDS, "tenancy_start", "tenants_count", "rex_pm_status", "service_package"];

/** The fields a person may set from this screen. */
export const EDITABLE = new Set<string>([
  "deposit_status", "deposit_ref", "deposit_amount", "deposit_protected_on", "deposit_registered_by",
  "deposit_pi_served_on", "deposit_notes",
]);

/** Statuses offered on the screen: the September audit's own words, so old and new rows read alike. */
export const STATUS_CHOICES = [
  "TLE - TDS",
  "TLE - MDS",
  "TLE - flatfair No Deposit",
  "Landlord - TDS",
  "Landlord - TDS Insured",
  "Landlord - DPS",
  "Landlord - DPS Insured",
  "Landlord - mydeposits (E&W)",
  "Landlord - mydeposits Scotland",
  "Landlord - SafeDeposits Scotland",
  "Landlord - Letting Protection Service Scotland",
  "Market only - landlord holds deposit",
  "Management transfer - deposit transfer pending",
  "No deposit taken (confirmed)",
  "No deposit - vacant / tenancy ended",
  "No deposit - tenancy fell through",
  "No deposit - sold / withdrawn",
  "Archived / sold - remove from PayProp",
  "NOT FOUND - deposit cannot be located",
];

/* Names REX spells one way and Flatfair or PayProp another. */
const NICKNAMES: Record<string, string> = { kasia: "katarzyna", kate: "katarzyna" };
const canonName = (n: string) => n.trim().replace(/^(\S+)/, (w) => NICKNAMES[w.toLowerCase()] ?? w);

/**
 * Agents the compliance book says have left. Read from the book as REX built
 * it, before the OS's own agent moves: a move hands a leaver's homes to
 * someone current, and reading after it marked the new agent as the leaver.
 * Null when the book has never been built.
 */
async function leaverNames(): Promise<string[] | null> {
  const [held, moves] = await Promise.all([heldComplianceBookStrict().catch(() => null), agentMoves()]);
  if (!held) return null;
  /* An agent whose whole book the office has handed to someone current
     (Admin > agent moves) is not a leaver with homes left behind: their homes
     are looked after. One agent's Glasgow book, handed to Sean, is one. */
  const handedOver = moves.filter((m) => m.kind === "agent").map((m) => m.label);
  const left = new Set<string>();
  for (const p of held.book.properties) {
    if (p.agentLeft && p.agent && !handedOver.some((h) => sameAgent(h, p.agent))) left.add(p.agent);
  }
  return [...left].sort();
}

const branchAgent = (b: string | null) => (b ?? "").replace(/^the letting'?s? experts?\s*-\s*/i, "").trim() || null;

/** Statuses that say a deposit is (or should be) held somewhere: never dropped silently. */
const HELD_SOMEWHERE = new Set<Position>(["tle_tds", "tle_mds", "transfer", "landlord_scheme", "not_found"]);
/** Sources whose tenancy start describes the protected deposit's own tenancy (the scheme reports and people). */
const TRUSTED_START = /susan|tds|mydeposits|manual|flatfair/i;

export async function depositRegister(): Promise<DepositRegister> {
  if (!hasDb()) throw new Error("No database on this environment.");

  /* Four reads, all of them live. Any one failing fails the screen: a register
     with half its sources missing would read as fewer gaps, not more. */
  const [props, facts, flats, leavers, signRows] = await Promise.all([
    q<PropRow>(
      `SELECT id, address, postcode, payprop_no, service_level, management, landlord_name, agent_name, tenant_names
         FROM os_properties WHERE active`
    ),
    q<FactRow>(
      `SELECT property_id, field, value, file_key, source, captured_at, captured_by, verified_at, verified_by
         FROM os_property_facts WHERE field = ANY($1)`,
      [READ_FIELDS]
    ),
    q<FlatRow>(
      `SELECT f.id, f.status, f.product_type, f.deposit_provider, f.deposit_type, f.registration_number,
              f.deposit_amount, f.start_date, f.address, f.postcode, f.branch_name, f.managed_by, f.fetched_at,
              (SELECT array_agg(DISTINCT d.type) FROM os_flatbond_docs d WHERE d.env = f.env AND d.flatbond_id = f.id) AS docs
         FROM os_flatbonds f
        WHERE f.env = 'live' AND f.status NOT IN ('canceled', 'cancelled', 'closed')`
    ),
    leaverNames(),
    q<{ property_id: string; reason: string; covers: unknown; signed_by: string | null; signed_at: Date }>(
      `SELECT property_id, reason, covers, signed_by, signed_at FROM os_deposit_signoffs WHERE reopened_at IS NULL`
    ),
  ]);
  const signs = new Map(signRows.map((s) => [s.property_id, s]));
  /** The start of the new let on a home that has one: a sign-off from before it was about the last tenancy. */
  const letStart = new Map<string, string>();

  const byHome = new Map<string, Map<string, FactRow>>();
  for (const f of facts) {
    let m = byHome.get(f.property_id);
    if (!m) byHome.set(f.property_id, (m = new Map()));
    m.set(f.field, f);
  }
  const factsOf = (id: string) => byHome.get(id) ?? new Map<string, FactRow>();
  const depositFacts = (id: string) => [...factsOf(id).keys()].filter((k) => (DEPOSIT_FIELDS as readonly string[]).includes(k)).length;

  const isLeaver = (name: string | null): boolean | null => {
    if (leavers == null) return null;
    if (!name) return false;
    return leavers.some((l) => sameAgent(canonName(l), canonName(name)));
  };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const shapeFlat = (r: FlatRow): Flat => {
    const branch = branchAgent(r.branch_name);
    return {
      id: r.id,
      status: r.status,
      product: r.product_type ?? "unselected",
      provider: r.deposit_provider,
      type: r.deposit_type,
      ref: r.registration_number?.trim() || null,
      amount: penceToPounds(r.deposit_amount),
      start: iso(r.start_date),
      branch,
      branchLeft: isLeaver(branch),
      managedBy: r.managed_by,
      piSigned: (r.docs ?? []).includes("deposit_protection_certificate_signed"),
      regCert: (r.docs ?? []).includes("deposit_registration_certificate"),
    };
  };
  const live = (r: FlatRow) => r.status === "active" && (!r.start_date || iso(r.start_date)! <= today);

  /* Flatfair indexes. */
  const flatById = new Map<string, FlatRow>();
  const flatByRef = new Map<string, FlatRow>();
  const flatByUnit = new Map<string, FlatRow[]>();
  for (const r of flats) {
    flatById.set(String(r.id), r);
    const ref = normRef(r.registration_number);
    if (ref) flatByRef.set(ref, r);
    const k = unitKey(r.address, r.postcode);
    if (k) flatByUnit.set(k, [...(flatByUnit.get(k) ?? []), r]);
  }
  const newestFirst = (a: FlatRow, b: FlatRow) => String(iso(b.start_date)).localeCompare(String(iso(a.start_date)));

  /* ── One row per home: fold the OS's duplicates ──────────────────────
     Some homes are on the OS twice (a PayProp-sheet record and a REX PM one,
     two REX records). Keep the record with a PayProp number, else the one
     with the most deposit facts; the other goes on the row as alsoRecords,
     and a second record that holds deposit facts of its own makes the row a
     "Two records" job rather than being silently dropped. */
  const groups = new Map<string, PropRow[]>();
  const loners: PropRow[] = [];
  for (const p of props) {
    const k = unitKey(p.address, p.postcode);
    if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
    else loners.push(p);
  }
  type Home = { p: PropRow; key: string; also: PropRow[] };
  const homes: Home[] = loners.map((p) => ({ p, key: "", also: [] }));
  for (const [key, list] of groups) {
    const ranked = [...list].sort((a, b) =>
      Number(Boolean(b.payprop_no)) - Number(Boolean(a.payprop_no)) ||
      depositFacts(b.id) - depositFacts(a.id) ||
      Number(Boolean(b.tenant_names?.trim())) - Number(Boolean(a.tenant_names?.trim())) ||
      a.id.localeCompare(b.id)
    );
    homes.push({ p: ranked[0], key, also: ranked.slice(1) });
  }

  /* ── Claims: a Flatfair record belongs to one home ─────────────────────
     First by what the record names (TDS reference, plan number), then by
     the unit. The newest tenancy at the unit wins over an older one the
     record names: a home re-let since the record was taken. */
  const claimed = new Map<number, string>();
  const named = new Map<string, { flat: FlatRow | null; wrongPlan: boolean; refElsewhere: boolean }>();
  const homeKeys = new Set(homes.map((h) => h.key).filter(Boolean));
  const asks = homes.map((h) => {
    const f = factsOf(h.p.id);
    const ref = normRef(f.get("deposit_ref")?.value);
    const plan = planIdIn(f.get("deposit_status")?.value) ?? planIdIn(f.get("deposit_ref")?.value) ??
      (/^\d{4,6}$/.test(ref) && countryOf(h.p.postcode, h.p.address ?? "") !== "Scotland" ? ref : null);
    const byRef = ref ? flatByRef.get(ref) ?? null : null;
    const byPlan = plan ? flatById.get(plan) ?? null : null;
    return { h, byRef, byPlan };
  });
  const keyOf = (r: FlatRow) => unitKey(r.address, r.postcode);
  /* Pass 1: what the record names, where the Flatfair address is this unit (or can't be told). */
  for (const { h, byRef, byPlan } of asks) {
    const fits = (r: FlatRow | null) => Boolean(r && (!h.key || !keyOf(r) || keyOf(r) === h.key) && !claimed.has(r.id));
    const hit = fits(byRef) ? byRef : fits(byPlan) ? byPlan : null;
    if (hit) claimed.set(hit.id, h.p.id);
    named.set(h.p.id, { flat: hit, wrongPlan: false, refElsewhere: false });
  }
  /* Pass 2: what the record names at ANOTHER address. A plan there was matched
     by an earlier sweep and isn't trusted. A TDS reference there is kept only
     when no home on the book is that other unit; otherwise it is the other
     home's deposit and this one needs a look. */
  for (const { h, byRef, byPlan } of asks) {
    const n = named.get(h.p.id)!;
    if (n.flat) continue;
    if (byRef && claimed.has(byRef.id)) {
      n.refElsewhere = true;
    } else if (byRef) {
      const k = keyOf(byRef);
      if (k && homeKeys.has(k) && k !== h.key) n.refElsewhere = true;
      else { n.flat = byRef; claimed.set(byRef.id, h.p.id); }
    } else if (byPlan && !claimed.has(byPlan.id)) {
      n.wrongPlan = true;
    }
  }

  const rowsOut: DepositRow[] = [];
  const shown = new Set<number>();

  for (const h of homes) {
    const p = h.p;
    const f = factsOf(p.id);
    const val = (k: string) => f.get(k)?.value?.trim() || null;
    const address = tidyAddress(p.address ?? "") || p.address || p.id;
    const country = countryOf(p.postcode, p.address ?? "");

    /* Flatfair for this home. */
    const own = named.get(p.id)!;
    const atUnit = (h.key ? flatByUnit.get(h.key) ?? [] : []).filter((r) => !claimed.has(r.id) || claimed.get(r.id) === p.id).sort(newestFirst);
    const newestLive = atUnit.find((r) => r.status === "active") ?? null;
    let flatRow = own.flat;
    if (newestLive && (!flatRow || String(iso(newestLive.start_date)) > String(iso(flatRow.start_date)))) flatRow = newestLive;
    if (!flatRow) flatRow = atUnit[0] ?? null;
    const others = atUnit.filter((r) => r.id !== flatRow?.id);
    const flat = flatRow ? shapeFlat(flatRow) : null;

    /* Parked homes (nobody in, archived) stay off - unless Flatfair has a
       live tenancy there, the record says to archive it in PayProp, the record
       says a deposit is held somewhere (that one needs confirming released),
       or a let is on record that has started (let-only homes often carry no
       tenant names). */
    const status = val("deposit_status");
    const recorded = positionOf(status);
    const parked = notLetFrom(p.tenant_names, f);
    const flatStarted = Boolean(flatRow && live(flatRow));
    const startOnRecord = val("tenancy_start")?.slice(0, 10) ?? "";
    const recordedLet = Boolean(status) && recorded !== "archived" && recorded !== "no_deposit" &&
      Boolean(startOnRecord) && startOnRecord <= today && !/^(archived|vacant, no letting agreement)/i.test(val("rex_pm_status") ?? "");
    const heldOnRecord = recorded != null && HELD_SOMEWHERE.has(recorded);
    if (parked && recorded !== "archived" && !flatStarted && !recordedLet && !heldOnRecord) continue;
    const notLetNow = parked && !flatStarted && !recordedLet && heldOnRecord;

    if (flatRow) { claimed.set(flatRow.id, p.id); shown.add(flatRow.id); }
    for (const r of others) shown.add(r.id);

    const lvl = p.service_level;
    const svcText = `${val("service_package") ?? ""} ${p.management ?? ""}`;
    const service: DepositRow["service"] =
      lvl === "managed" ? "managed"
        : lvl === "market_only" ? "let_only"
          : lvl === "rent_collect" ? "rent_collect"
            : /tenant.?find|let.?only|no letting agreement/i.test(svcText) ? "let_only"
              : /fully managed|managed|active letting agreement/i.test(svcText) ? "managed"
                : "unknown";

    /* A new let: Flatfair's tenancy began after the deposit on record (by more
       than a month, so a late re-registration of the same tenancy is not one).
       Imported values (the September sheets, REX PM, Propoly) describe the old
       let whatever day they were captured; a value a person typed in on or
       after the new let began is the new let's. */
    const flatStart = flatRow && flatRow.status === "active" ? iso(flatRow.start_date) : null;
    const before = (k: string) => {
      const r = f.get(k);
      if (!r || !flatStart) return false;
      return !(r.source === "manual" && r.captured_at && iso(r.captured_at)! >= flatStart);
    };
    const oldStart = before("tenancy_start") ? startOnRecord || null : null;
    const oldDate = before("deposit_protected_on") ? val("deposit_protected_on")?.slice(0, 10) ?? null : null;
    const anchor = [oldStart, oldDate].filter(Boolean).sort().pop() ?? null;
    const newLet = Boolean(flatStart && (anchor ? flatStart > addDays(anchor, 30) : !status));
    const cur = (k: string) => (newLet && before(k) ? null : val(k));
    if (newLet && flatStart) letStart.set(p.id, flatStart);

    /* Where it is. */
    const fromFlatfair: DepositRow["fromFlatfair"] = [];
    const curStatus = cur("deposit_status");
    let ref = cur("deposit_ref");
    let position: Position | null = own.wrongPlan || own.refElsewhere ? "check" : positionOf(curStatus);
    /* REX PM's bare "Active" with a scheme number: ours on a managed home, the landlord's on a let-only one. */
    const doubted = own.wrongPlan || own.refElsewhere;
    if (position === "check" && !doubted && planIdIn(ref)) position = "flatfair_plan";
    if (position === "check" && !doubted && looksLikeRef(ref)) {
      position = service === "let_only" ? "landlord_scheme" : country === "Scotland" ? "tle_mds" : service === "managed" ? "tle_tds" : "check";
    }
    if ((!position || position === "check") && !own.wrongPlan && !own.refElsewhere && flatRow && flatRow.status === "active") {
      const fromFlat: Position | null =
        flatRow.product_type === "flatbond" ? "flatfair_plan"
          /* Registered through TLE's Flatfair group with TDS: TLE's deposit, whoever manages the let. */
          : flatRow.product_type === "traditional_deposit" && flat!.ref ? "tle_tds"
            : null;
      if (fromFlat) { position = fromFlat; fromFlatfair.push("position"); }
    }
    if (!position) position = service === "let_only" ? "landlord_holds" : "not_found";

    let amount = money(cur("deposit_amount"));
    const useFlat = Boolean(flat && flat.product === "traditional_deposit" && (position === "tle_tds" || position === "landlord_scheme"));
    if (useFlat && (!ref || !looksLikeRef(ref)) && flat!.ref) { ref = flat!.ref; fromFlatfair.push("ref"); }
    if (useFlat && amount == null && flat!.amount != null) { amount = flat!.amount; fromFlatfair.push("amount"); }

    const protectedOn = cur("deposit_protected_on")?.slice(0, 10) ?? null;
    const recordStart = cur("tenancy_start")?.slice(0, 10) ?? null;
    /* When Flatfair holds the very deposit on record, its start is that tenancy's; REX PM's start is often an older one. */
    const sameDeposit = Boolean(flat?.start && flat.ref && ref && normRef(flat.ref) === normRef(ref));
    const tenancyStart = sameDeposit ? flat!.start : newLet ? recordStart ?? flatStart : recordStart ?? (flat?.start ?? null);
    const piServedOn = cur("deposit_pi_served_on")?.slice(0, 10) ?? null;
    const certFact = newLet && before("doc_deposit_cert") ? undefined : f.get("doc_deposit_cert");
    const certOnFileRecord = Boolean(certFact && (certFact.file_key || certFact.value) && !/^not applicable$/i.test(certFact.value ?? ""));
    const certOnFile = certOnFileRecord || Boolean(useFlat && flat!.piSigned);
    const piEvidence: DepositRow["piEvidence"] = piServedOn ? "date" : useFlat && flat!.piSigned ? "flatfair" : certOnFileRecord ? "file" : null;

    const values: DepositRow["values"] = {};
    const put = (k: keyof DepositRow["values"], field: string) => {
      const r = f.get(field);
      if (r && !(newLet && before(field))) values[k] = { value: r.value, source: r.source, at: iso(r.captured_at), by: r.captured_by };
    };
    put("status", "deposit_status");
    put("ref", "deposit_ref");
    put("amount", "deposit_amount");
    put("protectedOn", "deposit_protected_on");
    put("piServedOn", "deposit_pi_served_on");
    put("cert", "doc_deposit_cert");
    put("registeredBy", "deposit_registered_by");
    put("notes", "deposit_notes");

    /* What is missing, by who holds it. */
    const gaps: Gap[] = [];
    let protectDeadline: string | null = null;
    const heldByTle = position === "tle_tds" || position === "tle_mds";
    const refDiffers = Boolean(flat && flat.ref && ref && !fromFlatfair.includes("ref") && normRef(flat.ref) !== normRef(ref) && position === "tle_tds" && /^EW/i.test(ref));
    if (heldByTle) {
      if (!ref) gaps.push("ref");
      if (amount == null) gaps.push("amount");
      if (!protectedOn) gaps.push("date");
      if (!certOnFile) gaps.push("cert");
      /* Late only against the start of the tenancy the protected date belongs
         to: the start of a Flatfair DEPOSIT at the unit where there is one (a
         no-deposit plan's start says nothing about a deposit), else a start
         from the scheme reports or a person, else REX PM's start when it is
         within a year of the date protected. Older than that, REX PM's
         start is usually an earlier tenancy's, which made re-lets look years late. */
      if (protectedOn && !refDiffers) {
        const starts = [flatRow, ...others]
          .filter((r): r is FlatRow => Boolean(r && r.product_type === "traditional_deposit"))
          .map((r) => iso(r.start_date)).filter((x): x is string => Boolean(x))
          .filter((x) => x <= addDays(protectedOn, 30)).sort();
        const fromFlat = starts.pop() ?? null;
        const startFact = f.get("tenancy_start");
        const trusted = startFact && recordStart && (TRUSTED_START.test(startFact.source ?? "") || recordStart >= addDays(protectedOn, -365)) ? recordStart : null;
        const start = fromFlat ?? trusted;
        if (start) protectDeadline = protectBy(start, country);
        if (start && protectedOn > protectBy(start, country)) gaps.push("late");
      }
    }
    if (position === "landlord_scheme") {
      if (!ref) gaps.push("ref");
      else if (!looksLikeRef(ref)) gaps.push("ref_label");
      if (!certOnFile) gaps.push("cert");
    }
    const pendingStart = flatRow ? iso(flatRow.start_date) : null;
    if (flatRow && /^pending/.test(flatRow.status) && flatRow.product_type === "traditional_deposit" && pendingStart && pendingStart <= today) gaps.push("unfunded");
    if (refDiffers) gaps.push("ref_differs");
    const liveHere = [flatRow, ...others].filter((r): r is FlatRow => Boolean(r && live(r)));
    const kinds = new Set(liveHere.map((r) => r.product_type));
    if (kinds.has("flatbond") && kinds.has("traditional_deposit")) gaps.push("conflict");
    const liveDeposits = liveHere.filter((r) => r.product_type === "traditional_deposit" && r.registration_number);
    if (liveDeposits.length > 1) gaps.push("two_live");
    if (["no_deposit", "landlord_holds", "not_found", "transfer"].includes(position) && liveDeposits.length) gaps.push("flat_live");
    /* "No deposit - vacant" on record while a no-deposit plan has started since: a new let nobody recorded. */
    const livePlan = liveHere.find((r) => r.product_type === "flatbond");
    if (position === "no_deposit" && livePlan && !/flatfair|plan|replacement/i.test(curStatus ?? "") && (!startOnRecord || String(iso(livePlan.start_date)) >= startOnRecord)) gaps.push("plan_live");
    if (own.wrongPlan) gaps.push("wrong_plan");
    if (own.refElsewhere) gaps.push("ref_elsewhere");
    if (!status && !flat) gaps.push("no_record");
    if (notLetNow) gaps.push("not_let_now");
    const disagreeing = h.also.filter((a) => depositFacts(a.id) > 0 && (factsOf(a.id).get("deposit_status")?.value ?? null) !== status);
    if (disagreeing.length) gaps.push("duplicate");

    const checked = [...DEPOSIT_FIELDS].filter((k) => !(newLet && before(k))).map((k) => f.get(k)).filter((r): r is FactRow => Boolean(r?.verified_at))
      .sort((a, b) => +new Date(b.verified_at!) - +new Date(a.verified_at!))[0];

    rowsOut.push({
      id: p.id,
      address,
      postcode: p.postcode,
      country,
      service,
      paypropNo: p.payprop_no,
      agent: p.agent_name,
      agentLeft: isLeaver(p.agent_name),
      landlord: p.landlord_name,
      tenants: p.tenant_names,
      tenancyStart,
      position,
      heldByTle,
      status: curStatus,
      ref,
      amount,
      protectedOn,
      piServedOn,
      piEvidence,
      protectBy: protectDeadline,
      certOnFile,
      registeredBy: cur("deposit_registered_by"),
      notes: val("deposit_notes"),
      values,
      flatfair: flat,
      otherFlats: others.filter((r) => r.status === "active").map(shapeFlat),
      alsoRecords: h.also.map((a) => ({ id: a.id, status: factsOf(a.id).get("deposit_status")?.value ?? null })),
      newLet,
      fromFlatfair,
      gaps,
      action: null,
      done: false,
      flagged: null,
      signOff: null,
      lastChecked: checked ? { at: iso(checked.verified_at)!, by: checked.verified_by } : null,
    });
  }

  /* One reference on two homes: one of them is wrong. */
  const byRef = new Map<string, DepositRow[]>();
  for (const r of rowsOut) {
    const k = normRef(r.ref);
    if (r.position === "archived" || !/\d{5,}/.test(k)) continue;
    byRef.set(k, [...(byRef.get(k) ?? []), r]);
  }
  for (const list of byRef.values()) if (list.length > 1) for (const r of list) r.gaps.push("dup_ref");

  /* What to do, most pressing first. */
  const CONFLICTS: Gap[] = ["conflict", "ref_differs", "flat_live", "plan_live", "dup_ref", "duplicate"];
  for (const r of rowsOut) {
    const g = new Set(r.gaps);
    r.action =
      r.position === "archived" ? (r.paypropNo ? "housekeeping" : null)
        : r.position === "not_found" || g.has("unfunded") ? "urgent"
          : r.position === "check" ? "check"
            : g.has("late") ? "late"
              : g.has("not_let_now") ? "released"
                : CONFLICTS.some((c) => g.has(c)) ? "conflict"
                  : g.has("two_live") ? "old_live"
                  : r.position === "transfer" ? "transfer"
                    : r.position === "landlord_scheme" && (g.has("ref") || g.has("ref_label")) ? "landlord_ref"
                      : r.position === "landlord_scheme" && g.has("cert") ? "landlord_cert"
                        : r.heldByTle && r.gaps.length ? "held_details"
                          : null;
    r.flagged = r.action;
    const s = signs.get(r.id) ?? r.alsoRecords.map((a) => signs.get(a.id)).find(Boolean);
    if (s && r.flagged) {
      const covers = new Set(Array.isArray(s.covers) ? s.covers.map(String) : []);
      const since = r.gaps.filter((x) => !covers.has(x));
      const signedOn = iso(s.signed_at) ?? "";
      const newLetSince = Boolean(letStart.get(r.id) && signedOn < letStart.get(r.id)!);
      const holds = !newLetSince && since.length === 0 && covers.has(`act:${r.flagged}`);
      r.signOff = { by: s.signed_by, at: new Date(s.signed_at).toISOString(), reason: s.reason, holds, since };
      if (holds) r.action = null;
    }
    r.done = r.action == null;
  }

  /* Live Flatfair deposits and plans no home on the book claims. */
  const unmatched: Unmatched[] = flats
    .filter((r) => !shown.has(r.id) && r.status === "active")
    .map((r) => {
      const s = shapeFlat(r);
      return { id: r.id, address: r.address ?? "", postcode: r.postcode, product: s.product, status: r.status, ref: s.ref, amount: s.amount, start: s.start, branch: s.branch, branchLeft: s.branchLeft };
    })
    .sort((a, b) => a.address.localeCompare(b.address));

  const flatfairAt = flats.reduce<Date | null>((m, r) => (r.fetched_at && (!m || r.fetched_at > m) ? r.fetched_at : m), null);
  const recordAt = facts
    .filter((f) => (DEPOSIT_FIELDS as readonly string[]).includes(f.field))
    .reduce<Date | null>((m, r) => (r.captured_at && (!m || r.captured_at > m) ? r.captured_at : m), null);

  rowsOut.sort((a, b) => a.address.localeCompare(b.address, "en-GB", { numeric: true }));

  return {
    at: new Date().toISOString(),
    flatfairAt: flatfairAt ? new Date(flatfairAt).toISOString() : null,
    recordAt: recordAt ? new Date(recordAt).toISOString() : null,
    leaversKnown: leavers != null,
    leavers: (leavers ?? []).filter((l) =>
      rowsOut.some((r) => r.agentLeft && sameAgent(canonName(l), canonName(r.agent ?? ""))) ||
      rowsOut.some((r) => r.flatfair?.branchLeft && sameAgent(canonName(l), canonName(r.flatfair.branch ?? ""))) ||
      unmatched.some((u) => u.branchLeft && sameAgent(canonName(l), canonName(u.branch ?? "")))),
    rows: rowsOut,
    unmatched,
  };
}
