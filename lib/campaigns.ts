/**
 * Nurture campaigns.
 *
 * The shape of this file IS the decision: campaigns are AUTHORED here, in one
 * place, by marketing — and agents only ever pick one off a list. Agents write
 * terrible campaigns, and a tool that lets fifteen people improvise their own
 * follow-up produces fifteen versions of the brand and no way to tell what
 * worked. So there is no campaign builder on the agent side, by design.
 *
 * Each campaign is aimed at a REASON, not at a person: "went with another
 * agent" and "fee too high" want completely different letters, and the reason
 * is already captured when an appraisal is marked lost or nurtured. That is
 * what makes enrolling a one-click job — the OS already knows which campaign
 * fits, and only has to offer it.
 *
 * Steps are day offsets from enrolment, so a campaign can be read at a glance
 * and reasoned about without running it.
 */

export type CampaignAudience = "lost" | "nurture";

export type CampaignStep = {
  /** Days after enrolment. 0 is the same day. */
  day: number;
  channel: "email" | "call" | "post";
  subject: string;
  /** The gist, for the agent reading the plan. The mail merge holds the copy. */
  gist: string;
};

export type Campaign = {
  id: string;
  name: string;
  audience: CampaignAudience;
  /**
   * The lost/nurture reasons this is written for, matched against what the
   * appraisal recorded. An empty list means "any reason in that audience".
   */
  reasons: string[];
  /** What it's trying to do, in one line, for whoever is picking. */
  aim: string;
  status: "live" | "draft";
  steps: CampaignStep[];
};

/**
 * The set marketing has built. Seeded here rather than in a database while the
 * shapes settle — moving them later is a data migration, not a rewrite, and
 * the agent side never knew the difference.
 */
export const CAMPAIGNS: Campaign[] = [
  {
    id: "win-back-agent",
    name: "Win-back — went to another agent",
    audience: "lost",
    reasons: ["Went with another agent"],
    aim: "Stay in sight for the six months until they're disappointed, without ever saying so.",
    status: "live",
    steps: [
      { day: 1, channel: "email", subject: "Good luck with the let", gist: "Gracious note, no pitch. Offer the market report anyway." },
      { day: 30, channel: "email", subject: "How's it going?", gist: "One question: is it let? If not, we're still here." },
      { day: 90, channel: "email", subject: "What rents did in your postcode", gist: "The area report — useful whether or not they use us." },
      { day: 180, channel: "call", subject: "Six-month check-in", gist: "Most switch at renewal. This is the call that catches it." },
    ],
  },
  {
    id: "win-back-fee",
    name: "Win-back — fee too high",
    audience: "lost",
    reasons: ["Fee too high"],
    aim: "Answer the objection with what the fee buys, over time, rather than discounting.",
    status: "live",
    steps: [
      { day: 2, channel: "email", subject: "What our fee actually covers", gist: "Void days, arrears, compliance — the cost of the cheap option." },
      { day: 45, channel: "email", subject: "A landlord who switched to us", gist: "One case study, same postcode, numbers not adjectives." },
      { day: 120, channel: "call", subject: "Still happy?", gist: "Ask about arrears and voids. That is where cheap agents lose them." },
    ],
  },
  {
    id: "not-ready",
    name: "Not ready yet",
    audience: "nurture",
    reasons: ["Tenant still in situ", "Letting later in the year", "Thinking about it"],
    aim: "Be the agent they were already talking to when the date finally arrives.",
    status: "live",
    steps: [
      { day: 1, channel: "email", subject: "Everything we talked about", gist: "The valuation in writing, so it exists when they look again." },
      { day: 60, channel: "email", subject: "What's let near you", gist: "Local comparables. Quietly proves the valuation was right." },
      { day: 150, channel: "email", subject: "Getting ready to let?", gist: "The pre-let checklist — compliance, works, timing." },
    ],
  },
  {
    id: "refurb",
    name: "Refurbishing first",
    audience: "nurture",
    reasons: ["Refurbishing first"],
    aim: "Be useful during the works, so the call at the end is a formality.",
    status: "live",
    steps: [
      { day: 3, channel: "email", subject: "What's worth doing, and what isn't", gist: "Which works actually move the rent, which don't pay back." },
      { day: 45, channel: "call", subject: "How are the works going?", gist: "Genuine check-in. Offer to look once it's finished." },
      { day: 100, channel: "email", subject: "Ready when you are", gist: "Photos and marketing can be booked before completion." },
    ],
  },
];

/** The campaigns that fit what the appraisal actually recorded. */
export function campaignsFor(audience: CampaignAudience, reason: string | null): Campaign[] {
  const live = CAMPAIGNS.filter((c) => c.status === "live" && c.audience === audience);
  if (!reason) return live;
  const exact = live.filter((c) => c.reasons.includes(reason));
  // Never leave an agent with nothing: an unmatched reason still gets the
  // general campaigns for its side.
  return exact.length ? exact : live.filter((c) => !c.reasons.length || !exact.length);
}

export function lastDay(c: Campaign): number {
  return c.steps.reduce((n, s) => Math.max(n, s.day), 0);
}
