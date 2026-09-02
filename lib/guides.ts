/**
 * The guide shelf.
 *
 * ── Why there is a catalogue and not just some pages ──────────────────────
 *
 * These live under Admin for now, which is James's alone, so the first
 * readers are James and whoever he shows. They are not written for him. Every
 * one of them is written for somebody on their first morning who has never
 * seen the OS, and the plan is that they end up on Steve's Guides shelf -
 * which today says "Guides are on their way" and lists nothing.
 *
 * That move is a one-liner as long as the shelf is DATA rather than a folder
 * of routes somebody has to remember to link. Hence this file: the panel in
 * HelpDock can map over `GUIDES` the same way /admin/guides does, and a guide
 * written next month appears in both places without either being edited.
 *
 * ── `ready` is not decoration ─────────────────────────────────────────────
 *
 * A shelf that lists a guide which turns out to be a stub teaches somebody,
 * on their first morning, that this product promises things it does not have.
 * Anything not finished says so on the card and does not open.
 */

export type Guide = {
  slug: string;
  /** Title Case, small words lowercase. */
  title: string;
  blurb: string;
  /** The shelf it sits on. Loose groupings, added to as guides are written. */
  section: string;
  icon: string;
  /** Honest reading time, not a guess dressed as one. */
  minutes: number;
  ready: boolean;
};

export const GUIDES: Guide[] = [
  {
    slug: "dashboard",
    title: "Your Dashboard",
    blurb:
      "The first screen you see, and the one screen that is genuinely yours. What every tile means, and how to move, resize, remove and add them until it shows what you actually want first thing.",
    section: "System",
    icon: "dashboard",
    minutes: 6,
    ready: true,
  },
];

/** Sections in the order the shelf should draw them. */
export const GUIDE_SECTIONS: string[] = ["System"];

export function guideBySlug(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

/**
 * Every tile the dashboard can show, in the drawers the tray puts them in.
 *
 * TRANSCRIBED from `DASH_TRAY_GROUPS` and the `WIDGETS` registry in
 * components/widgets.tsx, deliberately rather than imported. That module is
 * `"use client"` and pulls the whole dashboard - charts, the diary hook, the
 * lot - so importing it here to read eleven labels would drag all of it into
 * a page of prose.
 *
 * The cost of the copy is that it can drift, and nothing here will catch it:
 * add a widget to the registry and this list simply will not mention it. So
 * if you add one, add it here. The descriptions are also written for somebody
 * who has never seen the tile, which is a different job from the one-line
 * `hint` the tray shows on hover - they are not the same sentence twice.
 */
export type GuideTile = { label: string; what: string };

export const DASHBOARD_TILES: Array<{ group: string; icon: string; tiles: GuideTile[] }> = [
  {
    group: "Performance",
    icon: "trend-up",
    tiles: [
      { label: "Leads today", what: "How many came in today, and how many nobody has rung yet. Bigger, it shows the trend, then the names themselves." },
      { label: "Lead sources", what: "Where this month's leads actually came from - portals, paid social, the website, word of mouth - against last month." },
      { label: "Pipeline snapshot", what: "The whole journey as five numbers, from lead through to managed. Taller, it adds what converts to what." },
      { label: "Earnings this month", what: "The fees that have landed, net of VAT, split by where they came from." },
      { label: "Applications", what: "How many you have going through, and how many have stopped moving." },
    ],
  },
  {
    group: "Social & ads",
    icon: "megaphone",
    tiles: [
      { label: "Facebook leads", what: "Leads from Facebook, counted through GoHighLevel." },
      { label: "Instagram leads", what: "The same, from Instagram." },
      { label: "Ads running", what: "What is live right now, and what each lead is costing you." },
    ],
  },
  {
    group: "The book",
    icon: "folder",
    tiles: [
      { label: "On market", what: "What you have available. Bigger, it splits by status and names the ones that have sat longest." },
      { label: "Occupancy", what: "The percentage of your managed book that is let, the voids behind it, and what those voids cost." },
      { label: "Portfolio size", what: "The managed book as a whole, and which way it is moving." },
      { label: "Recently listed", what: "What has just gone live, and whether it is getting any interest." },
    ],
  },
  {
    group: "People & diary",
    icon: "calendar",
    tiles: [
      { label: "Today", what: "Your appointments for today, in order, with a way through to the full calendar." },
      { label: "Diary", what: "The same diary with room to breathe - the day, then the week, then the whole grid as you make it bigger." },
      { label: "Viewings", what: "What is coming up, and what the last ones said. Feedback is the bit landlords wait on." },
      { label: "Needs attention", what: "The worry list. Uncontacted leads, a certificate about to expire, referencing that has stalled. You can tick things off." },
    ],
  },
  {
    group: "Management",
    icon: "setting",
    tiles: [
      { label: "Rent arrears", what: "Who owes what, and for how long." },
      { label: "Maintenance jobs", what: "What is open and what is urgent." },
      { label: "Tenancies ending", what: "The next sixty days, so renew-or-re-let is a decision rather than a surprise." },
      { label: "Terms to sign", what: "Landlords who still have not signed their terms of business, oldest first." },
    ],
  },
  {
    group: "Compliance",
    icon: "shield",
    tiles: [
      { label: "Compliance due", what: "Certificates expiring this month across your properties." },
    ],
  },
  {
    group: "News",
    icon: "megaphone",
    tiles: [{ label: "News", what: "What landlords are reading today." }],
  },
];
