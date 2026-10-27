"use client";

import { useEffect, useState } from "react";
import type { Appt } from "@/lib/diary";
import { refreshDiary } from "@/lib/diary-store";
import { canCancelGeneral } from "@/components/CancelAppointment";
import FieldDate from "@/components/FieldDate";
import FieldSelect from "@/components/FieldSelect";
import FloatSheet, { FloatCard, FloatCardHead, FloatDone, FloatFoot } from "@/components/new-look/FloatSheet";

/**
 * EDIT A GENERAL APPOINTMENT (Richard Callow c9389089, 27 Oct 2026: "Please
 * add an edit button to amend appointments in the diary"). He had put "50
 * Bartlemas Road visit TBC" in with New appointment and, once it was settled,
 * could only cancel it and make it again.
 *
 * The same fields New appointment asks for - what it is, the agenda, the day,
 * the time, how long and where - read back from what is saved, in the new
 * look's floating boxes over whichever Diary it is opened from. Saved through
 * PATCH /api/appointments, which moves the Outlook entry with it. Only your
 * own, and only the OS's general entries: a viewing has Change time, an
 * appraisal Rearrange, and an entry made in Outlook or the old system is
 * changed where it was made.
 */
export function canEditGeneral(a: Appt): boolean {
  return canCancelGeneral(a) && Boolean(a.own);
}

const LENGTHS = [
  { mins: 15, label: "15 min" },
  { mins: 30, label: "30 min" },
  { mins: 45, label: "45 min" },
  { mins: 60, label: "1 hour" },
  { mins: 90, label: "1½ hours" },
  { mins: 120, label: "2 hours" },
  { mins: 180, label: "3 hours" },
  { mins: 240, label: "Half a day" },
];

const pad = (n: number) => String(n).padStart(2, "0");
/* 07:00 to 21:00 by the quarter hour, as New appointment offers. */
const TIMES = Array.from({ length: (21 - 7) * 4 + 1 }, (_, i) => `${pad(7 + Math.floor(i / 4))}:${pad((i % 4) * 15)}`);
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const lengthLabel = (m: number) => LENGTHS.find((l) => l.mins === m)?.label ?? (m % 60 ? `${Math.floor(m / 60) ? `${Math.floor(m / 60)} h ` : ""}${m % 60} min` : `${m / 60} hours`);

type Saved = { startsAt: string; mins: number; title: string; where: string; notes: string; inOutlook: boolean };

