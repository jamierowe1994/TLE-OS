"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { Pill } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import { minutesOf, type Appt } from "@/lib/diary";

/**
 * One viewing, in full: when, where, who's coming, whether the property has
 * someone living in it, and — the question the whole drawer exists for —
 * whether every message around it actually went. An unsent confirmation
 * gets a button, not a shrug.
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

  useEffect(() => {
    if (!appt) { setShown(false); return; }
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
        className={`absolute inset-y-0 right-0 flex w-full max-w-lg flex-col bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* ── When, first — a viewing IS a time. ── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
              {past ? "Viewing — happened" : "Viewing — booked"}
            </p>
            <h2 className="mt-1 text-[20px] leading-tight">
              {dayLabel(appt.day)}, {appt.start}–{endTime(appt)}
            </h2>
            <p className="mt-0.5 text-[12px] text-muted">{appt.agent} accompanying</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {/* ── The property, and who's living in it. ── */}
          <div className="rounded-2xl border border-line/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2.5">
                <DoodleIcon name="home" size={16} className="shrink-0 text-accent-dark" />
                <span className="min-w-0">
                  <span className="hand block truncate text-[14px]">{property}</span>
                  <span className="block truncate text-[11px] text-muted">{appt.where}</span>
                </span>
              </span>
              {appt.tenant ? <Pill tone="accent">Tenanted</Pill> : <Pill tone="neutral">Vacant</Pill>}
            </div>
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
          </div>

          {/* ── Who's viewing. ── */}
          <div className="mt-4 rounded-2xl border border-line/70 p-4">
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              {past ? "Who viewed" : "Who's coming"}
            </p>
            <p className="hand mt-1.5 text-[15px]">{appt.who}</p>
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
            {past && outcome && (
              <div className="mt-3 flex items-center gap-2.5 border-t border-line/50 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                  Outcome
                </span>
                <Pill tone={outcome === "Applying" ? "good" : "neutral"}>{outcome}</Pill>
                {outcome === "Thinking" && (
                  <PressButton className="press-ring ml-auto rounded-full border border-ink/25 px-3.5 py-1.5 text-[11px] font-semibold">
                    Chase feedback
                  </PressButton>
                )}
              </div>
            )}
          </div>

          {/* ── The messages: every tick earned, every gap a button. ── */}
          <div className="mt-4 rounded-2xl border border-line/70 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                Confirmations
              </p>
              {allSent ? (
                <Pill tone="good">All sent</Pill>
              ) : (
                <Pill tone="accent">
                  {appt.comms.filter((c) => !c.done && !sentExtra.has(`${appt.id}:${c.label}`)).length} outstanding
                </Pill>
              )}
            </div>
            <ul className="mt-3 space-y-2.5">
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
            {appt.tenant && !appt.comms.some((c) => c.label.toLowerCase().includes("heads-up")) && (
              <p className="mt-3 rounded-lg bg-accent-soft/50 px-3 py-2 text-[11px] leading-relaxed text-accent-dark">
                This property is tenanted and no heads-up is on the list — add one before
                anybody gets a surprise at their own front door.
              </p>
            )}
          </div>

          {/* ── What you can do from here. ── */}
          {!past && (
            <div className="mt-4 flex flex-wrap gap-2.5">
              <PressButton className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2.5 text-[12px] font-semibold">
                <DoodleIcon name="calendar" size={13} />
                Reschedule
              </PressButton>
              <PressButton className="press-ring flex items-center gap-2 rounded-full border border-ink/25 px-4 py-2.5 text-[12px] font-semibold text-muted">
                ✕ Cancel the viewing
              </PressButton>
            </div>
          )}

          <p className="mt-4 text-[10px] leading-relaxed text-muted">
            Wireframe — &ldquo;Send it now&rdquo; ticks the box here; the real send goes
            through email/WhatsApp once sending is wired. Reschedule will reopen the
            booker with this viewing loaded.
          </p>
        </div>
      </aside>
    </div>
  );
}
