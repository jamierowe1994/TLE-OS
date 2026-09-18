/**
 * Where a tenant is, from the day they make a passport to the day they are
 * living in the home. One line, in the tenant's words, and everything the
 * portal decides from it: which pages are open, what the home shows, what
 * the next step is.
 *
 * James, 12 Sep 2026: "it will change and develop based on where they're at
 * in the process ... if they're at the stage of looking for a property, then
 * it should all be around property ... once they get to the point where they
 * put in an offer on the property, it will then transfer to this kind of
 * backend. It should unlock a few different areas."
 *
 * Three phases:
 *
 *   finding   passport made, enquiring, viewing, offering - the world is the
 *             property they are after. My tenancy, Maintenance and Payments
 *             are locked; Home, Documents and Messages are open.
 *   tenancy   the offer is accepted and the deal is running through its
 *             eight stages (lib/tenant-account PORTAL_STAGES). My tenancy
 *             and Payments open; Maintenance waits for the keys.
 *   living    moved in. Everything is open.
 *
 * Shared by the live view (lib/tenant-home-view) and the sample
 * (lib/tenant-sample). No server-only imports: the side nav reads it too.
 */

export type TenantStageKey =
  | "passport"
  | "enquired"
  | "matched"
  | "viewing"
  | "viewed"
  | "offer"
  | "declined"
  | "deal_started"
  | "holding_fee"
  | "referencing"
  | "plc"
  | "deposit"
  | "tenancy_agreement"
  | "rent_payment"
  | "move_day"
  | "living";

export type TenantPhase = "finding" | "tenancy" | "living";

/**
 * The finding phase, 14 Sep 2026: two stages added so the portal matches the
 * process map (lib/process/tenant).
 *
 *   matched    we have sent them homes that fit and are waiting to hear which
 *              they want to see. It was invisible before, which meant the
 *              busiest week of a tenant's search showed "Enquired" and nothing
 *              else.
 *   declined   the landlord went with somebody else. It sits at the END of the
 *              finding list rather than where it happens, because a declined
 *              tenant has not gone backwards - they are back at matching with
 *              everything they told us still true. The portal says so, and the
 *              process map loops them to "homes that fit".
 */
export const FINDING: TenantStageKey[] = ["passport", "enquired", "matched", "viewing", "viewed", "offer", "declined"];
export const DEAL: TenantStageKey[] = ["deal_started", "holding_fee", "referencing", "plc", "deposit", "tenancy_agreement", "rent_payment", "move_day"];

export const ORDER: TenantStageKey[] = [...FINDING, ...DEAL, "living"];

export function phaseOf(stage: TenantStageKey): TenantPhase {
  if (stage === "living") return "living";
  return FINDING.includes(stage) ? "finding" : "tenancy";
}

export const isStage = (s: string | undefined | null): s is TenantStageKey => Boolean(s && (ORDER as string[]).includes(s));

export const after = (stage: TenantStageKey, than: TenantStageKey) => ORDER.indexOf(stage) > ORDER.indexOf(than);
export const atLeast = (stage: TenantStageKey, than: TenantStageKey) => ORDER.indexOf(stage) >= ORDER.indexOf(than);

/* ── What the portal says at each stage ────────────────────────────────── */

/**
 * THE UPDATE FIELD FOR EVERY STAGE - James, 14 Sep 2026: "the tenant portal
 * will obviously need an update field for each stage that is applicable."
 *
 * Before this, the words a tenant reads were in three places: the eight deal
 * stages in lib/tenant-account, the finding stages in a switch inside
 * lib/tenant-sample, and nothing at all for the two new ones. Same tenant,
 * same journey, three files - so the sample could say one thing and the live
 * portal another, and a new stage arrived silently blank.
 *
 * One table, every stage, no exceptions. A stage with no entry is a type
 * error rather than an empty card.
 *
 *   title/blurb   what is happening, in their words, on the home card
 *   next          what happens next - the line the deal view shows under it
 *   cta/href      the one thing to do about it
 *
 * Placeholders are filled by whoever renders it: {property}, {when},
 * {amount}, {agent}. A renderer with nothing to put in drops the sentence
 * rather than printing the braces (fill(), below).
 */
export type StageUpdate = {
  /** The stop's name on the road at the top of the portal. */
  label: string;
  title: string;
  blurb: string;
  next: string;
  cta: string;
  href: string;
};

