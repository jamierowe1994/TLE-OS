/**
 * The pre-appraisal presentation — what the landlord sees before we arrive.
 *
 * The shape of the idea is borrowed from two places that already do it: the
 * Acaboom decks the sales side uses, and the Fine & Country pipeline (whose
 * appointment-confirmation deck is the closest working example — six slides,
 * every value merged, sent the moment a market appraisal is booked). This is
 * neither of those. It is a lettings deck for one office, and it says so.
 *
 * ── Three decisions worth keeping ───────────────────────────────────────────
 *
 * 1. THE DECK IS A SNAPSHOT, NOT A LIVE QUERY.
 *    Everything the viewer needs is frozen into one row when the agent sends
 *    it. A landlord opening the link on Sunday morning must not depend on
 *    REX being up, on a token being unexpired, or on a lead record nobody has
 *    touched since. It also means what they saw is what we can still see: the
 *    row IS the record of what was sent.
 *
 * 2. EVERY FIELD CAN BE MISSING.
 *    This is the constraint that decides the design. Most REX users have a
 *    headshot; nobody has a bio (measured — `settings.profile_bio` is null
 *    for all 100 account users). Half the properties have no photo anywhere.
 *    So each block states its own empty rule below, and the deck must read as
 *    deliberate with any of them gone — never as a broken gap.
 *
 * 3. NO INVENTED FIGURES.
 *    The F&C deck leans on "300+ locations, 120,000 buyers, 17% fall-through"
 *    because those are real and audited. We have no equivalent verified
 *    numbers for TLE, so the Why slide argues from what the office actually
 *    does rather than from statistics nobody can stand behind. Slots are
 *    there when James has the real ones.
 */

/* ───────────────────────── the data ───────────────────────── */

export type PresentAgent = {
  name: string;
  /** How the deck addresses them — "Susan", not "Susan Liles". */
  firstName: string;
  /** REX `settings.position`. Empty for about half the book; the line is
   *  dropped rather than filled with "Agent". */
  title: string;
  email: string;
  /** Mobile preferred over the office line: this is a personal introduction. */
  phone: string;
  /** REX `settings.profile_image`, absolutised. Null → monogram initials. */
  photo: string | null;
  /**
   * Written in the OS, not in REX. REX has a `profile_bio` field and it is
   * empty for every single user, so treating it as the source would have
   * shipped a slide that is blank for everyone.
   */
  bio: string;
};

export type PresentProperty = {
  address: string;
  postcode: string;
  /** Hero. From the dossier's last listing or Rightmove; often null. */
  image: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  propertyType: string | null;
  epc: string | null;
};

/**
 * The agent's short welcome, recorded straight into the landlord's page.
 *
 * `key` is ours and is what Flow gets as its `reference` — NOT the
 * presentation token. The token is the only thing between a stranger and this
 * page, and it does not belong in a third party's metadata.
 *
 * `status` mirrors Flow's, and lives here so the page can say "your agent is
 * recording a welcome for you" rather than showing a hole. Nothing about the
 * deck depends on it: no video is a perfectly good deck.
 */
export type WelcomeVideo = {
  key: string;
  recordingId: string;
  status: "awaiting_recording" | "uploading" | "processing" | "ready" | "failed";
  embedUrl: string | null;
  thumbnailUrl: string | null;
  durationSecs: number | null;
  recordedAt: string | null;
};

/** The comparables slide's data, snapshotted onto the deck when it is minted.
 *  A LIVE lookup would let the numbers move between the agent approving the
 *  deck and the landlord opening it — the one thing a valuation must not do. */
export type PresentComparables = {
  guideLow: number;
  guideMid: number;
  guideHigh: number;
  basedOn: number;
  /** Shown so the landlord can see the working, not just the answer. */
  rows: { name: string; locality: string; rent: string; days: number | null; letAgreed: boolean }[];
  /** Any caveat the research produced. Shown to the LANDLORD too — a range we
   *  would qualify to an agent is a range we must qualify to them. */
  caveat: string | null;
};

