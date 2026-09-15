/**
 * The standing copy of the market-appraisal deck.
 *
 * Separated from `lib/present.ts` on purpose: that file is the MODEL — what a
 * deck is made of, which slides a kind carries, what happens when a value is
 * missing. This one is the WORDS, and the words change on a different clock.
 * Susan or Sean rewriting a paragraph should never mean opening the file that
 * decides which slides exist.
 *
 * ── Where this came from ───────────────────────────────────────────────────
 *
 * The structure is lifted from the agreed Base44 deck — "TLE Market Appraisal
 * Presentation", captured slide by slide in docs/MA-PRESENTATION-MOCKUP.md.
 * James: the structure has been signed off, so copy it and tweak the slides
 * individually rather than re-arguing the running order.
 *
 * Three things were changed in the lift, and each is a rule this file keeps:
 *
 * 1. NO UNSOURCED FIGURES. The original claimed video "can generate 400% more
 *    enquiries" and that "only 2-3% of the population are actively looking on
 *    Rightmove". Neither carries a source. They are gone rather than repeated
 *    — same rule the rest of the deck already follows, and a landlord who
 *    checks one number and finds it hollow re-reads every other one.
 *
 * 2. WE, NOT I. The original mixes them mid-deck ("I target those passive
 *    clients") because it was written for a single-agent sales brand. The
 *    whole argument here is that one named person handles it, backed by an
 *    office, so the voice has to hold that.
 *
 * 3. LETTINGS, NOT SALES. The source deck was built for property sales and
 *    dressed for lettings afterwards — a "Recently Let Properties" heading
 *    over comparable SALE prices, a market slide reporting time-to-sell and
 *    buyers per property. Everything here talks about rent, tenants and voids
 *    because that is the only thing a landlord is deciding.
 */

/* ───────────────────────── the contents ───────────────────────── */

/**
 * What the deck covers, in the order it covers it.
 *
 * This is a PROMISE about length as much as a contents list — a landlord
 * scrolling a thirty-slide deck needs to know early that it ends. Each entry
 * names the section divider it points at, so the two can never drift.
 */
/**
 * The line under the contents, in the tense the deck is being read in.
 *
 * The appraisal deck is presented on the day and the post-appraisal one is
 * posted afterwards, and until now both said "nothing needs deciding today"
 * about a meeting one of them had already had. James, 15 Sep 2026: "they're
 * not going through it today. They've already been through it."
 */
export const AGENDA_INTRO = {
  live: "Four simple parts. Stop us at any point and ask anything you like - nothing needs deciding today.",
  sent: "The four parts we went through, all here to read again - on your own time, and as many times as you want.",
};

export const AGENDA: { title: string; body: string }[] = [
  {
    title: "Your property",
    body: "What we know about it, what's available nearby and what similar properties are letting for.",
  },
  {
    title: "Marketing",
    body: "How we'll present it, where it appears and how we reach the right tenants.",
  },
  {
    title: "Managing your property",
    body: "Compliance, legislation, service options and the support available throughout the tenancy.",
  },
  {
    title: "Getting started",
    body: "What it costs and what happens if you'd like to go ahead.",
  },
];

/* ───────────────────────── who we are ───────────────────────── */

/**
 * Why us, before any of the evidence.
 *
 * Was four unlabelled paragraphs, which is what the source deck had and what
 * the red version rendered. Four paragraphs of prose on one slide is a page
 * from a brochure: a landlord reads the first, skims the second and takes
 * nothing from either. The same four arguments with a heading each are four
 * things somebody can actually repeat to whoever else decides, which is the
 * job this slide has.
 *
 * The arguments themselves are unchanged. Nothing here is a statistic - see
 * decision 3 at the top of lib/present.
 */
export const APPROACH = {
  eyebrow: "A different approach to lettings",
  standfirst:
    "You get a local expert who knows your market, backed by the systems, compliance support and professional network of The Letting Experts.",
  points: [
    {
      title: "One person, start to finish",
      body: "Your Letting Expert runs their own local business and takes personal responsibility for your property. From valuation to tenancy, you know exactly who you're dealing with.",
    },
    {
      title: "Backed by a national business",
      body: "Behind your local expert sits the systems, training, compliance framework and operational support of The Letting Experts.",
    },
    {
      title: "Ahead of the law, not behind it",
      body: "Lettings legislation continues to evolve. We'll keep you informed, explain what applies to your property and help make sure the right steps are taken at the right time.",
    },
    {
      title: "One property or a portfolio",
      body: "Whether you have one property or several, the approach stays the same: good tenants, strong management and clear communication.",
    },
  ],
};

/* ───────────────────────── compliance ───────────────────────── */

