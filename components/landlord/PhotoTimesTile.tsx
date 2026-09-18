"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { CTA } from "@/components/landlord/StepAction";

/**
 * "When can we come and take the photographs?" (James, 17 Sep 2026).
 *
 * The landlord offers a few days that suit, and their agent books one and
 * confirms it. Days and parts of the day, not exact times: nobody knows at
 * this point how long the photographer needs, and a landlord asked for
 * 10:15 on a Tuesday picks nothing at all.
 *
 * Optional throughout - a re-let often keeps the photographs it has, which
 * is why the way out says so rather than hiding in a corner.
 */
type Slot = { day: string; part: "morning" | "afternoon" | "either" };

const dayWords = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

const PARTS: Array<{ id: Slot["part"]; label: string }> = [
  { id: "morning", label: "Morning" },
  { id: "afternoon", label: "Afternoon" },
  { id: "either", label: "Any time" },
];

/** The next three weeks, Monday to Saturday - nobody photographs on a Sunday. */
function upcoming(): Array<{ iso: string; day: string; date: string; month: string }> {
  const out: Array<{ iso: string; day: string; date: string; month: string }> = [];
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + 1);
  for (let i = 0; i < 24 && out.length < 18; i++) {
    if (d.getDay() !== 0) {
      out.push({
        iso: d.toISOString().slice(0, 10),
        day: d.toLocaleDateString("en-GB", { weekday: "short" }),
        date: String(d.getDate()),
        month: d.toLocaleDateString("en-GB", { month: "short" }),
      });
    }
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export default function PhotoTimesTile({
  appraisalId,
  label,
  sub,
  icon,
  variant,
}: {
  appraisalId: string | null;
  label: string;
  sub: string;
  icon: string;
  variant: "button" | "row" | "link";
}) {
  const [open, setOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const days = upcoming();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const picked = slots.filter((s) => s.day);
    if (!picked.length || busy) return;
    /* The sample portal saves nothing - see MessageTile for what it used to do. */
    if (window.location.pathname.startsWith("/landlord/demo")) {
      setError("This is the sample portal, so nothing is sent from here.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/landlord/takeon-times", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ appraisalId, slots: picked, note }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "That didn't send.");
      setSent("Thank you - your agent will confirm a time.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't send.");
    } finally {
      setBusy(false);
    }
  }

  const opener =
    variant === "button" ? (
      <button type="button" onClick={() => setOpen(true)} className={CTA}>
        {label} <span aria-hidden>→</span>
      </button>
    ) : variant === "link" ? (
      <button type="button" onClick={() => setOpen(true)} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
        {label}
      </button>
    ) : (
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center gap-4 py-3.5 text-left transition-opacity hover:opacity-80">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
          <DoodleIcon name={icon} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">{label}</span>
          <span className="block text-[12px] text-muted">{sub}</span>
        </span>
        <span aria-hidden className="text-[15px] text-muted">›</span>
      </button>
    );

  return (
    <>
      {opener}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#2b201d]/55 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Times for the photographs"
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-[520px] rounded-[28px] bg-white p-7 shadow-2xl"
            >
              {sent ? (
                <>
                  <h2 className="text-[24px] leading-tight">Thank You</h2>
                  <p className="mt-3 text-[14px] leading-relaxed text-muted">{sent}</p>
                  <button type="button" onClick={() => setOpen(false)} className={`${CTA} mt-6`}>
                    Close
                  </button>
                </>
              ) : (
                <>
                  <h2 className="text-[24px] leading-tight">When Can We Take the Photographs?</h2>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed text-muted">
                    Pick a few days that suit and your agent will confirm one. It takes about an hour: photographs, the floor plan, and the details that go on the advert.
                  </p>
                  {/* THE DAYS THEMSELVES, not a date box (James, 17 Sep 2026:
                      the browser's own picker "looks generally awful"). Tap a
                      day, then say whether the morning or the afternoon is
                      better. */}
                  <div className="mt-5 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
                    {days.map((d) => {
                      const on = slots.some((s) => s.day === d.iso);
                      return (
                        <button
                          key={d.iso}
                          type="button"
                          onClick={() =>
                            setSlots((all) =>
                              all.some((s) => s.day === d.iso)
                                ? all.filter((s) => s.day !== d.iso)
                                : all.length >= 4
                                  ? all
                                  : [...all, { day: d.iso, part: "either" }]
                            )
                          }
                          aria-pressed={on}
                          className="flex w-[54px] shrink-0 flex-col items-center gap-0.5 rounded-2xl border px-2 py-2.5 transition-colors"
                          style={on ? { background: "#56423e", borderColor: "#56423e", color: "#fff" } : { borderColor: "rgba(86,66,62,0.2)", color: "#56423e" }}
                        >
                          <span className="text-[10.5px] uppercase tracking-wide opacity-70">{d.day}</span>
                          <span className="text-[17px] font-semibold leading-none">{d.date}</span>
                          <span className="text-[10.5px] opacity-70">{d.month}</span>
                        </button>
                      );
                    })}
                  </div>

                  {slots.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {slots.map((s) => (
                        <div key={s.day} className="flex flex-wrap items-center gap-2">
                          <span className="min-w-[132px] flex-1 text-[13px] font-semibold">{dayWords(s.day)}</span>
                          <div className="flex gap-1.5">
                            {PARTS.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                onClick={() => setSlots((all) => all.map((x) => (x.day === s.day ? { ...x, part: p.id } : x)))}
                                className="rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors"
                                style={s.part === p.id ? { background: "#56423e", borderColor: "#56423e", color: "#fff" } : { borderColor: "rgba(86,66,62,0.22)", color: "#56423e" }}
                              >
                                {p.label}
                              </button>
                            ))}
                          </div>
                          <button
                            type="button"
                            onClick={() => setSlots((all) => all.filter((x) => x.day !== s.day))}
                            aria-label={`Remove ${dayWords(s.day)}`}
                            className="rounded-full px-2 py-1 text-[12px] text-muted hover:text-ink"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Anything we should know? A tenant to ring, a gate code…"
                    className="mt-4 w-full resize-y rounded-xl border border-line/70 px-3.5 py-2.5 text-[13px] outline-none focus:border-ink/40"
                  />
                  {error && <p className="mt-3 text-[12.5px] text-accent-dark">{error}</p>}
                  <div className="mt-6 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={() => void send()} disabled={busy || !slots.some((s) => s.day)} className={`${CTA} disabled:opacity-40`}>
                      {busy ? "Sending…" : "Send these times"}
                    </button>
                    <button type="button" onClick={() => setOpen(false)} className="text-[13px] font-semibold text-muted hover:text-ink">
                      Not now
                    </button>
                  </div>
                  <p className="mt-4 text-[11.5px] leading-relaxed text-muted">
                    Happy with the photographs you already have? Skip this and tell your agent - we can use them.
                  </p>
                </>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
