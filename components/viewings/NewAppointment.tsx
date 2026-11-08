"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import FloatSheet, { FloatCard, FloatCardHead, FloatChoice, FloatDone, FloatFoot } from "@/components/new-look/FloatSheet";
import { DateField } from "@/components/offers/OfferParts";
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
  const [step, setStep] = useState<1 | 2>(1);

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
    setStep(1);
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

  /* Two screens in the new look (James, 8 Nov 2026): what it is, then when
     and where. The same save as before. */
  const firstOk = Boolean(title.trim());
  const go = (to: 1 | 2) => setStep(to);
  return (
    <FloatSheet
      title="New Appointment"
      size="lg"
      step={done ? undefined : step}
      steps={done ? undefined : 2}
      onBack={!done && step === 2 ? () => go(1) : undefined}
      onClose={onClose}
      dismissible={!busy}
      screenKey={done ? "done" : step}
      question={done ? undefined : step === 1 ? "What is it?" : "When and where?"}
      lede={done ? undefined : step === 1 ? "A meeting, an inspection or something personal. No home or person needed." : title.trim()}
      foot={
        <FloatFoot left={problem ? <span className="text-accent-dark">{problem}</span> : undefined}>
          {done ? (
            <button type="button" className="nl-btn nl-btn--primary" onClick={onClose}>Done</button>
          ) : step === 1 ? (
            <>
              <button type="button" className="nl-btn nl-btn--quiet" onClick={onClose}>Cancel</button>
              <button type="button" className="nl-btn nl-btn--primary" disabled={!firstOk} onClick={() => go(2)}>Next</button>
            </>
          ) : (
            <button type="button" className="nl-btn nl-btn--primary" disabled={Boolean(missing) || busy} title={missing ?? undefined} onClick={() => void save()}>
              {busy ? "Saving…" : "Add to my diary"}
            </button>
          )}
        </FloatFoot>
      }
    >
      {done ? (
        <FloatDone title={title.trim()}>{done}</FloatDone>
      ) : step === 1 ? (
        <>
          <div className="nl-fs-choices is-row nl-na-starters">
            {STARTERS.map((st) => (
              <FloatChoice key={st} title={st} on={title === st} onClick={() => setTitle(st)} />
            ))}
          </div>
          <FloatCard>
            <label className="nl-fs-label" htmlFor="na-title">In your words</label>
            <input id="na-title" data-autofocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Team meeting at the Banbury office" className="nl-fs-input mt-1.5" />
            <label className="nl-fs-label mt-4" htmlFor="na-notes">Agenda or notes <em>(optional)</em></label>
            <textarea id="na-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={4000} placeholder="What it's about, who's going, anything to bring." className="nl-fs-input nl-na-notes mt-1.5" />
          </FloatCard>
        </>
      ) : (
        <>
          <FloatCard>
            <FloatCardHead title="When" />
            <div className="nl-na-when">
              <div>
                <span className="nl-fs-label">Day</span>
                <DateField value={date} onChange={setDate} min={todayIso} className="nl-na-date mt-1.5" placeholder="Choose the day" />
              </div>
              <label>
                <span className="nl-fs-label">Starts</span>
                <select value={time} onChange={(e) => setTime(e.target.value)} className="nl-fs-input mt-1.5">
                  {TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </div>
            <span className="nl-fs-label mt-4 block">How long</span>
            <div className="nl-na-lengths">
              {LENGTHS.map((l) => (
                <button key={l.mins} type="button" aria-pressed={mins === l.mins} className={mins === l.mins ? "is-on" : ""} onClick={() => setMins(l.mins)}>{l.label}</button>
              ))}
            </div>
          </FloatCard>
          <FloatCard>
            <FloatCardHead title="Where" aside="Optional" />
            <input value={where} onChange={(e) => setWhere(e.target.value)} maxLength={200} placeholder="An address, or Teams" className="nl-fs-input" />
            <label className="nl-fs-tick-row mt-4">
              <input type="checkbox" checked={outlook} onChange={(e) => setOutlook(e.target.checked)} />
              <span>
                <b>Put it in my Outlook calendar too</b>
                <small>Only yours. Nobody is invited or emailed.</small>
              </span>
            </label>
          </FloatCard>
        </>
      )}
    </FloatSheet>
  );
}