export const COMPLIANCE: { title: string; body: string }[] = [
  {
    title: "Clear responsibilities",
    body: "You'll know what we handle, what you handle and what needs to happen at each stage of the tenancy.",
  },
  {
    title: "Ongoing compliance guidance",
    body: "Practical guidance around the legal requirements that apply to your property, with someone there to explain changes as they happen.",
  },
  {
    title: "Structured tenant referencing",
    body: "A consistent process covering affordability, credit history, employment, income and the required applicant checks.",
  },
  {
    title: "Current documentation",
    body: "Tenancy agreements and supporting documents prepared in line with current requirements and updated as legislation changes.",
  },
];

/**
 * The obligations, each paired with what we actually do about it.
 *
 * The pairing is the point. A list of legal duties is a list of reasons to
 * worry; the same list with our half of it attached is the argument for
 * handing it over.
 */
export const LEGAL_ITEMS: { title: string; body: string }[] = [
  {
    title: "Gas Safety Certificate (CP12)",
    body: "Required annually. We can keep the renewal date visible and coordinate the next certificate where included in your service.",
  },
  {
    title: "Electrical safety (EICR)",
    body: "A valid report is required at least every five years in England. We'll help keep the relevant dates and requirements clear.",
  },
  {
    title: "EPC",
    body: "We'll confirm the property's current rating and explain any requirements that apply before it is marketed.",
  },
  {
    title: "Smoke and carbon monoxide alarms",
    body: "The required alarms need to be in place and checked at the start of the tenancy.",
  },
  {
    title: "Deposit protection",
    body: "Where applicable, deposits must be protected correctly and the required information provided within the relevant timeframe.",
  },
  {
    title: "Right to Rent checks",
    body: "The required checks are completed and documented for each tenant.",
  },
  {
    title: "How to Rent guide",
    body: "The current guide is issued where required as part of the tenancy documentation.",
  },
  {
    title: "Client money protection and redress",
    body: "Relevant protection and redress arrangements sit behind the service.",
  },
];

/**
 * Requirements diverge across the UK and this deck is written for England.
 *
 * Kept as a visible line on the slide rather than a footnote nobody reads:
 * an agent showing this in Cardiff or Glasgow needs the landlord to see that
 * the detail will differ, and needs to have said so at the time.
 */
export const LEGAL_CAVEAT =
  "Requirements vary across the UK. This reflects the position in England. Scotland and Wales operate under separate legislation, and we'll confirm what applies to your property.";

/* ───────────────────────── marketing ───────────────────────── */

/**
 * The three points on the Marketing divider.
 *
 * HERE rather than in the slide, because the slide exists twice - the deck's
 * MarketingDivider and the booklet's BookMarketing - and both were carrying
 * their own copy of this list. Two copies of a paragraph is two paragraphs
 * that drift, and this one already had.
 */
export const MARKETING_POINTS: { icon: "camera" | "people" | "chart"; title: string; body: string }[] = [
  { icon: "camera", title: "Professional presentation", body: "Photography and listings designed to make the property stand out." },
  { icon: "people", title: "Targeted reach", body: "Local and social marketing built around your property and its likely tenant." },
  { icon: "chart", title: "Major portals", body: "Your property everywhere serious renters are already looking." },
];

export const WHAT_WE_OFFER: string[] = [
  "Professional photography and videography",
  "Virtual tours and 3D floor plans",
  "Premium listings on Rightmove, Zoopla and OnTheMarket",
  "Targeted social advertising built around your property",
  "Accompanied viewings with someone who knows the property",
  "Tenant matching focused on suitability",
  "Tenancy agreements and paperwork prepared correctly",
  "Support getting the property ready to let",
];

/**
 * How the marketing turns into a number.
 *
 * The half of Marketing every agency leaves out. A landlord shown photography,
 * portals and social has been told we will find A tenant; none of it explains
 * why they should get MORE rent than the flat down the road, which is the only
 * question they are really asking.
 *
 * Nothing here is a claim we cannot stand behind on the day: it is what the
 * office actually does, in the order it does it.
 */
export const MAX_PRICE = {
  eyebrow: "Getting the best rent",
  heading: "Marketing finds the tenant. Strategy gets the best result.",
  points: [
    {
      title: "Priced to create interest from day one",
      body: "We use the local evidence to set a figure that gives the property the strongest possible start.",
    },
    {
      title: "Presented before it goes live",
      body: "We'll tell you what's worth doing, what isn't and where small improvements could make a meaningful difference.",
    },
    {
      title: "Launched with purpose",
      body: "We plan the launch around the property, the local market and tenant demand.",
    },
    {
      title: "Viewings managed with momentum",
      body: "We organise suitable applicants carefully so interest remains active and the process keeps moving.",
    },
    {
      title: "Reviewed using the evidence",
      body: "We monitor enquiries, viewings and feedback closely and keep you informed as the market responds.",
    },
  ],
};

