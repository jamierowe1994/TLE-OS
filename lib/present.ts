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

export type PresentDeck = {
  kind: "pre-appraisal";
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
export type SlideId = "welcome" | "appointment" | "agent" | "why" | "questions";

export const SLIDES: { id: SlideId; title: string; removable: boolean }[] = [
  { id: "welcome", title: "Welcome", removable: false },
  { id: "appointment", title: "Your appointment", removable: false },
  { id: "agent", title: "Who you're meeting", removable: false },
  { id: "why", title: "Why The Letting Experts", removable: true },
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
export function slidesFor(_deck: PresentDeck): typeof SLIDES {
  return SLIDES;
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
