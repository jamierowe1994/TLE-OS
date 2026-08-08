/**
 * The diary: one week's appointments, shared by the dashboard's Today box and
 * the full calendar it opens into.
 *
 * Days are OFFSETS from today, not fixed dates, so the sample week is always
 * alive — there's yesterday to look back on and next week to scroll to no
 * matter when the wireframe is opened. When authentication lands this whole
 * file is replaced by a pull from each agent's own 365 calendar; the shape
 * below is the contract that pull has to satisfy.
 *
 * Every appointment knows two things a calendar entry usually doesn't:
 * which RECORD it belongs to (click it, get the file), and which EMAILS were
 * sent when it was booked — because "did the confirmation actually go?" is
 * the question agents open a diary to answer.
 */

export type ApptKind = "viewing" | "appraisal" | "takeon" | "movein" | "inspection";

export type Appt = {
  id: string;
  /** Days from today: -1 is yesterday, 0 today, 7 a week out. */
  day: number;
  start: string; // "10:15"
  mins: number;
  kind: ApptKind;
  what: string;
  where: string;
  who: string;
  agent: string;
  /** The record this appointment is a line in. */
  link?: { href: string; label: string };
  /** The messages the booking flow sends, and whether they went. */
  comms: { label: string; done: boolean }[];
};

export const KIND_META: Record<ApptKind, { label: string; icon: string }> = {
  viewing: { label: "Viewing", icon: "key" },
  appraisal: { label: "Appraisal", icon: "trend-up" },
  takeon: { label: "Take-on & photos", icon: "pack/photo" },
  movein: { label: "Move-in", icon: "pack/house" },
  inspection: { label: "Inspection", icon: "pack/checklist" },
};

/** "10:15" → minutes since midnight. */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const sent = (label: string) => ({ label, done: true });
const unsent = (label: string) => ({ label, done: false });