export const VIDEO_COPY = {
  heading: "Your property, on film",
  body: "A short teaser for social, a full walk-through for the portals, and drone footage where the garden or the setting is doing some of the selling. Tenants who have already seen the layout arrive at a viewing ready to take it, which is most of what shortens a void.",
};

export const BROCHURE_COPY = {
  heading: "A brochure that sells the life, not the floorplan",
  body: "Before it is photographed we interview you about living there - the park you walk the dog in, the school run, the cafe you would tell a friend about. That interview runs through the brochure, the video and the listing copy, because a tenant chooses a street and a routine as much as a set of rooms.",
};

export const PORTALS_COPY = {
  heading: "Everywhere a tenant is looking",
  body: "Rightmove, Zoopla, OnTheMarket, thelettingexperts.co.uk and your Letting Expert's local site. The same professional photography and carefully written listing appear throughout, so your property is presented consistently wherever it is found.",
  portals: ["Rightmove", "Zoopla", "OnTheMarket", "thelettingexperts.co.uk"],
};

export const SOCIAL_COPY = {
  heading: "Reaching tenants beyond the portals",
  body: "Portal search reaches people already actively looking. Paid social helps us extend that reach locally and introduce your property to potential tenants beyond the traditional property portals.",
};

/* ───────────────────────── tenants ───────────────────────── */

export const SCREENING = {
  eyebrow: "How we find and screen every tenant",
  heading: "A thorough process from the start",
  paragraphs: [
    "Before a viewing is booked, applicants complete our Rental Passport, covering affordability, employment and income, previous landlord references and Right to Rent, with a guarantor route where appropriate.",
    "Suitable applicants are then invited to view, helping us keep the process organised and focused on the right match for the property.",
    "Supporting documents are checked carefully as part of the referencing process.",
    "You can see bookings, feedback and offers as they happen, from launch through to let.",
  ],
};

/* ───────────────────────── service and management ───────────────────────── */

export const MANAGEMENT: { title: string; body: string }[] = [
  {
    title: "Flexible service options",
    body: "Tenant Find, Rent Collection or the full Experts Management Service. You choose the level of support that suits you.",
  },
  {
    title: "Professional tenancy management",
    body: "Ongoing management with legislation, documentation and key tenancy requirements kept in view throughout.",
  },
  {
    title: "Rent collection and financial administration",
    body: "Rent collected, statements issued and a clear record ready for you or your accountant.",
  },
  {
    title: "Maintenance and property care",
    body: "Repairs coordinated through trusted contractors, helping keep the property well looked after throughout the tenancy.",
  },
];

/**
 * The three levels, as a comparison.
 *
 * `included` runs in the same order as `SERVICE_LEVELS` and the pairing is
 * positional, which is fragile in exactly one way: a level added to one array
 * and not the other silently shifts every tick. The renderer checks the
 * lengths rather than trusting them.
 */
export const SERVICE_LEVELS = ["Experts Management", "Rent Collection", "Tenant Find"] as const;

export const SERVICE_ROWS: { service: string; included: [boolean, boolean, boolean] }[] = [
  { service: "Market appraisal", included: [true, true, true] },
  { service: "Property details and photography", included: [true, true, true] },
  { service: "To Let board", included: [true, true, true] },
  { service: "Rightmove, Zoopla and OnTheMarket", included: [true, true, true] },
  { service: "Accompanied viewings", included: [true, true, true] },
  { service: "Comprehensive tenant referencing", included: [true, true, true] },
  { service: "Tenancy agreement", included: [true, true, true] },
  { service: "Rent collection and statements", included: [true, true, false] },
  { service: "Deposit protected in a government scheme", included: [true, false, false] },
  { service: "Inventory, schedule of condition and check-in", included: [true, false, false] },
  { service: "Tenancy extensions and legal notices", included: [true, false, false] },
  { service: "Repairs and maintenance coordination", included: [true, false, false] },
  { service: "Property inspections every six months", included: [true, false, false] },
  { service: "Annual gas and electrical safety coordination", included: [true, false, false] },
];

export const SERVICE_LEVELS_INTRO =
  "Three levels, and the difference between them is how much of the tenancy you want to run yourself. Whichever you choose, you get all of the above.";

export const RENT_COLLECTION = {
  heading: "Rent collection, made simple",
  body: "We use PayProp to reconcile rent as payments land, giving you a clear, up-to-date view of your rental income.",
  points: [
    "Rent released to you as soon as it has cleared and been reconciled",
    "Payment follow-up from the first day anything becomes overdue",
    "Every payment and statement visible as it happens",
    "A landlord portal you can check at any time",
  ],
};

