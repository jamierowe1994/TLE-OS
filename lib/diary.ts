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

export type ApptKind =
  | "viewing"
  | "appraisal"
  | "takeon"
  | "movein"
  | "inspection"
  /** Getting there and getting back. Kept as its OWN entry either side of the
   *  visit rather than padded onto it, so the diary shows the appraisal as
   *  the hour it really is and the drive as the drive — and so moving one
   *  doesn't silently move the other. */
  | "travel"
  /** Everything else in a real working day — appointments, training, the
   *  private entries that show only as "Busy". Hiding these would tell you
   *  an agent is free when they are not. */
  | "other";

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
  /** Where it is, roughly — so a booking calendar can say how far this
   *  appointment is from the one being booked. Town-level is enough. */
  lat?: number;
  lng?: number;
  /** How to reach the person it's with — the drawer's phone-them button. */
  contact?: { email: string; phone: string };
  /** The sitting tenant, when the property has one. null = vacant. A
   *  tenanted viewing without a heads-up is the thing this data exists
   *  to catch. */
  tenant?: string | null;
  /** The record this appointment is a line in. */
  link?: { href: string; label: string };
  /** The messages the booking flow sends, and whether they went. */
  comms: { label: string; done: boolean }[];
  /**
   * An all-day entry — a holiday, a course, a "on leave" block.
   *
   * These arrive from REX with a midnight start, which is not a time anybody
   * booked; it is the absence of one. They must be kept OUT of the grid's
   * hour window or a single day off drags the whole week open to 00:00 and
   * squashes the working day into half the height. Drawn as a chip under the
   * day heading instead, where it reads as what it is.
   */
  allDay?: boolean;
  /** Came from a real REX calendar rather than the sample book. Such an
   *  appointment has no confirmation trail and no occupancy on it, and the
   *  screen must say so rather than imply all is well. */
  fromRex?: boolean;
};

export const KIND_META: Record<ApptKind, { label: string; icon: string }> = {
  viewing: { label: "Viewing", icon: "key" },
  appraisal: { label: "Appraisal", icon: "trend-up" },
  takeon: { label: "Take-on & photos", icon: "pack/photo" },
  movein: { label: "Move-in", icon: "pack/house" },
  inspection: { label: "Inspection", icon: "pack/checklist" },
  /* "target" rather than a car, because there isn't one in the icon set and a
     name with no file behind it renders as a solid square (the mask fails
     open, not closed). It is already the geotag marker on AddressField, so it
     at least reads as "somewhere to get to". */
  travel: { label: "Travel time", icon: "target" },
  other: { label: "In the diary", icon: "clock" },
};

/** "10:15" → minutes since midnight. */
export function minutesOf(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

const sent = (label: string) => ({ label, done: true });
const unsent = (label: string) => ({ label, done: false });

/**
 * THINNED, 1 Sep 2026 — fourteen entries down to five.
 *
 * This book only ever stands in when REX is unreachable, and a fortnight of
 * invented appointments made an empty or broken connection look like a busy
 * week. Five is enough to prove the grid draws lanes, kinds, a tenanted
 * viewing and an unsent confirmation, and few enough that nobody mistakes it
 * for their own diary.
 *
 * It is no longer reachable from the dashboard at all — every tile there now
 * reads the live store. See components/widgets.tsx.
 */
export const DIARY: Appt[] = [
  /* One behind, so there is something to look back on. */
  {
    id: "d-past-clark", day: -1, start: "11:00", mins: 30, kind: "viewing",
    what: "Viewing — 2, 10 Cardiff Grove", where: "Luton LU1",
    who: "Olivia Clark", agent: "Kirstie", lat: 51.879, lng: -0.415,
    contact: { email: "olivia.clark@btinternet.com", phone: "07700 900112" }, tenant: null,
    link: { href: "/listings", label: "2, 10 Cardiff Grove" },
    comms: [sent("Confirmation to Olivia Clark")],
  },

  /* Today: an appraisal and two viewings — one of them tenanted with the
     heads-up still unsent, which is the miss this screen exists to make loud. */
  {
    id: "d-granby", day: 0, start: "13:00", mins: 60, kind: "appraisal",
    what: "Market appraisal — 9 Granby Road", where: "Salford M7",
    who: "New landlord", agent: "Kirstie", lat: 53.51, lng: -2.27,
    link: { href: "/leads?side=landlord", label: "The landlord lead" },
    comms: [sent("Confirmation to the landlord"), sent("Follow-up reminder set")],
  },
  {
    id: "d-bell", day: 0, start: "15:30", mins: 30, kind: "viewing",
    what: "Viewing — 41 Harewood Road", where: "Luton LU1",
    who: "Marcus Bell", agent: "Kirstie", lat: 51.879, lng: -0.415,
    contact: { email: "marcus.bell@yahoo.co.uk", phone: "07700 900456" }, tenant: "The Ellis family",
    link: { href: "/listings", label: "41 Harewood Road" },
    comms: [sent("Confirmation to Marcus Bell"), sent("Landlord told"), unsent("Heads-up to The Ellis family")],
  },
  {
    id: "d-turner", day: 0, start: "17:00", mins: 30, kind: "viewing",
    what: "Viewing — Flat 2, Mercer Street", where: "Manchester M4",
    who: "Sophie Turner", agent: "Kirstie", lat: 53.484, lng: -2.23,
    contact: { email: "sophie.turner@gmail.com", phone: "07700 900678" }, tenant: null,
    link: { href: "/listings", label: "Flat 2, Mercer Street" },
    // Booked, never confirmed.
    comms: [unsent("Confirmation to Sophie Turner"), sent("Landlord told")],
  },

  /* One take-on ahead, so the week is not all viewings. */
  {
    id: "d-takeon", day: 2, start: "10:00", mins: 90, kind: "takeon",
    what: "Take-on & photos — 183 Walesby Lane", where: "New Ollerton NG22",
    who: "Dean Halliwell (sitting tenant)", agent: "Michael", lat: 53.199, lng: -1.02,
    link: { href: "/listings", label: "183 Walesby Lane" },
    comms: [sent("Visit confirmed with the landlord"), sent("Heads-up to Dean Halliwell")],
  },
];

/** Today's list, in order — the dashboard box reads from here so the box and
 *  the calendar can never disagree. */
export function todaysAppts(): Appt[] {
  return DIARY.filter((a) => a.day === 0).sort(
    (a, b) => minutesOf(a.start) - minutesOf(b.start)
  );
}

/**
 * Feedback on past viewings — the stand-in for REX outcomes, which we cannot
 * read yet.
 *
 * Keyed on SAMPLE ids only, and deliberately left that way. A live viewing's
 * id is `rex-<id>` and will never match, so against a real book every past
 * viewing reads "feedback due" — which is the honest answer, because nobody
 * has told us how it went. The two ids for viewings removed in the thinning
 * are gone; a key with no appointment behind it is just a trap for the next
 * person wondering why it never shows.
 */
export const VIEWING_OUTCOMES: Record<string, "Applying" | "Thinking" | "Not for them"> = {
  "d-past-clark": "Applying",
};
