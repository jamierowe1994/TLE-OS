"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { createPortal } from "react-dom";
import DiaryGrid from "@/components/DiaryGrid";
import { ConfettiBurst, DoneTick, PressButton } from "@/components/Bits";
import PeopleFilterBar, { NO_FILTERS, passesFilters, milesBetween, type Filters } from "@/components/PeopleFilter";
import SendFlow, { type Outgoing } from "@/components/SendFlow";
import { dayKey, useForecast } from "@/lib/weather";
import { landlordFor } from "@/lib/journey";
import { minutesOf, type Appt } from "@/lib/diary";
import { useDiary, refreshDiary } from "@/lib/diary-store";
import { usePref } from "@/lib/prefs-store";

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
};

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
  }) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [stage, setStage] = useState<"applicant" | "when" | "who" | "done">("when");
  const [chosen, setChosen] = useState<Person | null>(lead);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  /* How long it runs. Everything used to be half an hour, which is right for
     a viewing and wrong for almost every appraisal — a four-bed with a
     landlord who wants to talk is an hour and a half. */
  const [mins, setMins] = useState(mode === "appraisal" || mode === "takeon" ? 60 : 30);
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "");
  const [sentCount, setSentCount] = useState(0);
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  // One calendar for the whole OS: the diary's own week grid, with the pick
  // drawn into it. Which day AND what else that day holds, one look.
  const [week, setWeek] = useState(0);

  // Reset on OPEN only. The caller builds `properties` inline, so depending on
  // it here would throw the chosen day and time away on any parent re-render.
  const seed = useRef(properties);
  seed.current = properties;
  useEffect(() => {
    if (!open) return;
    // Starting from a property, the applicant is the first unknown; starting
    // from a lead, it's already answered.
    setChosen(lead);
    setStage(lead ? "when" : "applicant");
    setDay(null);
    setSlot(null);
    setPropertyId(seed.current[0]?.id ?? "");
    setFilters(NO_FILTERS);
    setWeek(0);
    /* Re-seeded on OPEN, not just at mount. The booker mounts once and is
       shown and hidden by `open`, and it mounts under whatever mode the
       caller last held — usually "viewing". So an appraisal opened later
       kept the viewing default and every appraisal was booked for half an
       hour, no matter what this line said. */
    setMins(mode === "appraisal" || mode === "takeon" ? 60 : 30);
  }, [open, today, mode]);

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

  const { appts } = useDiary();
  const [profile] = usePref<BaseProfile | null>(PROFILE_KEY, null);
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

  if (!open) return null;

  const property = properties.find((p) => p.id === propertyId) ?? properties[0] ?? null;
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
  /**
   * An appraisal stops HERE.
   *
   * It used to carry straight on into "who do we tell", compose the
   * confirmation and finish on a Booked screen with confetti — which read as
   * "that has gone out to them" when nothing had. Everything after the time
   * is picked now belongs to the appraisal box on the record, where the
   * confirmation, the calendar invite and the pre-appraisal live together and
   * you can see which of them has actually happened.
   *
   * Viewings keep the old run: there is no appraisal box behind them, so the
   * booker is the only place their messages can be composed.
   */
  const bookedOnly = mode === "appraisal";

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

  /** Hand the booking to the record and get out of the way. */
  async function bookAndClose() {
    await saveBuffers();
    onBooked({
      when: whenLabel,
      property: address || "Visit",
      locality: mode === "takeon" ? "Take-on visit" : "Market appraisal",
      who: chosen?.name ?? "",
      whenPretty,
      startsAt,
      minutes: mins,
    });
    onClose();
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
    const ll = landlordFor(property.id);
    const llFirst = ll.name.split(" ")[0];
    const where = `${property.name}, ${property.locality}`;

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
      {
        key: "landlord",
        role: "Landlord",
        name: ll.name,
        email: ll.email,
        phone: ll.phone,
        channel: "email",
        on: true,
        subject: `Viewing booked at ${property.name} — ${shortDate}, ${slot}`,
        emailBody:
          `Hi ${llFirst},\n\n` +
          `We've booked a viewing at ${where} for ${dayLabel} at ${slot}.\n\n` +
          `${agent} will be accompanying, so there's nothing you need to do — ` +
          `just let us know if that time is a problem for access.\n\n` +
          `We'll come back to you with feedback the same day.\n\n` +
          `Kind regards,\n${agent}\nThe Letting Experts`,
        whatsappBody:
          `Hi ${llFirst}, we've got a viewing at ${property.name} on ${shortDate} at ${slot}. ` +
          `${agent} is accompanying. Let us know if access is a problem.`,
      },
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
          `Landlord: ${ll.name} · ${ll.phone}`,
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

      <div className={`fade-up relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)] ${toLandlord ? "max-w-5xl" : "max-w-4xl"}`}>
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "done"
                ? mode === "appraisal" ? "Appraisal booked" : mode === "takeon" ? "Take-on booked" : "Viewing booked"
                : stage === "who"
                  ? "Who do we tell?"
                  : stage === "applicant"
                    ? "Who's viewing?"
                    : mode === "appraisal" ? "Book the appraisal" : mode === "takeon" ? "Book the take-on" : "Book a viewing"}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {stage === "applicant"
                ? properties[0]?.name ?? "Pick who's viewing"
                : stage === "when"
                  ? `For ${chosen?.name ?? "—"}`
                  : `${chosen?.name ?? "—"} · ${whenLabel}${
                      toLandlord
                        ? address ? ` · ${address}` : ""
                        : property ? ` · ${property.name}` : ""
                    }`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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

          {/* ══ WHEN ══ */}
          {stage === "when" && (
            <>
              {toLandlord && address && (
                <p className="mb-4 flex items-center gap-2 text-[12.5px] text-muted">
                  <DoodleIcon name="home" size={14} />
                  At {address} — their place, not ours.
                </p>
              )}
              {!toLandlord && properties.length > 1 && (
                <div className="mb-5">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Which property
                  </p>
                  <div className="flex gap-2.5 overflow-x-auto pb-1">
                    {properties.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setPropertyId(p.id)}
                        className={`flex w-56 shrink-0 items-center gap-2.5 rounded-xl border p-2 text-left transition-colors ${
                          p.id === propertyId
                            ? "border-accent-dark bg-accent-soft/40"
                            : "border-line/60 hover:border-ink/30"
                        }`}
                      >
                        <PropertyPhoto src={p.image} className="h-9 w-11 shrink-0 rounded-lg" />
                        <span className="min-w-0">
                          <span className="hand block truncate text-[12.5px]">{p.name}</span>
                          <span className="block truncate text-[10px] text-muted">{p.locality}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
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

              <div className="max-h-[46vh] overflow-auto rounded-xl border border-line/60">
                <DiaryGrid
                  week={week}
                  hourPx={44}
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
                {slot && " Drag the bar at the bottom of your booking to make it longer."}
              </p>

              {/* ══ TRAVEL TIME ══
                  Offered, never imposed. The buffer is the thing everybody
                  means to add and nobody remembers to, so it appears the
                  moment a slot is picked — with the drive already measured,
                  because "add a buffer" is a question you can't answer
                  without knowing how far away the place is. */}
              {canTravel && travel.status !== "idle" && (
                <div className="mt-4 rounded-xl border border-line/60 bg-panel/50 p-4">
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
            </>
          )}

                    {/* ══ WHO ══ */}
          {stage === "who" && (
            <SendFlow
              messages={compose()}
              sendLabel="Send"
              onSend={(sent) => {
                setSentCount(sent.length);
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
                    locality: mode === "appraisal" ? "Market appraisal" : mode === "takeon" ? "Take-on visit" : property!.locality,
                    who: chosen?.name ?? "",
                    whenPretty,
                    startsAt,
                    minutes: mins,
                  });
                }
              }}
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
              <p className="mt-3 text-[12px] text-muted">
                {sentCount
                  ? `${sentCount} message${sentCount === 1 ? "" : "s"} sent. In the diary and on the record.`
                  : "In the diary and on the record. Nobody was told."}
              </p>
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
                <PressButton
                  onClick={() => ready && !savingBuffers && (bookedOnly ? void bookAndClose() : setStage("who"))}
                  className={`shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                    ready && !savingBuffers ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {savingBuffers ? (
                      <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" />
                    ) : (
                      <DoodleIcon name="calendar" size={15} />
                    )}
                    {savingBuffers ? "Booking…" : bookedOnly ? "Book it" : "Next — who do we tell?"}
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
