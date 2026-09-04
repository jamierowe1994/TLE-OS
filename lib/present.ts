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
  /** Shown so the landlord can see the working, not just the answer.
   *
   *  The photographs and the extra detail are OPTIONAL, and that is not
   *  laziness: these come from our own book rather than from Homesearch, and
   *  REX does not always have images on a let property. A row without them is
   *  still evidence - it is a real property at a real rent - it just does not
   *  open. See PresentListing for why they are here at all. */
  rows: {
    name: string;
    locality: string;
    rent: string;
    days: number | null;
    letAgreed: boolean;
    beds?: number | null;
    type?: string | null;
    image?: string | null;
    photos?: string[];
  }[];
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

/**
 * WHAT IT COSTS. Its own slide, on both long decks.
 *
 * James, 4 Sep: "I do want a single page for the fees to go in." The agreed
 * source deck put a fourteen-row service comparison in front of a landlord
 * with no price anywhere on it — which does not read as discretion, it reads
 * as something being kept back, and it leaves them doing sums in their head
 * instead of listening.
 *
 * `rows` rather than fixed fields because the shape genuinely varies: some
 * offices quote one percentage, some quote a percentage and a set-up fee,
 * some quote per service level. A fixed `feePct` + `setupFee` would force
 * every office into the middle one.
 *
 * `headline` is what the landlord repeats to whoever else decides — "10% of
 * rent, fully managed". If an agent writes nothing else, the slide still
 * answers the question it exists to answer.
 */
export type PresentFees = {
  /** "10% of rent collected" — the one line they will remember. */
  headline: string | null;
  /** The service level the headline belongs to, when there is more than one. */
  headlineFor: string | null;
  rows: { label: string; amount: string; note: string | null }[];
  /** What is NOT in the fee. Stated here so it is never a surprise later. */
  excluded: string[];
  /** VAT, tie-ins, anything a landlord would rightly want in writing. */
  note: string | null;
};

/**
 * One property on the "what's on the market" slide.
 *
 * ── Why this carries a gallery ─────────────────────────────────────────────
 *
 * James, 4 Sep: the comparison slides were "just listing out some random
 * properties with nothing attached to them". He is right, and it is the
 * difference between evidence and a list of names: a landlord cannot judge
 * whether the flat at £1,150 is better or worse than theirs from an address.
 * With the photographs, the agent, the status and how long it has sat, they
 * can - and that is the whole job of the slide.
 *
 * Everything here is SNAPSHOTTED at send, photographs included, for the reason
 * at the top of this file: a landlord opening the link on Sunday must not
 * depend on Homesearch being up. The URLs are its public S3 media, which
 * survives without a token (measured).
 *
 * The optional fields are optional so that decks minted before 4 Sep still
 * parse. A row with no photographs simply does not open.
 */
export type PresentListing = {
  address: string;
  locality: string;
  rent: string;
  beds: number | null;
  type?: string | null;
  /** The lead photograph. 95% of Homesearch rows carry one. */
  image: string | null;
  /** The rest of the gallery, from `current_listings/<id>`. */
  photos?: string[];
  agent: string | null;
  /** The real advert, so a landlord can check us rather than trust us. */
  advert?: string | null;
  /** "let agreed" is the rental STC - the freshest evidence of what the market
   *  PAYS as opposed to what it asks, so it is labelled rather than dropped. */
  status?: "on market" | "let agreed";
  days?: number | null;
  /** Ours, so the slide can say so without a separate list. */
  ours: boolean;
};

/** A row of the "what we have on record" slide — label and value, nothing more. */
export type PresentMaterialRow = { label: string; value: string };

/** How the area has moved, month by month. */
export type PresentHistory = {
  area: string;
  points: { month: string; listed: number; let: number; withdrawn: number }[];
};

