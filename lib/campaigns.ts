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
  /** The gist, for the agent reading the plan. Shorthand, written for us —
   *  "ask, do not gloat" is a note to the office, never to a landlord. */
  gist: string;
  /**
   * The actual copy, as paragraphs. Merge tokens allowed: {{firstName}},
   * {{address}}, {{senderName}}.
   *
   * Absent means marketing hasn't written it yet, and the scheduler will hold
   * the sequence there rather than improvise — which is the point. An unwritten
   * step is visible on the Marketing screen as a debt, not silently skipped.
   */
  body?: string[];
  /** Optional call to action under the copy. */
  cta?: { text: string; url: string };
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
    id: "gone-quiet-lead",
    name: "Gone quiet - never spoken to",
    audience: "nurture",
    reasons: ["Not answering"],
    aim: "A landlord lead that never picked up. Three light touches over six weeks, then stop - most who come back do so on the second.",
    status: "live",
    steps: [
      { day: 2, channel: "email", subject: "You asked about letting your property", gist: "Short. We tried to call, here is what we do and one question back. No attachments." },
      { day: 10, channel: "email", subject: "What your property might let for", gist: "One figure or a range for their area, and the offer of a fifteen-minute call." },
      { day: 42, channel: "email", subject: "Still thinking about letting?", gist: "The last one. Say we will leave it there, and how to pick it up again." },
    ],
  },
  {
    id: "win-back-agent",
    name: "Win-back — went to another agent",
    audience: "lost",
    reasons: ["Went with another agent"],
    aim: "Stay in sight for the six months until they're disappointed, without ever saying so.",
    status: "live",
    steps: [
      {
        day: 1,
        channel: "email",
        subject: "Good luck with the let",
        gist: "Gracious note, no pitch. Offer the market report anyway.",
        body: [
          "Hi {{firstName}},",
          "Thanks for having us round to look at {{address}} — and genuinely, good luck with the let. I hope it goes quickly.",
          "One thing before I leave you alone: we put together a short report each quarter on what's actually letting around you, and at what rent. It's useful whether or not you ever use us, so I'll send it over unless you'd rather I didn't.",
          "If anything changes, you have my number.",
        ],
      },
      {
        day: 30,
        channel: "email",
        subject: "How's it going?",
        gist: "One question: is it let? If not, we're still here.",
        body: [
          "Hi {{firstName}},",
          "A month on — is {{address}} let?",
          "If it is, that's the last you'll hear from me on it. If it isn't, that's worth a conversation: a property that's been on for four weeks usually needs a change to the price, the photos or the audience, and it's easier to fix now than at week ten.",
          "Either way, a one-line reply and I'll know which.",
        ],
      },
      {
        day: 90,
        channel: "email",
        subject: "What rents did in your postcode",
        gist: "The area report — useful whether or not they use us.",
        body: [
          "Hi {{firstName}},",
          "The quarterly figures for your area are in. This is what actually let near {{address}} and what it achieved — not asking prices, which is the number most reports quietly use.",
          "No action needed. It's the sort of thing worth knowing before a renewal comes round.",
        ],
      },
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
    reasons: ["Tenant still in situ", "Letting later in the year", "Thinking about it", "Not ready yet"],
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

  {
    id: "valuation-low",
    name: "Win-back — valuation too low",
    audience: "lost",
    reasons: ["Valuation too low"],
    aim: "Be the honest number they remember when the optimistic one doesn't let.",
    status: "live",
    steps: [
      { day: 1, channel: "email", subject: "The figure, and why", gist: "Restate the valuation with the comparables behind it. No sulking, no I-told-you-so." },
      { day: 21, channel: "email", subject: "What's actually letting", gist: "Local lets at ACHIEVED rents. The over-valued one is still sitting there and they can see it." },
      { day: 60, channel: "call", subject: "Any interest?", gist: "Six weeks is when an over-valued let starts to hurt. Ask, do not gloat." },
      { day: 120, channel: "email", subject: "Still available?", gist: "Offer a fresh appraisal free. By now the market has made the argument for us." },
    ],
  },
  {
    id: "went-direct",
    name: "Win-back — self-managing",
    audience: "lost",
    reasons: ["Went direct / self-managing"],
    aim: "Let the admin do the persuading — most self-managers quit at the first hard thing.",
    status: "live",
    steps: [
      { day: 2, channel: "email", subject: "The bits people forget", gist: "Deposit deadlines, right to rent, gas and EICR dates. Genuinely useful, no pitch." },
      { day: 40, channel: "email", subject: "When a tenant stops paying", gist: "What the process actually costs in time. The most common reason they come back." },
      { day: 100, channel: "email", subject: "What has changed in the rules", gist: "Legislation update. Self-managers are the ones who miss these." },
      { day: 200, channel: "call", subject: "How is it going?", gist: "A year in, most have had one bad month. This is the call." },
    ],
  },
  {
    id: "selling-instead",
    name: "Selling instead",
    audience: "lost",
    reasons: ["Decided to sell instead", "Decided not to let"],
    aim: "Stay useful on a decision we do not handle, so the next property comes to us.",
    status: "live",
    steps: [
      { day: 1, channel: "email", subject: "Good luck with the sale", gist: "No pitch. Offer the rental figure in writing in case the sale stalls." },
      { day: 75, channel: "email", subject: "If it has not sold", gist: "Letting as the fallback, with the numbers. A stalled sale is a live lettings lead." },
      { day: 240, channel: "email", subject: "Buying again?", gist: "Landlords who sell often buy. Be there for the next one." },
    ],
  },
  {
    id: "weighing-up",
    name: "Weighing up agents",
    audience: "nurture",
    reasons: ["Weighing up agents"],
    aim: "Win it in the week they are actually deciding, which is this one.",
    status: "live",
    steps: [
      { day: 1, channel: "email", subject: "Everything in one place", gist: "Valuation, fee, what we do for it. One page to put next to the others." },
      { day: 4, channel: "call", subject: "Any questions?", gist: "The call most agents do not make. Ask what would make the decision easy." },
      { day: 14, channel: "email", subject: "A landlord like you", gist: "One case study, same kind of property, same postcode." },
    ],
  },
  {
    id: "lost-touch",
    name: "Gone quiet",
    audience: "lost",
    reasons: ["Lost touch", "Other"],
    aim: "Two more tries, spaced, then stop — a list nobody prunes is a list nobody trusts.",
    status: "live",
    steps: [
      { day: 7, channel: "email", subject: "Did I miss you?", gist: "Short, human, one question. No attachments." },
      { day: 30, channel: "call", subject: "One more try", gist: "Different time of day from the last attempt." },
      { day: 90, channel: "email", subject: "Closing your file", gist: "Say we are stopping, and how to come back. Gets more replies than the other two." },
    ],
  },
];

/**
 * The campaigns that fit what the appraisal actually recorded.
 *
 * `all` defaults to the built-in set so this stays usable without a fetch —
 * but the agent screen passes the merged list, or a campaign marketing wrote
 * this morning could never be picked.
 */
export function campaignsFor(
  audience: CampaignAudience,
  reason: string | null,
  all: Campaign[] = CAMPAIGNS
): Campaign[] {
  const live = all.filter((c) => c.status === "live" && c.audience === audience);
  if (!reason) return live;
  const exact = live.filter((c) => c.reasons.includes(reason));
  // Never leave an agent with nothing: an unmatched reason still gets the
  // general campaigns for its side.
  return exact.length ? exact : live.filter((c) => !c.reasons.length || !exact.length);
}

/**
 * The campaigns that fit a REASON, wherever they sit.
 *
 * The reason is the specific thing - "Not answering", "Fee too high" - and a
 * campaign written for it fits whichever side of the book the person came in
 * on. So exact matches are taken across BOTH audiences first, and only when
 * nothing was written for that reason does the audience's own general set
 * (campaigns with no reasons at all) stand in. Nothing matching means nothing:
 * a lead is better left off a campaign than put on the wrong one.
 *
 * Several live campaigns on one reason is not a conflict, it is a TEST:
 * the enroller alternates between them and the Marketing screen shows which
 * one got the replies. That is how marketing runs an A/B without a switch.
 */
export function campaignsForReason(
  reason: string | null,
  audience: CampaignAudience,
  all: Campaign[] = CAMPAIGNS
): Campaign[] {
  const live = all.filter((c) => c.status === "live");
  if (reason) {
    const exact = live.filter((c) => c.reasons.includes(reason));
    if (exact.length) return exact;
  }
  return live.filter((c) => c.audience === audience && !c.reasons.length);
}

export function lastDay(c: Campaign): number {
  return c.steps.reduce((n, s) => Math.max(n, s.day), 0);
}
