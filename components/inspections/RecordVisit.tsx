"use client";

import { useEffect, useMemo, useState } from "react";
import { PressButton } from "@/components/Bits";
import type { Finding, Inspection } from "@/lib/inspections";
import { ANSWER_WORD, CHECKS, READINGS, asChecks, checksDone, type CheckAnswer, type Checks } from "@/lib/inspection-checks";

/**
 * RECORD THE VISIT (James, 3 Oct 2026: "...and then record it afterwards").
 *
 * The whole screen, room by room, the way the visit is walked: a list down
 * the side (the checks, every room, then the write-up), and one thing at a
 * time in the middle. A room is its condition, what was seen, the photos and
 * what happens next - saved as the room's "Overall" finding, so the report,
 * the landlord's email and the printout all carry it with no second copy.
 * Anything specific in a room ("extractor fan") is its own finding beneath.
 *
 * Works on a tablet or a phone in the property as well as at a desk: photos
 * open the camera where there is one.
 */

type Move = (body: unknown, label?: string) => Promise<boolean>;
type Cond = "good" | "fair" | "poor";

const OVERALL = "Overall";
const BASE_ROOMS = ["Outside", "Hallway", "Living room", "Kitchen", "Bathroom", "Bedroom 1", "Bedroom 2"];
const MORE_ROOMS = ["Bedroom 3", "Bedroom 4", "Dining room", "En-suite", "WC", "Utility", "Loft", "Garage", "Garden", "Communal areas", "Meters & alarms"];
const COND: Array<{ id: Cond; label: string; tone: string }> = [
  { id: "good", label: "Good", tone: "#2f7a48" },
  { id: "fair", label: "Fair", tone: "#a86c12" },
  { id: "poor", label: "Poor", tone: "#b3372b" },
];
const ACTIONS = [
  { id: "none", label: "Nothing needed" },
  { id: "monitor", label: "Watch it next time" },
  { id: "works_order", label: "Raise a works order" },
  { id: "tenant", label: "Tenant to put right" },
  { id: "landlord", label: "Landlord to put right" },
];

type Tab = { kind: "checks" } | { kind: "room"; room: string } | { kind: "writeup" };

