"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PressButton } from "@/components/Bits";
import type { Finding, Inspection } from "@/lib/inspections";
import { CHECKS, READINGS, asChecks, type CheckAnswer } from "@/lib/inspection-checks";
import { canRead, type ReadAction, type ReadCondition, type ReadState, type ReportRead } from "@/lib/visit-report";

/**
 * THE UPLOADED REPORT ON ONE SIDE, OUR BOXES ON THE OTHER (James, 12 Nov 2026).
 *
 * "Maybe it should be like a side-by-side where they'll see their uploaded
 * version on one side of the screen, and they can scroll on that. They can
 * also see our version, so they can just copy and paste the info over if it's
 * missed it for whatever reason."
 *
 * The report (made in Inventory Base, say) scrolls on the left. On the right
 * are the same boxes a visit written up here has - the day, who went, the
 * overall condition and summary, the checks, the meters, what the tenant
 * raised, and each room. The reader fills what it finds; every box says
 * whether it came from the report or was not found, and every box can be
 * changed. Nothing touches the visit until "Save onto the visit", which saves
 * through the visit's own route exactly as a visit recorded here does - so
 * the printed report, the landlord's email and the works orders all read it
 * with no second copy.
 *
 * A box already filled on the visit keeps what it has: the reader only fills
 * what is empty and has not been typed in.
 */

type Move = (body: unknown, label?: string) => Promise<boolean>;
type Mark = "found" | "missing" | "typed" | "held";

const OVERALL = "Overall";
const COND: Array<{ id: ReadCondition; label: string; tone: string }> = [
  { id: "good", label: "Good", tone: "#2f7a48" },
  { id: "fair", label: "Fair", tone: "#a86c12" },
  { id: "poor", label: "Poor", tone: "#b3372b" },
];
const ACTIONS: Array<{ id: ReadAction; label: string }> = [
  { id: "none", label: "Nothing needed" },
  { id: "monitor", label: "Watch it next time" },
  { id: "works_order", label: "Raise a works order" },
  { id: "tenant", label: "Tenant to put right" },
  { id: "landlord", label: "Landlord to put right" },
];
const ANSWERS: Array<{ id: CheckAnswer; label: string }> = [
  { id: "ok", label: "Yes" },
  { id: "issue", label: "No" },
  { id: "na", label: "Not checked" },
];

type ItemBox = { uid: string; id?: string; item: string; condition: ReadCondition; note: string; action: ReadAction; photos: { key: string; name: string }[] };
type RoomBox = { uid: string; id?: string; room: string; condition: ReadCondition | null; note: string; action: ReadAction; photos: { key: string; name: string }[]; items: ItemBox[]; mark: Mark };

let seq = 0;
const uid = () => `b${++seq}`;
const localDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};
const today = () => localDay(new Date().toISOString());

function roomsFrom(findings: Finding[]): RoomBox[] {
  const names = [...new Set(findings.map((f) => f.room).filter(Boolean))];
  return names.map((room) => {
    const o = findings.find((f) => f.room === room && f.item === OVERALL);
    return {
      uid: uid(),
      id: o?.id,
      room,
      condition: o?.condition ?? null,
      note: o?.note ?? "",
      action: (o?.action ?? "none") as ReadAction,
      photos: o?.photos ?? [],
      mark: "held" as Mark,
      items: findings
        .filter((f) => f.room === room && f.item !== OVERALL)
        .map((f) => ({ uid: uid(), id: f.id, item: f.item, condition: f.condition, note: f.note, action: f.action as ReadAction, photos: f.photos ?? [] })),
    };
  });
}

function Chip({ mark }: { mark: Mark | undefined }) {
  if (!mark || mark === "typed" || mark === "held") return null;
  return mark === "found" ? (
    <span className="rounded-full bg-[#2f7a48]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#2f7a48]">From the report</span>
  ) : (
    <span className="rounded-full bg-[#a86c12]/10 px-2 py-0.5 text-[10.5px] font-semibold text-[#a86c12]">Not found</span>
  );
}