/**
 * The local market, frozen at send.
 *
 * A SNAPSHOT of numbers, not a set of instructions to go and fetch them — same
 * rule as the rest of the deck. A landlord opening this on a Sunday must not
 * depend on Homesearch being up, and the row then doubles as the record of
 * exactly what we told them.
 *
 * Only the blocks the agent ticked survive, and each is optional, because the
 * slide has to read with any subset present. `area` is on the object rather
 * than on each block: every figure here describes ONE scope, and mixing a
 * district rent with a sector pace would be a quiet lie a landlord could not
 * detect.
 */
export type PresentMarket = {
  /** "NN5 4" — and the level, so the landlord knows how local this is. */
  area: string;
  level: "district" | "sector";
  advertised: number;
  /** Median asking rent across every size, pcm. */
  medianRent: number | null;
  /** How long today's advertised stock has sat, and how long WE take. Kept as
   *  two fields because they answer different questions — see the slide copy. */
  marketDays: number | null;
  ourDays: number | null;
  ourLets: number | null;
  /** Non-overlapping age bands, in display order. */
  bands?: { label: string; n: number }[] | null;
  /** Median asking rent per size. `n` travels so a thin one can be labelled. */
  rentByBed?: { label: string; n: number; rent: number | null }[] | null;
  mix?: { houses: number; flats: number } | null;
  agents?: { agent: string; n: number; ours: boolean }[] | null;
  reduced: number | null;
  /** When the figures were read, shown on the slide. */
  pulledAt: string;
};

/**
 * THE OFFER, in writing. Post-appraisal only.
 *
 * This is the number the landlord has already been told in their own kitchen,
 * repeated so they can show it to whoever else decides. It is a SNAPSHOT of
 * what was agreed at the visit — if the figure is later revised, that is a new
 * deck, not an edit to this one, because the old one has already been read.
 *
 * Everything except the rent is optional and the slide reads without it. An
 * agent who agreed a rent and left the fee to the office must still be able to
 * send the figure, or they will send nothing.
 */
export type PresentValuation = {
  /** £ pcm. The reason the slide exists — no rent, no slide. */
  rent: number;
  /** Already humanised ("Fully managed"), not the Propoly key. */
  serviceLevel: string | null;
  feePct: number | null;
  setupFee: number | null;
  note: string | null;
};

/**
 * The terms to sign.
 *
 * `signUrl` is NULL until DocuSeal is connected, and that is the normal state
 * today rather than a defect. The slide still renders — it says what happens
 * next and who to reply to — because a landlord reading "here is your figure"
 * and then nothing at all is worse than one reading "your agent will send the
 * paperwork over". What it must never do is show a button that goes nowhere:
 * a dead "Sign now" in front of a landlord is the one outcome worth avoiding.
 */
export type PresentTerms = {
  /** DocuSeal, once it exists. Null means the slide explains instead. */
  signUrl: string | null;
  /** What they are being asked to sign, in their words. */
  summary: string | null;
};

export type PresentDeck = {
  /** Which of the three decks this is — see DeckKind. */
  kind: DeckKind;
  /** Post-appraisal only. See PresentValuation. */
  valuation?: PresentValuation | null;
  /** Post-appraisal only. See PresentTerms. */
  terms?: PresentTerms | null;
  comparables?: PresentComparables | null;
  /** The local market, if the agent chose to include any of it. */
  market?: PresentMarket | null;
  /** Optional throughout. The deck was designed without one and still reads. */
  welcomeVideo?: WelcomeVideo | null;
  /** Who this copy is addressed to. Each guest could get their own. */
  recipientName: string;
  property: PresentProperty;
  /** "Tuesday 19 August at 2:00pm" — already human, from the diary. */
  whenPretty: string;
  /** ISO, for the add-to-calendar file. Null means nothing firm is booked. */
  startsAt: string | null;
  minutes: number;
  agent: PresentAgent;
  createdAt: string;
};

/* ───────────────────────── the words ───────────────────────── */

/**
 * What happens on the day. Four beats, because that is how long the visit
 * actually is — and because a landlord who knows the shape of an hour is a
 * landlord who doesn't cancel it.
 */
