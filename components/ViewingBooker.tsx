"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { createPortal } from "react-dom";
import DiaryGrid from "@/components/DiaryGrid";
import { ConfettiBurst, DoneTick, PressButton } from "@/components/Bits";
import PeopleFilterBar, { NO_FILTERS, passesFilters, milesBetween, type Filters } from "@/components/PeopleFilter";
import SendFlow, { type Outgoing } from "@/components/SendFlow";
import { VIEWING_SENDS_LIVE } from "@/lib/viewing-sends";
import { dayKey, useForecast } from "@/lib/weather";
import type { Landlord } from "@/lib/rex-landlord";
import { fetchMe } from "@/lib/me";
import { minutesOf, type Appt } from "@/lib/diary";
import { useDiary, refreshDiary } from "@/lib/diary-store";
import { usePref } from "@/lib/prefs-store";
import { useRouter } from "next/navigation";
import ConfirmEditor, { type ConfirmDraft, type ConfirmEditorHandle, type ConfirmTarget } from "@/components/ConfirmEditor";

/** What the record did with a booking, told back to the booker's done screen. */
export type BookedResult = { said?: string; goTo?: { ask: string; label: string; href: string } } | undefined;

/**
 * Booking a viewing, in the order the job actually happens: which property,
 * when, then who needs telling.
 *
 * The calendar is big on purpose. Picking a day is the decision the whole
 * screen exists for, and a date field you type into is how you end up viewing
 * on the wrong Thursday.
 */

type Listing = {
  id: string; name: string; locality: string; rent: number | null; image: string | null;
  /** REX's property behind the listing, where the caller knows it. Carried so
   *  a booking can say WHICH home, not just its address. */
  propertyId?: string | null;
};

/* What the booker's own Starts and Length boxes offer: the grid's whole
   window in quarter hours, and up to the four hours a drag allows. */