export type PresentDeck = {
  /** Which of the three decks this is — see DeckKind. */
  kind: DeckKind;
  /** Which look it wears. Absent means "hand", so every deck minted before
   *  4 Sep keeps exactly the appearance it was approved with. */
  style?: PresentStyle;
  /** Post-appraisal only. See PresentValuation. */
  valuation?: PresentValuation | null;
  /** Post-appraisal only. See PresentTerms. */
  terms?: PresentTerms | null;
  /** What we charge. On both long decks — see PresentFees. */
  fees?: PresentFees | null;
  comparables?: PresentComparables | null;
  /** What is advertised near them right now. */
  listings?: PresentListing[] | null;
  /** What we hold about the property, for them to correct. */
  material?: PresentMaterialRow[] | null;
  history?: PresentHistory | null;
  /** A real review, with a real name on it. Never a composite. */
  testimonial?: { quote: string; author: string; rating: number | null } | null;
  /** The agent's walk-through of THIS property, if one has been filmed. */
  propertyVideoUrl?: string | null;
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
    body: "Every room, the outside, and the bits people forget - the boiler, the meters, the parking. Ten minutes of it tells us more than any form.",
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
    body: "Sometimes nothing. Sometimes one afternoon's work puts fifty pounds a month on it - we'll tell you which.",
  },
];

/**
 * The three promises along the bottom of the entrance screen, from James's
 * mock-up. They are propositions rather than statistics, which is the same
 * rule the Why slide follows — nothing here is a number we can't stand behind.
 */
export const BANNER: { icon: "people" | "shield" | "chart"; title: string; body: string }[] = [
  {
    icon: "people",
    title: "Local experts",
    // These used to be cut to ONE line each, because they sat in a third of a
    // banner across the foot of a photograph. James's 4 Sep entrance moves
    // them into the body of the slide with a tinted badge above each, where
    // two lines is the shape that looks right — so the first one goes back to
    // the fuller sentence it wanted in the first place.
    body: "People who know your area inside out.",
  },
  {
    icon: "shield",
    title: "Maximum protection",
    body: "Your property and income, safe.",
  },
  {
    // A bar chart, not a trend arrow. An arrow going up beside the words
    // "better returns" is a promise about performance we have not made.
    icon: "chart",
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
    `${who} looks after lettings across the area, and will be the one person you deal with - the valuation, the marketing, and the call when there's an offer.`,
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
  | "agenda"
  | "agent"
  | "approach"
  /* — your property — */
  | "property"
  | "material"
  /* — the current market — */
  | "market"
  | "listings"
  | "comparables"
  | "history"
  /* — marketing — */
  | "marketing"
  | "offer"
  | "maxprice"
  | "video"
  | "brochure"
  | "portals"
  | "social"
  /* — compliance — */
  | "compliance"
  | "legal"
  | "screening"
  /* — service and management — */
  | "management"
  | "levels"
  | "collection"
  /* — protecting the income — */
  | "protection"
  | "rentlegal"
  | "regulated"
  | "network"
  /* — the close — */
  | "why"
  | "testimonial"
  | "valuation"
  | "fees"
  | "terms"
  | "questions";

/**
 * The slide list, in the one order every deck reads them in.
 *
 * ── The running order is the agreed one, with three slides moved ────────────
 *
 * The structure comes from the signed-off Base44 deck (captured in
 * docs/MA-PRESENTATION-MOCKUP.md) and James asked for it copied rather than
 * re-argued. Three slides did move, and only because that deck contradicted
 * itself: rent collection, historic listings and social media sat AFTER "Get
 * In Touch", which is the close, and none of the three appeared on its own
 * agenda. They now sit with the section each belongs to — collection with
 * management, history with the market, social with marketing.
 *
 * ── `section` groups them, and the group is the contents list ───────────────
 *
 * A thirty-slide deck needs to tell a landlord where they are. The dividers
 * (`property`, `marketing`) and the agenda both read from these groups, so a
 * slide added to a section appears in the contents without anyone remembering
 * to add it twice.
 */
/**
 * THE SECTIONS.
 *
 * James, 4 Sep: "this is a bit of a mishmash of things being put together…
 * break it down into chunks" — and, separately, that a "1 / 29" in the corner
 * "is making me depressed". Those are the same problem. Twenty-nine is only a
 * frightening number when it is presented as one undifferentiated run; as
 * seven short chapters it is an evening's reading with obvious places to stop.
 *
 * The sections ARE the agenda on slide 2 — same seven, same order, same words.
 * That is the whole point: a landlord is told the shape at the start and then
 * watches it happen, rather than being told one thing and shown another.
 *
 * `opening` has no label because it is not a chapter, it is the way in. The
 * chrome shows nothing until the first real section starts, which spares the
 * landlord a progress indicator on the slide where they are deciding whether
 * to keep reading at all.
 */
export type SectionId =
  | "opening"
  | "property"
  | "marketing"
  | "next"
  | "close";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "opening", label: "" },
  { id: "property", label: "Your property" },
  { id: "marketing", label: "Marketing" },
  { id: "next", label: "The next steps" },
  { id: "close", label: "Getting started" },
];

