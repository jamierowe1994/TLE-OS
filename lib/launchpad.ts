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
  /**
   * The address this answer is about, and every address we tried.
   *
   * Shown to owners on the card. Without it, "not part of your licence" for
   * somebody who is plainly Pro on the People screen is an afternoon of
   * guessing — which is exactly what Kayleigh Wright cost on 29 Aug.
   */
  askedAbout: string | null;
  triedAddresses: string[];
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
  askedAbout: null,
  triedAddresses: [],
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
      askedAbout: email.trim().toLowerCase(),
      triedAddresses: [email.trim().toLowerCase()],
    };
  } catch {
    return UNAVAILABLE;
  } finally {
    clearTimeout(timer);
  }
}

/** Where a lead sits today. Decided by Launch Pad, never re-derived here. */
export type LeadBucket = "uncontacted" | "follow-up" | "resting" | "won" | "closed";

export interface MirroredLead {
  id: string;
  name: string;
  phone: string;
  email: string;
  source: string;
  stage: string;
  bucket: LeadBucket;
  receivedAt: string;
  followUpAt: string | null;
  appointmentAt: string | null;
  adName: string | null;
  note: string;
  deepLink: string;
  attempts: number;
}

export interface Funnel {
  /** False when they are entitled but have never signed into Launch Pad. */
  found: boolean;
  leads: MirroredLead[];
  counts: Partial<Record<LeadBucket, number>>;
  /** When Launch Pad judged "resting" — see the endpoint's note on the clock. */
  computedAt: string | null;
  appUrl: string | null;
}

/**
 * One agent's funnel, mirrored.
 *
 * Returns null on any failure, which the screen must render as "couldn't load"
 * rather than as an empty funnel. An agent shown zero leads believes it.
 */
export async function fetchLaunchPadLeads(email: string): Promise<Funnel | null> {
  if (!launchPadConfigured() || !email.trim()) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const res = await fetch(
      `${base()}/api/partner/leads?email=${encodeURIComponent(email.trim().toLowerCase())}`,
      {
        headers: { Authorization: `Bearer ${process.env.ADS_API_KEY}` },
        cache: "no-store",
        signal: controller.signal,
      }
    );
    if (!res.ok) return null;
    const j = (await res.json()) as Partial<Funnel>;
    if (!Array.isArray(j.leads)) return null;
    return {
      found: Boolean(j.found),
      leads: j.leads as MirroredLead[],
      counts: j.counts ?? {},
      computedAt: j.computedAt ?? null,
      appUrl: j.appUrl ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The same question, asked about every address we hold for one person.
 *
 * ── Why one address is not enough ─────────────────────────────────────────
 *
 * Kayleigh Wright is on Susan's launch list AND marked Pro in the Hub, and the
 * card still told her the tool was not part of her licence. REX, Team Hub and
 * the launch list all agree on `Kayleigh.Wright@TheLettingExperts.co.uk`; the
 * only address that does not have to match any of them is the one she signs
 * into the OS with, and that is the one we were asking about.
 *
 * A person is not an email. Launch Pad's own list already carries the evidence:
 * Kirstie appears as both Mulholland and Wallington after a name change, and
 * three of Susan's thirteen are dual-brand partners whose mailboxes are on TPE
 * and Prestige domains. Asking about one mailbox and concluding something about
 * the human is the bug.
 *
 * ── Why this cannot over-admit ────────────────────────────────────────────
 *
 * Every address tried is one the OS already holds AGAINST THAT RECORD: their
 * own sign-in address, the email on their own REX AccountUser, and the Team Hub
 * record found by their own REX id. Nothing is guessed, nothing is derived from
 * a name, and no address belonging to anybody else can enter the list. The REX
 * id is the strong key throughout — the same one the People screen uses to show
 * the licence tier, which is why that screen said Pro while this one said no.
 *
 * First "yes" wins and stops. If nobody says yes, the answer for their PRIMARY
 * address is returned, so the wording an agent sees is about them rather than
 * about whichever alias happened to be asked last.
 */
export async function getLaunchPadAccessForPerson(opts: {
  email: string;
  name?: string | null;
  /** Their REX AccountUser id, from os_users. The strong key. */
  rexUserId?: string | null;
  /** Other addresses the OS holds for this same person. */
  alsoTry?: Array<string | null | undefined>;
}): Promise<LaunchPadAccess> {
  const primary = opts.email.trim().toLowerCase();
  const seen = new Set<string>();
  const addresses: string[] = [];
  for (const a of [primary, ...(opts.alsoTry ?? [])]) {
    const clean = (a ?? "").trim().toLowerCase();
    if (clean && clean.includes("@") && !seen.has(clean)) {
      seen.add(clean);
      addresses.push(clean);
    }
  }
  if (addresses.length === 0) return UNAVAILABLE;

  let fallback: LaunchPadAccess | null = null;
  for (const address of addresses) {
    const res = await getLaunchPadAccess(address, opts.name);
    if (res.entitled) return { ...res, askedAbout: address, triedAddresses: addresses };
    /* Keep the FIRST real answer as the fallback. An "unavailable" from a later
       address must not overwrite a definite "not-pro" from their own — that
       would turn a clear answer into a shrug. */
    if (!fallback || (fallback.reason === "unavailable" && res.reason !== "unavailable")) {
      fallback = res;
    }
  }
  return { ...(fallback ?? UNAVAILABLE), askedAbout: primary, triedAddresses: addresses };
}