const START_TIMES = Array.from({ length: (22 - 6) * 4 }, (_, i) => {
  const m = 6 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const LENGTHS = Array.from({ length: 16 }, (_, i) => (i + 1) * 15);

function lengthWords(n: number): string {
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function endOf(slot: string, mins: number): string {
  const [h, m] = slot.split(":").map(Number);
  const e = h * 60 + m + mins;
  return `${String(Math.floor(e / 60) % 24).padStart(2, "0")}:${String(e % 60).padStart(2, "0")}`;
}

/** A local day as the "YYYY-MM-DD" a date box wants. */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Only the bit of the profile the booker needs — where they set off from. */
type BaseProfile = { base?: string; baseLat?: number | null; baseLng?: number | null };
const PROFILE_KEY = "tle-profile-v1";

/** One measured journey, as /api/travel answers it. */
type Leg =
  | { id: string; ok: true; minutes: number; miles: number; withTraffic: boolean; buffer: number }
  | { id: string; ok: false; problem: { code: string; says: string } };

type TravelState =
  | { status: "idle" }
  /** Nothing to measure FROM — no base saved and nothing earlier in the day. */
  | { status: "nowhere" }
  | { status: "loading" }
  | { status: "problem"; says: string }
  /** `precise` false = we only placed the AREA, not the building. */
  | { status: "ready"; legs: Leg[]; precise: boolean; resolved: string | null };

/** The landlord lookup, with "REX didn't answer" kept apart from "no landlord". */
type LandlordState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "known"; landlord: Landlord }
  /** REX holds no owner against this property — about 1 rental in 8. */
  | { status: "none" }
  /** We could not find out. NOT the same as none. */
  | { status: "problem"; says: string };

/** "9 Granby Road, Salford M7" — whichever of the two an entry actually has. */
function placeOf(a: Appt): string {
  return a.where || a.what.replace(/^[^—]+—\s*/, "") || "the last appointment";
}



export type Person = {
  name: string;
  email: string;
  phone: string;
  lat?: number;
  lng?: number;
};

export default function ViewingBooker({
  open,
  onClose,
  lead,
  applicants,
  properties,
  agent,
  mode = "viewing",
  address = "",
  occupant = null,
  origin = null,
  onBooked,
  firstId = null,
  leadId = null,
  appraisalId = null,
  suggested = null,
}: {
  open: boolean;
  onClose: () => void;
  /** Known from a lead record. Null when starting from a property instead. */
  lead: Person | null;
  /** Offered when there's no lead yet — booking from the listing side, where
   *  you have the property and still have to say who's coming. */
  applicants?: Person[];
  properties: Listing[];
  agent: string;
  /** "appraisal" and "takeon" book the AGENT to the landlord's own property:
   *  no property picker (theirs is the only one), and the confirmation goes
   *  to the landlord, not an applicant. */
  mode?: "viewing" | "appraisal" | "takeon";
  /** The landlord's address, for appraisal mode. */
  address?: string;
  /** The sitting tenant, when the property has one — they get a courtesy
   *  heads-up about the visit, because strangers with keys is how landlords
   *  lose tenants' goodwill. */
  occupant?: Person | null;
  /** Where the appointment being booked will be — lets the diary say how far
   *  each existing appointment is from it, which is how a real day is
   *  planned: not "am I free", but "can I get there". */
  origin?: { lat: number; lng: number } | null;
  /** The listing they enquired about: first in the list and picked by default. */
  firstId?: string | null;
  /** The lead being booked, so the confirmation can be drafted beside the diary. */
  leadId?: string | null;
  /** The appraisal, in take-on mode: the confirmation is drafted from it. */
  appraisalId?: string | null;
  /** What the landlord said they can do, shown above the diary (17 Sep 2026). */
  suggested?: string[] | null;
  /**
   * `startsAt` and `minutes` are the booking as a MACHINE reads it, and they
   * are not decoration. Everything downstream — the landlord's calendar file,
   * the "about 45 minutes" line on their page, the confirmation email — used
   * to be handed a hard-coded 45 and a null start, so the .ics was never
   * generated at all and the deck promised a length nobody had booked.
   */
  onBooked: (summary: {
    when: string;
    property: string;
    locality: string;
    who: string;
    /** "Tuesday 19 August at 2:00pm" — how it reads to a landlord. */
    whenPretty: string;
    startsAt: string | null;
    minutes: number;
    /** The REX property, so the record can ask who lives there before the
     *  agent turns up (James, 9 Sep 2026). Null on an appraisal or take-on,
     *  where the address is the landlord's own. */
    propertyId: string | null;
    listingId: string | null;
    /** Nobody from us is going: the applicant lets themselves in (15 Sep 2026). */
    unaccompanied?: boolean;
    /** The confirmation as the agent left it in the email column, or send: false. */
    confirmation?: { send: boolean; subject?: string; html?: string; again?: boolean };
  }) => void | BookedResult | Promise<BookedResult | void>;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  /* A viewing is booked property first (James, 11 Sep 2026): find it, confirm
     it is the one, then the diary, then the confirmation. */
  const [stage, setStage] = useState<"applicant" | "property" | "confirm" | "when" | "who" | "done">("when");
  const [find, setFind] = useState("");
  const [book, setBook] = useState<Listing[] | null>(null);
  const [chosen, setChosen] = useState<Person | null>(lead);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  /* How long it runs. Everything used to be half an hour, which is right for
     a viewing and wrong for almost every appraisal — a four-bed with a
     landlord who wants to talk is an hour and a half. */
  const [mins, setMins] = useState(mode === "appraisal" || mode === "takeon" ? 60 : 30);
  /* A company viewing - one of us is there - unless the agent says otherwise
     (James, 15 Sep 2026). Unticked, it goes in as unaccompanied: its own
     colour on the diary, REX's Unaccompanied type, and nobody told an agent
     will meet them. */
  const [accompanied, setAccompanied] = useState(true);
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "");
  const [sentCount, setSentCount] = useState(0);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // One calendar for the whole OS: the diary's own week grid, with the pick
  // drawn into it. Which day AND what else that day holds, one look.
  const [week, setWeek] = useState(0);
  /* ── THE EMAIL COLUMN (James, 17 Sep 2026) ──────────────────────────────
     Pick a time and the diary makes room: the confirmation opens beside it,
     editable, with travel time underneath, and Book does both. The column
     can be dragged wider, and the whole booker widened, for a long email. */
  const [sendEmail, setSendEmail] = useState(true);
  const [draft, setDraft] = useState<ConfirmDraft | null>(null);
  const editor = useRef<ConfirmEditorHandle>(null);
  const [column, setColumn] = useState(540);
  const [wide, setWide] = useState(false);
  const [booking, setBooking] = useState(false);
  const [result, setResult] = useState<BookedResult | null>(null);
  const router = useRouter();
  const splitRef = useRef<HTMLDivElement>(null);

  // Reset on OPEN only. The caller builds `properties` inline, so depending on
  // it here would throw the chosen day and time away on any parent re-render.
  const seed = useRef(properties);
  seed.current = properties;
  /* The whole live book, so the property can be any home on the market and
     not only what was shortlisted. Read once per open. */
  useEffect(() => {
    if (!open || mode !== "viewing") return;
    let live = true;
    /* Test listings included: a test file's home is booked here like any
       other, and the booking stays in the test world (/api/viewings/book). */
    fetch("/api/listings", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live || !j?.ok || !Array.isArray(j.listings)) return;
        const rows = (j.listings as Array<Listing & { letAgreed?: boolean }>)
          .filter((l) => !l.letAgreed)
          .map((l) => ({ id: String(l.id), name: l.name, locality: l.locality, rent: l.rent, image: l.image, propertyId: l.propertyId ?? null }));
        setBook(rows);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    // Starting from a property, the applicant is the first unknown; starting
    // from a lead, it's already answered.
    setChosen(lead);
    setStage(lead ? (mode === "viewing" ? "property" : "when") : "applicant");
    setFind("");
    setDay(null);
    setSlot(null);
    setPropertyId(firstId ?? seed.current[0]?.id ?? "");
    setFilters(NO_FILTERS);
    setWeek(0);
    setSendEmail(true);
    setResult(null);
    setBooking(false);
    /* Re-seeded on OPEN, not just at mount. The booker mounts once and is
       shown and hidden by `open`, and it mounts under whatever mode the
       caller last held — usually "viewing". So an appraisal opened later
       kept the viewing default and every appraisal was booked for half an
       hour, no matter what this line said. */
    setMins(mode === "appraisal" || mode === "takeon" ? 60 : 30);
  }, [open, today, mode, firstId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // The forecast rides the calendar for the agent's OWN visits — the
  // appraisal is nicer on a good day, and the take-on is where the
  // photographs happen, so the sky is genuinely a scheduling input there.
  // Applicant viewings don't need it (James, 8 Aug 2026). Absence changes
  // nothing but the corner of each cell.
  const toLandlord = mode !== "viewing";
  const forecast = useForecast(open && toLandlord);

  /* ══ TRAVEL TIME ═══════════════════════════════════════════════════════
     Everything from here to the early return is hook-order-critical: this
     component returns null when closed, so a hook added BELOW that line
     would run on some renders and not others. There is no ESLint config in
     this repo, so nothing catches that but reading it. */

  const offsetOf = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  /** Which week of the grid (0 = this one, Monday first) holds a day. */
  const weekOf = (o: number) => Math.max(0, Math.floor((o + ((today.getDay() + 6) % 7)) / 7));
  const dateFromOffset = (o: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + o);
    return d;
  };

  /** The picked slot as an instant. Slots are "HH:MM" on the local clock. */
  const startsAt = (() => {
    if (!day || !slot) return null;
    const [h, m] = slot.split(":").map(Number);
    const at = new Date(day);
    at.setHours(h, m, 0, 0);
    return at.toISOString();
  })();

  const { appts: allAppts, everything, outlook } = useDiary();
  const [profile] = usePref<BaseProfile | null>(PROFILE_KEY, null);
  /* Who is doing the booking, for when no agent name is given. */
  const [meName, setMeName] = useState<string>("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    fetchMe()
      .then((j) => { if (live && j?.user?.name) setMeName(j.user.name); })
      .catch(() => { /* the grid falls back to the whole book */ });
    return () => { live = false; };
  }, [open]);
  /**
   * WHOSE DIARY IS ON THE GRID.
   *
   * James, 9 Sep 2026: booking a viewing was showing every agent's
   * appointments at once, so a slot that is free for you looked taken because
   * somebody in another office was out. The diary read is shared and stays
   * business-wide - it is the same cached book the calendar uses - so the
   * narrowing happens here, on the name the booking is FOR.
   *
   * Matched on the first name too, because REX writes "Lauren Engley" on a
   * calendar and the OS may hold "Lauren". An appointment whose owner we
   * cannot read at all is kept rather than dropped: a slot wrongly shown as
   * busy costs a phone call, one wrongly shown as free costs a double booking.
   */
  /* Booking into your own day (no agent named, or the agent is you). */
  const bookingOwn = !everything || !agent.trim() || (meName.trim() !== "" && agent.trim().toLowerCase().split(" ")[0] === meName.trim().toLowerCase().split(" ")[0]);
  const appts = useMemo(() => {
    /* No name given: the person doing the booking (19 Sep 2026 - an owner was
       shown the whole company's week while booking their own appraisal). */
    /* The diary is only ever the signed-in person's own now (24 Sep 2026),
       so there is nobody else's day to narrow away - and narrowing an owner's
       own day to the lead's agent's NAME would leave the grid empty. */
    if (!everything) return allAppts;
    const want = (agent.trim() || meName.trim()).toLowerCase();
    if (!want) return allAppts;
    const first = want.split(" ")[0];
    return allAppts.filter((a) => {
      const who = (a.agent ?? "").trim().toLowerCase();
      /* An entry nobody owns: on an agent's diary the book is already theirs,
         so it is theirs and stays. On the WHOLE company's book (an owner) it
         is somebody else's far more often than not, and a grid full of other
         people's days is what made this unusable. */
      if (!who) return !everything;
      return who === want || who.split(" ")[0] === first;
    });
  }, [allAppts, agent, meName, everything]);

  /**
   * The property's REAL landlord, from REX.
   *
   * Fetched rather than invented. This used to be `landlordFor(property.id)` —
   * one of five made-up people chosen by hashing the id — and it addressed a
   * confirmation email that was ON by default. REX has the real one on 88% of
   * rentals (the listing's "owner" contact relationship); the other 12% get an
   * honest unsendable row. See lib/rex-landlord.ts.
   */
  const [landlord, setLandlord] = useState<LandlordState>({ status: "idle" });
  useEffect(() => {
    // Only viewings write to a landlord. An appraisal's recipient IS the
    // landlord and is already on the record as `chosen`.
    if (!open || toLandlord || !propertyId) {
      setLandlord({ status: "idle" });
      return;
    }
    let gone = false;
    setLandlord({ status: "loading" });
    fetch(`/api/listings/landlord?id=${encodeURIComponent(propertyId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; landlord?: Landlord | null; problem?: string }) => {
        if (gone) return;
        if (!j.ok) {
          setLandlord({ status: "problem", says: j.problem ?? "REX didn't answer." });
        } else if (j.landlord) {
          setLandlord({ status: "known", landlord: j.landlord });
        } else {
          setLandlord({ status: "none" });
        }
      })
      .catch(() => {
        if (!gone) {
          setLandlord({
            status: "problem",
            says: "Couldn't reach REX to look the landlord up.",
          });
        }
      });
    return () => {
      gone = true;
    };
  }, [open, toLandlord, propertyId]);
  const [travel, setTravel] = useState<TravelState>({ status: "idle" });
  /** Which origin they chose to buffer for, and whether the drive on/back
   *  is being blocked out too. Null and false = they said no, which is a
   *  real answer and must not be overwritten by a re-render. */
  const [bufferFrom, setBufferFrom] = useState<string | null>(null);
  const [bufferAfter, setBufferAfter] = useState(false);
  const [savingBuffers, setSavingBuffers] = useState(false);

  const pickDay = day ? offsetOf(day) : null;
  const pickStart = slot ? minutesOf(slot) : null;

  /**
   * What sits either side of this slot on the same day.
   *
   * Only entries that know WHERE they are can be measured from, so anything
   * without coordinates is skipped rather than guessed at — and travel blocks
   * are skipped too, or the buffer would start measuring from the last buffer.
   */
  const neighbours = useMemo(() => {
    if (pickDay == null || pickStart == null) return { prev: null as Appt | null, next: null as Appt | null };
    const placed = appts.filter(
      (a) => a.day === pickDay && a.kind !== "travel" && a.lat != null && a.lng != null
    );
    const endsBy = (a: Appt) => minutesOf(a.start) + a.mins;
    const prev =
      placed.filter((a) => endsBy(a) <= pickStart).sort((a, b) => endsBy(b) - endsBy(a))[0] ?? null;
    const next =
      placed
        .filter((a) => minutesOf(a.start) >= pickStart + mins)
        .sort((a, b) => minutesOf(a.start) - minutesOf(b.start))[0] ?? null;
    return { prev, next };
  }, [appts, pickDay, pickStart, mins]);

  /* Only where there's a real address to drive to. Appraisals and take-ons
     carry the landlord's own address; a viewing has a listing name and a
     town, which geocodes to the middle of the town and would quote a
     confident travel time to the wrong street. */
  const destination = toLandlord ? address.trim() : "";
  const canTravel = Boolean(open && destination && startsAt);

  const prevId = neighbours.prev?.id ?? null;
  const nextId = neighbours.next?.id ?? null;
  const homeLat = profile?.baseLat ?? null;
  const homeLng = profile?.baseLng ?? null;

  useEffect(() => {
    if (!canTravel || !startsAt) {
      setTravel({ status: "idle" });
      return;
    }
    const ends = new Date(new Date(startsAt).getTime() + mins * 60000).toISOString();
    const legs: { id: string; from: { lat: number; lng: number }; arriveBy: string }[] = [];
    if (homeLat != null && homeLng != null) {
      legs.push({ id: "home", from: { lat: homeLat, lng: homeLng }, arriveBy: startsAt });
    }
    if (neighbours.prev?.lat != null && neighbours.prev?.lng != null) {
      legs.push({
        id: "prev",
        from: { lat: neighbours.prev.lat, lng: neighbours.prev.lng },
        arriveBy: startsAt,
      });
    }
    /* The drive AWAY is measured as next→property rather than property→next.
       Same road, and it lets all three journeys ride one request; the two
       directions differ by which side of the dual carriageway is queued,
       which is well inside the rounding a buffer gets anyway. `arriveBy` is
       the end of the visit, so it's costed in the right traffic. */
    if (neighbours.next?.lat != null && neighbours.next?.lng != null) {
      legs.push({
        id: "next",
        from: { lat: neighbours.next.lat, lng: neighbours.next.lng },
        arriveBy: ends,
      });
    }
    if (!legs.length) {
      setTravel({ status: "nowhere" });
      return;
    }

    let alive = true;
    setTravel({ status: "loading" });
    fetch("/api/travel", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toAddress: destination, legs }),
    })
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        if (j?.ok && Array.isArray(j.legs)) {
          setTravel({
            status: "ready",
            legs: j.legs,
            precise: j.precise !== false,
            resolved: j.resolved ?? null,
          });
        }
        else setTravel({ status: "problem", says: j?.problem?.says ?? j?.error ?? "Travel times aren't available." });
      })
      .catch(() => {
        if (alive) setTravel({ status: "problem", says: "Couldn't work out the travel time just now." });
      });
    return () => {
      alive = false;
    };
    // neighbours.prev/next are read through their ids: the objects are rebuilt
    // on every diary render and would re-fetch forever as dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTravel, destination, startsAt, mins, homeLat, homeLng, prevId, nextId]);

  /* A new slot is a new set of journeys, so a buffer agreed for the old one
     must not silently carry over onto it. */
  useEffect(() => {
    setBufferFrom(null);
    setBufferAfter(false);
  }, [pickDay, slot, mins]);

  const everyHome = useMemo(() => {
    const seen = new Set<string>();
    const all = [...properties, ...(book ?? [])].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
    if (!firstId) return all;
    const asked = all.find((p) => p.id === firstId);
    return asked ? [asked, ...all.filter((p) => p.id !== firstId)] : all;
  }, [properties, book, firstId]);

  if (!open) return null;

  const property = everyHome.find((p) => p.id === propertyId) ?? properties[0] ?? null;
  const needle = find.trim().toLowerCase();
  const found = everyHome.filter((p) => !needle || `${p.name} ${p.locality}`.toLowerCase().includes(needle));
  /* The booking's real length, in words, so the confirmation cannot promise
     half an hour for a visit the agent has just set aside ninety minutes for.
     That mismatch is exactly how a landlord ends up with somewhere else to be
     half way through. */
  const howLong =
    mins >= 120
      ? `${mins / 60} hours`
      : mins === 90
        ? "an hour and a half"
        : mins === 60
          ? "about an hour"
          : mins === 45
            ? "about three quarters of an hour"
            : mins === 30
              ? "half an hour"
              : `about ${mins} minutes`;

  const ready = Boolean(day && slot && chosen && (toLandlord || property));

  const dayLabel = day
    ? day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";
  /* Behind us: a warning, never a block. */
  const gone = Boolean(startsAt && new Date(startsAt).getTime() < Date.now());
  const shortDate = day
    ? day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "";
  const whenLabel = `${shortDate}, ${slot ?? ""}`;
  /* How a landlord would say it. The grid runs on a 24-hour clock because a
     grid should; an email that says "at 14:00" does not sound like a person. */
  const whenPretty = (() => {
    if (!day || !slot) return "";
    const [h, m] = slot.split(":").map(Number);
    const am = h < 12;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${dayLabel} at ${h12}:${String(m).padStart(2, "0")}${am ? "am" : "pm"}`;
  })();

  /* `startsAt` is computed up with the hooks — the travel lookup needs it. */

  const legOf = (id: string): Leg | undefined =>
    travel.status === "ready" ? travel.legs.find((l) => l.id === id) : undefined;
  const drivable = (id: string) => {
    const l = legOf(id);
    return l && l.ok ? l : undefined;
  };

  /** Where they could be setting off from, longest drive first — the one
   *  most worth knowing about sits at the top. */
  const beforeOptions = [
    neighbours.prev && drivable("prev")
      ? { id: "prev", label: `You're at ${placeOf(neighbours.prev)} before this`, leg: drivable("prev")! }
      : null,
    drivable("home")
      ? { id: "home", label: profile?.base ? `From ${profile.base}` : "From home", leg: drivable("home")! }
      : null,
  ]
    .filter((o): o is { id: string; label: string; leg: Extract<Leg, { ok: true }> } => Boolean(o))
    .sort((a, b) => b.leg.minutes - a.leg.minutes);

  /** The drive away afterwards: on to the next job, or home if it's the last. */
  const afterOption = neighbours.next && drivable("next")
    ? { label: `On to ${placeOf(neighbours.next)}`, leg: drivable("next")! }
    : drivable("home")
      ? { label: "Back home", leg: drivable("home")! }
      : null;

  const chosenBefore = beforeOptions.find((o) => o.id === bufferFrom) ?? null;

  /**
   * Travel goes in as its OWN entries, either side of the visit.
   *
   * Not padded onto the appraisal: an hour's appraisal that says 90 minutes
   * is a lie to everyone who reads the diary, including the landlord on the
   * confirmation. Two separate blocks say what they are, and can be deleted
   * on their own when a journey turns out not to be needed.
   */
  async function saveBuffers(): Promise<void> {
    if (!startsAt) return;
    const jobs: Record<string, unknown>[] = [];
    if (chosenBefore) {
      const at = new Date(new Date(startsAt).getTime() - chosenBefore.leg.buffer * 60000);
      jobs.push({
        startsAt: at.toISOString(),
        mins: chosenBefore.leg.buffer,
        kind: "travel",
        title: `Travel time - to ${address}`,
        where: chosenBefore.label,
        who: agent,
      });
    }
    if (bufferAfter && afterOption) {
      const at = new Date(new Date(startsAt).getTime() + mins * 60000);
      jobs.push({
        startsAt: at.toISOString(),
        mins: afterOption.leg.buffer,
        kind: "travel",
        title: `Travel time - ${afterOption.label.toLowerCase()}`,
        where: address,
        who: agent,
      });
    }
    if (!jobs.length) return;

    setSavingBuffers(true);
    try {
      await Promise.all(
        jobs.map((j) =>
          fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(j),
          })
        )
      );
      // The week the agent is looking at has just changed. Without this the
      // buffer they asked for isn't there when they glance back at it.
      await refreshDiary();
    } catch {
      /* A buffer that didn't save must not lose the booking behind it. */
    } finally {
      setSavingBuffers(false);
    }
  }

  /**
   * Book it and show the done screen. Reached from the "who do we tell?"
   * step, or straight from the time picker while the sends are off
   * (lib/viewing-sends) - that step's Send sent nothing.
   */
  function finishBooking(sentN: number) {
    setSentCount(sentN);
    setStage("done");
    /* Take-ons come through here rather than through bookAndClose,
       so the buffer has to be written on this path too or it is
       silently dropped for every mode but the appraisal. */
    void saveBuffers();
    // Appraisals have no listing — the guard must not eat them.
    if (toLandlord || property) {
      onBooked({
        when: whenLabel,
        property: toLandlord ? (address || "Visit") : property!.name,
        propertyId: toLandlord ? null : (property?.propertyId ?? null),
        listingId: toLandlord ? null : (property?.id ?? null),
        locality: mode === "appraisal" ? "Market appraisal" : mode === "takeon" ? "Take-on visit" : property!.locality,
        who: chosen?.name ?? "",
        whenPretty,
        startsAt,
        minutes: mins,
        ...(mode === "viewing" && !accompanied ? { unaccompanied: true } : {}),
      });
    }
  }

  /** The confirmation to draft beside the diary, when there is one to send. */
  const emailTarget: ConfirmTarget | null =
    !startsAt
      ? null
      : mode === "takeon"
        ? appraisalId
          ? { kind: "takeon", id: appraisalId, startsAt, minutes: mins }
          : null
      : !leadId || !chosen
      ? null
      : mode === "appraisal"
        ? { kind: "appraisal-new", appraisal: { leadId, landlord: chosen.name, email: chosen.email, address: address || "", startsAt, minutes: mins } }
        : property
          ? { kind: "viewing", booking: { leadId, listingId: property.id, applicantName: chosen.name, applicantEmail: chosen.email, address: property.name, startsAt, minutes: mins, unaccompanied: !accompanied } }
          : null;
  const willSend = Boolean(emailTarget && sendEmail && draft?.ok && draft.to && !draft.blocked);
  const draftLoading = Boolean(emailTarget && sendEmail && draft === null);

  /** Drag the divider: the email column is as wide as the space to its right. */
  function startDrag(e: React.PointerEvent) {
    e.preventDefault();
    const box = splitRef.current?.getBoundingClientRect();
    if (!box) return;
    const move = (ev: PointerEvent) => setColumn(Math.round(Math.min(Math.max(box.right - ev.clientX, 380), Math.max(380, box.width - 420))));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  /**
   * Book it, send what the column says, and show what happened.
   *
   * The email is read out of the editor BEFORE the stage changes, because the
   * done screen unmounts it. The record does the saving and the sending
   * (onBooked) and says back what went, so the done screen reports facts
   * rather than hopes.
   */
  async function bookIt() {
    if (!ready || booking) return;
    setBooking(true);
    const confirmation = willSend
      ? { send: true, subject: editor.current?.subject, html: editor.current?.html(), again: Boolean(draft?.alreadySent) }
      : { send: false };
    await saveBuffers();
    setResult(null);
    setStage("done");
    try {
      const r = await onBooked({
        when: whenLabel,
        property: toLandlord ? (address || "Visit") : property!.name,
        propertyId: toLandlord ? null : (property?.propertyId ?? null),
        listingId: toLandlord ? null : (property?.id ?? null),
        locality: mode === "appraisal" ? "Market appraisal" : mode === "takeon" ? "Take-on visit" : property!.locality,
        who: chosen?.name ?? "",
        whenPretty,
        startsAt,
        minutes: mins,
        ...(mode === "viewing" && !accompanied ? { unaccompanied: true } : {}),
        confirmation,
      });
      setResult(r ?? {});
      /* So the slot just taken stops looking free, here and on every other
         screen reading the same diary. */
      void refreshDiary();
    } catch {
      setResult({ said: "Something went wrong saving it. Check the diary before booking it again." });
    } finally {
      setBooking(false);
    }
  }

  /* Composed at the point of sending so the wording carries the choices made
     on the previous screen — a template built up front goes stale the moment
     somebody changes the time. */
  function compose(): Outgoing[] {
    if (!day || !slot || !chosen) return [];
    const first = chosen.name.split(" ")[0];

    if (toLandlord) {
      // Two messages: the landlord's confirmation, and the agent's own diary.
      const where = address || "their property";
      return [
        {
          key: "landlord",
          role: "Landlord",
          name: chosen.name,
          email: chosen.email,
          phone: chosen.phone,
          channel: "email",
          on: true,
          subject:
            mode === "takeon"
              ? `Photos & details visit — ${shortDate} at ${slot}`
              : `Your market appraisal — ${shortDate} at ${slot}`,
          emailBody:
            mode === "takeon"
              ? `Hi ${first},\n\n` +
                `We're booked in for ${dayLabel} at ${slot} to photograph the property and gather ` +
                `the details for the listing.\n\n${where}\n\n` +
                `Bright and tidy is all it needs — ${agent} will do the rest. It takes ${howLong}.\n\n` +
                `Kind regards,\n${agent}\nThe Letting Experts`
              : `Hi ${first},\n\n` +
                `Thanks for speaking today — your market appraisal is booked for ${dayLabel} at ${slot}.\n\n` +
                `${where}\n\n` +
                `${agent} will come to you, walk the property with you and talk through what it should achieve. ` +
                `Nothing to prepare — ${howLong} of your time is all it takes.\n\n` +
                `Kind regards,\n${agent}\nThe Letting Experts`,
          whatsappBody:
            mode === "takeon"
              ? `Hi ${first}, photos & details visit booked — ${shortDate} at ${slot}, at ${where}. ` +
                `Bright and tidy is all it needs. Reply here to move it.`
              : `Hi ${first}, your market appraisal is booked — ${shortDate} at ${slot}, at ${where}. ` +
                `${agent} will come to you. Reply here if you need to move it.`,
        },
        {
          key: "agent",
          role: "Diary — for the person doing it",
          name: agent,
          email: `${agent.toLowerCase()}@thelettingexperts.co.uk`,
          phone: "—",
          channel: "email",
          on: false,
          subject: `Diary: ${mode === "takeon" ? "take-on" : "MA"} at ${where}, ${shortDate} ${slot}`,
          emailBody: `${dayLabel}, ${slot}\n${where}\n\nLandlord: ${chosen.name} · ${chosen.phone}`,
          whatsappBody: `${shortDate} ${slot} — ${mode === "takeon" ? "take-on" : "MA"} at ${where}. ${chosen.name}, ${chosen.phone}.`,
        },
      ];
    }

    if (!property) return [];
    const where = `${property.name}, ${property.locality}`;

    /** The landlord row, in whichever of its four states applies. */
    function landlordMessage(): Outgoing {
      const base = {
        key: "landlord",
        role: "Landlord",
        channel: "email" as const,
        phone: "",
        email: "",
      };
      if (landlord.status === "known") {
        const ll = landlord.landlord;
        const llFirst = ll.name.split(" ")[0];
        return {
          ...base,
          name: ll.name,
          email: ll.email ?? "",
          phone: ll.phone ?? "",
          /* On by default only if we can actually reach them. A landlord in
             REX with no email address is still a landlord we can't email. */
          on: Boolean(ll.email),
          ...(ll.email
            ? {}
            : {
                blocked:
                  `${ll.name} is on the property in REX but has no email address, so there's ` +
                  `nothing to send to.${ll.phone ? ` Their number is ${ll.phone}.` : ""}`,
              }),
          subject: `Viewing booked at ${property!.name} — ${shortDate}, ${slot}`,
          emailBody:
            `Hi ${llFirst},\n\n` +
            `We've booked a viewing at ${where} for ${dayLabel} at ${slot}.\n\n` +
            `${agent} will be accompanying, so there's nothing you need to do — ` +
            `just let us know if that time is a problem for access.\n\n` +
            `We'll come back to you with feedback the same day.\n\n` +
            `Kind regards,\n${agent}\nThe Letting Experts`,
          whatsappBody:
            `Hi ${llFirst}, we've got a viewing at ${property!.name} on ${shortDate} at ${slot}. ` +
            `${agent} is accompanying. Let us know if access is a problem.`,
        };
      }

      const says =
        landlord.status === "loading"
          ? "Looking them up in REX…"
          : landlord.status === "problem"
            ? `${landlord.says} We can't tell whether this property has a landlord on file, so nothing will be sent.`
            : "No landlord is held against this property in REX, so there's nobody to write to. " +
              "Tell them yourself, or add them to the listing in REX and they'll appear here next time.";

      return {
        ...base,
        name: "The landlord",
        on: false,
        blocked: says,
        subject: "",
        emailBody: "",
        whatsappBody: "",
      };
    }

    const occupantMsg: Outgoing[] = occupant
      ? [
          {
            key: "occupant",
            role: "Current tenant — a courtesy heads-up",
            name: occupant.name,
            email: occupant.email,
            phone: occupant.phone,
            channel: "email",
            on: true,
            subject: `A viewing at your home — ${shortDate} at ${slot}`,
            emailBody:
              `Hi ${occupant.name.split(" ")[0]},\n\n` +
              `Just to let you know we'll be bringing someone to view the property on ${dayLabel} at ${slot}. ` +
              `${agent} will accompany them, and it should take no more than twenty minutes.\n\n` +
              `If that time doesn't work for you, reply here and we'll move it — your say comes first.\n\n` +
              `Kind regards,\n${agent}\nThe Letting Experts`,
            whatsappBody:
              `Hi ${occupant.name.split(" ")[0]}, heads-up — viewing at yours ${shortDate} at ${slot}, ` +
              `${agent} accompanying, ~20 mins. Reply if that time's bad and we'll move it.`,
          },
        ]
      : [];

    return [
      ...occupantMsg,
      {
        key: "applicant",
        role: "Applicant",
        name: chosen.name,
        email: chosen.email,
        phone: chosen.phone,
        channel: "email",
        on: true,
        subject: `Viewing confirmed — ${property.name}, ${shortDate} at ${slot}`,
        emailBody:
          `Hi ${first},\n\n` +
          `That's your viewing booked for ${dayLabel} at ${slot}.\n\n` +
          `${where}\n\n` +
          `${agent} will meet you outside — please give us a ring if you're running late or need to move it.\n\n` +
          `Kind regards,\n${agent}\nThe Letting Experts`,
        whatsappBody:
          `Hi ${first}, viewing booked for ${shortDate} at ${slot} — ${where}. ` +
          `${agent} will meet you outside. Reply here if you need to change it.`,
      },
      /**
       * The landlord — the REAL one, or an honest blank.
       *
       * This row used to be addressed to whichever of five invented people
       * `landlordFor()` hashed the property id onto: a tickable, on-by-default
       * email to somebody who does not exist, about a property they have never
       * owned. It now comes from REX, and when REX has nobody the row stays but
       * cannot be sent — because the landlord genuinely should be told, and a
       * row that quietly vanished would let that quietly not happen.
       */
      landlordMessage(),
      {
        key: "agent",
        role: "Diary — for the person doing it",
        name: agent,
        email: `${agent.toLowerCase()}@thelettingexperts.co.uk`,
        phone: "—",
        channel: "email",
        on: false,
        subject: `Diary: ${property.name}, ${shortDate} ${slot}`,
        emailBody:
          `${dayLabel}, ${slot}\n${where}\n\nApplicant: ${chosen.name} · ${chosen.phone}\n` +
          `Landlord: ${
            landlord.status === "known"
              ? [landlord.landlord.name, landlord.landlord.phone].filter(Boolean).join(" · ")
              : "not recorded in REX"
          }`,
        whatsappBody: `${shortDate} ${slot} — ${property.name}. ${chosen.name}, ${chosen.phone}.`,
      },
    ];
  }

  // Portaled: this opens from inside drawers whose slide transition leaves a
  // transform on the aside — which would anchor `fixed` to the drawer.
  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div
        className={`fade-up relative flex w-full flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)] transition-[max-width] duration-300 ${
          stage === "when"
            ? `h-[94vh] ${wide ? "max-w-[calc(100vw-1rem)]" : "max-w-[1440px]"}`
            : `max-h-[92vh] ${toLandlord ? "max-w-5xl" : "max-w-4xl"}`
        }`}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "done"
                ? mode === "appraisal" ? "Appraisal booked" : mode === "takeon" ? "Take-on booked" : "Viewing booked"
                : stage === "who"
                  ? "Who do we tell?"
                  : stage === "applicant"
                    ? "Who's viewing?"
                    : stage === "property"
                      ? "Find the property"
                      : stage === "confirm"
                        ? "This one?"
                        : mode === "appraisal" ? "Book the appraisal" : mode === "takeon" ? "Book the take-on" : "Pick a time"}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {stage === "applicant"
                ? properties[0]?.name ?? "Pick who's viewing"
                : stage === "property" || stage === "confirm"
                  ? `For ${chosen?.name ?? "—"} · ${stage === "property" ? "any home on the market" : property?.name ?? ""}`
                : stage === "when"
                  ? `For ${chosen?.name ?? "—"}`
                  : `${chosen?.name ?? "—"} · ${whenLabel}${
                      toLandlord
                        ? address ? ` · ${address}` : ""
                        : property ? ` · ${property.name}` : ""
                    }`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {stage === "when" && (
              <button
                type="button"
                onClick={() => setWide((w) => !w)}
                title={wide ? "Back to the usual width" : "Use the whole screen"}
                className="hidden rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] text-muted transition-colors hover:text-ink lg:block"
              >
                {wide ? "Narrower" : "Wider"}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto px-6 py-5 ${stage === "when" ? "lg:overflow-hidden" : ""}`}>
          {/* ══ WHO'S VIEWING ══ */}
          {stage === "applicant" && (
            <>
            <PeopleFilterBar filters={filters} onChange={setFilters} />
            <ul className="space-y-2.5">
              {(applicants ?? []).filter((p) => passesFilters(p, filters)).map((p) => {
                const on = chosen?.email === p.email;
                return (
                  <li key={p.email}>
                    <button
                      type="button"
                      onClick={() => setChosen(p)}
                      className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                        on ? "border-accent-dark bg-accent-soft/40" : "border-line/60 hover:border-ink/30"
                      }`}
                    >
                      <span
                        className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                          on ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                        }`}
                      >
                        {on && "✓"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="hand block truncate text-[13.5px]">{p.name}</span>
                        <span className="block truncate text-[10.5px] text-muted">{p.email}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
              {!applicants?.length && (
                <p className="py-8 text-center text-[12.5px] text-muted">
                  No applicants on the book yet — add a lead first.
                </p>
              )}
              {applicants && applicants.length > 0 &&
                !applicants.some((p) => passesFilters(p, filters)) && (
                <p className="py-8 text-center text-[12.5px] text-muted">
                  Nobody matches those filters — widen the radius or clear the search.
                </p>
              )}
            </ul>
            </>
          )}

          {/* ══ FIND THE PROPERTY ══ */}
          {stage === "property" && (
            <div className="frame-grow">
              <input
                autoFocus
                value={find}
                onChange={(e) => setFind(e.target.value)}
                placeholder="Street, area or postcode…"
                className="w-full rounded-xl border border-line/80 bg-transparent px-3.5 py-2.5 text-[13px] outline-none focus:border-ink"
              />
              {properties.length > 0 && !needle && (
                <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-muted">{firstId ? "The one they asked about first, then the rest of the book" : "On their shortlist first, then the rest of the book"}</p>
              )}
              <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
                {found.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { setPropertyId(p.id); setStage("confirm"); }}
                      className={`flex w-full items-center gap-3 rounded-2xl border p-2.5 text-left transition-colors hover:border-ink/40 ${p.id === propertyId ? "border-brown bg-brown/5" : "border-line/60"}`}
                    >
                      <PropertyPhoto src={p.image} className="h-14 w-[72px] shrink-0 rounded-xl" />
                      <span className="min-w-0 flex-1">
                        <span className="hand block truncate text-[13.5px]">{p.name}</span>
                        <span className="block truncate text-[11px] text-muted">{p.locality}{p.rent ? ` · £${p.rent.toLocaleString("en-GB")} pcm` : ""}</span>
                      </span>
                      <span aria-hidden className="text-muted">›</span>
                    </button>
                  </li>
                ))}
              </ul>
              {book === null && !properties.length && <p className="py-8 text-center text-[12.5px] text-muted">Reading the book…</p>}
              {book !== null && !found.length && <p className="py-8 text-center text-[12.5px] text-muted">Nothing on the market like that.</p>}
            </div>
          )}

          {/* ══ CONFIRM IT ══ */}
          {stage === "confirm" && property && (
            <div className="frame-grow mx-auto max-w-md py-4 text-center">
              <PropertyPhoto src={property.image} className="mx-auto h-44 w-full rounded-2xl" />
              <p className="hand mt-5 text-[22px]">{property.name}</p>
              <p className="mt-1 text-[13px] text-muted">{property.locality}{property.rent ? ` · £${property.rent.toLocaleString("en-GB")} pcm` : ""}</p>
              <p className="mt-4 text-[12.5px] text-muted">{chosen?.name ?? "They"} will be viewing this one. Next, the diary.</p>
            </div>
          )}

          {/* ══ WHEN ══
              The diary takes the whole booker until a time is picked. Then it
              makes room: the confirmation opens in a column beside it, with
              travel time under it, and Book does all of it (James, 17 Sep
              2026). The column can be dragged wider. */}
          {stage === "when" && (
            <div ref={splitRef} className="flex flex-col gap-4 lg:h-full lg:flex-row">
              <div className="flex min-h-[460px] min-w-0 flex-1 flex-col lg:min-h-0">
              {toLandlord && address && (
                <p className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
                  <DoodleIcon name="home" size={14} />
                  At {address} — their place, not ours.
                </p>
              )}
              {/* What the landlord said they can do, beside the diary rather
                  than on another screen (James, 17 Sep 2026). */}
              {suggested?.length ? (
                <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12.5px]">
                  <span className="inline-flex items-center gap-2 font-semibold">
                    <DoodleIcon name="calendar" size={14} className="text-accent-dark" />
                    They can do:
                  </span>
                  {suggested.map((s, i) => (
                    <span key={s} className="text-muted">
                      {s}
                      {i < suggested.length - 1 ? " ·" : ""}
                    </span>
                  ))}
                </p>
              ) : null}
              {!toLandlord && property && (
                <p className="mb-3 flex items-center gap-2 text-[12.5px] text-muted">
                  <DoodleIcon name="home" size={14} />
                  {property.name} · {property.locality}
                  <button type="button" onClick={() => setStage("property")} className="ml-1 text-[11.5px] font-semibold text-accent-dark hover:underline">change</button>
                </p>
              )}
              {/* THE week — the diary's own grid, so booking happens against
                  the day you can see: every existing appointment drawn in,
                  the weather up top for the agent's own visits, and the pick
                  a solid block among them. Click any empty half-hour. */}
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setWeek((w) => Math.max(0, w - 1))}
                    disabled={week === 0}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink disabled:opacity-30"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeek((w) => w + 1)}
                    className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
                  >
                    ›
                  </button>
                </div>
                <p className="hand text-[17px]">
                  {week === 0 ? "This week" : week === 1 ? "Next week" : `${week} weeks out`}
                </p>
                <button
                  type="button"
                  onClick={() => setWeek(0)}
                  className={`hand rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                    week === 0 ? "border-accent-dark text-accent-dark" : "border-line/80 hover:border-ink"
                  }`}
                >
                  Today
                </button>
              </div>

              <div className="min-h-[320px] flex-1 overflow-auto rounded-xl border border-line/60">
                <DiaryGrid
                  week={week}
                  hourPx={52}
                  /* Whose day: the agent this booking is for (see `appts`). */
                  appts={appts}
                  pick={day && slot ? { day: offsetOf(day), slot } : null}
                  onPick={(o, t) => {
                    setDay(dateFromOffset(o));
                    setSlot(t);
                  }}
                  pickLabel={
                    mode === "appraisal" ? "Appraisal" : mode === "takeon" ? "Take-on" : "Viewing"
                  }
                  pickMins={mins}
                  onPickMins={setMins}
                  origin={origin}
                  weather={toLandlord ? forecast : undefined}
                />
              </div>
              <p className="mt-2 text-[10.5px] text-muted">
                Click an empty half-hour to book it — the other appointments are already
                drawn in, so a clash is visible before it happens.
                {slot && " Drag your booking to move it, and pull the tab underneath to make it longer. Or set the date, start and length in the boxes with the booking."}
              </p>
              {/* Their Outlook, read in beside the diary (24 Sep 2026). Said only
                  on their OWN grid: nobody else's Outlook is ever read, so on
                  somebody else's day there is nothing to say about it. */}
              {bookingOwn && outlook && outlook.state !== "not_yours" && (
                outlook.state === "connected" ? (
                  <p className="mt-1 text-[10.5px] text-muted">Your Outlook calendar is drawn in too, so time you blocked out there shows as busy.</p>
                ) : (
                  <p className="mt-1 text-[10.5px] text-accent-dark">
                    {outlook.reason ?? "Your Outlook calendar isn't shown."}{" "}
                    <a href="/api/auth/microsoft/start?from=profile" className="font-semibold underline underline-offset-2">
                      Connect Outlook
                    </a>
                  </p>
                )
              )}
              </div>

              {day && slot && (
                <>
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Drag to widen the email"
                    onPointerDown={startDrag}
                    className="group hidden w-2.5 shrink-0 cursor-col-resize items-center justify-center lg:flex"
                  >
                    <span className="h-12 w-1 rounded-full bg-line transition-colors group-hover:bg-ink/40" />
                  </div>
                  <aside
                    style={{ ["--col" as string]: `${column}px` }}
                    className="frame-grow flex w-full shrink-0 flex-col gap-4 lg:min-h-0 lg:w-[var(--col)] lg:overflow-y-auto lg:pr-1"
                  >
                    <div>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">
                        {mode === "appraisal" ? "Market appraisal" : mode === "takeon" ? "Take-on visit" : "Viewing"}
                      </p>
                      <p className="hand mt-1 text-[20px] leading-tight">{whenPretty}</p>
                      {/* The date, start and length, set here or on the grid:
                          both move the same booking (Howard, 24 Sep 2026). */}
                      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1.35fr_1fr_1fr]">
                        <label className="col-span-2 flex min-w-0 flex-col gap-1 text-[11px] text-muted sm:col-span-1">
                          Date
                          <input
                            type="date"
                            value={isoDay(day)}
                            min={isoDay(today)}
                            onChange={(e) => {
                              const [y, m, d] = e.target.value.split("-").map(Number);
                              if (!y || !m || !d) return;
                              const next = new Date(y, m - 1, d);
                              if (offsetOf(next) < 0) return;
                              setDay(next);
                              setWeek(weekOf(offsetOf(next)));
                            }}
                            className="w-full min-w-0 rounded-lg border border-line/80 bg-card px-2.5 py-2 text-[13px] text-ink"
                          />
                        </label>
                        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted">
                          Starts
                          <select
                            value={slot}
                            onChange={(e) => setSlot(e.target.value)}
                            className="figures w-full min-w-0 rounded-lg border border-line/80 bg-card px-2.5 py-2 text-[13px] text-ink"
                          >
                            {(START_TIMES.includes(slot) ? START_TIMES : [...START_TIMES, slot].sort()).map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex min-w-0 flex-col gap-1 text-[11px] text-muted">
                          Length
                          <select
                            value={mins}
                            onChange={(e) => setMins(Number(e.target.value))}
                            className="w-full min-w-0 rounded-lg border border-line/80 bg-card px-2.5 py-2 text-[13px] text-ink"
                          >
                            {(LENGTHS.includes(mins) ? LENGTHS : [...LENGTHS, mins].sort((a, b) => a - b)).map((n) => (
                              <option key={n} value={n}>{lengthWords(n)}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="mt-2 text-[12px] text-muted">
                        <span className="figures">{slot}–{endOf(slot, mins)}</span>
                        {" · "}
                        {howLong}
                        {day && forecast[dayKey(day)] ? ` · ${forecast[dayKey(day)].glyph} ${forecast[dayKey(day)].word.toLowerCase()}, ${forecast[dayKey(day)].temp}°` : ""}
                      </p>
                    </div>

              {mode === "viewing" && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/60 px-3 py-2.5 text-[12px]">
                  <input
                    id="booker-accompanied"
                    type="checkbox"
                    checked={accompanied}
                    onChange={(e) => setAccompanied(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block font-semibold">One of us will be there</span>
                    <span className="block text-[11px] leading-snug text-muted">
                      Untick for an unaccompanied viewing - the applicant lets themselves in. It shows in its own colour on the diary.
                    </span>
                  </span>
                </label>
              )}


                    {emailTarget ? (
                      <section className="rounded-xl border border-line/60 bg-card p-4">
                        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px]">
                          <input
                            id="booker-send-email"
                            type="checkbox"
                            checked={sendEmail}
                            onChange={(e) => setSendEmail(e.target.checked)}
                            className="mt-0.5"
                          />
                          <span>
                            <span className="block font-semibold">Email the confirmation</span>
                            <span className="block text-[11px] leading-snug text-muted">
                              {mode === "appraisal"
                                ? "To the landlord, with the calendar invite. Change any of the words first."
                                : mode === "takeon"
                                  ? "To the landlord, with the calendar invite and what to expect on the day. Change any of the words first."
                                  : "To the applicant, with the calendar invite and their passport link. Change any of the words first."}
                              {" "}Untick to book without telling them.
                            </span>
                          </span>
                        </label>
                        {sendEmail && (
                          <div className="mt-3 flex flex-col">
                            <ConfirmEditor ref={editor} target={emailTarget} onDraft={setDraft} fill={false} />
                          </div>
                        )}
                      </section>
                    ) : mode !== "takeon" ? (
                      <p className="rounded-xl border border-line/60 px-3.5 py-3 text-[12px] text-muted">
                        The confirmation can be sent from the record once this is booked.
                      </p>
                    ) : null}

              {/* ══ TRAVEL TIME ══
                  Offered, never imposed. The buffer is the thing everybody
                  means to add and nobody remembers to, so it appears the
                  moment a slot is picked — with the drive already measured,
                  because "add a buffer" is a question you can't answer
                  without knowing how far away the place is. */}
              {canTravel && travel.status !== "idle" && (
                <div className="rounded-xl border border-line/60 bg-panel/50 p-4">
                  <p className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <DoodleIcon name="target" size={13} />
                    Travel time
                  </p>

                  {travel.status === "loading" && (
                    <p className="flex items-center gap-2 text-[12.5px] text-muted">
                      <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                      Working out how long it takes to get there…
                    </p>
                  )}

                  {/* Nothing to measure FROM is a different fact from a broken
                      lookup, and it has a fix the agent can action. */}
                  {travel.status === "nowhere" && (
                    <p className="text-[12px] leading-relaxed text-muted">
                      Nothing earlier in the day to set off from, and no base address saved. Add
                      where you usually set off from on your profile and this will offer you a
                      buffer.
                    </p>
                  )}

                  {/* Never a guessed number. If Google won't answer, the panel
                      says so — an invented travel time is how somebody ends up
                      on the wrong doorstep trusting the software. */}
                  {travel.status === "problem" && (
                    <p className="text-[12px] leading-relaxed text-accent-dark">{travel.says}</p>
                  )}

                  {travel.status === "ready" && !beforeOptions.length && !afterOption && (
                    <p className="text-[12px] leading-relaxed text-muted">
                      Couldn&apos;t measure a drive to {address} — the address may not be precise
                      enough to place on a map.
                    </p>
                  )}

                  {travel.status === "ready" && (beforeOptions.length > 0 || afterOption) && (
                    <>
                      {beforeOptions.length > 0 && (
                        <>
                          <p className="mb-2 text-[12px] text-muted">
                            Where are you coming from?
                          </p>
                          <ul className="space-y-2">
                            {beforeOptions.map((o) => {
                              const on = bufferFrom === o.id;
                              return (
                                <li key={o.id}>
                                  <button
                                    type="button"
                                    onClick={() => setBufferFrom(on ? null : o.id)}
                                    className={`flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                                      on ? "border-accent-dark bg-accent-soft/40" : "border-line/60 hover:border-ink/30"
                                    }`}
                                  >
                                    <span
                                      className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                                        on ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                                      }`}
                                    >
                                      {on && "✓"}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[12.5px]">{o.label}</span>
                                      <span className="figures block text-[10.5px] text-muted">
                                        {o.leg.minutes} min drive
                                        {o.leg.miles ? ` · ${o.leg.miles} miles` : ""}
                                        {o.leg.withTraffic ? " · traffic at that time" : ""}
                                      </span>
                                    </span>
                                    <span className="hand shrink-0 text-[12.5px] text-accent-dark">
                                      {on ? `${o.leg.buffer} min added` : `Add ${o.leg.buffer} min`}
                                    </span>
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        </>
                      )}

                      {afterOption && (
                        <button
                          type="button"
                          onClick={() => setBufferAfter((v) => !v)}
                          className={`mt-2 flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors ${
                            bufferAfter ? "border-accent-dark bg-accent-soft/40" : "border-line/60 hover:border-ink/30"
                          }`}
                        >
                          <span
                            className={`flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[9px] ${
                              bufferAfter ? "border-accent-dark bg-accent-dark text-page" : "border-line"
                            }`}
                          >
                            {bufferAfter && "✓"}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12.5px]">
                              {afterOption.label} afterwards
                            </span>
                            <span className="figures block text-[10.5px] text-muted">
                              {afterOption.leg.minutes} min drive
                              {afterOption.leg.miles ? ` · ${afterOption.leg.miles} miles` : ""}
                            </span>
                          </span>
                          <span className="hand shrink-0 text-[12.5px] text-accent-dark">
                            {bufferAfter ? `${afterOption.leg.buffer} min added` : `Add ${afterOption.leg.buffer} min`}
                          </span>
                        </button>
                      )}

                      {/* The address we were given is often only an area —
                          REX fills it from the town or the outward postcode.
                          Measuring to the middle of M7 and calling it the
                          property is how a confident number turns into a
                          late arrival, so it says which one this is. */}
                      {!travel.precise && (
                        <p className="mt-2.5 text-[10.5px] leading-relaxed text-accent-dark">
                          Measured to {travel.resolved ?? address}, which is the area rather than the
                          exact address — so treat this as a rough steer. Put the full address on the
                          lead to get a real door-to-door time.
                        </p>
                      )}

                      {/* What Google actually matched, always. A precise hit
                          can still be the WRONG house — "9 Granby Road,
                          Salford M7" resolves confidently to an M27 address
                          in Swinton — and the only way anyone catches that
                          is by being shown the address that was measured. */}
                      {travel.precise && travel.resolved && (
                        <p className="mt-2.5 text-[10.5px] leading-relaxed text-muted">
                          Measured to {travel.resolved}. If that isn&apos;t the right house, fix the
                          address on the lead.
                        </p>
                      )}

                      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
                        {chosenBefore || bufferAfter
                          ? "Saved as its own Travel time entry either side of the visit - not added to the appraisal itself, so the length you promised the landlord stays the length you booked."
                          : "Each drive is rounded up to the next five minutes with a little for parking."}
                      </p>
                    </>
                  )}
                </div>
              )}
                  </aside>
                </>
              )}
            </div>
          )}

                    {/* ══ WHO ══ */}
          {stage === "who" && (
            <SendFlow
              messages={compose()}
              sendLabel="Send"
              onSend={(sent) => finishBooking(sent.length)}
            />
          )}

          {/* ══ DONE ══ */}
          {stage === "done" && (
            <div className="relative flex flex-col items-center py-8 text-center">
              {/* The gun goes off, then the tick settles — booked should FEEL booked. */}
              <ConfettiBurst />
              <DoneTick />
              <p className="hand mt-5 text-[20px]">{whenLabel}</p>
              <p className="mt-1 text-[12.5px]">
                {toLandlord ? address || "Visit booked" : property?.name}
              </p>
              {/* What actually happened, as the record reports it: the
                  diary, the email or its absence, and where to go next. */}
              {result === null ? (
                <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
                  <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                  Putting it in the diary{sentCount || !sendEmail ? "" : " and sending the confirmation"}…
                </p>
              ) : (
                <>
                  <p className="mt-4 max-w-md text-[12.5px] leading-relaxed text-muted">
                    {result?.said ?? (sentCount ? `${sentCount} message${sentCount === 1 ? "" : "s"} sent. In the diary and on the record.` : "Booked, and going into your Outlook calendar.")}
                  </p>
                  {result?.goTo && (
                    <div className="mt-6 w-full max-w-md rounded-2xl border border-line/60 bg-card p-5">
                      <p className="text-[13.5px] leading-snug">{result.goTo.ask}</p>
                      <div className="mt-4 flex flex-wrap justify-center gap-2.5">
                        <PressButton
                          onClick={() => { onClose(); router.push(result.goTo!.href); }}
                          className="press-ring rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white"
                        >
                          {result.goTo.label}
                        </PressButton>
                        <button
                          type="button"
                          onClick={onClose}
                          className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40"
                        >
                          Stay on the lead
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {stage !== "who" && (
          <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
            {stage === "applicant" ? (
              <>
                <p className="min-w-0 truncate text-[12px] text-muted">
                  {chosen ? chosen.name : "Pick who's coming to see it"}
                </p>
                <PressButton
                  onClick={() => chosen && setStage("when")}
                  className={`shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                    chosen ? "bg-accent-dark text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DoodleIcon name="calendar" size={15} />
                    Next — pick a time
                  </span>
                </PressButton>
              </>
            ) : stage === "property" ? (
              <>
                <p className="min-w-0 truncate text-[12px] text-muted">Pick the home they are going to see</p>
                <span />
              </>
            ) : stage === "confirm" ? (
              <>
                <button type="button" onClick={() => setStage("property")} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40">← Not this one</button>
                <PressButton onClick={() => setStage("when")} className="press-ring shrink-0 rounded-full bg-brown px-6 py-2.5 text-[13px] font-semibold text-white">
                  <span className="flex items-center gap-2">
                    <DoodleIcon name="calendar" size={15} />
                    Yes — pick a time
                  </span>
                </PressButton>
              </>
            ) : stage === "when" ? (
              <>
                <p className="min-w-0 truncate text-[12px] text-muted">
                  {ready
                    ? `${dayLabel} at ${slot}${
                        day && forecast[dayKey(day)]
                          ? ` · ${forecast[dayKey(day)].glyph} ${forecast[dayKey(day)].word.toLowerCase()}, ${forecast[dayKey(day)].temp}°`
                          : ""
                      }`
                    : "Pick a day and a time"}
                </p>
                {/* ALREADY GONE, AND ALLOWED (James, 17 Sep 2026). Somebody
                    writing up a visit that happened before the OS existed is
                    doing the right thing; they are just told what they are
                    doing, so a mistyped day is caught here rather than by a
                    landlord getting a confirmation for last Tuesday. */}
                {gone && (
                  <p className="flex items-start gap-1.5 text-[11.5px] leading-snug text-accent-dark">
                    <DoodleIcon name="info" size={12} className="mt-[2px] shrink-0" />
                    <span>That time has already gone. Book it anyway if the visit has happened - the confirmation will say so.</span>
                  </p>
                )}
                <PressButton
                  onClick={() => {
                    if (!ready || savingBuffers || booking || draftLoading) return;
                    if (VIEWING_SENDS_LIVE && mode === "viewing") setStage("who");
                    else void bookIt();
                  }}
                  className={`shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                    ready && !savingBuffers && !booking && !draftLoading ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {savingBuffers || booking ? (
                      <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" />
                    ) : (
                      <DoodleIcon name={willSend ? "mail" : "calendar"} size={15} />
                    )}
                    {savingBuffers || booking ? "Booking…" : draftLoading ? "Getting the email ready…" : willSend ? "Book and send" : "Book it"}
                  </span>
                </PressButton>
              </>
            ) : (
              <>
                <span />
                <PressButton
                  onClick={onClose}
                  className="rounded-full bg-ink px-6 py-2.5 text-[13px] font-semibold text-page"
                >
                  Done
                </PressButton>
              </>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