export const DIARY: Appt[] = [
  /* ── Looking back: last week taught somebody something. ── */
  {
    id: "d-past-takeon", day: -4, start: "10:00", mins: 90, kind: "takeon",
    what: "Take-on & photos — 183 Walesby Lane", where: "New Ollerton NG22",
    who: "Dean Halliwell (sitting tenant)", agent: "Michael",
    link: { href: "/listings", label: "183 Walesby Lane" },
    comms: [sent("Visit confirmed with the landlord"), sent("Heads-up to Dean Halliwell")],
  },
  {
    id: "d-past-patel", day: -2, start: "14:30", mins: 30, kind: "viewing",
    what: "Viewing — 183 Walesby Lane", where: "New Ollerton NG22",
    who: "James Patel", agent: "Michael",
    link: { href: "/listings", label: "183 Walesby Lane" },
    comms: [sent("Confirmation to James Patel"), sent("Heads-up to the current tenant")],
  },
  {
    id: "d-past-clark", day: -1, start: "11:00", mins: 30, kind: "viewing",
    what: "Viewing — 2, 10 Cardiff Grove", where: "Luton LU1",
    who: "Olivia Clark", agent: "Kirstie",
    link: { href: "/listings", label: "2, 10 Cardiff Grove" },
    comms: [sent("Confirmation to Olivia Clark")],
  },
  {
    id: "d-past-williams", day: -1, start: "16:00", mins: 30, kind: "viewing",
    what: "Viewing — 8 Recreation Terrace", where: "Nottingham NG9",
    who: "Tom Williams", agent: "Kirstie",
    link: { href: "/listings", label: "8 Recreation Terrace" },
    comms: [sent("Confirmation to Tom Williams")],
  },

  /* ── Today — the same four the dashboard box shows. ── */
  {
    id: "d-shah", day: 0, start: "10:15", mins: 30, kind: "viewing",
    what: "Viewing — 12 Elm Gardens", where: "Didsbury M20",
    who: "Priya Shah", agent: "Michael",
    link: { href: "/listings", label: "12 Elm Gardens" },
    comms: [sent("Confirmation to Priya Shah"), sent("Landlord told")],
  },
  {
    id: "d-granby", day: 0, start: "13:00", mins: 60, kind: "appraisal",
    what: "Market appraisal — 9 Granby Road", where: "Salford M7",
    who: "New landlord", agent: "Kirstie",
    link: { href: "/leads?side=landlord", label: "The landlord lead" },
    comms: [sent("Confirmation to the landlord"), sent("Follow-up reminder set")],
  },
  {
    id: "d-bell", day: 0, start: "15:30", mins: 30, kind: "viewing",
    what: "Viewing — 41 Harewood Road", where: "Luton LU1",
    who: "Marcus Bell", agent: "Kirstie",
    link: { href: "/listings", label: "41 Harewood Road" },
    comms: [sent("Confirmation to Marcus Bell"), sent("Landlord told")],
  },
  {
    id: "d-turner", day: 0, start: "17:00", mins: 30, kind: "viewing",
    what: "Viewing — Flat 2, Mercer Street", where: "Manchester M4",
    who: "Sophie Turner", agent: "Kirstie",
    link: { href: "/listings", label: "Flat 2, Mercer Street" },
    // The one the diary exists to catch: booked, never confirmed.
    comms: [unsent("Confirmation to Sophie Turner"), sent("Landlord told")],
  },

  /* ── The rest of the week. ── */
  {
    id: "d-okafor", day: 1, start: "09:30", mins: 30, kind: "viewing",
    what: "Viewing — 228a Chapter Road", where: "London NW2",
    who: "Daniel Okafor", agent: "Michael",
    link: { href: "/listings", label: "228a Chapter Road" },
    comms: [sent("Confirmation to Daniel Okafor")],
  },
  {
    id: "d-adams", day: 1, start: "14:00", mins: 30, kind: "viewing",
    what: "Viewing — 108 Cherry Tree Drive", where: "Coventry CV4",
    who: "Chloe Adams", agent: "Kirstie",
    link: { href: "/listings", label: "108 Cherry Tree Drive" },
    comms: [unsent("Confirmation to Chloe Adams"), sent("Landlord told")],
  },
  {
    id: "d-movein", day: 2, start: "10:00", mins: 60, kind: "movein",
    what: "Move-in — Flat A, 41 Milton Road", where: "Luton LU1",
    who: "Ryan Whitfield", agent: "Michael",
    link: { href: "/applications", label: "Ryan's application" },
    comms: [sent("Move-in pack emailed"), sent("Deposit registered")],
  },
  {
    id: "d-inspect", day: 3, start: "11:30", mins: 45, kind: "inspection",
    what: "Mid-term inspection — 41 Harewood Road", where: "Luton LU1",
    who: "The tenants", agent: "Kirstie",
    link: { href: "/portfolio", label: "41 Harewood Road" },
    comms: [sent("Notice given to the tenants")],
  },
  {
    id: "d-nextweek-app", day: 6, start: "10:00", mins: 60, kind: "appraisal",
    what: "Market appraisal — 17 Beckett Avenue", where: "Mansfield NG18",
    who: "Mrs Osei", agent: "Michael",
    link: { href: "/leads?side=landlord", label: "The landlord lead" },
    comms: [sent("Confirmation to Mrs Osei"), sent("Follow-up reminder set")],
  },
  {
    id: "d-nextweek-view", day: 7, start: "15:00", mins: 30, kind: "viewing",
    what: "Viewing — 12 Elm Gardens", where: "Didsbury M20",
    who: "Aisha Rahman", agent: "Kirstie",
    link: { href: "/listings", label: "12 Elm Gardens" },
    comms: [sent("Confirmation to Aisha Rahman"), sent("Landlord told")],
  },
];

/** Today's list, in order — the dashboard box reads from here so the box and
 *  the calendar can never disagree. */
export function todaysAppts(): Appt[] {
  return DIARY.filter((a) => a.day === 0).sort(
    (a, b) => minutesOf(a.start) - minutesOf(b.start)
  );
}