export const sectionLabel = (id: SectionId) =>
  SECTIONS.find((s) => s.id === id)?.label ?? "";

export const SLIDES: { id: SlideId; title: string; removable: boolean; section: SectionId }[] = [
  { id: "welcome", title: "Welcome", removable: false, section: "opening" },
  { id: "appointment", title: "Your appointment", removable: false, section: "opening" },
  { id: "agenda", title: "What we'll cover", removable: true, section: "opening" },
  { id: "agent", title: "Who you're meeting", removable: false, section: "opening" },
  { id: "approach", title: "A different approach", removable: true, section: "opening" },

  /* Your property. The divider earns its slide: it is the moment the deck
     stops talking about us and starts talking about them. */
  { id: "property", title: "Your property", removable: true, section: "property" },
  { id: "material", title: "What we have on record", removable: true, section: "property" },

  /* The current market. Named properties first, then the area they sit in —
     the specific earns the attention the general then spends. */
  { id: "listings", title: "What's on the market", removable: true, section: "property" },
  /* Removable, and it MUST be: a comparables slide with two properties on it
     argues against us. Better absent than thin. */
  { id: "comparables", title: "What's letting nearby", removable: true, section: "property" },
  { id: "market", title: "Your local market", removable: true, section: "property" },
  { id: "history", title: "How the area has moved", removable: true, section: "property" },

  /* Marketing. */
  { id: "marketing", title: "Marketing", removable: true, section: "marketing" },
  { id: "offer", title: "What we do", removable: true, section: "marketing" },
  /* James, 4 Sep: Marketing is its own chunk, and inside it a landlord needs
     BOTH halves — how we put it in front of people, and how that turns into a
     higher rent. The source deck only ever argued the first. */
  { id: "maxprice", title: "Getting the best rent", removable: true, section: "marketing" },
  { id: "video", title: "Your property on film", removable: true, section: "marketing" },
  { id: "brochure", title: "The brochure", removable: true, section: "marketing" },
  { id: "portals", title: "Where it appears", removable: true, section: "marketing" },
  { id: "social", title: "Social advertising", removable: true, section: "marketing" },

  /* Compliance. Screening moved up from slide 21 of the source deck: it is
     the strongest argument in the whole thing and nobody reached it there. */
  { id: "compliance", title: "Compliance and guidance", removable: true, section: "next" },
  { id: "legal", title: "What the law asks of you", removable: true, section: "next" },
  { id: "screening", title: "How we screen tenants", removable: true, section: "next" },

  /* Service and management. */
  { id: "management", title: "Management and support", removable: true, section: "next" },
  { id: "levels", title: "Service levels", removable: true, section: "next" },
  { id: "collection", title: "Rent collection", removable: true, section: "next" },

  /* Protecting the income. */
  { id: "protection", title: "Protecting your income", removable: true, section: "next" },
  { id: "rentlegal", title: "Rent and legal protection", removable: true, section: "next" },
  { id: "regulated", title: "Regulated and protected", removable: true, section: "next" },
  { id: "network", title: "The Experts Group", removable: true, section: "next" },

  /* The close. */
  { id: "why", title: "Why The Letting Experts", removable: true, section: "close" },
  { id: "testimonial", title: "What landlords say", removable: true, section: "close" },
  /* BEFORE the fee, not after it. On a post-appraisal deck the landlord has
     already had the conversation and is opening this for one thing: the
     number. Making them scroll past anything to reach it reads as building a
     case before daring to say it. Figure first, then what it costs. */
  { id: "valuation", title: "What we'd put it on at", removable: true, section: "close" },
  /* James, 4 Sep: the fee gets a page of its own. The source deck put a
     service comparison in front of a landlord with no price anywhere on it,
     which leaves them working out the cost in their head while we talk. */
  { id: "fees", title: "What it costs", removable: true, section: "close" },
  /* Last thing before the close, because it is the ask. Everything above it
     is the argument for saying yes to this. */
  { id: "terms", title: "Getting started", removable: true, section: "close" },
  { id: "questions", title: "Any questions", removable: false, section: "close" },
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
 * WHICH LOOK THIS DECK WEARS.
 *
 * James, 4 Sep: "some of the guys have concerns over the styling… it's not
 * that they're not keen on it, it's just a lot different." So rather than
 * argue it, the deck offers three and lets the room choose.
 *
 *   hand    What we built. Warm off-white, the marker hand, the coral script
 *           word, the drawn illustrations. Unchanged and NOT to be touched -
 *           it is the one somebody already likes.
 *   brand   The halfway house. The brand's own typography on the brand's own
 *           quiet surface, keeping the illustrations. Same deck, same shape,
 *           read in the voice the guidelines specify.
 *   photo   Fully branded. Brand typography, and photographs where the
 *           illustrations were.
 *
 * ── Why this is one deck and three themes, not three decks ────────────────
 *
 * Every argument, every figure and every empty-state rule is the same in all
 * three. Only the type, the ground and the artwork differ. Three decks would
 * mean three places to fix a typo and three chances to drift, which is the
 * same reasoning that made the appraisal and post-appraisal decks one list.
 *
 * The theme is carried as CSS variables at the deck root, so a slide asking
 * for the display face gets whichever one the deck is wearing without
 * knowing there is a choice. See components/present-kit.
 */
export type PresentStyle = "hand" | "brand" | "photo";

export const PRESENT_STYLES: { id: PresentStyle; label: string; blurb: string }[] = [
  { id: "hand", label: "Drawn", blurb: "The marker hand and the illustrations." },
  { id: "brand", label: "Brand", blurb: "Brand typography, same illustrations." },
  { id: "photo", label: "Photographic", blurb: "Brand typography, photographs." },
];

export const asStyle = (v: string | null | undefined): PresentStyle =>
  PRESENT_STYLES.some((s) => s.id === v) ? (v as PresentStyle) : "hand";

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
    blurb: "The full deck. Presented on the day.",
  },
  {
    id: "post-appraisal",
    label: "Post-appraisal",
    blurb: "The same deck, plus the agreed figure and the terms to sign.",
  },
];