export const VISIT_STEPS: { title: string; body: string }[] = [
  {
    title: "A proper walk round",
    body: "Every room, the outside, and the bits people forget — the boiler, the meters, the parking. Ten minutes of it tells us more than any form.",
  },
  {
    title: "What it should let for",
    body: "A real figure, with the reasoning behind it. Not the highest number we can say out loud to win the instruction.",
  },
  {
    title: "How quickly, and to whom",
    body: "Who rents in your street, what they'll pay, and what the last few near you actually went for.",
  },
  {
    title: "What's worth doing first",
    body: "Sometimes nothing. Sometimes one afternoon's work puts fifty pounds a month on it — we'll tell you which.",
  },
];

/**
 * The three promises along the bottom of the entrance screen, from James's
 * mock-up. They are propositions rather than statistics, which is the same
 * rule the Why slide follows — nothing here is a number we can't stand behind.
 */
export const BANNER: { icon: "people" | "shield" | "trend"; title: string; body: string }[] = [
  {
    icon: "people",
    title: "Local experts",
    // Each of these has to hold ONE line at 12.5px in a third of the frame,
    // so they were cut to fit rather than the type shrunk to fit them. A
    // promise that wraps stops reading as a promise.
    body: "Agents who know your streets.",
  },
  {
    icon: "shield",
    title: "Maximum protection",
    body: "Your property and income, safe.",
  },
  {
    icon: "trend",
    title: "Better returns",
    body: "Smarter strategy, stronger rent.",
  },
];

/** Have these to hand. Deliberately short, and all four are optional. */
export const BRING_ALONG: string[] = [
  "The EPC, if you already have one",
  "Any gas safety or electrical certificate",
  "Rough dates for when you'd want it available",
  "Anything you already know needs doing",
];

/**
 * Why us. Arguments, not statistics — see decision 3 at the top of this file.
 * Each one is something the office can be held to on the day.
 */
export const WHY_TLE: { title: string; body: string }[] = [
  {
    title: "Lettings is all we do",
    body: "Not a sales agency with a lettings desk at the back. Every person you deal with here works on rented property all day, which is why the compliance side never surprises us.",
  },
  {
    title: "One person, start to finish",
    body: "The agent who values it is the agent who markets it and the agent who rings you when there's an offer. You won't be handed to a department.",
  },
  {
    title: "Priced on evidence",
    body: "We'll show you what let nearby, at what price, and how long it took. If our number is lower than someone else's, you'll see exactly why.",
  },
  {
    title: "Straight about the fee",
    body: "One percentage, what it covers, and what it doesn't. Everything else is quoted before it happens, never after.",
  },
];

/**
 * Three things every agent can be held to, on the introduction slide.
 * Same rule as everywhere else in this deck: claims about conduct, never
 * statistics nobody can stand behind.
 */
export const AGENT_CHIPS: { icon: "pin" | "chat" | "heart"; title: string; body: string }[] = [
  { icon: "pin", title: "Local expert", body: "In-depth knowledge of your area" },
  { icon: "chat", title: "Straight talking advice", body: "Honest, clear guidance at every step" },
  { icon: "heart", title: "Here to help", body: "Focused on you and your goals" },
];

/**
 * What the introduction says when the agent hasn't written their own.
 *
 * This is the COMMON case, not the edge one — REX's profile_bio is null for
 * every user on the account — so it has to stand up as real writing rather
 * than read as a placeholder.
 *
 * Written without pronouns, using the first name instead. A deck is generated
 * for whoever is signed in and we do not hold anybody's pronouns; guessing
 * from a name is exactly the kind of thing that goes wrong in front of a
 * customer.
 */
export function defaultBio(firstName: string): string {
  const who = firstName || "Your agent";
  return [
    `${who} looks after lettings across the area, and will be the one person you deal with — the valuation, the marketing, and the call when there's an offer.`,
    `At the appointment ${who} will walk round the property with you, talk through what it should let for and why, answer anything you want to ask, and set out exactly what happens next.`,
  ].join("\n\n");
}

