/**
 * The tour a new agent is offered the first time they reach the OS.
 *
 * ── Two tours, not one ────────────────────────────────────────────────────
 *
 * FAST is Steve and the feedback button, and nothing else. It exists because
 * during a pre-launch the single most valuable thing a new person can learn
 * is how to tell us something is wrong. If they take nothing else in, that
 * one screen has already paid for itself.
 *
 * FULL walks the rail top to bottom and ends in the same place. It is the
 * same last step by design: whichever door somebody comes through, they leave
 * knowing where the feedback button is.
 *
 * ── The order is the rail's order ─────────────────────────────────────────
 *
 * Not a curated tour route. Somebody being shown round a new system is
 * building a map, and a tour that jumps about builds a worse one than a tour
 * that reads top to bottom - even if the jumping-about order is more logical.
 * The one exception is Your profile, which James put third when he dictated
 * this: it carries the warning that edits will reach REX at launch, and that
 * is worth landing before anybody starts poking at things.
 *
 * ── Honesty about what is not built ───────────────────────────────────────
 *
 * `caveat` exists because half of these screens are partial and two are still
 * a shell. Showing a new agent round a room and calling an empty corner a
 * feature is how the whole product loses their trust in one afternoon. Where
 * lib/screens.ts says `shell`, the tour says so out loud.
 */

export type TourId = "full" | "fast";

export type TourStep = {
  id: string;
  /**
   * CSS selectors, tried in order. The first one that resolves to a visible
   * element gets the spotlight; if none do, the card is shown centred with no
   * spotlight rather than pointing at nothing. That fallback is not an edge
   * case - Admin is owner-only, the rail does not exist below 1024px, and the
   * Customise button is not on every dashboard layout.
   */
  target?: string[];
  /** Spotlight every match together, rather than the first. Used for Steve. */
  union?: boolean;
  title: string;
  body: string;
  /** Said plainly when a screen is not finished. */
  caveat?: string;
  /** Ask the shell to open something before this step is measured. */
  reveal?: { expand?: boolean; profile?: boolean };
  /**
   * Ask Steve to open, and on which tab. `perform` starts his routine: he
   * waves while he is being introduced, flexes, settles, and drifts off if
   * somebody leaves the screen sitting there.
   */
  dock?: { open: boolean; tab?: "help" | "guides" | "feedback"; perform?: boolean };
};

/** The last step of both tours, and the reason the fast one exists. */
const STEVE: TourStep[] = [
  {
    id: "steve",
    target: ["[data-os-steve]", "[data-os-steve-bubble]"],
    union: true,
    title: "This Is Steve",
    body: "He is your assistant, and he is yours rather than everyone's. He learns from what you tell him, he can look things up across your properties, and he can draft an email and send it from your own mailbox once you have connected it.",
    caveat:
      "He knows which screen you are on, but he cannot see your screen. Nothing he does happens without you pressing the button on it first.",
    dock: { open: true, tab: "help", perform: true },
  },
  {
    id: "guides",
    target: ["[data-os-steve]", "[data-os-steve-bubble]"],
    union: true,
    title: "And His Guides",
    body: "Guides will hold the how-to for each part of the system. It is an empty shelf today, honestly, because the systems it describes are still being built. It fills up as they land.",
    dock: { open: true, tab: "guides" },
  },
  {
    id: "feedback",
    /* The launcher AND the bubble together, not just the feedback pill.
       James: "blur out the rest of the screen and just show Steve, and the
       Give Feedback button". A hole cut around one 90px pill inside an
       otherwise blurred bubble reads as a fault rather than as emphasis. */
    target: ["[data-os-steve]", "[data-os-steve-bubble]"],
    union: true,
    title: "And This Is The Important One",
    body: "Anything that looks wrong, anything confusing, and any idea you have. It takes a picture of what you were looking at and sends it straight to the development team, so you do not have to explain where you were.",
    caveat: "Use it more than you think you should. During a pre-launch there is no such thing as too small.",
    dock: { open: true, tab: "feedback" },
  },
];

export const FAST: TourStep[] = [
  {
    id: "fast-open",
    title: "The Short Version",
    body: "One thing, and it is the thing that matters most while this is still being built: how to tell us when something is not right.",
  },
  ...STEVE,
];

export const FULL: TourStep[] = [
  {
    id: "dashboard",
    target: ['[data-nav="/dashboard"]'],
    title: "Your Dashboard",
    body: "The first thing you see, and it is yours to arrange. Use Customise to add, remove and move the tiles so it shows what you actually want to look at first thing.",
    reveal: { expand: true },
  },
  {
    id: "leads",
    target: ['[data-nav="/leads"]'],
    title: "Leads",
    body: "Everyone who has put their hand up. Tenant-side and landlord-side are different jobs with different questions, so Leads opens into the two rather than mixing them into one list.",
  },
  {
    id: "profile",
    target: ["[data-os-profile]"],
    title: "Your Profile",
    body: "Your name, your photo, your contact details, and where you connect REX and your email if you ever need to change them.",
    caveat:
      "Worth knowing now: by the time this goes live, editing your details here will change them in REX too. So it is real, and it is worth being a little careful with.",
    reveal: { expand: true, profile: true },
  },
  {
    id: "market-appraisals",
    target: ['[data-nav="/market-appraisals"]'],
    title: "Market Appraisals",
    body: "Book an appraisal, and build the presentation you take to the landlord. Comparables, what the street is achieving, and your own figures, in something you can put in front of somebody.",
    reveal: { profile: false },
  },
  {
    id: "listings",
    target: ['[data-nav="/listings"]'],
    title: "Listings",
    body: "Your current listings, filtered by what is available. Only yours, never the whole office.",
  },
  {
    id: "viewings",
    target: ['[data-nav="/viewings"]'],
    title: "Viewings",
    body: "The day in front of you, as a diary. What you are seeing, when, and who with.",
  },
  {
    id: "applications",
    target: ['[data-nav="/applications"]'],
    title: "Applications",
    body: "Everything you have going through right now, and where each one has got to.",
  },
  {
    id: "compliance",
    target: ['[data-nav="/compliance"]'],
    title: "Compliance",
    body: "What is outstanding across your properties, and booking a contractor in to deal with it.",
  },
  {
    id: "emails",
    target: ['[data-nav="/emails"]'],
    title: "Emails",
    body: "An audit of what already goes out under our name. Skip past it for now, it is not the part you need on day one.",
  },
  {
    id: "portfolio",
    target: ['[data-nav="/portfolio"]'],
    title: "Portfolio",
    body: "Your book as a whole. How much of it is let, how much is fully managed, and how that is moving.",
    caveat: "Still being built. The screen is there, the figures behind it are not finished.",
  },
  {
    id: "finances",
    target: ['[data-nav="/finances"]'],
    title: "Finances",
    body: "Your own numbers, not the office's. Customisable in the same way the dashboard is, so you can put what you care about at the top.",
  },
  {
    id: "tools",
    target: ['[data-nav="/tools"]'],
    title: "Tools",
    body: "Prospecting, and the doors nobody has knocked on yet. This is the one you go to deliberately rather than the one waiting for you, which is why it sits down here.",
    caveat: "Mostly a shell today. It is the newest part of the system and it is being built out.",
  },
  ...STEVE,
];

export function stepsFor(id: TourId): TourStep[] {
  return id === "fast" ? FAST : FULL;
}