/**
 * Which slides each kind is made of, in order.
 *
 * ── The two long decks are ONE deck ─────────────────────────────────────────
 *
 * James, 4 Sep: the appraisal and post-appraisal decks are "pretty much the
 * same deck… from the point of view of everybody else it will just have two
 * things added to it" — a real call to action, and the terms with a signing
 * button on them. So `MAIN` is written once and post-appraisal is that list
 * with three slides spliced in. Writing them out twice would guarantee they
 * drift, and the drift would be invisible: nobody opens both decks side by
 * side, so the day one slide went missing from the post version is the day
 * before somebody noticed.
 *
 * `appointment` is on the pre-appraisal ONLY. On the day the agent is standing
 * in the hall, and afterwards the visit has happened — a deck that opens by
 * confirming an appointment the landlord has already had reads as a mistake.
 *
 * `fees` is on BOTH long decks, and that is deliberate rather than an
 * oversight of the "post-appraisal only" pattern. What we charge does not
 * depend on what the property lets for, and a landlord who has sat through a
 * service comparison has earned the price before they are asked to decide.
 * What the post-appraisal deck adds is the RENT — the figure that needed the
 * visit — and the paperwork that follows from it.
 */
const MAIN: SlideId[] = [
  "welcome",
  "agenda",
  "agent",
  "approach",
  "property",
  "material",
  "listings",
  "comparables",
  "market",
  "history",
  "marketing",
  "offer",
  "maxprice",
  "video",
  "brochure",
  "portals",
  "social",
  "compliance",
  "legal",
  "screening",
  "management",
  "levels",
  "collection",
  "protection",
  "rentlegal",
  "regulated",
  "network",
  "why",
  "testimonial",
  "fees",
  "questions",
];

