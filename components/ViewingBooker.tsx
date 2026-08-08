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
import { DIARY, minutesOf } from "@/lib/diary";

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
  onBooked: (summary: { when: string; property: string; locality: string; who: string }) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [stage, setStage] = useState<"applicant" | "when" | "who" | "done">("when");
  const [chosen, setChosen] = useState<Person | null>(lead);
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
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
  }, [open, today]);

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



  if (!open) return null;



  const property = properties.find((p) => p.id === propertyId) ?? properties[0] ?? null;
  const offsetOf = (d: Date) => Math.round((startOfDay(d).getTime() - today.getTime()) / 86400000);
  const dateFromOffset = (o: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + o);
    return d;
  };
  const ready = Boolean(day && slot && chosen && (toLandlord || property));

  const dayLabel = day
    ? day.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    : "";
  const shortDate = day
    ? day.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
    : "";
  const whenLabel = `${shortDate}, ${slot ?? ""}`;

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
                `Bright and tidy is all it needs — ${agent} will do the rest. It takes about an hour.\n\n` +
                `Kind regards,\n${agent}\nThe Lettings Experts`
              : `Hi ${first},\n\n` +
                `Thanks for speaking today — your market appraisal is booked for ${dayLabel} at ${slot}.\n\n` +
                `${where}\n\n` +
                `${agent} will come to you, walk the property with you and talk through what it should achieve. ` +
                `Nothing to prepare — half an hour of your time is all it takes.\n\n` +
                `Kind regards,\n${agent}\nThe Lettings Experts`,
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
              `Kind regards,\n${agent}\nThe Lettings Experts`,
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
          `Kind regards,\n${agent}\nThe Lettings Experts`,
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
          `Kind regards,\n${agent}\nThe Lettings Experts`,
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
                  origin={origin}
                  weather={toLandlord ? forecast : undefined}
                />
              </div>
              <p className="mt-2 text-[10.5px] text-muted">
                Click an empty half-hour to book it — the other appointments are already
                drawn in, so a clash is visible before it happens.
              </p>
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
                // Appraisals have no listing — the guard must not eat them.
                if (toLandlord || property) {
                  onBooked({
                    when: whenLabel,
                    property: toLandlord ? (address || "Visit") : property!.name,
                    locality: mode === "appraisal" ? "Market appraisal" : mode === "takeon" ? "Take-on visit" : property!.locality,
                    who: chosen?.name ?? "",
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
                  onClick={() => ready && setStage("who")}
                  className={`shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${
                    ready ? "bg-ink text-page" : "cursor-not-allowed bg-ink/30 text-page/60"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <DoodleIcon name="calendar" size={15} />
                    Next — who do we tell?
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
