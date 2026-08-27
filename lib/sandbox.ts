/**
 * The sandbox — fake records you can drive through the whole process, and
 * rewind whenever you like.
 *
 * James, 23 Aug: *"I'm concerned that we're going to get emails out."* That
 * concern is the design, not a footnote to it. Everything below exists to make
 * one guarantee cheap to check:
 *
 *   **A SANDBOX RECORD CAN NEVER SEND ANYTHING.**
 *
 * ── How that guarantee is kept ────────────────────────────────────────────
 *
 * Not by remembering to check. By making it structural:
 *
 * 1. **Every sandbox id starts `sbx_`.** One prefix, checked in one function
 *    (`isSandbox`), and any send path can refuse in a single line. A flag on a
 *    record can be dropped by a careless copy; a prefix travels with the id
 *    everywhere it goes, including into logs and URLs where you can SEE it.
 *
 * 2. **Every email address is `@sandbox.invalid`.** `.invalid` is reserved by
 *    RFC 2606 and can never resolve. So if something one day sends anyway —
 *    past the prefix check, past review — it goes nowhere. Two independent
 *    failures have to line up before a real person hears from us.
 *
 * 3. **Phone numbers are Ofcom's drama range (07700 900xxx)**, reserved
 *    precisely so fiction cannot ring a real phone.
 *
 * The names are obviously fictional too. A sandbox landlord called "Sarah
 * Jones" is one screenshot away from being mistaken for a real customer.
 *
 * ── Rewind ────────────────────────────────────────────────────────────────
 *
 * Seeding is idempotent per kind: seeding twice replaces rather than
 * accumulates, so "rewind" and "seed" are the same operation and there is no
 * drift to reason about. Rewinding one kind never touches another — you can
 * reset market appraisals mid-experiment without losing the leads you were
 * using with them.
 */

export const SANDBOX_PREFIX = "sbx_";
export const SANDBOX_EMAIL_DOMAIN = "sandbox.invalid";

/** The only check any send path needs. Cheap, and true wherever the id goes. */
export function isSandbox(id: string | null | undefined): boolean {
  return typeof id === "string" && id.startsWith(SANDBOX_PREFIX);
}

/** True if ANY id in a payload is a sandbox one — for guarding a whole send. */
export function touchesSandbox(...ids: (string | null | undefined)[]): boolean {
  return ids.some(isSandbox);
}

export const SANDBOX_KINDS = [
  { id: "tenant_lead", label: "Tenant lead", blurb: "A new enquiry, ready to qualify, shortlist and book a viewing." },
  { id: "landlord_lead", label: "Landlord lead", blurb: "A landlord to contact, chase and book an appraisal with." },
  { id: "listing", label: "Listing", blurb: "A property on the market, with a rent and a publication state." },
  { id: "market_appraisal", label: "Market appraisal", blurb: "Booked, with a real postcode so the comparables are genuine." },
  { id: "viewing", label: "Viewing", blurb: "Booked, ready for feedback and an offer." },
  { id: "application", label: "Application", blurb: "A tenancy application part-way through the checks." },
] as const;

export type SandboxKind = (typeof SANDBOX_KINDS)[number]["id"];

export interface SandboxRecord {
  id: string;
  kind: SandboxKind;
  label: string;
  /** Everything the surface needs, shaped per kind. Deliberately loose — the
   *  sandbox is for driving screens, not for type-checking a domain twice. */
  data: Record<string, unknown>;
  createdAt: string;
}

const email = (name: string) =>
  `${name.toLowerCase().replace(/[^a-z]+/g, ".")}@${SANDBOX_EMAIL_DOMAIN}`;

/** Ofcom's reserved drama range. These cannot ring anybody. */
const phone = (n: number) => `07700 900${String(n).padStart(3, "0")}`;

/**
 * The seeds.
 *
 * Postcodes are REAL and chosen because our book has comparables near them —
 * a sandbox appraisal whose research panel comes back empty teaches nothing
 * about the feature. Everything identifying a person is fiction.
 */
export function seedFor(kind: SandboxKind, now = new Date()): SandboxRecord[] {
  const at = now.toISOString();
  const day = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();
  const mk = (n: number, label: string, data: Record<string, unknown>): SandboxRecord => ({
    id: `${SANDBOX_PREFIX}${kind}_${n}`,
    kind,
    label,
    data,
    createdAt: at,
  });

  switch (kind) {
    case "tenant_lead":
      return [
        mk(1, "Testy McTestface — new enquiry", {
          name: "Testy McTestface", email: email("testy mctestface"), phone: phone(101),
          source: "Rightmove", stage: "New", budget: 950, beds: 2, area: "Liverpool L34",
        }),
        mk(2, "Sandy Sandbox — qualified", {
          name: "Sandy Sandbox", email: email("sandy sandbox"), phone: phone(102),
          source: "OnTheMarket", stage: "Qualified", budget: 1200, beds: 3, area: "Teignmouth TQ14",
        }),
      ];

    case "landlord_lead":
      return [
        mk(1, "Fictional Fiona — new lead", {
          name: "Fictional Fiona", email: email("fictional fiona"), phone: phone(201),
          source: "Website valuation form", stage: "New",
          address: "11 Station Road", postcode: "L34 5SN",
        }),
        mk(2, "Pretend Pritchard — contacted twice", {
          name: "Pretend Pritchard", email: email("pretend pritchard"), phone: phone(202),
          source: "Referral", stage: "Contacted",
          address: "4 Hermosa Road", postcode: "TQ14 9LA",
          contactAttempts: 2,
        }),
      ];

    case "listing":
      return [
        mk(1, "Sandbox House — on market", {
          name: "1 Sandbox House", locality: "Liverpool L34 5SN",
          rent: 950, rentPeriod: "month", publicationStatus: "published",
          letAgreed: false, daysOnMarket: 12,
        }),
      ];

    case "market_appraisal":
      return [
        mk(1, "11 Station Road — booked", {
          landlord: "Fictional Fiona", address: "11 Station Road", postcode: "L34 5SN",
          agent: "Sandbox Agent", appointmentAt: day(2), stage: "booked", valuation: null,
        }),
        mk(2, "4 Hermosa Road — visit passed, no figure", {
          landlord: "Pretend Pritchard", address: "4 Hermosa Road", postcode: "TQ14 9LA",
          agent: "Sandbox Agent", appointmentAt: day(-3), stage: "appraisal", valuation: null,
        }),
      ];

    case "viewing":
      return [
        mk(1, "Testy McTestface at 11 Station Road", {
          tenant: "Testy McTestface", email: email("testy mctestface"),
          property: "11 Station Road", postcode: "L34 5SN", at: day(1), status: "booked",
        }),
      ];

    case "application":
      return [
        mk(1, "Sandy Sandbox — referencing", {
          tenant: "Sandy Sandbox", email: email("sandy sandbox"), phone: phone(102),
          property: "4 Hermosa Road", postcode: "TQ14 9LA",
          offer: 995, status: "received", rightToRent: true, guarantor: false,
        }),
      ];
  }
}

/** Everything a seed of this kind would create — for the "what will this do"
 *  line, so nobody presses a button that does something unexpected. */
export function describeSeed(kind: SandboxKind): string {
  const n = seedFor(kind).length;
  return `${n} record${n === 1 ? "" : "s"}, all ids prefixed ${SANDBOX_PREFIX} and addressed @${SANDBOX_EMAIL_DOMAIN}`;
}