/** The main deck with the figure in front of the fee, and the terms after it. */
const withValuation = (list: SlideId[]): SlideId[] =>
  list.flatMap((id) =>
    id === "fees" ? (["valuation", "fees", "terms"] as SlideId[]) : [id]
  );

const SLIDES_BY_KIND: Record<DeckKind, SlideId[]> = {
  "pre-appraisal": ["welcome", "appointment", "agent", "why", "questions"],
  appraisal: MAIN,
  "post-appraisal": withValuation(MAIN),
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
    /* Everything else that renders a DATA set rather than standing copy. Each
       is dropped rather than shown empty, for the reason comparables is: a
       heading over nothing does not read as "we had no data", it reads as a
       broken page, and it costs us the slide either way. */
    if (s.id === "listings") return Boolean(deck.listings?.length);
    if (s.id === "history") return Boolean(deck.history?.points?.length);
    if (s.id === "material") return Boolean(deck.material?.length);
    if (s.id === "testimonial") return Boolean(deck.testimonial?.quote);
    /* `video` is NOT gated on having a film, and used to be. The film is made
       after the instruction and this deck is what wins the instruction, so the
       argument for filming a property is worth making to precisely the person
       who has not signed yet. The slide shows a frame saying what will go in
       it; see components/PresentSlides. */
    /* The fee page needs a fee. An agent who has not set one yet gets no slide
       rather than a page of dashes — and the builder can then tell them so. */
    if (s.id === "fees") return Boolean(deck.fees && (deck.fees.rows.length || deck.fees.headline));
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
      {
        name: "Apartment 2, 11 Station Road", locality: "Liverpool L34 5SN",
        rent: "\u00a3695 pcm", days: 13, letAgreed: true, beds: 1, type: "Flat",
        image: "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/897BEA0623F24D2316A416706858EF5BC21170FB.jpg",
        photos: [
          "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/897BEA0623F24D2316A416706858EF5BC21170FB.jpg",
          "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/219E20077D133E46D54AC1CC8AE7919C95D2EB59.jpg",
        ],
      },
      { name: "Apartment 2, 10 Cardiff Grove", locality: "Luton LU1 1QH", rent: "\u00a3750 pcm", days: null, letAgreed: false },
      { name: "Apartment 28, 21 Wheatsheaf Court", locality: "Leicester LE2 6EY", rent: "\u00a3795 pcm", days: 2, letAgreed: false },
      {
        name: "14 Marchmont Road", locality: "Liverpool L34 5PQ", rent: "\u00a31,050 pcm",
        days: 21, letAgreed: true, beds: 3, type: "Terraced house",
        image: "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/219E20077D133E46D54AC1CC8AE7919C95D2EB59.jpg",
        photos: ["https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/219E20077D133E46D54AC1CC8AE7919C95D2EB59.jpg"],
      },
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
    note: "Subject to the EPC being redone before it goes live - the current one expired in August.",
  },
  terms: { signUrl: null, summary: null },
  /* Shown on BOTH long decks — see PresentFees. Written as an office actually
     quotes it: one headline percentage, the extras named rather than implied,
     and the exclusions listed so the slide cannot be read as all-inclusive. */
  fees: {
    headline: "10% of rent collected",
    headlineFor: "Fully managed",
    rows: [
      { label: "Fully managed", amount: "10% of rent", note: "Rent & Legal Protection included" },
      { label: "Rent collection", amount: "7% of rent", note: null },
      { label: "Tenant find", amount: "£750 one-off", note: "Charged on move-in, not on instruction" },
      { label: "Set-up fee", amount: "£600 one-off", note: "Referencing, agreement and check-in" },
    ],
    excluded: [
      "Gas and electrical safety certificates, at cost",
      "An inventory where one is not already held",
      "Court fees, on the two service levels that do not include legal cover",
    ],
    note: "All figures include VAT. No tie-in - one month's notice either way, at any point.",
  },
  /* What is advertised near them today. Deliberately includes one of ours and
     several that are not: a slide showing only our own stock is a brochure,
     not a market. */
  /* The photographs are Homesearch's own public S3 media, which is what a real
     deck snapshots (measured: 200 image/jpeg, no token). They are here so the
     gallery can actually be reviewed before an agent sends one - the rows that
     carry none stay shut, which is the other half of the behaviour and just as
     worth seeing. If one of these ever 404s the row simply stops opening. */
  listings: [
    {
      address: "24 Harlestone Road", locality: "NN5 6AA", rent: "£1,095 pcm", beds: 2,
      type: "Terraced house", agent: "The Letting Experts", ours: true,
      status: "on market", days: 9,
      image: "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/219E20077D133E46D54AC1CC8AE7919C95D2EB59.jpg",
      photos: [
        "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/219E20077D133E46D54AC1CC8AE7919C95D2EB59.jpg",
        "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/897BEA0623F24D2316A416706858EF5BC21170FB.jpg",
      ],
    },
    {
      address: "8 Larkhall Lane", locality: "NN5 7BB", rent: "£1,150 pcm", beds: 2,
      type: "Flat", agent: "O'Riordan Bond", ours: false, status: "on market", days: 24,
      image: "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/897BEA0623F24D2316A416706858EF5BC21170FB.jpg",
      photos: [
        "https://hs-pt-media.s3.eu-west-2.amazonaws.com/I/897BEA0623F24D2316A416706858EF5BC21170FB.jpg",
      ],
    },
    {
      address: "112 Bants Lane", locality: "NN5 6DE", rent: "£1,250 pcm", beds: 3,
      type: "Semi-detached house", agent: "Connells Lettings", ours: false,
      status: "let agreed", days: 16, image: null,
    },
    {
      address: "3 Wilby Way", locality: "NN5 4QT", rent: "£1,395 pcm", beds: 3,
      type: "Detached house", agent: "Lomond", ours: false, status: "on market", days: 41,
      image: null,
    },
  ],
  /* The point of this slide is that the landlord CORRECTS it, so the sample
     carries a blank the way a real record does — nobody has the tenure. */
  material: [
    { label: "Type", value: "Semi-detached house" },
    { label: "Bedrooms", value: "3" },
    { label: "Bathrooms", value: "1" },
    { label: "Floor area", value: "912 sq ft" },
    { label: "EPC", value: "C" },
    { label: "Council tax", value: "Band C, West Northamptonshire" },
    { label: "Tenure", value: "-" },
    { label: "Heating", value: "Gas central heating" },
  ],
  history: {
    area: "NN5 4",
    points: [
      { month: "2026-03", listed: 4, let: 3, withdrawn: 0 },
      { month: "2026-04", listed: 6, let: 5, withdrawn: 1 },
      { month: "2026-05", listed: 7, let: 6, withdrawn: 1 },
      { month: "2026-06", listed: 2, let: 4, withdrawn: 0 },
      { month: "2026-07", listed: 7, let: 2, withdrawn: 0 },
      { month: "2026-08", listed: 5, let: 6, withdrawn: 1 },
    ],
  },
  /* A real one, with a real name. A composite review on a slide about being
     straight with people is the wrong thing to invent. */
  testimonial: {
    quote:
      "First time we'd let a property and we had no idea what we were doing. Everything was explained before it happened rather than after, and the tenancy was signed inside a fortnight.",
    author: "Sarah Davies",
    rating: 5,
  },
  propertyVideoUrl: null,
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
