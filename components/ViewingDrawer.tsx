"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import { minutesOf, type Appt } from "@/lib/diary";

/**
 * One viewing, at full record width — the same pull-out distance as a lead
 * or a listing, because a viewing is a record, not a footnote.
 *
 * Left: the facts (property + occupancy, who's coming, the confirmations
 * with their send buttons). Right: the life of the record — the pairing
 * (once someone applies, applicant and property are COUPLED and travel
 * together into compliance; a fall-through uncouples them), the activity
 * log, and notes. Actions along the foot: reschedule, review, cancel.
 */

function dayLabel(offset: number): string {
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset === -1) return "Yesterday";
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

function endTime(a: Appt): string {
  const end = minutesOf(a.start) + a.mins;
  return `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}`;
}

export type Outcome = "Booked" | "Confirm" | "Applying" | "Thinking" | "Not for them";

function Card({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line/70 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[12.5px] font-semibold">
          <DoodleIcon name={icon} size={15} className="text-accent-dark" />
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function ViewingDrawer({
  appt,
  outcome,
  onClose,
  sentExtra,
  onSend,
}: {
  appt: Appt | null;
  /** Past viewings carry their feedback state. */
  outcome?: Outcome;
  onClose: () => void;
  /** Labels the agent has sent from this page this session. */
  sentExtra: Set<string>;
  onSend: (apptId: string, label: string) => void;
}) {
  const [shown, setShown] = useState(false);
  const [coupled, setCoupled] = useState(true);
  const [note, setNote] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [cancelled, setCancelled] = useState(false);

  useEffect(() => {
    if (!appt) { setShown(false); return; }
    setCoupled(true);
    setNote("");
    setNotes([]);
    setCancelled(false);
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [appt]);

  useEffect(() => {
    if (!appt) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [appt, onClose]);

  if (!appt) return null;
  const past = appt.day < 0;
  const property = appt.what.replace(/^[^—]+—\s*/, "");
  const allSent = appt.comms.every((c) => c.done || sentExtra.has(`${appt.id}:${c.label}`));
  const applying = outcome === "Applying";

  /* The activity log, derived from what the record knows — every event the
     wiring will one day write is already shaped here. */
  const activity: { when: string; what: string; by: string }[] = [
    { when: dayLabel(appt.day - 2), what: `Viewing booked for ${dayLabel(appt.day)}, ${appt.start}`, by: appt.agent },
    ...appt.comms
      .filter((c) => c.done)
      .map((c) => ({ when: dayLabel(appt.day - 2), what: `Sent: ${c.label}`, by: "TLE OS" })),
    ...appt.comms
      .filter((c) => !c.done && sentExtra.has(`${appt.id}:${c.label}`))
      .map((c) => ({ when: "Just now", what: `Sent: ${c.label}`, by: "You" })),
    ...(past && outcome
      ? [{ when: dayLabel(appt.day + 1), what: `Outcome recorded: ${outcome}`, by: appt.agent }]
      : []),
    ...(applying && coupled
      ? [{ when: dayLabel(appt.day + 1), what: `${appt.who} coupled to ${property} — referencing started`, by: "TLE OS" }]
      : []),
    ...(cancelled ? [{ when: "Just now", what: "Viewing cancelled — everyone told", by: "You" }] : []),
  ];

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* ── When, first — a viewing IS a time. ── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {cancelled ? "Viewing — cancelled" : past ? "Viewing — happened" : "Viewing — booked"}
            </p>
            <h2 className="mt-1 text-[20px] leading-tight">
              {dayLabel(appt.day)}, {appt.start}–{endTime(appt)}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">
              {property} · {appt.who} · {appt.agent} accompanying
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {!past && !cancelled && (
              <>
                <PressButton className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold">
                  <DoodleIcon name="calendar" size={13} />
                  Reschedule
                </PressButton>
                <PressButton
                  onClick={() => setCancelled(true)}
                  className="press-ring rounded-full border border-line/80 px-4 py-2 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink hover:text-ink"
                >
                  ✕ Cancel viewing
                </PressButton>
              </>
            )}
            {past && (
              <PressButton className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2 text-[11.5px] font-semibold">
                <DoodleIcon name="clock" size={13} />
                Schedule a review
              </PressButton>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 lg:grid-cols-2">
            {/* ══ LEFT: the facts. ══ */}
            <div className="space-y-4">
              <Card
                title="The property"
                icon="home"
                action={appt.tenant ? <Pill tone="accent">Tenanted</Pill> : <Pill tone="neutral">Vacant</Pill>}
              >
                <p className="hand text-[15px]">{property}</p>
                <p className="mt-0.5 text-[11.5px] text-muted">{appt.where}</p>
                <p className="mt-2.5 border-t border-line/50 pt-2.5 text-[11.5px] leading-relaxed text-muted">
                  {appt.tenant
                    ? `${appt.tenant} in situ — access is arranged with them, and they must know before anyone walks in.`
                    : "Vacant — keys held at the office, no access to arrange."}
                </p>
                {appt.link && (
                  <Link
                    href={appt.link.href}
                    className="mt-2 inline-block text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    Open the property record →
                  </Link>
                )}
              </Card>

              <Card
                title={past ? "Who viewed" : "Who's coming"}
                icon="user"
                action={
                  past && outcome ? (
                    <Pill tone={outcome === "Applying" ? "good" : "neutral"}>{outcome}</Pill>
                  ) : undefined
                }
              >
                <p className="hand text-[15px]">{appt.who}</p>
                {appt.contact && (
                  <div className="mt-2 space-y-1">
                    <p className="flex items-center gap-2 text-[11.5px] text-muted">
                      <DoodleIcon name="call" size={13} /> {appt.contact.phone}
                    </p>
                    <p className="flex items-center gap-2 truncate text-[11.5px] text-muted">
                      <DoodleIcon name="mail" size={13} /> {appt.contact.email}
                    </p>
                  </div>
                )}
                {past && outcome === "Thinking" && (
                  <PressButton className="press-ring mt-3 rounded-full border border-ink/25 px-3.5 py-1.5 text-[11px] font-semibold">
                    Chase feedback
                  </PressButton>
                )}
              </Card>

              <Card
                title="Confirmations"
                icon="mail"
                action={
                  allSent ? (
                    <Pill tone="good">All sent</Pill>
                  ) : (
                    <Pill tone="accent">
                      {appt.comms.filter((c) => !c.done && !sentExtra.has(`${appt.id}:${c.label}`)).length} outstanding
                    </Pill>
                  )
                }
              >
                <ul className="space-y-2.5">
                  {appt.comms.map((c) => {
                    const done = c.done || sentExtra.has(`${appt.id}:${c.label}`);
                    return (
                      <li key={c.label} className="flex items-center gap-2.5">
                        <span
                          className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            done ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line text-transparent"
                          }`}
                        >
                          ✓
                        </span>
                        <span className={`min-w-0 flex-1 text-[12.5px] ${done ? "" : "text-muted"}`}>
                          {c.label}
                        </span>
                        {done ? (
                          <span className="shrink-0 text-[10px] text-muted">
                            {c.done ? "sent" : "sent just now"}
                          </span>
                        ) : past ? (
                          <span className="shrink-0 text-[10px] font-semibold text-accent-dark">NEVER SENT</span>
                        ) : (
                          <PressButton
                            onClick={() => onSend(appt.id, c.label)}
                            className="press-ring shrink-0 rounded-full bg-accent-dark px-3.5 py-1.5 text-[10.5px] font-semibold text-page"
                          >
                            Send it now
                          </PressButton>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </div>

            {/* ══ RIGHT: the record's life. ══ */}
            <div className="space-y-4">
              {/* The pairing — the moment an application lands, person and
                  property become ONE file for compliance and referencing.
                  Only something dramatic uncouples them. */}
              {applying && (
                <Card
                  title="Paired records"
                  icon="link"
                  action={
                    coupled ? (
                      <Pill tone="good">Coupled</Pill>
                    ) : (
                      <Pill tone="accent">Uncoupled</Pill>
                    )
                  }
                >
                  <div className="flex items-center gap-3">
                    <span className="min-w-0 flex-1 rounded-xl border border-line/70 p-2.5 text-center">
                      <span className="hand block truncate text-[12.5px]">{appt.who}</span>
                      <span className="block text-[9.5px] text-muted">applicant</span>
                    </span>
                    <DoodleIcon
                      name="link"
                      size={18}
                      className={coupled ? "shrink-0 text-accent-dark" : "shrink-0 text-muted opacity-40"}
                    />
                    <span className="min-w-0 flex-1 rounded-xl border border-line/70 p-2.5 text-center">
                      <span className="hand block truncate text-[12.5px]">{property}</span>
                      <span className="block text-[9.5px] text-muted">property</span>
                    </span>
                  </div>
                  <p className="mt-2.5 text-[11px] leading-relaxed text-muted">
                    {coupled
                      ? "They applied and the offer was accepted, so the two files travel together — referencing, compliance and the tenancy all read from the pair."
                      : "Uncoupled — the application fell through. Each file stands alone again."}
                  </p>
                  {coupled && (
                    <p className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                      <DoodleIcon name="file-contract" size={12} className="text-accent-dark" />
                      References: 2 of 3 back — employer&apos;s outstanding
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => setCoupled((c) => !c)}
                    className="mt-3 text-[11px] font-semibold text-muted transition-colors hover:text-ink"
                  >
                    {coupled ? "Uncouple — it fell through" : "Re-couple the records"}
                  </button>
                </Card>
              )}

              <Card title="Activity" icon="list">
                <ul className="space-y-2.5">
                  {activity.map((a, i) => (
                    <li key={i} className="flex items-baseline gap-2.5 text-[12px]">
                      <span className="w-[74px] shrink-0 text-[10px] text-muted">{a.when}</span>
                      <span className="min-w-0 flex-1">{a.what}</span>
                      <span className="shrink-0 text-[10px] text-muted">{a.by}</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card title="Notes" icon="note">
                <div className="flex gap-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && note.trim()) {
                        setNotes((cur) => [note.trim(), ...cur]);
                        setNote("");
                      }
                    }}
                    placeholder="Anything worth remembering — press Enter to keep it"
                    className="w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12px] outline-none transition-colors focus:border-ink"
                  />
                </div>
                {notes.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {notes.map((n, i) => (
                      <li key={i} className="rounded-xl bg-accent-soft/30 px-3 py-2 text-[12px] leading-relaxed">
                        {n}
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <p className="text-[10px] leading-relaxed text-muted">
                Wireframe — sends tick here, the real messages go once sending is wired.
                Reschedule reopens the booker with this viewing loaded; the pair writes
                through to compliance when the records live in the database.
              </p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