export default function RecordVisit({
  inspection,
  findings,
  busy,
  onMove,
  onClose,
  startAt,
}: {
  inspection: Inspection;
  findings: Finding[];
  busy: boolean;
  onMove: Move;
  onClose: () => void;
  startAt?: "checks" | "writeup";
}) {
  const [added, setAdded] = useState<string[]>([]);
  const rooms = useMemo(() => {
    const base = inspection.kind === "hmo" ? [...BASE_ROOMS, "Communal areas"] : BASE_ROOMS;
    const seen = findings.map((f) => f.room).filter(Boolean);
    return [...new Set([...base, ...seen, ...added])];
  }, [inspection.kind, findings, added]);
  const [tab, setTab] = useState<Tab>(startAt === "writeup" ? { kind: "writeup" } : startAt === "checks" ? { kind: "checks" } : { kind: "room", room: rooms[0]! });
  const overallOf = (room: string) => findings.find((f) => f.room === room && f.item === OVERALL) ?? null;
  const done = rooms.filter((r) => overallOf(r)).length;
  const checks = asChecks(inspection.checks);

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

  const nextRoom = (room: string) => {
    const at = rooms.indexOf(room);
    setTab(at >= 0 && at < rooms.length - 1 ? { kind: "room", room: rooms[at + 1]! } : { kind: "writeup" });
  };

  const item = (on: boolean) =>
    `flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${on ? "bg-ink text-page" : "hover:bg-accent-soft/40"}`;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-page">
      {/* The top: where, how far through, and the way back. */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line/70 px-5 py-3">
        <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold">
          ← Back to the inspection
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Recording the visit · #{inspection.ref}</p>
          <p className="hand truncate text-[17px]">{inspection.propertyName}</p>
        </div>
        <p className="text-[12px] text-muted">
          {done} of {rooms.length} rooms · checks {checksDone(checks)} of {CHECKS.length}
        </p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        {/* The walk, down the side (along the top on a phone). */}
        <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line/70 p-3 md:w-64 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r">
          <button type="button" onClick={() => setTab({ kind: "checks" })} className={`${item(tab.kind === "checks")} shrink-0`}>
            <span>Safety &amp; checks</span>
            <span className="text-[11px] opacity-70">
              {checksDone(checks)}/{CHECKS.length}
            </span>
          </button>
          <p className="hidden px-3 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-wider text-muted md:block">Rooms</p>
          {rooms.map((r) => {
            const o = overallOf(r);
            const c = COND.find((x) => x.id === o?.condition);
            const on = tab.kind === "room" && tab.room === r;
            return (
              <button key={r} type="button" onClick={() => setTab({ kind: "room", room: r })} className={`${item(on)} shrink-0`}>
                <span className="truncate">{r}</span>
                {c ? <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: c.tone }} title={c.label} /> : <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-line" />}
              </button>
            );
          })}
          <AddRoom
            taken={rooms}
            onAdd={(r) => {
              setAdded((a) => [...a, r]);
              setTab({ kind: "room", room: r });
            }}
          />
          <button type="button" onClick={() => setTab({ kind: "writeup" })} className={`${item(tab.kind === "writeup")} shrink-0 md:mt-3`}>
            <span>Write it up</span>
            {inspection.reportedAt && <span className="text-[11px] opacity-70">done</span>}
          </button>
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl p-5 md:p-8">
            {tab.kind === "checks" ? (
              <ChecksPane key="checks" inspection={inspection} checks={checks} busy={busy} onMove={onMove} onNext={() => setTab({ kind: "room", room: rooms[0]! })} />
            ) : tab.kind === "room" ? (
              <RoomPane
                key={tab.room}
                inspection={inspection}
                room={tab.room}
                overall={overallOf(tab.room)}
                extras={findings.filter((f) => f.room === tab.room && f.item !== OVERALL)}
                busy={busy}
                onMove={onMove}
                onNext={() => nextRoom(tab.room)}
                isLast={rooms.indexOf(tab.room) === rooms.length - 1}
              />
            ) : (
              <WriteUp key="writeup" inspection={inspection} findings={findings} checks={checks} busy={busy} onMove={onMove} onClose={onClose} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddRoom({ taken, onAdd }: { taken: string[]; onAdd: (r: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const left = MORE_ROOMS.filter((r) => !taken.includes(r));
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold text-accent-dark hover:bg-accent-soft/40">
        + Add a room
      </button>
    );
  }
  return (
    <div className="shrink-0 space-y-1.5 rounded-xl border border-line/80 p-2">
      <div className="flex flex-wrap gap-1">
        {left.slice(0, 8).map((r) => (
          <button key={r} type="button" onClick={() => { onAdd(r); setOpen(false); }} className="rounded-full border border-line/80 px-2.5 py-1 text-[11.5px]">
            {r}
          </button>
        ))}
      </div>
      <div className="flex gap-1.5">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type one" className="min-w-0 flex-1 rounded-lg border border-line/80 bg-page px-2 py-1 text-[12px]" />
        <button
          type="button"
          disabled={!name.trim() || taken.includes(name.trim())}
          onClick={() => { onAdd(name.trim()); setName(""); setOpen(false); }}
          className="rounded-lg bg-ink px-2.5 text-[12px] font-semibold text-page disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** Photos onto R2 under the inspection, the same route the sheet's findings use. */
async function upload(inspectionId: string, files: FileList): Promise<{ key: string; name: string }[]> {
  const added: { key: string; name: string }[] = [];
  for (const file of Array.from(files)) {
    const body = new FormData();
    body.set("scope", "photo");
    body.set("ref", `inspection-${inspectionId}`);
    body.set("file", file);
    const j = await fetch("/api/r2/upload", { method: "POST", body }).then((r) => r.json());
    if (!j.ok) throw new Error(j.error ?? "That picture would not upload.");
    added.push({ key: j.key, name: file.name });
  }
  return added;
}

function Photos({ photos, onAdd, busy }: { photos: { key: string; name: string }[]; onAdd: (files: FileList) => Promise<void>; busy: boolean }) {
  const [up, setUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <a key={p.key} href={`/api/r2/file?key=${encodeURIComponent(p.key)}`} target="_blank" rel="noreferrer" title={p.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/r2/file?key=${encodeURIComponent(p.key)}`} alt={p.name} className="h-20 w-20 rounded-xl border border-line/60 object-cover" />
          </a>
        ))}
        <label className={`flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[11px] font-semibold ${busy || up ? "text-muted" : "cursor-pointer text-accent-dark"}`}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          </svg>
          {up ? "Uploading" : "Add photos"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            disabled={busy || up}
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files;
              e.currentTarget.value = "";
              if (!f?.length) return;
              setUp(true);
              setErr(null);
              try {
                await onAdd(f);
              } catch (x) {
                setErr(x instanceof Error ? x.message : "That picture would not upload.");
              } finally {
                setUp(false);
              }
            }}
          />
        </label>
      </div>
      {err && <p className="mt-1 text-[11.5px] text-accent-dark">{err}</p>}
    </div>
  );
}

function RoomPane({
  inspection,
  room,
  overall,
  extras,
  busy,
  onMove,
  onNext,
  isLast,
}: {
  inspection: Inspection;
  room: string;
  overall: Finding | null;
  extras: Finding[];
  busy: boolean;
  onMove: Move;
  onNext: () => void;
  isLast: boolean;
}) {
  const [cond, setCond] = useState<Cond | null>(overall?.condition ?? null);
  const [note, setNote] = useState(overall?.note ?? "");
  const [action, setAction] = useState(overall?.action ?? "none");
  const [photos, setPhotos] = useState(overall?.photos ?? []);
  const [saved, setSaved] = useState<boolean>(Boolean(overall));

  const save = async (after?: () => void) => {
    if (!cond) return;
    const ok = await onMove({ finding: { ...(overall ?? {}), room, item: OVERALL, condition: cond, note, action, photos } }, room);
    if (ok) {
      setSaved(true);
      after?.();
    }
  };

  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Room</p>
      <h2 className="hand mt-1 text-[28px]">{room}</h2>

      <p className="mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted">How is it kept?</p>
      <div className="grid grid-cols-3 gap-2">
        {COND.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setCond(c.id); setSaved(false); }}
            className="rounded-2xl border-2 px-3 py-3.5 text-[14px] font-semibold transition-colors"
            style={cond === c.id ? { borderColor: c.tone, background: `${c.tone}14`, color: c.tone } : { borderColor: "var(--line, #e5e0da)" }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted">What you saw</p>
      <textarea
        value={note}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        rows={3}
        placeholder="Clean and tidy. Small mark on the wall by the door…"
        className="w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13.5px]"
      />

      <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted">Photos</p>
      <Photos
        photos={photos}
        busy={busy}
        onAdd={async (files) => {
          const more = await upload(inspection.id, files);
          const next = [...photos, ...more];
          setPhotos(next);
          /* Saved straight away once the room has a condition, so a photo is
             never in storage with nothing on the record pointing at it. */
          if (cond) await onMove({ finding: { ...(overall ?? {}), room, item: OVERALL, condition: cond, note, action, photos: next } }, "Photo");
          else setSaved(false);
        }}
      />

      <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted">Anything to do?</p>
      <div className="flex flex-wrap gap-1.5">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => { setAction(a.id as Finding["action"]); setSaved(false); }}
            className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${action === a.id ? "bg-ink text-page" : "border border-line/80 text-muted"}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <PressButton disabled={busy || !cond} onClick={() => void save(onNext)} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
          {isLast ? "Save and write it up" : "Save and next room"}
        </PressButton>
        <PressButton disabled={busy || !cond} onClick={() => void save()} className="rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold">
          Save
        </PressButton>
        {!cond && <span className="text-[12px] text-muted">Pick how it&apos;s kept first.</span>}
        {cond && saved && <span className="text-[12px] text-muted">Saved.</span>}
      </div>

      {/* Something specific in this room, as its own line on the report. */}
      <Specific room={room} extras={extras} busy={busy} onMove={onMove} />
    </div>
  );
}

function Specific({ room, extras, busy, onMove }: { room: string; extras: Finding[]; busy: boolean; onMove: Move }) {
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState("");
  const [note, setNote] = useState("");
  const [cond, setCond] = useState<Cond>("fair");
  const [action, setAction] = useState("works_order");
  return (
    <section className="mt-8 border-t border-line/70 pt-5">
      <p className="text-[10.5px] font-bold uppercase tracking-wider text-muted">Something specific in {room.toLowerCase()}</p>
      {extras.length > 0 && (
        <ul className="mt-2 divide-y divide-line/50">
          {extras.map((f) => (
            <li key={f.id} className="flex items-start justify-between gap-3 py-2 text-[12.5px]">
              <span className="min-w-0">
                <span className="block font-semibold">{f.item || "Noted"}</span>
                {f.note && <span className="block text-muted">{f.note}</span>}
              </span>
              <span className="shrink-0 text-[11.5px] text-muted">
                {f.condition} · {ACTIONS.find((a) => a.id === f.action)?.label}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 text-[12.5px] font-semibold text-accent-dark underline">
          + Add something specific (a broken catch, a leak…)
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What - extractor fan, window catch…" className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What you saw." className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]" />
          <div className="flex flex-wrap gap-2">
            <select value={cond} onChange={(e) => setCond(e.target.value as Cond)} className="rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]">
              {COND.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value)} className="rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]">
              {ACTIONS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
            <PressButton
              disabled={busy || !what.trim()}
              onClick={async () => {
                if (await onMove({ finding: { room, item: what.trim(), note, condition: cond, action } }, "Finding")) {
                  setWhat("");
                  setNote("");
                  setOpen(false);
                }
              }}
              className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page"
            >
              Add it
            </PressButton>
            <button type="button" onClick={() => setOpen(false)} className="text-[12px] text-muted underline">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ChecksPane({ checks, busy, onMove, onNext }: { inspection: Inspection; checks: Checks; busy: boolean; onMove: Move; onNext: () => void }) {
  const [c, setC] = useState<Checks>(checks);
  const [saved, setSaved] = useState(false);
  const set = (id: string, answer: CheckAnswer) => {
    setC((x) => ({ ...x, answers: { ...x.answers, [id]: { ...(x.answers[id] ?? {}), answer } } }));
    setSaved(false);
  };
  const note = (id: string, text: string) => {
    setC((x) => ({ ...x, answers: { ...x.answers, [id]: { answer: x.answers[id]?.answer ?? "issue", note: text } } }));
    setSaved(false);
  };
  const save = async (after?: () => void) => {
    if (await onMove({ action: "checks", checks: c }, "Checks")) {
      setSaved(true);
      after?.();
    }
  };
  const pill = (on: boolean, tone: string) =>
    `rounded-full px-3 py-1.5 text-[12px] font-semibold ${on ? "text-page" : "border border-line/80 text-muted"}` + (on ? ` ${tone}` : "");

  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">On every visit</p>
      <h2 className="hand mt-1 text-[28px]">Safety &amp; Checks</h2>
      <p className="mt-1 text-[12.5px] text-muted">Each one is put so that Yes is the good answer. Not checked is fine - a blank would read as a pass.</p>

      <ul className="mt-5 divide-y divide-line/60 rounded-2xl border border-line/80 bg-panel">
        {CHECKS.map((d) => {
          const a = c.answers[d.id];
          return (
            <li key={d.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold">{d.label}</span>
                  {d.hint && <span className="block text-[11.5px] text-muted">{d.hint}</span>}
                </span>
                <span className="flex gap-1.5">
                  {(["ok", "issue", "na"] as const).map((ans) => (
                    <button
                      key={ans}
                      type="button"
                      onClick={() => set(d.id, ans)}
                      className={pill(a?.answer === ans, ans === "ok" ? "bg-[#2f7a48]" : ans === "issue" ? "bg-[#b3372b]" : "bg-[#7a6a64]")}
                    >
                      {ANSWER_WORD[ans]}
                    </button>
                  ))}
                </span>
              </div>
              {a?.answer === "issue" && (
                <input
                  value={a.note ?? ""}
                  onChange={(e) => note(d.id, e.target.value)}
                  placeholder="What's wrong, and where?"
                  className="mt-2 w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]"
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className="mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted">Meter readings, if you took them</p>
      <div className="grid grid-cols-3 gap-2">
        {READINGS.map((r) => (
          <label key={r.id} className="block">
            <span className="mb-1 block text-[11.5px] text-muted">{r.label}</span>
            <input
              value={c.readings[r.id] ?? ""}
              onChange={(e) => { setC((x) => ({ ...x, readings: { ...x.readings, [r.id]: e.target.value } })); setSaved(false); }}
              inputMode="numeric"
              className="w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]"
            />
          </label>
        ))}
      </div>

      <p className="mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted">What the tenant raised</p>
      <textarea
        value={c.tenantSays}
        onChange={(e) => { setC((x) => ({ ...x, tenantSays: e.target.value })); setSaved(false); }}
        rows={3}
        placeholder="Anything they mentioned on the day, in their words."
        className="w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13.5px]"
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <PressButton disabled={busy} onClick={() => void save(onNext)} className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40">
          Save and start the rooms
        </PressButton>
        <PressButton disabled={busy} onClick={() => void save()} className="rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold">
          Save
        </PressButton>
        {saved && <span className="text-[12px] text-muted">Saved.</span>}
      </div>
    </div>
  );
}

function WriteUp({ inspection, findings, checks, busy, onMove, onClose }: { inspection: Inspection; findings: Finding[]; checks: Checks; busy: boolean; onMove: Move; onClose: () => void }) {
  const poor = findings.filter((f) => f.condition === "poor").length;
  const fair = findings.filter((f) => f.condition === "fair").length;
  const issues = Object.values(checks.answers).filter((a) => a.answer === "issue").length;
  const guess: Cond = poor > 0 || issues > 1 ? "poor" : fair > 0 || issues > 0 ? "fair" : "good";
  const [cond, setCond] = useState<Cond>(inspection.condition ?? guess);
  const [summary, setSummary] = useState(inspection.summary);
  const toDo = findings.filter((f) => ["works_order", "tenant", "landlord"].includes(f.action)).length;

  return (
    <div>
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Last</p>
      <h2 className="hand mt-1 text-[28px]">Write It Up</h2>
      <p className="mt-1 text-[12.5px] text-muted">
        {findings.length} things recorded · {poor} poor · {fair} fair · {issues} check{issues === 1 ? "" : "s"} failed · {toDo} to put right
      </p>

      <p className="mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted">Overall, the property is</p>
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            ["good", "In good order"],
            ["fair", "Reasonable"],
            ["poor", "Not being kept"],
          ] as const
        ).map(([id, label]) => {
          const tone = COND.find((c) => c.id === id)!.tone;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setCond(id)}
              className="rounded-2xl border-2 px-3 py-3.5 text-[13.5px] font-semibold"
              style={cond === id ? { borderColor: tone, background: `${tone}14`, color: tone } : { borderColor: "var(--line, #e5e0da)" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted">For the landlord, in a few lines</p>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={5}
        placeholder="How the property is being kept, and anything they need to know."
        className="w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13.5px]"
      />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <PressButton
          disabled={busy || !summary.trim()}
          onClick={async () => {
            if (await onMove({ action: "report", condition: cond, summary }, "Write-up")) onClose();
          }}
          className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40"
        >
          {inspection.reportedAt ? "Save the write-up" : "Finish the record"}
        </PressButton>
        <span className="text-[12px] text-muted">Then send it to the landlord from the inspection.</span>
      </div>
    </div>
  );
}