export const STAGE_UPDATE: Record<TenantStageKey, StageUpdate> = {
  passport: {
    label: "Passport",
    title: "Find your next home",
    blurb: "Your passport is ready, so applying is one tap when you find the one. Have a look at what we have on now.",
    next: "Tell us what you are after and we will send you the homes that fit.",
    cta: "See properties to rent", href: "/tenant/homes",
  },
  /* James, 18 Sep 2026: after an enquiry there is nothing for the tenant to
     pick - the agent books the viewing - so the step is waiting for that, and
     the one thing they can do is get hold of the agent about it. "#agent"
     raises the agent sheet (components/tenant/AgentSheet). */
  enquired: {
    label: "Enquire",
    title: "Waiting for a viewing",
    blurb: "{agent} is arranging a time to show you round {property}. Haven't heard? Get in touch and they will book you in.",
    next: "The agent books your viewing and it appears here with the time.",
    cta: "Contact your agent", href: "#agent",
  },
  matched: {
    label: "Homes for you",
    title: "Homes that fit what you are after",
    blurb: "We have picked out the ones that match your budget, your area and when you want to move.",
    next: "Tell us which you would like to see and we will book it in.",
    cta: "See the homes", href: "/tenant/next",
  },
  viewing: {
    label: "View it",
    title: "Your viewing is booked",
    blurb: "{when}, with {agent}. Bring some ID and any questions - we will have the answers on the property and the landlord.",
    next: "We will remind you on the morning, and you can move it any time from here.",
    cta: "Add to my calendar", href: "/tenant/next",
  },
  viewed: {
    label: "Viewed",
    title: "How was it?",
    blurb: "Tell us what you thought of {property}. If it is the one, make your offer from here and your passport does the rest.",
    next: "Make an offer, ask a question, or tell us what was wrong and we will send others.",
    /* "#offer" raises the offer sheet (components/tenant/ViewedSheets). */
    cta: "Make an offer", href: "#offer",
  },
  offer: {
    label: "Offer",
    title: "Your application is with the landlord",
    blurb: "{amount} a month on {property}. We usually hear back within a day, and you will know the moment we do.",
    next: "The landlord answers. If it is yes, we take a holding fee and referencing starts.",
    cta: "See my application", href: "/tenant/next",
  },
  declined: {
    label: "Not this one",
    title: "That one did not go your way",
    blurb: "The landlord has gone with another application on {property}. It happens, and it is not a reflection on you.",
    next: "We have picked out others that fit. Tell us which to book and you keep your place in the queue.",
    cta: "See the other homes", href: "/tenant/next",
  },
  deal_started: {
    label: "Offer accepted",
    title: "Your offer has been accepted",
    blurb: "Your offer has been accepted and the paperwork is being set up.",
    next: "We will ask you for a holding fee to take the property off the market.",
    cta: "See my tenancy", href: "/tenant/tenancy",
  },
  holding_fee: {
    label: "Holding fee",
    title: "Holding fee",
    blurb: "We are collecting the holding fee.",
    next: "Once it is in, your referencing starts.",
    cta: "See my tenancy", href: "/tenant/tenancy",
  },
  referencing: {
    label: "Referencing",
    title: "Referencing",
    blurb: "Your references are being checked: employer, previous landlord and credit.",
    next: "Reply quickly to anything the referencing team asks for. It is the one thing that speeds this up.",
    cta: "See what is needed", href: "/tenant/tenancy",
  },
  plc: {
    label: "Compliance checks",
    title: "Compliance checks",
    blurb: "Your references are back. We are checking the property's certificates and the landlord's documents.",
    next: "Nothing for you here. This is on us and the landlord.",
    cta: "See my tenancy", href: "/tenant/tenancy",
  },
  deposit: {
    label: "Deposit",
    title: "Deposit",
    blurb: "The compliance checks have passed. Your deposit or deposit alternative is being arranged.",
    next: "You will hear from us, or from Flatfair if you chose the deposit alternative.",
    cta: "See my tenancy", href: "/tenant/tenancy",
  },
  tenancy_agreement: {
    label: "Tenancy agreement",
    title: "Tenancy agreement",
    blurb: "Your tenancy agreement is being drawn up and sent for signing.",
    next: "Read it carefully and sign when it arrives. Both you and the landlord sign before anything else happens.",
    cta: "Read and sign", href: "/tenant/documents",
  },
  rent_payment: {
    label: "First rent",
    title: "First rent",
    blurb: "The agreement is signed. Your first month's rent and the standing order are being set up.",
    next: "Pay the first month when the request arrives, and set up the standing order for the rest.",
    cta: "See what is due", href: "/tenant/payments",
  },
  move_day: {
    label: "Move-in day",
    title: "Move-in day",
    blurb: "Everything is in place. It is move-in day, or nearly.",
    next: "Keys, inventory and check-in. Your agent will confirm the time.",
    cta: "See my tenancy", href: "/tenant/tenancy",
  },
  living: {
    label: "Moved in",
    title: "Nothing needed from you",
    blurb: "Your rent is set up and your certificates are in date. If anything needs fixing, report it and we will take care of it.",
    next: "Nothing. We will tell you when anything is due.",
    cta: "Report a maintenance issue", href: "/tenant/maintenance",
  },
};