const field = "w-full rounded-xl border border-line/80 bg-white px-3 py-2 text-[13px] outline-none focus:border-ink";
const label = "text-[10.5px] font-bold uppercase tracking-wider text-muted";

export default function ReportFromUpload({
  inspection,
  findings,
  fileKey,
  me,
  busy,
  onMove,
  onClose,
}: {
  inspection: Inspection;
  findings: Finding[];
  /** The file to show and read; the first readable one on the visit when not given. */
  fileKey?: string | null;
  me: string;
  busy: boolean;
  onMove: Move;
  onClose: () => void;
}) {
  const files = inspection.files ?? [];
  const [key, setKey] = useState<string>(() => fileKey ?? files.find((f) => canRead(f.type, f.name))?.key ?? files[0]?.key ?? "");
  const file = files.find((f) => f.key === key) ?? null;
  const readable = file ? canRead(file.type, file.name) : false;
  const isPdf = file ? /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) : false;

  /* ── Our boxes, opening with whatever the visit already holds. ── */
  const held = asChecks(inspection.checks);
  const [day, setDay] = useState(localDay(inspection.visitedAt));
  const [who, setWho] = useState(inspection.inspector || "");
  const [condition, setCondition] = useState<ReadCondition | null>(inspection.condition ?? null);
  const [summary, setSummary] = useState(inspection.summary || "");
  const [answers, setAnswers] = useState<Record<string, { answer: CheckAnswer; note?: string }>>(held.answers);
  const [readings, setReadings] = useState<Record<string, string>>(held.readings);
  const [tenantSays, setTenantSays] = useState(held.tenantSays);
  const [rooms, setRooms] = useState<RoomBox[]>(() => roomsFrom(findings));
  const [marks, setMarks] = useState<Record<string, Mark>>({});
  const touched = useRef<Set<string>>(new Set());
  const touch = (k: string) => {
    touched.current.add(k);
    setMarks((m) => (m[k] && m[k] !== "typed" ? { ...m, [k]: "typed" } : m));
  };

  /* ── The read: where it has got to, asked for until it is done. ── */
  const [state, setState] = useState<ReadState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /* Bumped when a read is started, so the asking begins again. */
  const [tick, setTick] = useState(0);
  const filled = useRef<string | null>(null);

  const fill = useCallback((r: ReportRead, stamp: string) => {
    if (filled.current === stamp) return;
    filled.current = stamp;
    const next: Record<string, Mark> = {};
    const free = (k: string, has: boolean) => !touched.current.has(k) && !has;
    const set = (k: string, has: boolean, value: unknown, put: () => void) => {
      if (!free(k, has)) return;
      if (value) {
        put();
        next[k] = "found";
      } else next[k] = "missing";
    };
    set("day", Boolean(inspection.visitedAt), r.visitDate && r.visitDate <= today() ? r.visitDate : "", () => setDay(r.visitDate));
    /* Before the visit is marked done, the name on it is who it was booked for; the report says who went. */
    set("who", Boolean(inspection.inspector) && Boolean(inspection.visitedAt), r.inspector, () => setWho(r.inspector));
    set("condition", Boolean(inspection.condition), r.condition, () => setCondition(r.condition));
    set("summary", Boolean(inspection.summary), r.summary, () => setSummary(r.summary));
    set("tenantSays", Boolean(held.tenantSays), r.tenantSays, () => setTenantSays(r.tenantSays));
    for (const c of CHECKS) set(`check:${c.id}`, Boolean(held.answers[c.id]), r.checks[c.id], () => setAnswers((a) => ({ ...a, [c.id]: r.checks[c.id]! })));
    for (const d of READINGS) set(`reading:${d.id}`, Boolean((held.readings[d.id] ?? "").trim()), r.readings[d.id], () => setReadings((x) => ({ ...x, [d.id]: r.readings[d.id]! })));
    setMarks((m) => ({ ...m, ...next }));
    /* Rooms the visit does not hold yet come in from the report; one it holds is left as it is. */
    setRooms((was) => {
      const have = new Set(was.map((x) => x.room.toLowerCase()));
      const add = r.rooms
        .filter((x) => !have.has(x.room.toLowerCase()))
        .map((x) => ({
          uid: uid(),
          room: x.room,
          condition: x.condition,
          note: x.note,
          action: x.action,
          photos: [],
          mark: "found" as Mark,
          items: x.items.map((it) => ({ uid: uid(), item: it.item, condition: it.condition, note: it.note, action: it.action, photos: [] })),
        }));
      return [...was, ...add];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ask = () =>
      fetch(`/api/inspections/${inspection.id}/read`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; read?: ReadState | null }) => {
          if (gone) return;
          setLoaded(true);
          const st = j?.read ?? null;
          setState(st);
          if (st?.status === "done" && st.read && st.key === key) fill(st.read, `${st.key}:${st.finishedAt ?? ""}`);
          if (st?.status === "reading") timer = setTimeout(ask, 3000);
        })
        .catch(() => {
          if (!gone) timer = setTimeout(ask, 5000);
        });
    void ask();
    return () => {
      gone = true;
      if (timer) clearTimeout(timer);
    };
  }, [inspection.id, key, fill, tick]);

  const startRead = async () => {
    if (!file) return;
    setProblem(null);
    const j = await fetch(`/api/inspections/${inspection.id}/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key: file.key }) })
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.ok) {
      setProblem(j?.error ?? "The report could not be read just now.");
      return;
    }
    filled.current = null;
    setState(j.read);
    setTick((t) => t + 1);
  };

  /* Read it as soon as the screen opens, unless this file has been read already. */
  const began = useRef(false);
  useEffect(() => {
    if (!loaded || began.current || !readable) return;
    began.current = true;
    if (!state || state.key !== key) void startRead();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, readable, key]);

  /* Escape closes, and the page under it stays still. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);

  const reading = state?.status === "reading" && state.key === key;
  const done = state?.status === "done" && state.key === key;
  const failed = state?.status === "failed" && state.key === key;
  const counted = useMemo(() => {
    const all = Object.values(marks);
    return { found: all.filter((m) => m === "found").length + rooms.filter((r) => r.mark === "found").length, missing: all.filter((m) => m === "missing").length };
  }, [marks, rooms]);

  /* ── Saving: through the visit's own route, one thing at a time. ── */
  const [saving, setSaving] = useState<string | null>(null);
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const kept = rooms.filter((r) => r.room.trim());
  const noCond = kept.find((r) => !r.condition);
  const cant = !day
    ? "Put in the day the visit was made."
    : day > today()
      ? "That day hasn't happened yet."
      : !condition
        ? "Choose the overall condition."
        : !summary.trim()
          ? "Write a line or two for the summary."
          : noCond
            ? `Choose a condition for ${noCond.room}, or remove it.`
            : null;

  async function save() {
    if (cant || saving) return;
    setSaveErr(null);
    const step = async (say: string, body: unknown, name: string) => {
      setSaving(say);
      if (!(await onMove(body, name))) throw new Error("That didn't save. Nothing after it has been saved; try again.");
    };
    try {
      if (!inspection.visitedAt || localDay(inspection.visitedAt) !== day || (who.trim() && who.trim() !== inspection.inspector)) {
        await step("Recording the visit…", { action: "visited", at: new Date(`${day}T12:00:00`).toISOString(), inspector: who.trim() || undefined }, "Visit");
      }
      await step("Saving the checks…", { action: "checks", checks: { answers, readings, tenantSays } }, "Checks");
      for (const [n, r] of kept.entries()) {
        const say = `Saving room ${n + 1} of ${kept.length}…`;
        await step(say, { finding: { ...(r.id ? { id: r.id } : {}), room: r.room.trim(), item: OVERALL, condition: r.condition, note: r.note.trim(), action: r.action, photos: r.photos } }, r.room);
        for (const it of r.items.filter((x) => x.item.trim())) {
          await step(say, { finding: { ...(it.id ? { id: it.id } : {}), room: r.room.trim(), item: it.item.trim(), condition: it.condition, note: it.note.trim(), action: it.action, photos: it.photos } }, r.room);
        }
      }
      await step("Writing it up…", { action: "report", condition, summary: summary.trim() }, "Write-up");
      if (file) await step("Finishing…", { action: "note", text: `Filled in from ${file.name} and checked beside it.` }, "Note");
      await fetch(`/api/inspections/${inspection.id}/read`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ applied: true }) }).catch(() => null);
      setSaving(null);
      onClose();
    } catch (e) {
      setSaving(null);
      setSaveErr(e instanceof Error ? e.message : "That didn't save.");
    }
  }

  /* ── On a phone the two sides are two tabs. ── */
  const [side, setSide] = useState<"report" | "ours">("ours");
  const setRoom = (id: string, patch: Partial<RoomBox>) => setRooms((was) => was.map((r) => (r.uid === id ? { ...r, ...patch, mark: r.mark === "held" ? "held" : "typed" } : r)));
  const setItem = (roomId: string, itemId: string, patch: Partial<ItemBox>) =>
    setRooms((was) => was.map((r) => (r.uid === roomId ? { ...r, items: r.items.map((it) => (it.uid === itemId ? { ...it, ...patch } : it)) } : r)));

  const chipBtn = (on: boolean) => `rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${on ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40"}`;
  const condBtns = (value: ReadCondition | null, pick: (c: ReadCondition) => void, small = false) => (
    <div className={`grid grid-cols-3 gap-1.5 ${small ? "max-w-[260px]" : ""}`}>
      {COND.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={value === c.id}
          onClick={() => pick(c.id)}
          className={`rounded-xl border-2 px-2 ${small ? "py-1.5 text-[12px]" : "py-2.5 text-[13px]"} font-semibold transition-colors`}
          style={value === c.id ? { borderColor: c.tone, background: `${c.tone}14`, color: c.tone } : { borderColor: "var(--line, #e5e0da)" }}
        >
          {c.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-page" data-report-from-upload>
      {/* The top: where, which file, and the way back. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-4 py-3 md:px-5">
        <button type="button" onClick={onClose} disabled={Boolean(saving)} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold">
          ← Back to the inspection
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Fill it in from the report · #{inspection.ref}</p>
          <p className="hand truncate text-[17px]">{inspection.propertyName}</p>
        </div>
        {files.length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-muted">
            Report
            <select
              value={key}
              onChange={(e) => { began.current = false; filled.current = null; setKey(e.target.value); }}
              className="max-w-[220px] rounded-lg border border-line/80 bg-white px-2 py-1.5 text-[12px] text-ink"
            >
              {files.map((f) => (
                <option key={f.key} value={f.key}>{f.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {/* Phone: one side at a time. */}
      <div className="flex gap-1 border-b border-line/70 p-2 md:hidden" role="tablist" aria-label="Report or our version">
        {(["ours", "report"] as const).map((s) => (
          <button key={s} type="button" role="tab" aria-selected={side === s} onClick={() => setSide(s)} className={`flex-1 rounded-xl px-3 py-2 text-[13px] font-semibold ${side === s ? "bg-ink text-page" : "text-muted"}`}>
            {s === "ours" ? "Our version" : "The report"}
          </button>
        ))}
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* ── Their report. ── */}
        <div className={`min-h-0 flex-1 flex-col border-line/70 bg-[#f1ede8] md:flex md:border-r ${side === "report" ? "flex" : "hidden"}`}>
          <div className="flex items-center justify-between gap-3 px-4 py-2 text-[11.5px] text-muted">
            <span className="min-w-0 truncate">{file ? file.name : "No report on this visit yet"}</span>
            {file && (
              <a href={`/api/r2/file?key=${encodeURIComponent(file.key)}`} target="_blank" rel="noopener noreferrer" className="shrink-0 font-semibold text-accent-dark underline">
                Open on its own
              </a>
            )}
          </div>
          {file ? (
            isPdf ? (
              <iframe title={file.name} src={`/api/r2/file?key=${encodeURIComponent(file.key)}#navpanes=0&view=FitH`} className="min-h-0 w-full flex-1 border-0 bg-white" />
            ) : (
              <div className="min-h-0 flex-1 overflow-auto p-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/r2/file?key=${encodeURIComponent(file.key)}`} alt={file.name} className="mx-auto max-w-full rounded-lg border border-line/60 bg-white" />
              </div>
            )
          ) : (
            <p className="p-6 text-[12.5px] text-muted">Add the report on the visit first, under Report and files.</p>
          )}
        </div>

        {/* ── Our version. ── */}
        <div className={`min-h-0 flex-1 overflow-y-auto md:block ${side === "ours" ? "block" : "hidden"}`}>
          <div className="mx-auto max-w-2xl space-y-6 p-4 pb-28 md:p-6 md:pb-28">
            {/* Where the reading has got to. */}
            <div className="rounded-2xl border border-line/60 bg-white p-4" aria-live="polite">
              {!file ? (
                <p className="text-[12.5px] text-muted">There is no report on this visit to read.</p>
              ) : !readable ? (
                <p className="text-[12.5px]">This kind of file can&apos;t be read automatically. It is open beside these boxes, so they can be filled in from it.</p>
              ) : reading || (!loaded && !state) ? (
                <p className="flex items-start gap-2.5 text-[12.5px]">
                  <span aria-hidden className="mt-0.5 inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-line border-t-ink" />
                  <span>
                    <span className="font-semibold">Reading the report…</span> A long report with photos takes a minute or two. The boxes fill in when it is done, and can be filled in by hand in the meantime.
                  </span>
                </p>
              ) : failed ? (
                <div className="text-[12.5px]">
                  <p className="font-semibold text-accent-dark">{state?.error ?? "The report could not be read."}</p>
                  <button type="button" onClick={() => void startRead()} className="mt-2 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold">Read it again</button>
                </div>
              ) : done ? (
                <div className="text-[12.5px]">
                  <p>
                    <span className="font-semibold">Read.</span> {counted.found} {counted.found === 1 ? "box" : "boxes"} filled from the report{counted.missing ? `, ${counted.missing} not found and left for you` : ""}. Check each against the report before saving: nothing is on the visit yet.
                  </p>
                  {state?.read?.notes && <p className="mt-1.5 text-muted">{state.read.notes}</p>}
                  <button type="button" onClick={() => void startRead()} className="mt-2 text-[11.5px] text-muted underline">Read it again</button>
                </div>
              ) : (
                <button type="button" onClick={() => void startRead()} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page">Read the report</button>
              )}
              {problem && <p className="mt-2 text-[12px] text-accent-dark">{problem}</p>}
            </div>

            {/* The visit. */}
            <section>
              <h3 className="hand text-[20px]">The Visit</h3>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="flex items-center justify-between gap-2"><span className={label}>The day it was done</span><Chip mark={marks.day} /></span>
                  <input type="date" value={day} max={today()} onChange={(e) => { setDay(e.target.value); touch("day"); }} className={`${field} mt-1`} />
                </label>
                <label className="block">
                  <span className="flex items-center justify-between gap-2"><span className={label}>Who went</span><Chip mark={marks.who} /></span>
                  <input value={who} maxLength={80} placeholder={me || "Their name"} onChange={(e) => { setWho(e.target.value); touch("who"); }} className={`${field} mt-1`} />
                </label>
              </div>
            </section>

            {/* Overall. */}
            <section>
              <h3 className="hand text-[20px]">Overall</h3>
              <div className="mt-3 flex items-center justify-between gap-2"><span className={label}>Condition</span><Chip mark={marks.condition} /></div>
              <div className="mt-1.5">{condBtns(condition, (c) => { setCondition(c); touch("condition"); })}</div>
              <div className="mt-4 flex items-center justify-between gap-2"><span className={label}>Summary for the landlord</span><Chip mark={marks.summary} /></div>
              <textarea value={summary} rows={4} maxLength={1500} placeholder="A few lines on how the home is being kept." onChange={(e) => { setSummary(e.target.value); touch("summary"); }} className={`${field} mt-1.5`} />
            </section>

            {/* Checks. */}
            <section>
              <h3 className="hand text-[20px]">Safety and Checks</h3>
              <ul className="mt-3 space-y-3">
                {CHECKS.map((c) => {
                  const a = answers[c.id];
                  return (
                    <li key={c.id} className="rounded-2xl border border-line/60 bg-white p-3.5">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-semibold">{c.label}</p>
                        <Chip mark={marks[`check:${c.id}`]} />
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {ANSWERS.map((x) => (
                          <button key={x.id} type="button" aria-pressed={a?.answer === x.id} onClick={() => { setAnswers((was) => ({ ...was, [c.id]: { answer: x.id, note: was[c.id]?.note ?? "" } })); touch(`check:${c.id}`); }} className={chipBtn(a?.answer === x.id)}>
                            {x.label}
                          </button>
                        ))}
                        {a && (
                          <button type="button" onClick={() => { setAnswers((was) => { const n = { ...was }; delete n[c.id]; return n; }); touch(`check:${c.id}`); }} className="px-2 text-[11.5px] text-muted underline">
                            Clear
                          </button>
                        )}
                      </div>
                      {a && (
                        <input value={a.note ?? ""} maxLength={300} placeholder="A note, if there is one" onChange={(e) => { setAnswers((was) => ({ ...was, [c.id]: { ...was[c.id]!, note: e.target.value } })); touch(`check:${c.id}`); }} className={`${field} mt-2`} />
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {READINGS.map((r) => (
                  <label key={r.id} className="block">
                    <span className="flex items-center justify-between gap-2"><span className={label}>{r.label}</span><Chip mark={marks[`reading:${r.id}`]} /></span>
                    <input value={readings[r.id] ?? ""} maxLength={40} placeholder="Reading" onChange={(e) => { setReadings((was) => ({ ...was, [r.id]: e.target.value })); touch(`reading:${r.id}`); }} className={`${field} mt-1`} />
                  </label>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between gap-2"><span className={label}>What the tenant raised</span><Chip mark={marks.tenantSays} /></div>
              <textarea value={tenantSays} rows={2} maxLength={1000} placeholder="In their words, if they raised anything" onChange={(e) => { setTenantSays(e.target.value); touch("tenantSays"); }} className={`${field} mt-1.5`} />
            </section>

            {/* Rooms. */}
            <section>
              <div className="flex items-end justify-between gap-3">
                <h3 className="hand text-[20px]">Rooms</h3>
                <p className="text-[11.5px] text-muted">{rooms.length} {rooms.length === 1 ? "room" : "rooms"}</p>
              </div>
              {rooms.length === 0 && <p className="mt-2 text-[12.5px] text-muted">{reading ? "Rooms appear here when the report has been read." : "None yet. Add each room the report covers."}</p>}
              <ul className="mt-3 space-y-3">
                {rooms.map((r) => (
                  <li key={r.uid} className="rounded-2xl border border-line/60 bg-white p-3.5" data-room>
                    <div className="flex items-center gap-2">
                      <input value={r.room} maxLength={60} aria-label="Room" onChange={(e) => setRoom(r.uid, { room: e.target.value })} className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[14px] font-semibold outline-none hover:border-line/80 focus:border-ink" />
                      <Chip mark={r.mark} />
                      <button type="button" onClick={() => setRooms((was) => was.filter((x) => x.uid !== r.uid))} disabled={Boolean(r.id)} title={r.id ? "Already saved on the visit" : "Leave this room out"} className="text-[11.5px] text-muted underline disabled:no-underline disabled:opacity-40">
                        Remove
                      </button>
                    </div>
                    <div className="mt-2">{condBtns(r.condition, (c) => setRoom(r.uid, { condition: c }), true)}</div>
                    <textarea value={r.note} rows={2} maxLength={800} placeholder="What the report says about it" onChange={(e) => setRoom(r.uid, { note: e.target.value })} className={`${field} mt-2`} />
                    <select value={r.action} aria-label="Anything to do" onChange={(e) => setRoom(r.uid, { action: e.target.value as ReadAction })} className={`${field} mt-2`}>
                      {ACTIONS.map((a) => (
                        <option key={a.id} value={a.id}>{a.label}</option>
                      ))}
                    </select>
                    {r.items.map((it) => (
                      <div key={it.uid} className="mt-3 rounded-xl border border-line/50 bg-page p-3">
                        <div className="flex items-center gap-2">
                          <input value={it.item} maxLength={80} placeholder="What it is" aria-label="Item" onChange={(e) => setItem(r.uid, it.uid, { item: e.target.value })} className={`${field} flex-1`} />
                          <button type="button" disabled={Boolean(it.id)} onClick={() => setRooms((was) => was.map((x) => (x.uid === r.uid ? { ...x, items: x.items.filter((y) => y.uid !== it.uid) } : x)))} className="text-[11.5px] text-muted underline disabled:no-underline disabled:opacity-40">
                            Remove
                          </button>
                        </div>
                        <div className="mt-2">{condBtns(it.condition, (c) => setItem(r.uid, it.uid, { condition: c }), true)}</div>
                        <input value={it.note} maxLength={500} placeholder="What needs doing" onChange={(e) => setItem(r.uid, it.uid, { note: e.target.value })} className={`${field} mt-2`} />
                        <select value={it.action} aria-label="Who puts it right" onChange={(e) => setItem(r.uid, it.uid, { action: e.target.value as ReadAction })} className={`${field} mt-2`}>
                          {ACTIONS.map((a) => (
                            <option key={a.id} value={a.id}>{a.label}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button type="button" onClick={() => setRooms((was) => was.map((x) => (x.uid === r.uid ? { ...x, items: [...x.items, { uid: uid(), item: "", condition: "fair", note: "", action: "works_order", photos: [] }] } : x)))} className="mt-2 text-[11.5px] font-semibold text-accent-dark underline">
                      Add something that needs doing in this room
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setRooms((was) => [...was, { uid: uid(), room: "", condition: null, note: "", action: "none", photos: [], items: [], mark: "typed" }])} className="mt-3 rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold">
                Add a room
              </button>
            </section>
          </div>
        </div>
      </div>

      {/* Save: always in reach, and says what is stopping it. */}
      {/* Room on the right for the floating help button, which sits over every screen. */}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line/70 bg-page py-3 pl-4 pr-20 md:pl-5 md:pr-24">
        <p className="min-w-0 flex-1 text-[12px] text-muted" aria-live="polite">
          {saveErr ? <span className="text-accent-dark">{saveErr}</span> : saving ? saving : cant ?? <span className="hidden sm:inline">Saves onto the visit as written up. The landlord is not emailed until you send the report.</span>}
        </p>
        <PressButton onClick={() => void save()} disabled={Boolean(cant) || Boolean(saving) || busy} className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
          {saving && <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" />}
          Save onto the visit
        </PressButton>
      </div>
    </div>
  );
}