export default function EditAppointment({ appt, className, onDone }: { appt: Appt; className: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  if (!canEditGeneral(appt)) return null;
  return (
    <>
      <button type="button" data-steve="appointment.edit" onClick={() => setOpen(true)} className={className}>
        Edit
      </button>
      {open && <EditSheet appt={appt} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  );
}

function EditSheet({ appt, onClose, onDone }: { appt: Appt; onClose: () => void; onDone?: () => void }) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [loadSaid, setLoadSaid] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [day, setDay] = useState("");
  const [time, setTime] = useState("09:00");
  const [mins, setMins] = useState(60);
  const [where, setWhere] = useState("");
  const [outlook, setOutlook] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  /* What is saved now, not what the diary last drew: the diary leaves out an empty agenda. */
  useEffect(() => {
    let gone = false;
    fetch(`/api/appointments?id=${encodeURIComponent(appt.id)}`)
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string; appointment?: Saved }>)
      .then((j) => {
        if (gone) return;
        if (!j.ok || !j.appointment) return setLoadSaid(j.said ?? "Couldn't open it just now. Try again.");
        const a = j.appointment;
        const at = new Date(a.startsAt);
        setSaved(a);
        setTitle(a.title);
        setNotes(a.notes);
        setDay(ymd(at));
        setTime(`${pad(at.getHours())}:${pad(at.getMinutes())}`);
        setMins(a.mins);
        setWhere(a.where);
        setOutlook(a.inOutlook);
      })
      .catch(() => !gone && setLoadSaid("Couldn't open it just now. Try again."));
    return () => {
      gone = true;
    };
  }, [appt.id]);

  const todayIso = ymd(new Date());
  const wasPast = saved ? new Date(saved.startsAt).getTime() < Date.now() : false;
  /* A time or a length it was saved with that the lists don't carry (a booker's 20 minutes) stays choosable. */
  const times = TIMES.includes(time) || !time ? TIMES : [...TIMES, time].sort();
  const lengths = LENGTHS.some((l) => l.mins === mins) ? LENGTHS : [...LENGTHS, { mins, label: lengthLabel(mins) }].sort((a, b) => a.mins - b.mins);
  const missing = !title.trim() ? "Say what it is first." : !day ? "Pick the day." : null;

  async function save() {
    if (missing || busy || !saved) return;
    setBusy(true);
    setProblem(null);
    const [y, mo, d] = day.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    const j = await fetch("/api/appointments", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: appt.id,
        startsAt: new Date(y, mo - 1, d, hh, mm, 0, 0).toISOString(),
        mins,
        title: title.trim(),
        notes: notes.trim(),
        where: where.trim(),
        outlook,
      }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string }>)
      .catch(() => null);
    setBusy(false);
    if (!j?.ok) return setProblem(j?.said ?? "That didn't save. Try again.");
    await refreshDiary().catch(() => null);
    setDone(j.said ?? "Changed in your diary.");
  }

  const finish = () => {
    onClose();
    if (done) onDone?.();
  };

  return (
    <FloatSheet
      title="Edit Appointment"
      label="Edit appointment"
      onClose={finish}
      dismissible={!busy}
      screenKey={done ? "done" : saved ? "form" : "load"}
      question={done ? undefined : appt.what || "Your appointment"}
      lede={done ? undefined : "Change what it is, when, how long or where. Nobody is invited or emailed."}
      foot={
        <FloatFoot left={problem ? <p className="nl-fs-err" role="alert">{problem}</p> : undefined}>
          {done ? (
            <button type="button" className="nl-btn nl-btn--primary" onClick={finish}>Done</button>
          ) : (
            <>
              <button type="button" className="nl-btn nl-btn--secondary" disabled={busy} onClick={onClose}>Cancel</button>
              <button type="button" className="nl-btn nl-btn--primary" disabled={!saved || Boolean(missing) || busy} title={missing ?? undefined} onClick={() => void save()}>
                {busy ? "Saving…" : "Save changes"}
              </button>
            </>
          )}
        </FloatFoot>
      }
    >
      {done ? (
        <FloatDone title={title.trim()}>{done}</FloatDone>
      ) : !saved ? (
        <FloatCard>
          {loadSaid ? (
            <p className="nl-fs-err" role="alert">{loadSaid}</p>
          ) : (
            <p className="nl-fs-hint flex items-center gap-2" role="status">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
              Opening the appointment…
            </p>
          )}
        </FloatCard>
      ) : (
        <>
          <FloatCard>
            <FloatCardHead title="What It Is" />
            <label className="nl-fs-label" htmlFor="ea-title">Name</label>
            <input id="ea-title" data-autofocus className="nl-fs-input mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} placeholder="Team meeting at the Banbury office" />
            <label className="nl-fs-label mt-3" htmlFor="ea-notes">Agenda or notes <em>(optional)</em></label>
            <textarea id="ea-notes" className="nl-fs-input mt-1" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} placeholder="What it's about, who's going, anything to bring." />
          </FloatCard>

          <FloatCard>
            <FloatCardHead title="When" />
            <div className="nl-fs-cols">
              <div className="is-wide">
                <span className="nl-fs-label">Day</span>
                <FieldDate className="mt-1" value={day} onChange={setDay} min={wasPast ? undefined : todayIso} />
              </div>
              <div>
                <span className="nl-fs-label">Starts</span>
                <FieldSelect className="mt-1" value={time} onChange={setTime} options={times.map((t) => ({ value: t, label: t }))} />
              </div>
              <div>
                <span className="nl-fs-label">How long</span>
                <FieldSelect className="mt-1" value={String(mins)} onChange={(v) => setMins(Number(v))} options={lengths.map((l) => ({ value: String(l.mins), label: l.label }))} />
              </div>
            </div>
          </FloatCard>

          <FloatCard>
            <FloatCardHead title="Where" aside="Optional" />
            <input id="ea-where" aria-label="Where" className="nl-fs-input" value={where} onChange={(e) => setWhere(e.target.value)} maxLength={200} placeholder="An address, or Teams" />
          </FloatCard>

          {saved.inOutlook ? (
            <FloatCard>
              <p className="nl-fs-hint" style={{ marginTop: 0 }}>It's in your Outlook calendar, so that entry changes with it.</p>
            </FloatCard>
          ) : (
            <label className={`nl-fs-card nl-fs-tick-row${outlook ? " is-on" : ""}`}>
              <input type="checkbox" checked={outlook} onChange={(e) => setOutlook(e.target.checked)} />
              <span>
                <b>Put it in my Outlook calendar too</b>
                <small>It isn't there now. Nobody is invited or emailed.</small>
              </span>
            </label>
          )}
        </>
      )}
    </FloatSheet>
  );
}
