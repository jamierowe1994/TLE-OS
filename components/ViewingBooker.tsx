"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import { DoneTick, PressButton } from "@/components/Bits";
import SendFlow, { type Outgoing } from "@/components/SendFlow";
import { landlordFor } from "@/lib/journey";

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

const SLOTS = (() => {
  const out: string[] = [];
  for (let h = 9; h <= 18; h++) {
    out.push(`${String(h).padStart(2, "0")}:00`);
    if (h < 18) out.push(`${String(h).padStart(2, "0")}:30`);
  }
  return out;
})();

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** The six-week grid for a month, Monday-first. */
function monthGrid(anchor: Date) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7; // JS weeks start Sunday; ours don't.
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) {
    cells.push(new Date(anchor.getFullYear(), anchor.getMonth(), 1 - lead + i));
  }
  return cells;
}

export type Person = { name: string; email: string; phone: string };

export default function ViewingBooker({
  open,
  onClose,
  lead,
  applicants,
  properties,
  agent,
  mode = "viewing",
  address = "",
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
  /** "appraisal" books the AGENT to the landlord's own property: no property
   *  picker (theirs is the only one), and the confirmation goes to the
   *  landlord, not an applicant. */
  mode?: "viewing" | "appraisal";
  /** The landlord's address, for appraisal mode. */
  address?: string;
  onBooked: (summary: { when: string; property: string; locality: string; who: string }) => void;
}) {
  const today = useMemo(() => startOfDay(new Date()), []);
  const [stage, setStage] = useState<"applicant" | "when" | "who" | "done">("when");
  const [chosen, setChosen] = useState<Person | null>(lead);
  const [month, setMonth] = useState<Date>(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [day, setDay] = useState<Date | null>(null);
  const [slot, setSlot] = useState<string | null>(null);
  const [propertyId, setPropertyId] = useState<string>(properties[0]?.id ?? "");
  const [sentCount, setSentCount] = useState(0);

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
    setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
  }, [open, today]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const cells = useMemo(() => monthGrid(month), [month]);

  if (!open) return null;

  const property = properties.find((p) => p.id === propertyId) ?? properties[0] ?? null;
  const ready = Boolean(day && slot && chosen && (mode === "appraisal" || property));

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

    if (mode === "appraisal") {
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
          subject: `Your market appraisal — ${shortDate} at ${slot}`,
          emailBody:
            `Hi ${first},\n\n` +
            `Thanks for speaking today — your market appraisal is booked for ${dayLabel} at ${slot}.\n\n` +
            `${where}\n\n` +
            `${agent} will come to you, walk the property with you and talk through what it should achieve. ` +
            `Nothing to prepare — half an hour of your time is all it takes.\n\n` +
            `Kind regards,\n${agent}\nThe Lettings Experts`,
          whatsappBody:
            `Hi ${first}, your market appraisal is booked — ${shortDate} at ${slot}, at ${where}. ` +
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
          subject: `Diary: MA at ${where}, ${shortDate} ${slot}`,
          emailBody: `${dayLabel}, ${slot}\n${where}\n\nLandlord: ${chosen.name} · ${chosen.phone}`,
          whatsappBody: `${shortDate} ${slot} — MA at ${where}. ${chosen.name}, ${chosen.phone}.`,
        },
      ];
    }

    if (!property) return [];
    const ll = landlordFor(property.id);
    const llFirst = ll.name.split(" ")[0];
    const where = `${property.name}, ${property.locality}`;

    return [
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

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/45"
      />

      <div className="fade-up relative flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">
              {stage === "done"
                ? mode === "appraisal" ? "Appraisal booked" : "Viewing booked"
                : stage === "who"
                  ? "Who do we tell?"
                  : stage === "applicant"
                    ? "Who's viewing?"
                    : mode === "appraisal" ? "Book the appraisal" : "Book a viewing"}
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {stage === "applicant"
                ? properties[0]?.name ?? "Pick who's viewing"
                : stage === "when"
                  ? `For ${chosen?.name ?? "—"}`
                  : `${chosen?.name ?? "—"} · ${whenLabel}${
                      mode === "appraisal"
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
            <ul className="space-y-2.5">
              {(applicants ?? []).map((p) => {
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
            </ul>
          )}

          {/* ══ WHEN ══ */}
          {stage === "when" && (
            <>
              {mode === "appraisal" && address && (
                <p className="mb-4 flex items-center gap-2 text-[12.5px] text-muted">
                  <DoodleIcon name="home" size={14} />
                  At {address} — their place, not ours.
                </p>
              )}
              {mode === "viewing" && properties.length > 1 && (
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

              <div className="grid gap-5 sm:grid-cols-[1fr_150px]">
                {/* The calendar, given the room it deserves. */}
                <div>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
                    >
                      ‹
                    </button>
                    <p className="hand text-[17px]">
                      {month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
                    </p>
                    <button
                      type="button"
                      onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
                    >
                      ›
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {DAY_NAMES.map((d) => (
                      <div
                        key={d}
                        className="pb-1 text-center text-[10px] font-semibold uppercase tracking-wide text-muted"
                      >
                        {d}
                      </div>
                    ))}
                    {cells.map((c) => {
                      const outside = c.getMonth() !== month.getMonth();
                      const past = c < today;
                      const isToday = c.getTime() === today.getTime();
                      const picked = day != null && c.getTime() === day.getTime();
                      return (
                        <button
                          key={c.toISOString()}
                          type="button"
                          disabled={past}
                          onClick={() => setDay(c)}
                          className={`figures aspect-square rounded-xl border text-[13px] transition-all ${
                            picked
                              ? "border-accent-dark bg-accent-dark font-semibold text-page"
                              : past
                                ? "cursor-not-allowed border-transparent text-muted/30"
                                : outside
                                  ? "border-transparent text-muted/45 hover:border-line"
                                  : "border-line/50 hover:border-ink/40"
                          } ${isToday && !picked ? "ring-1 ring-inset ring-accent-dark/50" : ""}`}
                        >
                          {c.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Times. */}
                <div className="flex min-h-0 flex-col">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                    Time
                  </p>
                  {day ? (
                    /* Runs the full height of the calendar beside it — a
                       short scroll box next to a tall grid reads as broken. */
                    <div className="grid max-h-[240px] grid-cols-2 gap-1.5 overflow-y-auto pr-1 sm:max-h-none sm:min-h-0 sm:flex-1 sm:grid-cols-1">
                      {SLOTS.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setSlot(t)}
                          className={`figures rounded-lg border py-2 text-[12.5px] transition-colors ${
                            slot === t
                              ? "border-accent-dark bg-accent-dark font-semibold text-page"
                              : "border-line/60 hover:border-ink/40"
                          }`}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-[11.5px] leading-relaxed text-muted">
                      Pick a day first
                    </p>
                  )}
                </div>
              </div>
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
                if (mode === "appraisal" || property) {
                  onBooked({
                    when: whenLabel,
                    property: mode === "appraisal" ? (address || "Appraisal") : property!.name,
                    locality: mode === "appraisal" ? "Market appraisal" : property!.locality,
                    who: chosen?.name ?? "",
                  });
                }
              }}
            />
          )}

          {/* ══ DONE ══ */}
          {stage === "done" && (
            <div className="flex flex-col items-center py-8 text-center">
              <DoneTick />
              <p className="hand mt-5 text-[20px]">{whenLabel}</p>
              <p className="mt-1 text-[12.5px]">
                {mode === "appraisal" ? address || "Market appraisal" : property?.name}
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
                  {ready ? `${dayLabel} at ${slot}` : "Pick a day and a time"}
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
    </div>
  );
}