/* ───────────────────────── shaping helpers ───────────────────────── */

export const firstNameOf = (name: string) => (name || "").trim().split(/\s+/)[0] ?? "";

/** Initials for the monogram that stands in for a missing headshot. */
export function initialsOf(name: string): string {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "TLE";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

/**
 * REX serves media as protocol-relative ("//uk-crm.cdns…"), which is fine in
 * a browser and broken everywhere else — an <img> in an email, a fetch on the
 * server, a JSON snapshot read back months later. Absolutised once, here.
 *
 * The CDN itself is public: measured, 200 image/jpeg with no Authorization
 * header, so a headshot works in an email the landlord's mail client fetches
 * with no cookie and no token.
 */
export function absoluteUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("//")) return `https:${url}`;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

/**
 * The slide list. Order matters and so does removability: the two slides that
 * carry the appointment itself cannot be dropped, everything else can, and
 * the deck has to read properly with any subset of the rest gone.
 */
export type SlideId =
  | "welcome"
  | "appointment"
  | "agent"
  | "valuation"
  | "comparables"
  | "market"
  | "why"
  | "terms"
  | "questions";

export const SLIDES: { id: SlideId; title: string; removable: boolean }[] = [
  { id: "welcome", title: "Welcome", removable: false },
  { id: "appointment", title: "Your appointment", removable: false },
  { id: "agent", title: "Who you're meeting", removable: false },
  /* Removable, and it MUST be: a comparables slide with two properties on it
     argues against us. Better absent than thin. */
  /* BEFORE the evidence, not after it. On a post-appraisal deck the landlord
     has already had the conversation and is opening this for one thing: the
     number. Making them scroll past comparables to reach it reads as building
     a case before daring to say it. Figure first, then why. */
  { id: "valuation", title: "What we'd put it on at", removable: true },
  { id: "comparables", title: "What's letting nearby", removable: true },
  /* After comparables on purpose. Named properties first, then the area they
     sit in — the specific earns the attention that the general then uses. */
  { id: "market", title: "Your local market", removable: true },
  { id: "why", title: "Why The Letting Experts", removable: true },
  /* Last thing before "any questions", because it is the ask. Everything above
     it is the argument for saying yes to this. */
  { id: "terms", title: "Getting started", removable: true },
  { id: "questions", title: "Any questions", removable: false },
];

/**
 * Which slides this particular deck shows.
 *
 * Nothing drops today, and that is a finding rather than a shortcut: every
 * slide here survives its own data being missing. The agent slide still
 * carries a name, a title and a way to reach them without a photo or a bio,
 * which is the whole point of it; the Why slide is static copy. The function
 * exists because the post-appraisal deck WILL drop slides for real — no
 * comparables chosen, no valuation written — and the viewer should already be
 * built against a list it doesn't control.
 */
/**
 * THE THREE DECKS, and why they are one component rather than three.
 *
 * A landlord meets us three times on paper and the paper is nearly the same
 * each time. Building three viewers would mean three places to fix a typo and
 * three chances for them to drift apart, so there is one deck, one renderer,
 * and a `kind` that decides which slides it is made of.
 *
 * ── What each one is for ──────────────────────────────────────────────────
 *
 * **pre-appraisal** — sent the day before, automatically. A sneak peek and
 *   nothing more: who is coming, when, and why us. It carries NO comparables
 *   and NO market, deliberately — the figures are the reason for the visit,
 *   and giving them away the night before removes it. James, 31 Aug.
 *
 * **appraisal** — what the agent takes with them and sends afterwards. This is
 *   the full research: the properties, the local market, the argument.
 *
 * **post-appraisal** — the same deck with the agreed figure and the terms to
 *   sign. It only goes once a valuation has been recorded.
 *
 * ── what makes post-appraisal different ───────────────────────────────────
 *
 * Two slides the other decks never carry: the agreed figure, and the terms to
 * sign. Both were impossible until valuation capture existed; both are gated
 * on real data, so a post-appraisal deck built before anyone recorded a
 * figure quietly renders as the appraisal deck rather than as a blank offer.
 */
