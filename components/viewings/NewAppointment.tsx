"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { refreshDiary } from "@/lib/diary-store";

/**
 * A GENERAL APPOINTMENT, NOT TIED TO A HOME OR A PERSON (Richard Callow
 * c88d1b13, Rhiannon Dodge 1d18a038, 16 Oct 2026).
 *
 * Richard: "add our own meeting type or custom agenda ... off site in person
 * meetings, property inspections, personal appointments". Rhiannon: "there
 * isn't a button to do this". There was one way in - click an empty slot on
 * the Dashboard's calendar - and nobody found it. This is the button.
 *
 * Their own words for what it is (the chips only start it off), an agenda,
 * when, how long and where. It is held in the OS (os_appointments, POST
 * /api/appointments) and, unless they untick it, put in their own Outlook the
 * way every OS booking is. Nobody is invited or emailed. Cancel appointment on
 * the entry takes it out of both.
 */

const STARTERS = ["Meeting", "Off-site meeting", "Property inspection", "Training", "Personal"];

const LENGTHS: Array<{ mins: number; label: string }> = [
  { mins: 15, label: "15 min" },
  { mins: 30, label: "30 min" },
  { mins: 45, label: "45 min" },
  { mins: 60, label: "1 hour" },
  { mins: 90, label: "1½ hours" },
  { mins: 120, label: "2 hours" },
  { mins: 180, label: "3 hours" },
  { mins: 240, label: "Half a day" },
];

/** 07:00 to 21:00 in quarter hours. */
const TIMES = Array.from({ length: (21 - 7) * 4 + 1 }, (_, i) => {
  const m = 7 * 60 + i * 15;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});

const field =
  "w-full rounded-xl border border-line/80 bg-white px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-ink";
const labelCls = "mb-1.5 block text-[11.5px] font-semibold uppercase tracking-wide text-muted";

/** yyyy-mm-dd on the browser's own clock (the agent's day). */
function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The next quarter hour from now, inside the working day. */
function nextSlot(): string {
  const n = new Date();
  const m = Math.ceil((n.getHours() * 60 + n.getMinutes() + 1) / 15) * 15;
  const clamped = Math.min(Math.max(m, 9 * 60), 20 * 60);
  return `${String(Math.floor(clamped / 60)).padStart(2, "0")}:${String(clamped % 60).padStart(2, "0")}`;
}

export default function NewAppointment({
  open,
  onClose,
  day,
}: {
  open: boolean;
  onClose: () => void;
  /** The day the diary is on, to start from. Today when it is in the past. */
  day?: Date | null;
}) {
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [mins, setMins] = useState(60);
  const [where, setWhere] = useState("");
  const [outlook, setOutlook] = useState(true);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const todayIso = useMemo(() => isoDay(new Date()), []);
  /* By value: the page hands a fresh Date every render, and keying on the
     object would wipe the form as they type. */
  const dayKey = day ? isoDay(day) : "";
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const now = isoDay(new Date());
    const start = dayKey && dayKey >= now ? dayKey : now;
    setTitle("");
    setNotes("");
    setDate(start);
    setTime(start === now ? nextSlot() : "09:00");
    setMins(60);
    setWhere("");
    setOutlook(true);
    setBusy(false);
    setProblem(null);
    setDone(null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dayKey]);

  if (!open) return null;

  const missing = !title.trim() ? "Say what it is first." : !date ? "Pick the day." : null;

  async function save() {
    if (missing || busy) return;
    setBusy(true);
    setProblem(null);
    const [y, mo, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const at = new Date(y, mo - 1, d, hh, mm, 0, 0);
    const j = await fetch("/api/appointments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        startsAt: at.toISOString(),
        mins,
        kind: /inspection|inventory/i.test(title) ? "inspection" : "other",
        title: title.trim(),
        notes: notes.trim(),
        where: where.trim(),
        outlook,
      }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; note?: string; error?: string }>)
      .catch(() => null);
    setBusy(false);
    if (!j?.ok) return setProblem(j?.error ?? "That didn't save. Try again.");
    await refreshDiary().catch(() => null);
    setDone(j.note ?? "In your diary.");
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">New appointment</h2>
            <p className="mt-0.5 text-[12px] text-muted">A meeting, an inspection or something personal. No home or person needed.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        {done ? (
          <div className="px-6 py-8 text-center">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft/70 text-accent-dark">
              <DoodleIcon name="calendar" size={20} />
            </span>
            <p className="hand mt-3 text-[16px]">{title.trim()}</p>
            <p className="mt-1 text-[12.5px] text-muted">{done}</p>
            <PressButton onClick={onClose} className="press-ring mt-5 rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white">
              Done
            </PressButton>
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
              <div>
                <label className={labelCls} htmlFor="na-title">What is it?</label>
                <input
                  id="na-title"
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={200}
                  placeholder="Team meeting at the Banbury office"
                  className={field}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setTitle((t) => (t.trim() ? t : s))}
                      className="rounded-full border border-line/70 bg-white px-3 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:border-ink/40 hover:text-ink"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={labelCls} htmlFor="na-notes">Agenda or notes <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                <textarea
                  id="na-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  maxLength={4000}
                  placeholder="What it's about, who's going, anything to bring."
                  className={`${field} resize-y`}
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div>
                  <label className={labelCls} htmlFor="na-date">Day</label>
                  <input id="na-date" type="date" min={todayIso} value={date} onChange={(e) => setDate(e.target.value)} className={field} />
                </div>
                <div>
                  <label className={labelCls} htmlFor="na-time">Starts</label>
                  <select id="na-time" value={time} onChange={(e) => setTime(e.target.value)} className={field}>
                    {TIMES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls} htmlFor="na-mins">How long</label>
                  <select id="na-mins" value={mins} onChange={(e) => setMins(Number(e.target.value))} className={field}>
                    {LENGTHS.map((l) => (
                      <option key={l.mins} value={l.mins}>{l.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className={labelCls} htmlFor="na-where">Where <span className="font-normal normal-case tracking-normal">(optional)</span></label>
                <input id="na-where" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={200} placeholder="An address, or Teams" className={field} />
              </div>

              <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px]">
                <input type="checkbox" checked={outlook} onChange={(e) => setOutlook(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brown)]" />
                <span>
                  Put it in my Outlook calendar too
                  <span className="block text-[11.5px] text-muted">Nobody is invited or emailed.</span>
                </span>
              </label>
            </div>

            <div className="flex shrink-0 items-center gap-3 border-t border-line/70 px-6 py-4">
              <p className="min-w-0 flex-1 text-[12px] text-accent-dark">{problem ?? ""}</p>
              <button type="button" onClick={onClose} className="text-[12.5px] font-semibold text-muted hover:text-ink">
                Cancel
              </button>
              <PressButton
                onClick={() => void save()}
                disabled={Boolean(missing) || busy}
                title={missing ?? undefined}
                className="press-ring flex items-center gap-2 rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white disabled:opacity-50"
              >
                {busy ? "Saving…" : "Add to my diary"}
              </PressButton>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