/* ───────────────────────── protecting the income ───────────────────────── */

export const PROTECTION = {
  heading: "Protecting you and your rental income",
  paragraphs: [
    "A rental property is an investment before it is anything else, and most of what goes wrong with one is financial rather than structural. The support and advice here is aimed at the long-term profitability of it, not just at filling it.",
    "Through our partners we can arrange insurance written specifically for landlords and for let property - cover that ordinary buildings policies quietly exclude the moment there is a tenant in it.",
    "The aim is that accident, damage, theft or a tenant who stops paying is an inconvenience you claim for rather than a loss you absorb.",
  ],
};

export const RENT_LEGAL = {
  eyebrow: "Experts Management Service",
  heading: "More than management - real protection for your income",
  standfirst:
    "Rent & Legal Protection is included as standard on the Experts Management Service, at no extra cost. It covers the two things landlords actually lose sleep over: a tenant who stops paying, and the cost of getting the property back.",
  points: [
    {
      title: "Rent protection",
      body: "Cover designed to support your rental income in qualifying circumstances.",
    },
    {
      title: "Up to £100,000 legal expenses",
      body: "Support with eligible court, possession and enforcement costs.",
    },
    {
      title: "Claims handled promptly",
      body: "Eligible rent payments can begin within 30 days of an accepted claim.",
    },
    {
      title: "Support after possession",
      body: "Up to three months' additional rent protection after possession, subject to the policy.",
    },
    {
      title: "Tenant damage cover",
      body: "Additional protection for eligible damage to the property.",
    },
    {
      title: "Legal support included",
      body: "Professional support through an eligible possession process.",
    },
  ],
  /**
   * A slide that makes a financial promise has to carry its own limits.
   * Without this line the nine points above read as a guarantee, and the first
   * declined claim becomes a complaint about us rather than about the policy.
   */
  disclaimer:
    "Cover is subject to the insurer's terms, conditions and acceptance criteria. Full policy documentation is provided separately. Available on new and existing tenancies.",
};

/* ───────────────────────── who stands behind us ───────────────────────── */

/**
 * Regulatory memberships and schemes.
 *
 * `logo` is a path under /public and is allowed to be null — the artwork for
 * most of these is not in the repo yet. A null renders as the NAME set in the
 * brand's own type rather than as a missing-image box, which is a worse look
 * than no logo at all but a better one than a broken tile.
 */
export const REGULATED: { name: string; caption: string; logo: string | null }[] = [
  { name: "Propertymark", caption: "Professional standards, training and industry guidance", logo: null },
  { name: "Client Money Protection", caption: "Protection for qualifying client funds held as part of the service", logo: null },
  { name: "The Property Redress Scheme", caption: "Independent consumer protection and redress", logo: null },
  { name: "ICO", caption: "Registered for the responsible handling of landlord and tenant information", logo: null },
  { name: "Tenancy Deposit Scheme", caption: "Approved deposit protection in England and Wales", logo: null },
  { name: "mydeposits Scotland", caption: "Deposit protection for eligible Scottish tenancies", logo: null },
  { name: "Rent Smart Wales", caption: "Licensed for relevant lettings activity in Wales", logo: null },
  { name: "Scottish Letting Agent Register", caption: "Registered for relevant lettings activity in Scotland", logo: null },
];

export const REGULATED_INTRO =
  "Our memberships, registrations and protection schemes give you an additional layer of reassurance around your property, your money and the service you receive.";

export const NETWORK = {
  heading: "The Experts Group network",
  body: "Letting the property is one part of owning it. Through the group we can put you in front of people we already work with - for a sale, a mortgage, an auction, or commercial space - rather than sending you to look one up.",
  brands: [
    "The Letting Experts",
    "The Property Experts",
    "The Recruitment Experts",
    "The Training Experts",
    "Prestige",
    "The Mortgage Experts",
    "The Commercial Property Experts",
  ],
};

/* ───────────────────────── the close ───────────────────────── */

/**
 * What happens after they say yes. Post-appraisal only — on the day the agent
 * says this out loud, and afterwards it has to survive being read alone.
 */
export const NEXT_STEPS: { title: string; body: string }[] = [
  {
    title: "Sign the terms",
    body: "Everything above, in writing, with the rent and the fee on it. It takes a couple of minutes and can be done on your phone.",
  },
  {
    title: "We get it ready",
    body: "Photography, video, floor plan and the compliance paperwork. We tell you if anything needs doing before it goes live.",
  },
  {
    title: "It goes live",
    body: "Across every portal on the same day, with viewings booked as the enquiries land.",
  },
];