export type DeckKind = "pre-appraisal" | "appraisal" | "post-appraisal";

export const DECK_KINDS: { id: DeckKind; label: string; blurb: string }[] = [
  {
    id: "pre-appraisal",
    label: "Pre-appraisal",
    blurb: "Goes out the day before. Who's coming, when, and why us.",
  },
  {
    id: "appraisal",
    label: "Appraisal",
    blurb: "The full research. Taken on the day, sent afterwards.",
  },
  {
    id: "post-appraisal",
    label: "Post-appraisal",
    blurb: "The agreed figure and the terms. Needs a valuation first.",
  },
];

/**
 * Which slides each kind is made of, in order.
 *
 * `appointment` is on the pre-appraisal ONLY. On the day the agent is standing
 * in the hall, and afterwards the visit has happened — a deck that opens by
 * confirming an appointment the landlord has already had reads as a mistake.
 */
const SLIDES_BY_KIND: Record<DeckKind, SlideId[]> = {
  "pre-appraisal": ["welcome", "appointment", "agent", "why", "questions"],
  appraisal: ["welcome", "agent", "comparables", "market", "why", "questions"],
  "post-appraisal": [
    "welcome",
    "agent",
    "valuation",
    "comparables",
    "market",
    "why",
    "terms",
    "questions",
  ],
};

/** The kind, tolerant of a row written before kinds existed. */
export function deckKind(deck: PresentDeck): DeckKind {
  return DECK_KINDS.some((k) => k.id === deck.kind) ? deck.kind : "pre-appraisal";
}

export function slidesFor(deck: PresentDeck): typeof SLIDES {
  const allowed = SLIDES_BY_KIND[deckKind(deck)];
  return SLIDES.filter((s) => {
    /* The kind decides membership FIRST. A pre-appraisal deck that happened to
       be minted with comparables on it must still not show them — the rule is
       about what this deck is for, not about what data reached it. */
    if (!allowed.includes(s.id)) return false;
    if (s.id === "comparables") {
      /* Three comparables is the floor. Below it the slide argues AGAINST us:
         a landlord counting two properties concludes we do not know their
         street, and the rest of the deck inherits that doubt. Absent is better. */
      const c = deck.comparables;
      return Boolean(c && c.rows.length >= 3);
    }
    /* The market slide is opt-in per appraisal — the agent ticks blocks on the
       Market step and nothing is included by default. An unticked deck must not
       carry an empty "Your local market" heading with nothing underneath it. */
    if (s.id === "market") return Boolean(deck.market);
    /* No rent, no offer slide. A "What we'd put it on at" heading above a dash
       is the worst thing on any of these decks: the landlord opened it for
       exactly that number. */
    if (s.id === "valuation") return Boolean(deck.valuation?.rent);
    /* The terms slide survives a null signUrl — it explains what happens next
       instead — but not a missing valuation. Asking somebody to sign up before
       telling them the figure is the wrong way round. */
    if (s.id === "terms") return Boolean(deck.terms && deck.valuation?.rent);
    return true;
  });
}

/* ───────────────────────── the sample ───────────────────────── */

/**
 * A deck with nobody's data in it, at /present/sample.
 *
 * Not a test fixture — it is how an agent sees what a landlord gets before
 * they ever send one, which they should be able to do without minting a real
 * page against a real address. It is also the only way this renders on a
 * machine with no database, which is how the OS runs locally.
 *
 * Deliberately thin where the real ones are thin: no photograph of the
 * property, no biography. Anyone reviewing the design should be looking at
 * the common case, not at a version dressed up with data most records don't
 * have.
 */
