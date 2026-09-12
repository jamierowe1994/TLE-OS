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
  | "viewing"
  | "viewed"
  | "offer"
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

export const FINDING: TenantStageKey[] = ["passport", "enquired", "viewing", "viewed", "offer"];
export const DEAL: TenantStageKey[] = ["deal_started", "holding_fee", "referencing", "plc", "deposit", "tenancy_agreement", "rent_payment", "move_day"];

export const ORDER: TenantStageKey[] = [...FINDING, ...DEAL, "living"];

export function phaseOf(stage: TenantStageKey): TenantPhase {
  if (stage === "living") return "living";
  return FINDING.includes(stage) ? "finding" : "tenancy";
}

export const isStage = (s: string | undefined | null): s is TenantStageKey => Boolean(s && (ORDER as string[]).includes(s));

export const after = (stage: TenantStageKey, than: TenantStageKey) => ORDER.indexOf(stage) > ORDER.indexOf(than);
export const atLeast = (stage: TenantStageKey, than: TenantStageKey) => ORDER.indexOf(stage) >= ORDER.indexOf(than);

/* ── The nav ───────────────────────────────────────────────────────────── */

export type NavKey = "home" | "documents" | "tenancy" | "maintenance" | "payments" | "messages";

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
  { key: "viewing", label: "Viewing booked" },
  { key: "viewed", label: "Viewed" },
  { key: "offer", label: "Offer made" },
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