/**
 * Fill the placeholders. A sentence whose value we do not hold is dropped
 * whole rather than printed with braces in it - a tenant should never read
 * "your viewing on {when}".
 */
export function fillUpdate(text: string, vars: Partial<Record<"property" | "when" | "amount" | "agent", string | null>>): string {
  return text
    .split(/(?<=\.)\s+/)
    .filter((sentence) => !/\{(\w+)\}/.test(sentence) || [...sentence.matchAll(/\{(\w+)\}/g)].every((m) => vars[m[1] as keyof typeof vars]))
    .map((sentence) => sentence.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k as keyof typeof vars] ?? "")))
    .join(" ")
    .trim();
}

/* ── The road to a tenancy ─────────────────────────────────────────────── */

/**
 * The spine before there is a deal (James, 18 Sep 2026): Find a home, Book a
 * viewing, Make an offer, Referencing, Moving. No Passport stop - nobody has
 * an account without one, so it was always ticked.
 *
 * Nearly everybody arrives having already asked about a home, so Find a home
 * is usually done on day one and the next step is the viewing. Where each
 * stage sits:
 *
 *   passport, matched, declined   Find a home is current (declined puts them
 *                                 back looking, not further forward)
 *   enquired, viewing             Book a viewing is current
 *   viewed, offer                 Make an offer is current
 *
 * Referencing and Moving are the deal's; once there is one, the portal draws
 * the deal's own eight stages instead.
 */
export function findingRoad(
  stage: TenantStageKey,
  subs: { home?: string | null; viewing?: string | null; offer?: string | null } = {}
): { id: string; label: string; sub: string; state: "done" | "current" | "upcoming" }[] {
  const at = stage === "enquired" || stage === "viewing" ? 1 : stage === "viewed" || stage === "offer" ? 2 : 0;
  const road: [string, string, string][] = [
    ["find", "Find a home", at > 0 ? subs.home ?? "Done" : "Pick the one"],
    ["viewing", "Book a viewing", subs.viewing ?? ""],
    ["offer", "Make an offer", subs.offer ?? ""],
    ["referencing", "Referencing", ""],
    ["moving", "Moving", ""],
  ];
  return road.map(([id, label, sub], i) => ({ id, label, sub, state: i < at ? "done" : i === at ? "current" : "upcoming" }));
}

/* ── The nav ───────────────────────────────────────────────────────────── */

export type NavKey = "home" | "homes" | "documents" | "tenancy" | "maintenance" | "payments" | "messages";

/**
 * Which pages are locked at this stage, and what unlocks each. In the order
 * James asked for: Home, Documents, My tenancy, then the rest, with
 * Messages always open ("apart from messages, because obviously they've not
 * actually registered for a property yet").
 */
export function locksFor(stage: TenantStageKey): Partial<Record<NavKey, string>> {
  const phase = phaseOf(stage);
  const locks: Partial<Record<NavKey, string>> = {};
  if (phase === "finding") {
    locks.tenancy = "Opens when your offer is accepted";
    locks.payments = "Opens when your offer is accepted";
  }
  if (phase !== "living") locks.maintenance = "Opens on move-in day";
  return locks;
}

/* ── The harness ───────────────────────────────────────────────────────── */

/**
 * The stops the sample can be switched to. Not every deal stage: the ones
 * where the page looks different. Order matters - the harness draws them as
 * a strip, and "next" in the sample's own buttons walks this list.
 */
export const HARNESS: { key: TenantStageKey; label: string }[] = [
  { key: "passport", label: "Signed in" },
  { key: "enquired", label: "Enquired" },
  { key: "matched", label: "Homes sent" },
  { key: "viewing", label: "Viewing booked" },
  { key: "viewed", label: "Viewed" },
  { key: "offer", label: "Offer made" },
  { key: "declined", label: "Offer declined" },
  { key: "deal_started", label: "Offer accepted" },
  { key: "referencing", label: "Referencing" },
  { key: "tenancy_agreement", label: "Agreement" },
  { key: "move_day", label: "Move-in day" },
  { key: "living", label: "Moved in" },
];

export function nextHarnessStage(stage: TenantStageKey): TenantStageKey | null {
  const i = HARNESS.findIndex((h) => h.key === stage);
  if (i < 0) {
    /* A deal stage the strip skips: the next strip stop after it. */
    const n = HARNESS.find((h) => after(h.key, stage));
    return n?.key ?? null;
  }
  return HARNESS[i + 1]?.key ?? null;
}

export const DEMO_STAGE_COOKIE = "tle-tenant-demo-stage";