export const SAMPLE_DECK: PresentDeck = {
  kind: "pre-appraisal",
  recipientName: "Sample Landlord",
  /* Real figures from the live book (L34 5, 23 Aug 2026) rather than invented
     ones, so /present/sample shows the comparables slide as a landlord would
     actually receive it — including its caveat when there is one. */
  comparables: {
    guideLow: 750,
    guideMid: 1050,
    guideHigh: 1200,
    basedOn: 6,
    rows: [
      { name: "Apartment 2, 11 Station Road", locality: "Liverpool L34 5SN", rent: "\u00a3695 pcm", days: 13, letAgreed: true },
      { name: "Apartment 2, 10 Cardiff Grove", locality: "Luton LU1 1QH", rent: "\u00a3750 pcm", days: null, letAgreed: false },
      { name: "Apartment 28, 21 Wheatsheaf Court", locality: "Leicester LE2 6EY", rent: "\u00a3795 pcm", days: 2, letAgreed: false },
      { name: "14 Marchmont Road", locality: "Liverpool L34 5PQ", rent: "\u00a31,050 pcm", days: 21, letAgreed: true },
      { name: "3 Beechwood Gardens", locality: "Liverpool L34 6TR", rent: "\u00a31,200 pcm", days: null, letAgreed: false },
      { name: "9 Duntreath Avenue", locality: "Liverpool L34 5AB", rent: "\u00a31,250 pcm", days: 34, letAgreed: true },
    ],
    caveat: null,
  },
  /* Real NN5 4 figures, measured 31 Aug 2026, for the same reason the
     comparables above are real: the sample has to show what a landlord
     actually receives, and a market slide built from round invented numbers
     would hide exactly the problems worth catching — a thin size band, a
     competitor name too long for its row, an "us" figure we cannot fill in.
     The one thing left null is our own let speed, because in NN5 it IS null. */
  market: {
    area: "NN5 4",
    level: "sector",
    advertised: 20,
    medianRent: 1150,
    marketDays: 31,
    ourDays: null,
    ourLets: null,
    bands: [
      { label: "Under 2 weeks", n: 6 },
      { label: "2–4 weeks", n: 4 },
      { label: "1–3 months", n: 9 },
      { label: "Over 3 months", n: 1 },
    ],
    rentByBed: [
      { label: "1 bed", n: 4, rent: 895 },
      { label: "2 bed", n: 11, rent: 1150 },
      { label: "3 bed", n: 5, rent: 1600 },
    ],
    mix: { houses: 9, flats: 11 },
    agents: [
      { agent: "Lomond Investment Management", n: 5, ours: false },
      { agent: "O'Riordan Bond", n: 3, ours: false },
      { agent: "Connells Lettings", n: 2, ours: false },
      { agent: "Northwood Northampton", n: 1, ours: false },
      { agent: "Richard Greener", n: 1, ours: false },
    ],
    reduced: 0,
    pulledAt: "2026-08-31T06:48:00.000Z",
  },
  /* Only shown on /present/sample?kind=post-appraisal — the other two kinds
     exclude these slides by membership, so carrying them costs nothing and
     means the offer and the terms can be reviewed without recording a real
     valuation against a real landlord. signUrl is null on purpose: that is
     the live state until DocuSeal is connected, and the no-button branch is
     the one worth looking at. */
  valuation: {
    rent: 1300,
    serviceLevel: "Fully managed",
    feePct: 10,
    setupFee: 600,
    note: "Subject to the EPC being redone before it goes live — the current one expired in August.",
  },
  terms: { signUrl: null, summary: null },
  property: {
    address: "12 Example Street, Lincoln",
    postcode: "LN5 9AB",
    image: null,
    beds: 3,
    baths: 1,
    sqft: 912,
    propertyType: "Semi-detached",
    epc: "C",
  },
  whenPretty: "Tuesday 19 August at 2:00pm",
  startsAt: "2026-08-19T13:00:00.000Z",
  minutes: 45,
  agent: {
    // A plainly fictional person rather than "Your Name": half the copy on
    // the deck uses the first name in a sentence, and "Your looks after
    // lettings across the area" is not a sentence.
    name: "Sam Whitaker",
    firstName: "Sam",
    title: "Property Expert",
    email: "you@thelettingexperts.co.uk",
    phone: "07000 000000",
    photo: null,
    bio: "",
  },
  createdAt: "2026-08-13T09:00:00.000Z",
};
