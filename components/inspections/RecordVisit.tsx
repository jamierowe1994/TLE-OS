"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { PressButton } from "@/components/Bits";
import type { Finding, Inspection } from "@/lib/inspections";
import { ANSWER_WORD, CHECKS, READINGS, asChecks, checksDone, type CheckAnswer, type Checks } from "@/lib/inspection-checks";
import { uploadVisitPhotos } from "@/lib/visit-photos";

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
 * Works on a tablet or a phone in the property as well as at a desk: on a
 * phone the photo button offers the camera or the photo library (it used to
 * force the camera, so photos already taken could not be added; 23 Nov 2026).
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

/* The new look (the "inspections" switch, lib/new-look): the same screen and
   the same saves, drawn in the house style (app/new-look/visit.css, prefix
   nl-vr-). Every class is named twice, old then new, so neither look can
   drift from the other's behaviour. */
const Nl = createContext(false);
function useLook() {
  const nl = useContext(Nl);
  return { nl, k: (old: string, nw: string) => (nl ? nw : old) };
}

type Tab = { kind: "checks" } | { kind: "room"; room: string } | { kind: "writeup" };

export default function RecordVisit({
  inspection,
  findings,
  busy,
  onMove,
  onClose,
  startAt,
  look,
}: {
  inspection: Inspection;
  findings: Finding[];
  busy: boolean;
  onMove: Move;
  onClose: () => void;
  startAt?: "checks" | "writeup";
  /** "new" draws the house style; the board passes it when the Inspections switch is on. */
  look?: "new";
}) {
  const nl = look === "new";
  const k = (old: string, nw: string) => (nl ? nw : old);
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

  /* On a phone the walk runs along the top: keep where you are in view. */
  const here = tab.kind === "room" ? tab.room : tab.kind;
  useEffect(() => {
    if (!nl) return;
    document.querySelector(".nl-vr-step.is-on")?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [nl, here]);

  const nextRoom = (room: string) => {
    const at = rooms.indexOf(room);
    setTab(at >= 0 && at < rooms.length - 1 ? { kind: "room", room: rooms[at + 1]! } : { kind: "writeup" });
  };

  const item = (on: boolean) =>
    nl ? `nl-vr-step${on ? " is-on" : ""}` :
    `flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left text-[13px] transition-colors ${on ? "bg-ink text-page" : "hover:bg-accent-soft/40"}`;

  return (
    <Nl.Provider value={nl}>
    <div data-look={nl ? "new" : undefined} className={k("fixed inset-0 z-[60] flex flex-col bg-page", "nl-vr nl-edge")}>
      {/* The top: where, how far through, and the way back. */}
      <div className={k("flex flex-wrap items-center gap-3 border-b border-line/70 px-5 py-3", "nl-vr-top")}>
        <button type="button" onClick={onClose} className={k("rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold", "nl-btn nl-btn--secondary nl-btn--sm")}>
          ← Back to the inspection
        </button>
        <div className={k("min-w-0 flex-1", "nl-vr-where")}>
          <p className={k("text-[9.5px] font-bold uppercase tracking-wider text-muted", "nl-eyebrow")}>Recording the visit · #{inspection.ref}</p>
          <p className={k("hand truncate text-[17px]", "nl-vr-home")}>{inspection.propertyName}</p>
        </div>
        <p className={k("text-[12px] text-muted", "nl-vr-prog")}>
          {done} of {rooms.length} rooms · checks {checksDone(checks)} of {CHECKS.length}
        </p>
      </div>

      {nl && (
        <div className="nl-vr-bar" aria-hidden>
          <i style={{ width: `${Math.round(((done + checksDone(checks)) / (rooms.length + CHECKS.length)) * 100)}%` }} />
        </div>
      )}

      <div className={k("flex min-h-0 flex-1 flex-col md:flex-row", "nl-vr-body")}>
        {/* The walk, down the side (along the top on a phone). */}
        <nav className={k("flex shrink-0 gap-1 overflow-x-auto border-b border-line/70 p-3 md:w-64 md:flex-col md:overflow-y-auto md:border-b-0 md:border-r", "nl-vr-rail")}>
          <button type="button" onClick={() => setTab({ kind: "checks" })} className={`${item(tab.kind === "checks")} shrink-0`}>
            <span>Safety &amp; checks</span>
            <span className={k("text-[11px] opacity-70", "nl-vr-count")}>
              {checksDone(checks)}/{CHECKS.length}
            </span>
          </button>
          <p className={k("hidden px-3 pb-1 pt-3 text-[9.5px] font-bold uppercase tracking-wider text-muted md:block", "nl-vr-group")}>Rooms</p>
          {rooms.map((r) => {
            const o = overallOf(r);
            const c = COND.find((x) => x.id === o?.condition);
            const on = tab.kind === "room" && tab.room === r;
            return (
              <button key={r} type="button" onClick={() => setTab({ kind: "room", room: r })} className={`${item(on)} shrink-0`}>
                <span className="truncate">{r}</span>
                {c ? <span className={k("h-2.5 w-2.5 shrink-0 rounded-full", `nl-vr-dot is-${c.id}`)} style={nl ? undefined : { background: c.tone }} title={c.label} /> : <span className={k("h-2.5 w-2.5 shrink-0 rounded-full border border-line", "nl-vr-dot")} />}
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
            {inspection.reportedAt && <span className={k("text-[11px] opacity-70", "nl-vr-count")}>done</span>}
          </button>
        </nav>

        <div className={k("min-h-0 flex-1 overflow-y-auto", "nl-vr-main")}>
          <div className={k("mx-auto max-w-2xl p-5 md:p-8", "nl-vr-pane")}>
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
    </Nl.Provider>
  );
}

function AddRoom({ taken, onAdd }: { taken: string[]; onAdd: (r: string) => void }) {
  const { nl, k } = useLook();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const left = MORE_ROOMS.filter((r) => !taken.includes(r));
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={k("shrink-0 rounded-xl px-3 py-2 text-left text-[12.5px] font-semibold text-accent-dark hover:bg-accent-soft/40", "nl-vr-add")}>
        + Add a room
      </button>
    );
  }
  return (
    <div className={k("shrink-0 space-y-1.5 rounded-xl border border-line/80 p-2", "nl-vr-addbox")}>
      <div className={k("flex flex-wrap gap-1", "nl-vr-chips")}>
        {left.slice(0, 8).map((r) => (
          <button key={r} type="button" onClick={() => { onAdd(r); setOpen(false); }} className={k("rounded-full border border-line/80 px-2.5 py-1 text-[11.5px]", "nl-vr-chip")}>
            {r}
          </button>
        ))}
      </div>
      <div className={k("flex gap-1.5", "nl-vr-addrow")}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Or type one" className={k("min-w-0 flex-1 rounded-lg border border-line/80 bg-page px-2 py-1 text-[12px]", "nl-input nl-vr-addinput")} />
        <button
          type="button"
          disabled={!name.trim() || taken.includes(name.trim())}
          onClick={() => { onAdd(name.trim()); setName(""); setOpen(false); }}
          className={k("rounded-lg bg-ink px-2.5 text-[12px] font-semibold text-page disabled:opacity-40", "nl-btn nl-btn--primary nl-btn--sm")}
        >
          Add
        </button>
      </div>
    </div>
  );
}

/** Photos onto R2 under the inspection, made smaller first and kept even when
    one of them fails (lib/visit-photos, Dan Richards, ticket f30276b7). */
async function upload(inspectionId: string, files: File[]): Promise<{ added: { key: string; name: string }[]; failed: string[] }> {
  return uploadVisitPhotos(inspectionId, files);
}

function Photos({ photos, onAdd, busy }: { photos: { key: string; name: string }[]; onAdd: (files: File[]) => Promise<void>; busy: boolean }) {
  const { nl, k } = useLook();
  const [up, setUp] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <div className={k("flex flex-wrap gap-2", "nl-vr-shots")}>
        {photos.map((p) => (
          <a key={p.key} href={`/api/r2/file?key=${encodeURIComponent(p.key)}`} target="_blank" rel="noreferrer" title={p.name}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/r2/file?key=${encodeURIComponent(p.key)}`} alt={p.name} className={k("h-20 w-20 rounded-xl border border-line/60 object-cover", "nl-vr-shot")} />
          </a>
        ))}
        <label className={nl ? `nl-vr-shot-add${busy || up ? " is-busy" : ""}` : `flex h-20 w-20 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line text-[11px] font-semibold ${busy || up ? "text-muted" : "cursor-pointer text-accent-dark"}`}>
          <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
          </svg>
          {up ? "Uploading" : "Add photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={busy || up}
            className="hidden"
            onChange={async (e) => {
              /* Copied out before the picker is cleared, so the list cannot go empty under us. */
              const f = e.target.files ? Array.from(e.target.files) : [];
              e.currentTarget.value = "";
              if (!f.length) return;
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
      {err && <p className={k("mt-1 text-[11.5px] text-accent-dark", "nl-vr-err")}>{err}</p>}
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
  const { nl, k } = useLook();
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
      <p className={k("text-[9.5px] font-bold uppercase tracking-wider text-muted", "nl-eyebrow")}>Room</p>
      <h2 className={k("hand mt-1 text-[28px]", "nl-vr-title")}>{room}</h2>

      <p className={k("mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>How is it kept?</p>
      <div className={k("grid grid-cols-3 gap-2", "nl-vr-tiles")}>
        {COND.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => { setCond(c.id); setSaved(false); }}
            className={k("rounded-2xl border-2 px-3 py-3.5 text-[14px] font-semibold transition-colors", `nl-vr-tile is-${c.id}${cond === c.id ? " is-on" : ""}`)}
            aria-pressed={cond === c.id}
            style={nl ? undefined : cond === c.id ? { borderColor: c.tone, background: `${c.tone}14`, color: c.tone } : { borderColor: "var(--line, #e5e0da)" }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <p className={k("mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>What you saw</p>
      <textarea
        value={note}
        onChange={(e) => { setNote(e.target.value); setSaved(false); }}
        rows={3}
        placeholder="Clean and tidy. Small mark on the wall by the door…"
        className={k("w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13.5px]", "nl-input nl-vr-text")}
      />

      <p className={k("mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>Photos</p>
      <Photos
        photos={photos}
        busy={busy}
        onAdd={async (files) => {
          const { added, failed } = await upload(inspection.id, files);
          if (added.length) {
            const next = [...photos, ...added];
            setPhotos(next);
            /* Saved straight away once the room has a condition, so a photo is
               never in storage with nothing on the record pointing at it. The
               ones that made it are saved even when another did not
               (ticket f30276b7): they used to be dropped with it. */
            if (cond) await onMove({ finding: { ...(overall ?? {}), room, item: OVERALL, condition: cond, note, action, photos: next } }, "Photo");
            else setSaved(false);
          }
          if (failed.length) throw new Error(failed.join(" "));
        }}
      />

      <p className={k("mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>Anything to do?</p>
      <div className={k("flex flex-wrap gap-1.5", "nl-vr-chips")}>
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => { setAction(a.id as Finding["action"]); setSaved(false); }}
            className={nl ? `nl-vr-chip${action === a.id ? " is-on" : ""}` : `rounded-full px-3.5 py-1.5 text-[12px] font-semibold ${action === a.id ? "bg-ink text-page" : "border border-line/80 text-muted"}`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className={k("mt-6 flex flex-wrap items-center gap-2", "nl-vr-foot")}>
        <PressButton disabled={busy || !cond} onClick={() => void save(onNext)} className={k("rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40", "nl-btn nl-btn--primary")}>
          {isLast ? "Save and write it up" : "Save and next room"}
        </PressButton>
        <PressButton disabled={busy || !cond} onClick={() => void save()} className={k("rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold", "nl-btn nl-btn--secondary")}>
          Save
        </PressButton>
        {!cond && <span className={k("text-[12px] text-muted", "nl-vr-note")}>Pick how it&apos;s kept first.</span>}
        {cond && saved && <span className={k("text-[12px] text-muted", "nl-vr-note")}>Saved.</span>}
      </div>

      {/* Something specific in this room, as its own line on the report. */}
      <Specific room={room} extras={extras} busy={busy} onMove={onMove} />
    </div>
  );
}

function Specific({ room, extras, busy, onMove }: { room: string; extras: Finding[]; busy: boolean; onMove: Move }) {
  const { nl, k } = useLook();
  const [open, setOpen] = useState(false);
  const [what, setWhat] = useState("");
  const [note, setNote] = useState("");
  const [cond, setCond] = useState<Cond>("fair");
  const [action, setAction] = useState("works_order");
  return (
    <section className={k("mt-8 border-t border-line/70 pt-5", "nl-vr-spec")}>
      <p className={k("text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>Something specific in {room.toLowerCase()}</p>
      {extras.length > 0 && (
        <ul className={k("mt-2 divide-y divide-line/50", "nl-vr-lines")}>
          {extras.map((f) => (
            <li key={f.id} className={k("flex items-start justify-between gap-3 py-2 text-[12.5px]", "nl-vr-line")}>
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
        <button type="button" onClick={() => setOpen(true)} className={k("mt-2 text-[12.5px] font-semibold text-accent-dark underline", "nl-link nl-vr-more")}>
          + Add something specific (a broken catch, a leak…)
        </button>
      ) : (
        <div className={k("mt-3 space-y-2", "nl-vr-specform")}>
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="What - extractor fan, window catch…" className={k("w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]", "nl-input")} />
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What you saw." className={k("w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]", "nl-input")} />
          <div className={k("flex flex-wrap gap-2", "nl-vr-specrow")}>
            <select value={cond} onChange={(e) => setCond(e.target.value as Cond)} className={k("rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]", "nl-input nl-vr-select")}>
              {COND.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select value={action} onChange={(e) => setAction(e.target.value)} className={k("rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]", "nl-input nl-vr-select")}>
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
              className={k("rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page", "nl-btn nl-btn--primary nl-btn--sm")}
            >
              Add it
            </PressButton>
            <button type="button" onClick={() => setOpen(false)} className={k("text-[12px] text-muted underline", "nl-link")}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function ChecksPane({ checks, busy, onMove, onNext }: { inspection: Inspection; checks: Checks; busy: boolean; onMove: Move; onNext: () => void }) {
  const { nl, k } = useLook();
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
      <p className={k("text-[9.5px] font-bold uppercase tracking-wider text-muted", "nl-eyebrow")}>On every visit</p>
      <h2 className={k("hand mt-1 text-[28px]", "nl-vr-title")}>Safety &amp; Checks</h2>
      <p className={k("mt-1 text-[12.5px] text-muted", "nl-vr-lede")}>Each one is put so that Yes is the good answer. Not checked is fine - a blank would read as a pass.</p>

      <ul className={k("mt-5 divide-y divide-line/60 rounded-2xl border border-line/80 bg-panel", "nl-vr-checks")}>
        {CHECKS.map((d) => {
          const a = c.answers[d.id];
          return (
            <li key={d.id} className={k("px-4 py-3", "nl-vr-check")}>
              <div className={k("flex flex-wrap items-center justify-between gap-2", "nl-vr-checkrow")}>
                <span className="min-w-0">
                  <span className={k("block text-[13.5px] font-semibold", "nl-vr-checkname")}>{d.label}</span>
                  {d.hint && <span className={k("block text-[11.5px] text-muted", "nl-vr-hint")}>{d.hint}</span>}
                </span>
                <span className={k("flex gap-1.5", "nl-vr-seg")}>
                  {(["ok", "issue", "na"] as const).map((ans) => (
                    <button
                      key={ans}
                      type="button"
                      onClick={() => set(d.id, ans)}
                      aria-pressed={a?.answer === ans}
                      className={nl ? `nl-vr-ans is-${ans}${a?.answer === ans ? " is-on" : ""}` : pill(a?.answer === ans, ans === "ok" ? "bg-[#2f7a48]" : ans === "issue" ? "bg-[#b3372b]" : "bg-[#7a6a64]")}
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
                  className={k("mt-2 w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]", "nl-input nl-vr-checknote")}
                />
              )}
            </li>
          );
        })}
      </ul>

      <p className={k("mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>Meter readings, if you took them</p>
      <div className={k("grid grid-cols-3 gap-2", "nl-vr-readings")}>
        {READINGS.map((r) => (
          <label key={r.id} className="block">
            <span className={k("mb-1 block text-[11.5px] text-muted", "nl-vr-hint")}>{r.label}</span>
            <input
              value={c.readings[r.id] ?? ""}
              onChange={(e) => { setC((x) => ({ ...x, readings: { ...x.readings, [r.id]: e.target.value } })); setSaved(false); }}
              inputMode="numeric"
              className={k("w-full rounded-xl border border-line/80 bg-page px-3 py-2 text-[13px]", "nl-input")}
            />
          </label>
        ))}
      </div>

      <p className={k("mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>What the tenant raised</p>
      <textarea
        value={c.tenantSays}
        onChange={(e) => { setC((x) => ({ ...x, tenantSays: e.target.value })); setSaved(false); }}
        rows={3}
        placeholder="Anything they mentioned on the day, in their words."
        className={k("w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13.5px]", "nl-input nl-vr-text")}
      />

      <div className={k("mt-6 flex flex-wrap items-center gap-2", "nl-vr-foot")}>
        <PressButton disabled={busy} onClick={() => void save(onNext)} className={k("rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40", "nl-btn nl-btn--primary")}>
          Save and start the rooms
        </PressButton>
        <PressButton disabled={busy} onClick={() => void save()} className={k("rounded-full border border-line/80 px-5 py-2.5 text-[13px] font-semibold", "nl-btn nl-btn--secondary")}>
          Save
        </PressButton>
        {saved && <span className={k("text-[12px] text-muted", "nl-vr-note")}>Saved.</span>}
      </div>
    </div>
  );
}

function WriteUp({ inspection, findings, checks, busy, onMove, onClose }: { inspection: Inspection; findings: Finding[]; checks: Checks; busy: boolean; onMove: Move; onClose: () => void }) {
  const { nl, k } = useLook();
  const poor = findings.filter((f) => f.condition === "poor").length;
  const fair = findings.filter((f) => f.condition === "fair").length;
  const issues = Object.values(checks.answers).filter((a) => a.answer === "issue").length;
  const guess: Cond = poor > 0 || issues > 1 ? "poor" : fair > 0 || issues > 0 ? "fair" : "good";
  const [cond, setCond] = useState<Cond>(inspection.condition ?? guess);
  const [summary, setSummary] = useState(inspection.summary);
  const toDo = findings.filter((f) => ["works_order", "tenant", "landlord"].includes(f.action)).length;

  return (
    <div>
      <p className={k("text-[9.5px] font-bold uppercase tracking-wider text-muted", "nl-eyebrow")}>Last</p>
      <h2 className={k("hand mt-1 text-[28px]", "nl-vr-title")}>Write It Up</h2>
      <p className={k("mt-1 text-[12.5px] text-muted", "nl-vr-lede")}>
        {findings.length} thing{findings.length === 1 ? "" : "s"} recorded · {poor} poor · {fair} fair · {issues} check{issues === 1 ? "" : "s"} failed · {toDo} to put right
      </p>

      <p className={k("mb-2 mt-6 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>Overall, the property is</p>
      <div className={k("grid grid-cols-3 gap-2", "nl-vr-tiles")}>
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
              className={k("rounded-2xl border-2 px-3 py-3.5 text-[13.5px] font-semibold", `nl-vr-tile is-${id}${cond === id ? " is-on" : ""}`)}
              aria-pressed={cond === id}
              style={nl ? undefined : cond === id ? { borderColor: tone, background: `${tone}14`, color: tone } : { borderColor: "var(--line, #e5e0da)" }}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className={k("mb-2 mt-5 text-[10.5px] font-bold uppercase tracking-wider text-muted", "nl-vr-label")}>For the landlord, in a few lines</p>
      <textarea
        value={summary}
        onChange={(e) => setSummary(e.target.value)}
        rows={5}
        placeholder="How the property is being kept, and anything they need to know."
        className={k("w-full rounded-xl border border-line/80 bg-page px-3 py-2.5 text-[13.5px]", "nl-input nl-vr-text")}
      />

      <div className={k("mt-6 flex flex-wrap items-center gap-2", "nl-vr-foot")}>
        <PressButton
          disabled={busy || !summary.trim()}
          onClick={async () => {
            if (await onMove({ action: "report", condition: cond, summary }, "Write-up")) onClose();
          }}
          className={k("rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40", "nl-btn nl-btn--primary")}
        >
          {inspection.reportedAt ? "Save the write-up" : "Finish the record"}
        </PressButton>
        <span className={k("text-[12px] text-muted", "nl-vr-note")}>Then send it to the landlord from the inspection.</span>
      </div>
    </div>
  );
}
