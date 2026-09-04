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
export const AGENDA: { title: string; body: string }[] = [
  {
    title: "Your property",
    body: "What we hold on record, what is advertised near you, and what has actually let.",
  },
  {
    title: "Marketing",
    body: "How we put it in front of the right tenants, and how that turns into a higher rent.",
  },
  {
    title: "The next steps",
    body: "Compliance, the three service levels, and what protects your income if a tenant stops paying.",
  },
  {
    title: "Getting started",
    body: "What it costs, and how to begin.",
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
    "There are cheaper agents and there are bigger ones. What follows is what you get here that you do not get from either.",
  points: [
    {
      title: "One person, personally responsible",
      body: "Your Letting Expert runs an independent local business and owns the outcome. That is a different arrangement from the high-street model, where responsibility is split across departments and nobody quite carries it.",
    },
    {
      title: "A national business behind them",
      body: "The systems, the training, the compliance framework and the operational support all come from the group. Local knowledge, with an established professional network standing behind it.",
    },
    {
      title: "Ahead of the law, not behind it",
      body: "Legislation and tenant expectations keep changing, and every update makes guidance worth more. Our job is to tell you what is coming, rather than explain it after it has cost you something.",
    },
    {
      title: "One property or a portfolio",
      body: "The priority does not change with the size of it: protect the investment, and support a tenancy that runs quietly enough that you rarely hear from us.",
    },
  ],
};

/* ───────────────────────── compliance ───────────────────────── */

export const COMPLIANCE: { title: string; body: string }[] = [
  {
    title: "Clear service levels",
    body: "What we do, what you do, and where the line sits. In writing, before anything starts.",
  },
  {
    title: "Compliance guidance",
    body: "Help understanding and meeting your legal obligations in the private rented sector - not a leaflet, a person who knows your property.",
  },
  {
    title: "Structured tenant referencing",
    body: "Affordability, credit history and employment verification on every applicant, to the same standard every time.",
  },
  {
    title: "Legally compliant documentation",
    body: "Tenancy agreements and paperwork prepared in line with current legislation, and kept current as it changes.",
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
    body: "Required annually. We track the renewal date and book it before it lapses.",
  },
  {
    title: "Electrical safety (EICR)",
    body: "A valid report at least every five years in England. We hold the dates and arrange the re-test.",
  },
  {
    title: "EPC",
    body: "Minimum E rating to let. We flag where you sit and what the coming MEES changes would ask of you.",
  },
  {
    title: "Smoke and carbon monoxide alarms",
    body: "Checked at the start of every tenancy, and recorded that they were.",
  },
  {
    title: "Deposit protection",
    body: "Protected in a government-approved scheme with the prescribed information served inside the deadline.",
  },
  {
    title: "Right to Rent checks",
    body: "Verified and documented for every tenant, with the evidence kept where it can be produced.",
  },
  {
    title: "How to Rent guide",
    body: "The current version issued to every new tenant - and re-issued when it is updated mid-tenancy.",
  },
  {
    title: "Client money protection and redress",
    body: "Your money held under a protection scheme, with an independent route to complain about us.",
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
  "Requirements vary across the UK. This reflects the position in England - Scotland and Wales operate under separate legislation, and we will confirm exactly what applies to your property.";

/* ───────────────────────── marketing ───────────────────────── */

export const WHAT_WE_OFFER: string[] = [
  "Professional photography and videography",
  "Virtual tours and 3D floor plans",
  "Premium listings on Rightmove, Zoopla and OnTheMarket",
  "Targeted social advertising built around your property",
  "Accompanied viewings, by someone who has stood in the property",
  "Tenancy matching, to let it to the right person rather than the first one",
  "Tenancy agreements and compliance paperwork prepared correctly",
  "Regular rental market updates and performance reports",
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
  heading: "Marketing finds a tenant. This is what sets the rent.",
  points: [
    {
      title: "Priced to start a queue, not to sit",
      body: "The first fortnight is when a property gets the most attention it will ever get. Priced right it draws several applicants at once and the rent holds; priced high it burns that fortnight and then reduces anyway, from a weaker position.",
    },
    {
      title: "Presented before it is listed",
      body: "We tell you what is worth doing first and what is not worth touching. Sometimes nothing. Sometimes one afternoon's work puts fifty pounds a month on it for the life of the tenancy.",
    },
    {
      title: "Launched when tenants are looking",
      body: "We pick the day it goes live around when your kind of tenant actually searches, rather than whenever the photographs happen to come back.",
    },
    {
      title: "Viewings together, not one by one",
      body: "Qualified applicants view at the same time. It is not a bidding process and we will not run one - but a tenant who can see genuine interest in the room moves quickly, and quick is what protects the asking rent.",
    },
    {
      title: "Reviewed on evidence, not on nerves",
      body: "If the enquiries are not coming we tell you why, with the numbers, in the first two weeks. A reduction decided early is a small one.",
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
  body: "Rightmove, Zoopla, OnTheMarket, thelettingexperts.co.uk and your own Letting Expert's local site. Professional photography and written-not-generated descriptions on all of them, so the listing that a tenant finds is the same quality wherever they find it.",
  portals: ["Rightmove", "Zoopla", "OnTheMarket", "thelettingexperts.co.uk"],
};

export const SOCIAL_COPY = {
  heading: "Reaching the tenants who are not looking yet",
  body: "Portal search catches people who are already hunting. Paid social reaches the ones who would move for the right property but have not started looking - targeted by area, age and circumstance, so your property appears in front of them rather than waiting to be found.",
};

/* ───────────────────────── tenants ───────────────────────── */

export const SCREENING = {
  eyebrow: "How we find and screen every tenant",
  heading: "Checked before they are through your door",
  paragraphs: [
    "Before a viewing is booked, applicants complete our Rental Passport - affordability, credit history, employment and income, previous landlord references and right to rent, with a guarantor route where the criteria are not fully met. Only applicants who clear every stage are put in front of your property.",
    "Those who pass are invited to view together. It is not a bidding process and we will not run one; it is about cutting the time your property sits empty. Tenants who are ready to move act quickly when they can see genuine interest in the room.",
    "Every document is checked for tampering and for AI-generated forgery as standard. It is a category of fraud that barely existed two years ago and it is now the most common way a referencing pack gets past an agent.",
    "You see bookings, feedback and offers as they happen, from launch through to let.",
  ],
};

/* ───────────────────────── service and management ───────────────────────── */

export const MANAGEMENT: { title: string; body: string }[] = [
  {
    title: "Flexible service options",
    body: "Tenant Find, Rent Collection, or the full Experts Management Service. You pick the level of involvement you want.",
  },
  {
    title: "Professional tenancy management",
    body: "The tenancy handled in line with current legislation, so a notice served late or a document missed never becomes your problem.",
  },
  {
    title: "Rent collection and financial administration",
    body: "Rent collected, statements issued, and a clear record you can hand straight to an accountant.",
  },
  {
    title: "Maintenance and property care",
    body: "Repairs coordinated through contractors we already use and already trust, so the property is looked after through the tenancy rather than at the end of it.",
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
  "Three levels, and the difference between them is how much of the tenancy you want to run yourself. Everything above the line is on all three.";

export const RENT_COLLECTION = {
  heading: "Rent collection, without the chasing",
  body: "We run rent through PayProp, which reconciles payments the day they land rather than at the end of the month.",
  points: [
    "Rent paid out the same day it clears",
    "Arrears chased automatically, from the first day it is late",
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
      title: "Full vacant possession rent cover",
      body: "Rent keeps being paid until you have the property back, not until a claim limit runs out.",
    },
    {
      title: "Up to £100,000 legal expenses",
      body: "Court fees, eviction costs and enforcement, covered.",
    },
    {
      title: "Claims that start quickly",
      body: "Rent payments begin within 30 days of a claim being accepted.",
    },
    {
      title: "Built for Section 8",
      body: "Designed around extended arrears periods rather than tidy ones.",
    },
    {
      title: "Rent after possession",
      body: "Up to three months' rent covered even once you have the property back.",
    },
    {
      title: "Tenant damage cover",
      body: "Additional protection where the property itself has been damaged.",
    },
    {
      title: "The eviction handled for you",
      body: "We run the process. You are not the one filing at court.",
    },
    {
      title: "No gaps between the two",
      body: "The insurance and the legal support run as one thing, so neither waits for the other.",
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
  { name: "Propertymark", caption: "Regulated member of the industry's leading professional body", logo: null },
  { name: "Client Money Protection", caption: "Your rent and deposit funds protected under an approved scheme", logo: null },
  { name: "The Property Redress Scheme", caption: "An independent route to resolve a dispute with us", logo: null },
  { name: "ICO", caption: "Registered for the secure handling of landlord and tenant data", logo: null },
  { name: "Tenancy Deposit Scheme", caption: "Deposits protected in England and Wales", logo: null },
  { name: "mydeposits Scotland", caption: "Deposits protected in Scotland", logo: null },
  { name: "Rent Smart Wales", caption: "Licensed for lettings activity in Wales", logo: null },
  { name: "Scottish Letting Agent Register", caption: "Registered with the relevant Scottish authorities", logo: null },
];

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
