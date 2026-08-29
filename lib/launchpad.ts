import "server-only";

/**
 * Is this person entitled to Launch Pad? Asked, never worked out here.
 *
 * ── Why we ask instead of reading the licence tier ────────────────────────
 *
 * Launch Pad is Paid Ads, and TLE's Pro licence includes it. So the obvious
 * gate is "read `partner_package` from Team Hub and let Pro through". Measured
 * against the live Hub on 29 Aug 2026, that gate is wrong in both directions
 * at the same time:
 *
 *   · Of Susan's 13 launch partners it would ADMIT 5. Six are still recorded
 *     as Basic, one as Academy, and two have no package at all.
 *   · It would also admit 8 TLE partners who are not on her list, one of them
 *     recorded as Departed.
 *
 * The Hub is being tidied by Susan and Howard and has moved by one record in
 * the twenty-five days since the same comparison was run on 4 Aug. Until that
 * lands, the licence field cannot carry a gate.
 *
 * ── Why we don't copy the rule across ─────────────────────────────────────
 *
 * Launch Pad already answers this — launch list, then admin additions, then
 * named exceptions, then the package — and that logic has already drifted once
 * INSIDE that app: a partner added to the roster on 26 Aug was refused by one
 * gate because it read the static file while another read the database. She was
 * let through one door and stopped at the next.
 *
 * Two products keeping their own copy is that bug with a deploy boundary
 * through the middle, and the symptom is the worst kind: a partner admitted
 * here and refused there, with each app certain it is right. So there is one
 * answer, from the app that owns the question.
 *
 * ── An outage is not a refusal ────────────────────────────────────────────
 *
 * `unavailable` is a distinct outcome and never collapses to "not entitled".
 * A gate that silently locks out every Pro partner the moment a sister service
 * hiccups is worse than one that says "can't check right now" — the first is a
 * morning of phone calls that all start "it says I don't have it".
 */

export type EntitlementReason =
  /** Entitled — roster, exception, or their tier covers it. */
  | "entitled"
  /** Known, but their licence doesn't include it. */
  | "not-pro"
  /** No record at all, so it cannot be judged. Treated as not entitled. */
  | "unknown-person"
  /** We could not ask. NOT a refusal — see above. */
  | "unavailable";

export interface LaunchPadAccess {
  entitled: boolean;
  reason: EntitlementReason;
  /** Which rule decided: "launch-list" | "exception" | "partner-package". */
  sourceOfTruth: string | null;
  /** Whether they already have a Launch Pad login. Entitled-but-no-account is
   *  an invitation to send, not a door to close. */
  hasAccount: boolean;
  partnerPackage: string | null;
}

function base(): string | null {
  const b = process.env.ADS_API_BASE;
  return b ? b.replace(/\/$/, "") : null;
}

/** The owner has wired the Launch Pad link (base URL + shared key). */
export function launchPadConfigured(): boolean {
  return !!(base() && process.env.ADS_API_KEY);
}

const UNAVAILABLE: LaunchPadAccess = {
  entitled: false,
  reason: "unavailable",
  sourceOfTruth: null,
  hasAccount: false,
  partnerPackage: null,
};

/**
 * Ask Launch Pad. Never throws — every failure becomes `unavailable`, which
 * the caller must render as "couldn't check" rather than as "no".
 */
export async function getLaunchPadAccess(
  email: string,
  name?: string | null
): Promise<LaunchPadAccess> {
  if (!launchPadConfigured() || !email.trim()) return UNAVAILABLE;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url =
      `${base()}/api/partner/entitlement?email=${encodeURIComponent(email.trim().toLowerCase())}` +
      (name ? `&name=${encodeURIComponent(name)}` : "");
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.ADS_API_KEY}` },
      cache: "no-store",
      signal: controller.signal,
    });
    /* 503 is Launch Pad saying it could not reach Team Hub. Its body already
       carries reason "unavailable"; anything else non-OK is our own problem
       and gets the same treatment rather than a guess. */
    if (!res.ok) return UNAVAILABLE;
    const j = (await res.json()) as Partial<LaunchPadAccess> & { reason?: string };
    if (typeof j.entitled !== "boolean") return UNAVAILABLE;
    return {
      entitled: j.entitled,
      reason: (j.reason as EntitlementReason) ?? (j.entitled ? "entitled" : "not-pro"),
      sourceOfTruth: j.sourceOfTruth ?? null,
      hasAccount: Boolean(j.hasAccount),
      partnerPackage: j.partnerPackage ?? null,
    };
  } catch {
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}
