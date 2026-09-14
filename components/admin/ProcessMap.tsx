"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import EmailCard from "@/components/admin/EmailCard";
import { STAGE_UPDATE, type TenantStageKey } from "@/lib/tenant-journey";
import { PROCESS_STAGES, stageOf, type ProcessEdge, type ProcessKind, type ProcessLane, type ProcessMap, type ProcessNode, type ProcessStatus } from "@/lib/process/types";

/**
 * The process map, drawn and edited.
 *
 * A canvas you grab and pan (the wheel scrolls it too), the spine across
 * the top and the nurture branches beneath, edges as curves - solid for
 * the main path, dashed for a return. Click a step and it opens: what it
 * is, when it fires, Open for a live screen (in a new tab, so a link can be
 * copied and sent), the email as it arrives, and Edit for the builder.
 *
 * Edit mode: drag steps to move them, change any field, attach or replace
 * the email, set the trigger, add a step after this one or a branch off
 * it, delete. Save writes the whole map; Reset returns to the one in code.
 */

const NODE_W = 236;
const NODE_H = 104;

const KIND: Record<ProcessKind, { icon: string; label: string }> = {
  trigger: { icon: "clock", label: "Trigger" },
  screen: { icon: "grid", label: "Screen" },
  email: { icon: "mail", label: "Email" },
  decision: { icon: "target", label: "Decision" },
  note: { icon: "note", label: "Note" },
};
/**
 * The nine rungs, dressed. Grey is nothing yet, clay is work in progress,
 * INK IS JAMES - the two rungs where it is his turn are the only solid dark
 * ones, so "what is waiting on me" is answerable from across the room - and
 * green is out in the world, solid only once it has been tested.
 */
const STATUS: Record<ProcessStatus, string> = {
  planned: "bg-box text-muted border border-line/70",
  written: "bg-white text-ink/70 border border-line/70",
  built: "bg-accent-soft/60 text-accent-dark",
  designed: "bg-accent-soft text-accent-dark",
  "with-james": "bg-ink text-page",
  notes: "border-[1.5px] border-ink bg-white text-ink",
  reworked: "bg-[#eef3e6] text-[#56634a]",
  live: "bg-[#f1f4ec] text-[#56634a] border border-[#b3bea5]",
  tested: "bg-[#56634a] text-white",
};
/** The same nine on the one-bar summary, where there is no text to carry them. */
const BAR: Record<ProcessStatus, string> = {
  planned: "bg-line/70",
  written: "bg-line",
  built: "bg-accent-soft",
  designed: "bg-accent",
  "with-james": "bg-ink",
  notes: "bg-ink/60",
  reworked: "bg-[#b3bea5]",
  live: "bg-[#8a9a78]",
  tested: "bg-[#56634a]",
};

const LANE: Record<ProcessLane, string> = {
  spine: "border-accent-dark/40 bg-white",
  nurture: "border-[#b3bea5] bg-[#f6f8f2]",
  side: "border-line/80 bg-panel",
};

type Email = { id: string; name: string; group: string; draft: boolean };

export default function ProcessMapView({ initial, emails, token }: { initial: ProcessMap; emails: Email[]; token: string }) {
  const [map, setMap] = useState<ProcessMap>(initial);
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  /** A rung picked out of the summary: every step not on it goes quiet. */
  const [only, setOnly] = useState<ProcessStatus | null>(null);
  const [pan, setPan] = useState({ x: 16, y: 24 });
  const [zoom, setZoom] = useState(0.9);
  const drag = useRef<{ kind: "pan" | "node"; id?: string; x: number; y: number; ox: number; oy: number; moved: boolean } | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => Object.fromEntries(map.nodes.map((n) => [n.id, n])), [map.nodes]);
  /* How far along the whole process is: one count per rung, plus the three
     numbers James actually asks for - done, waiting on him, not built. */
  const tally = useMemo(() => {
    const by = Object.fromEntries(PROCESS_STAGES.map((st) => [st.key, 0])) as Record<ProcessStatus, number>;
    for (const n of map.nodes) by[n.status] = (by[n.status] ?? 0) + 1;
    const yours = PROCESS_STAGES.filter((st) => st.yours).reduce((t, st) => t + by[st.key], 0);
    return { by, yours, tested: by.tested, todo: by.planned + by.written };
  }, [map.nodes]);
  const sel = selected ? byId[selected] : null;
  /* The tenant's own words at this step's stage, so the map and the portal
     are read together rather than kept in step by memory. */
  const portalWords = sel?.stage && map.audience === "tenant" ? STAGE_UPDATE[sel.stage as TenantStageKey] ?? null : null;
  const update = (fn: (m: ProcessMap) => ProcessMap) => {
    setMap((m) => fn(m));
    setDirty(true);
  };

  /* ── Pan and drag ── */
  const onDown = (e: React.PointerEvent, nodeId?: string) => {
    if (e.button !== 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    if (nodeId && editing) {
      const n = byId[nodeId];
      drag.current = { kind: "node", id: nodeId, x: e.clientX, y: e.clientY, ox: n.x, oy: n.y, moved: false };
    } else if (!nodeId) {
      drag.current = { kind: "pan", x: e.clientX, y: e.clientY, ox: pan.x, oy: pan.y, moved: false };
    } else {
      drag.current = { kind: "node", id: nodeId, x: e.clientX, y: e.clientY, ox: 0, oy: 0, moved: false };
    }
  };
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    if (d.kind === "pan") setPan({ x: d.ox + dx, y: d.oy + dy });
    else if (editing && d.id) {
      const id = d.id;
      setMap((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, x: Math.round(d.ox + dx / zoom), y: Math.round(d.oy + dy / zoom) } : n)) }));
    }
  };
  const onUp = (e: React.PointerEvent, nodeId?: string) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === "node" && d.moved && editing) setDirty(true);
    if (nodeId && !d.moved) setSelected(nodeId);
    e.stopPropagation();
  };
  const onWheel = (e: React.WheelEvent) => {
    setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
  };

  /* ── Edit actions ── */
  const addAfter = (id: string, lane?: ProcessLane) => {
    const from = byId[id];
    const nid = `step-${Date.now().toString(36)}`;
    const branch = lane && lane !== from.lane;
    const node: ProcessNode = {
      id: nid,
      kind: branch ? "decision" : "screen",
      title: branch ? "New branch" : "New step",
      blurb: "",
      lane: lane ?? from.lane,
      x: branch ? from.x : from.x + 300,
      y: branch ? from.y + 190 : from.y,
      status: "planned",
    };
    update((m) => {
      const nodes = branch ? m.nodes : m.nodes.map((n) => (n.lane === from.lane && n.x > from.x ? { ...n, x: n.x + 300 } : n));
      const edges: ProcessEdge[] = branch
        ? [...m.edges, { from: id, to: nid, kind: "branch", label: "if not" }]
        : [...m.edges.map((e) => (e.from === id && e.kind === "main" ? { ...e, from: nid } : e)), { from: id, to: nid, kind: "main" }];
      return { ...m, nodes: [...nodes, node], edges };
    });
    setSelected(nid);
  };
  const remove = (id: string) => {
    update((m) => {
      const into = m.edges.filter((e) => e.to === id);
      const out = m.edges.filter((e) => e.from === id);
      const bridged: ProcessEdge[] = into.length === 1 && out.length === 1 ? [{ from: into[0].from, to: out[0].to, kind: into[0].kind }] : [];
      return { ...m, nodes: m.nodes.filter((n) => n.id !== id), edges: [...m.edges.filter((e) => e.from !== id && e.to !== id), ...bridged] };
    });
    setSelected(null);
  };
  const patch = (id: string, p: Partial<ProcessNode>) => update((m) => ({ ...m, nodes: m.nodes.map((n) => (n.id === id ? { ...n, ...p } : n)) }));

  /**
   * Ticking a step along, without going into Edit mode first.
   *
   * The whole point of the ladder is that it gets updated constantly - after
   * a design goes over, after James sends notes back, after something is
   * tested. Making that a four-step job (Edit → open → select → Save) meant
   * it would be a board that goes stale by Wednesday. One click, saved.
   */
  const setStage = async (id: string, status: ProcessStatus) => {
    const next = { ...map, nodes: map.nodes.map((n) => (n.id === id ? { ...n, status } : n)) };
    setMap(next);
    await save(next);
  };

  const save = async (what?: ProcessMap) => {
    const body = what ?? map;
    setNote("Saving…");
    try {
      const r = await fetch(`/api/admin/process/${body.audience}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ map: body }) });
      const j = (await r.json()) as { ok?: boolean; map?: ProcessMap; error?: string };
      if (!j.ok || !j.map) throw new Error(j.error ?? "Could not save.");
      setMap(j.map);
      setDirty(false);
      setNote("Saved. The OS reads this map from now on.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Could not save.");
    }
  };
  const reset = async () => {
    if (!window.confirm("Put the map back to the one in code? Your changes are lost.")) return;
    const r = await fetch(`/api/admin/process/${map.audience}`, { method: "DELETE" });
    const j = (await r.json()) as { map?: ProcessMap };
    if (j.map) {
      setMap(j.map);
      setDirty(false);
      setNote("Back to the map in code.");
    }
  };

  /* ── Fit ──
     The map is long and short: twenty-five columns across, four rows down.
     Fitting the WIDTH would shrink it to nothing, so fit the height - every
     lane on screen at once - and start at the left, where the enquiry is. */
  const fit = useCallback(() => {
    const el = box.current;
    if (!el || map.nodes.length === 0) return;
    const minX = Math.min(...map.nodes.map((n) => n.x));
    const minY = Math.min(...map.nodes.map((n) => n.y));
    const maxY = Math.max(...map.nodes.map((n) => n.y + NODE_H));
    const z = Math.min(1, Math.max(0.4, (el.clientHeight - 56) / Math.max(1, maxY - minY)));
    setZoom(z);
    setPan({ x: 16 - minX * z, y: 24 - minY * z });
  }, [map.nodes]);

  /* Fit once, when the canvas has a size to fit to. */
  useEffect(() => { fit(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  /* Escape closes; the note fades. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => {
    if (!note) return;
    const id = window.setTimeout(() => setNote(null), 4000);
    return () => window.clearTimeout(id);
  }, [note]);

  const fill = useCallback((href: string) => href.replace("{token}", token), [token]);
  const bounds = map.nodes.reduce((b, n) => ({ w: Math.max(b.w, n.x + NODE_W + 120), h: Math.max(b.h, n.y + NODE_H + 120) }), { w: 1200, h: 600 });

  return (
    <div>
      {/* ── the bar ── */}
      <div className="flex flex-wrap items-center gap-2 text-[12px]">
        <button type="button" onClick={() => setZoom((z) => Math.min(1.6, z + 0.1))} className="rounded-full border border-line/70 px-3 py-1.5 hover:border-ink/40">Zoom in</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))} className="rounded-full border border-line/70 px-3 py-1.5 hover:border-ink/40">Zoom out</button>
        <button type="button" onClick={fit} className="rounded-full border border-line/70 px-3 py-1.5 hover:border-ink/40">Fit</button>
        <span className="text-muted">Drag the background to move around. Click a step to open it.</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          {note && <span className="text-accent-dark">{note}</span>}
          {map.updatedAt && !dirty && <span className="text-muted">Saved {new Date(map.updatedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
          {editing ? (
            <>
              <button type="button" onClick={reset} className="rounded-full border border-line/70 px-3 py-1.5 hover:border-ink/40">Reset to code</button>
              <button type="button" disabled={!dirty} onClick={() => save()} className="rounded-full bg-accent-dark px-4 py-1.5 font-semibold text-white disabled:opacity-40">Save the process</button>
              <button type="button" onClick={() => setEditing(false)} className="rounded-full border border-line/70 px-3 py-1.5 hover:border-ink/40">Done</button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-ink px-4 py-1.5 font-semibold text-page">Edit the process</button>
          )}
        </span>
      </div>

      {/* ── where everything is ── */}
      <div className="mt-4 rounded-2xl border border-line/60 bg-white p-4">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h2 className="text-[15px]">Where everything is</h2>
          <p className="text-[12.5px] text-muted">
            <strong className="text-ink">{tally.tested} of {map.nodes.length}</strong> live and tested
            {tally.yours > 0 && <> · <strong className="text-ink">{tally.yours}</strong> waiting on you</>}
            {tally.todo > 0 && <> · {tally.todo} still to build</>}
          </p>
        </div>
        {/* One bar, the nine rungs in order, each as wide as its share. */}
        <div className="mt-3 flex h-2.5 w-full overflow-hidden rounded-full bg-box">
          {PROCESS_STAGES.map((st) => {
            const n = tally.by[st.key];
            if (!n) return null;
            return <span key={st.key} title={`${n} ${st.label.toLowerCase()}`} className={`${BAR[st.key]} h-full`} style={{ width: `${(n / map.nodes.length) * 100}%` }} />;
          })}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PROCESS_STAGES.map((st) => (
            <button
              key={st.key}
              type="button"
              onClick={() => setOnly((o) => (o === st.key ? null : st.key))}
              title={st.blurb}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold transition-opacity ${STATUS[st.key]} ${only && only !== st.key ? "opacity-35" : ""}`}
            >
              {st.label} <span className="font-normal opacity-70">{tally.by[st.key]}</span>
            </button>
          ))}
          {only && <button type="button" onClick={() => setOnly(null)} className="rounded-full border border-line/70 px-2.5 py-0.5 text-[11px] hover:border-ink/40">Show all</button>}
        </div>
      </div>

      {/* ── the legend ── */}
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[11.5px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-accent-dark/40 bg-white" /> Main path</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-[#b3bea5] bg-[#f6f8f2]" /> Nurture, when they stall</span>
        <span className="flex items-center gap-1.5"><span className="h-3 w-5 rounded border border-line/80 bg-panel" /> Alongside</span>
        <span>Click a rung above to pick out every step sitting on it.</span>
      </div>

      {/* ── the canvas ── */}
      <div
        ref={box}
        className="relative mt-4 h-[calc(100vh-420px)] min-h-[460px] cursor-grab select-none overflow-hidden rounded-2xl border border-line/70 active:cursor-grabbing"
        style={{ background: "radial-gradient(circle, rgba(16,16,20,0.10) 1px, transparent 1.2px) 0 0 / 22px 22px, var(--panel)" }}
        onPointerDown={(e) => onDown(e)}
        onPointerMove={onMove}
        onPointerUp={(e) => onUp(e)}
        onPointerCancel={(e) => onUp(e)}
        onWheel={onWheel}
      >
        <div className="absolute left-0 top-0" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0", width: bounds.w, height: bounds.h }}>
          <svg className="pointer-events-none absolute left-0 top-0" width={bounds.w} height={bounds.h} aria-hidden>
            <defs>
              <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="var(--accent-dark)" />
              </marker>
            </defs>
            {map.edges.map((e) => {
              const a = byId[e.from], b = byId[e.to];
              if (!a || !b) return null;
              const branch = e.kind !== "main" || Math.abs(a.y - b.y) > 20;
              const x1 = branch && b.y > a.y ? a.x + NODE_W / 2 : a.x + NODE_W;
              const y1 = branch && b.y > a.y ? a.y + NODE_H : a.y + NODE_H / 2;
              const x2 = branch && b.y < a.y ? b.x + NODE_W / 2 : b.x;
              const y2 = branch && b.y < a.y ? b.y + NODE_H : b.y + NODE_H / 2;
              const dx = Math.max(60, Math.abs(x2 - x1) / 2);
              const d = branch && b.y > a.y
                ? `M${x1},${y1} C${x1},${y1 + 60} ${x2 - 40},${y2} ${x2},${y2}`
                : branch && b.y < a.y
                  ? `M${x1},${y1} C${x1 + 120},${y1} ${x2},${y2 + 90} ${x2},${y2}`
                  : `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`;
              const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
              return (
                <g key={`${e.from}-${e.to}`}>
                  <path d={d} fill="none" stroke={e.kind === "return" ? "#b3bea5" : "var(--accent-dark)"} strokeWidth={e.kind === "main" ? 2.2 : 1.8} strokeDasharray={e.kind === "return" ? "6 6" : e.kind === "branch" ? "2 5" : undefined} opacity={e.kind === "main" ? 0.9 : 0.8} markerEnd="url(#arrow)" />
                  {e.label && (
                    <text x={mx} y={my - 8} textAnchor="middle" fontSize="11" fill="var(--muted)" style={{ paintOrder: "stroke", stroke: "var(--panel)", strokeWidth: 4 }}>{e.label}</text>
                  )}
                </g>
              );
            })}
          </svg>

          {map.nodes.map((n) => (
            <div
              key={n.id}
              className={`absolute flex cursor-pointer flex-col rounded-2xl border-[1.5px] px-4 py-3 shadow-[0_8px_20px_-14px_rgba(16,16,20,0.35)] transition-shadow hover:shadow-[0_12px_28px_-12px_rgba(16,16,20,0.4)] ${LANE[n.lane]} ${selected === n.id ? "ring-2 ring-accent-dark" : ""} ${only && n.status !== only ? "opacity-25" : ""}`}
              style={{ left: n.x, top: n.y, width: NODE_W, height: NODE_H, cursor: editing ? "move" : "pointer" }}
              onPointerDown={(e) => { e.stopPropagation(); onDown(e, n.id); }}
              onPointerMove={onMove}
              onPointerUp={(e) => onUp(e, n.id)}
              onPointerCancel={(e) => onUp(e, n.id)}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/80 text-accent-dark ring-1 ring-line/60"><DoodleIcon name={KIND[n.kind].icon} size={12} /></span>
                <span className="text-[10px] font-semibold uppercase tracking-wide text-muted">{KIND[n.kind].label}</span>
                <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold ${STATUS[n.status]}`}>{stageOf(n.status).badge}</span>
              </div>
              <p className="mt-1.5 truncate text-[13.5px] font-semibold leading-tight">{n.title}</p>
              <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted">{n.trigger?.after ? `${n.trigger.after} · ` : ""}{n.blurb}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── the step, opened ── */}
      {sel && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 p-4 sm:items-center" onClick={() => setSelected(null)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-line/70 bg-card p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={KIND[sel.kind].icon} size={16} /></span>
              <div className="min-w-0 flex-1">
                <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{KIND[sel.kind].label} · {sel.lane === "spine" ? "main path" : sel.lane === "nurture" ? "nurture" : "alongside"}</p>
                {editing ? (
                  <input className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2 py-1 text-[18px] font-semibold outline-none focus:border-ink" value={sel.title} onChange={(e) => patch(sel.id, { title: e.target.value })} />
                ) : (
                  <h2 className="mt-0.5 text-[20px] leading-tight">{sel.title}</h2>
                )}
              </div>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${STATUS[sel.status]}`}>{stageOf(sel.status).label}</span>
              <button type="button" onClick={() => setSelected(null)} className="ml-1 rounded-full border border-line/70 px-2.5 py-1 text-[11.5px] hover:border-ink/40">Close</button>
            </div>

            {editing ? (
              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="block text-[12px] sm:col-span-2">
                  <span className="font-semibold">What happens</span>
                  <textarea rows={2} className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[13px] outline-none focus:border-ink" value={sel.blurb ?? ""} onChange={(e) => patch(sel.id, { blurb: e.target.value })} />
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">Kind</span>
                  <select className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[13px]" value={sel.kind} onChange={(e) => patch(sel.id, { kind: e.target.value as ProcessKind })}>
                    {(Object.keys(KIND) as ProcessKind[]).map((k) => <option key={k} value={k}>{KIND[k].label}</option>)}
                  </select>
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">Status</span>
                  <select className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[13px]" value={sel.status} onChange={(e) => patch(sel.id, { status: e.target.value as ProcessStatus })}>
                    {PROCESS_STAGES.map((st) => <option key={st.key} value={st.key}>{st.label}</option>)}
                  </select>
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">Lane</span>
                  <select className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[13px]" value={sel.lane} onChange={(e) => patch(sel.id, { lane: e.target.value as ProcessLane })}>
                    <option value="spine">Main path</option><option value="nurture">Nurture</option><option value="side">Alongside</option>
                  </select>
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">Email attached</span>
                  <select className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[13px]" value={sel.emailId ?? ""} onChange={(e) => patch(sel.id, { emailId: e.target.value || undefined })}>
                    <option value="">None yet - to write</option>
                    {emails.map((em) => <option key={em.id} value={em.id}>{em.name}{em.draft ? " (draft)" : ""}</option>)}
                  </select>
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">Portal stage</span>
                  <select className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[13px]" value={sel.stage ?? ""} onChange={(e) => patch(sel.id, { stage: e.target.value || undefined })}>
                    <option value="">Nothing changes for them here</option>
                    {Object.entries(STAGE_UPDATE).map(([k, u]) => <option key={k} value={k}>{u.label}</option>)}
                  </select>
                </label>
                <label className="block text-[12px] sm:col-span-2">
                  <span className="font-semibold">Screen link</span>
                  <input className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 font-mono text-[12px] outline-none focus:border-ink" placeholder="/tenant/demo?from=admin  ·  {token} fills in the preview's share token" value={sel.href ?? ""} onChange={(e) => patch(sel.id, { href: e.target.value || undefined })} />
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">Fires on</span>
                  <input className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 font-mono text-[12px] outline-none focus:border-ink" placeholder="viewing.booked" value={sel.trigger?.on ?? ""} onChange={(e) => patch(sel.id, { trigger: e.target.value ? { on: e.target.value, after: sel.trigger?.after } : undefined })} />
                </label>
                <label className="block text-[12px]">
                  <span className="font-semibold">After</span>
                  <input className="mt-1 w-full rounded-lg border border-line/70 bg-transparent px-2.5 py-2 text-[12px] outline-none focus:border-ink" placeholder="2 days" value={sel.trigger?.after ?? ""} onChange={(e) => patch(sel.id, { trigger: { on: sel.trigger?.on ?? "", after: e.target.value || undefined } })} />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-2">
                  <button type="button" onClick={() => addAfter(sel.id)} className="rounded-full border border-line/70 px-3 py-1.5 text-[12px] hover:border-ink/40">+ Step after this</button>
                  <button type="button" onClick={() => addAfter(sel.id, "nurture")} className="rounded-full border border-line/70 px-3 py-1.5 text-[12px] hover:border-ink/40">+ Nurture branch off this</button>
                  <button type="button" onClick={() => remove(sel.id)} className="ml-auto rounded-full border border-red-300 px-3 py-1.5 text-[12px] text-red-700 hover:bg-red-50">Delete step</button>
                </div>
              </div>
            ) : (
              <>
                {sel.blurb && <p className="mt-3 text-[13.5px] leading-relaxed">{sel.blurb}</p>}

                {/* ── how far along it is ── */}
                <div className="mt-4 rounded-xl border border-line/60 bg-panel p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">How far along <span className="font-normal normal-case tracking-normal">· one click moves it, and saves</span></p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {PROCESS_STAGES.map((st) => (
                      <button
                        key={st.key}
                        type="button"
                        title={st.blurb}
                        onClick={() => setStage(sel.id, st.key)}
                        className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold ${sel.status === st.key ? `${STATUS[st.key]} ring-[1.5px] ring-ink/60` : "border border-line/60 bg-white/60 text-muted/80 hover:border-ink/40 hover:text-ink"}`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{stageOf(sel.status).blurb}</p>
                </div>

                {/* ── what the tenant's own portal says at this point ── */}
                {portalWords && (
                  <div className="mt-3 rounded-xl border border-line/60 bg-white p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">In their portal · {portalWords.label}</p>
                    <p className="mt-1.5 text-[13px] font-semibold">{portalWords.title}</p>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{portalWords.blurb}</p>
                    <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted"><span className="font-semibold text-ink">Next:</span> {portalWords.next}</p>
                    {/* Through the harness route, not ?stage=, so the strip at the foot of the
                        sample agrees with the page and stays there as you walk around it. */}
                    <a href={`/tenant/demo/stage?to=${sel.stage}&back=${encodeURIComponent("/tenant/demo?from=admin")}`} target="_blank" rel="noreferrer" className="mt-2 inline-block rounded-full border border-line/70 px-3 py-1 text-[11.5px] hover:border-ink/40">See the portal at this stage</a>
                  </div>
                )}
                {sel.trigger && (
                  <p className="mt-3 flex items-center gap-2 text-[12.5px] text-muted">
                    <DoodleIcon name="clock" size={13} />
                    Fires on <code className="rounded bg-box px-1.5 py-0.5 text-[11.5px]">{sel.trigger.on}</code>{sel.trigger.after ? <> · {sel.trigger.after}</> : null}
                  </p>
                )}
                <div className="mt-4 flex flex-wrap gap-2">
                  {sel.href && (
                    <a href={fill(sel.href)} target="_blank" rel="noreferrer" className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page">Open the screen</a>
                  )}
                  {sel.href && (
                    <button type="button" onClick={() => { navigator.clipboard?.writeText(`${window.location.origin}${fill(sel.href!)}`); setNote("Link copied."); }} className="rounded-full border border-line/70 px-3.5 py-1.5 text-[12px] hover:border-ink/40">Copy the link</button>
                  )}
                  {sel.emailId && (
                    <a href={`/admin/emails?open=${encodeURIComponent(sel.emailId)}`} className="rounded-full border border-line/70 px-3.5 py-1.5 text-[12px] hover:border-ink/40">Edit the email</a>
                  )}
                </div>
                {sel.emailId ? (
                  <div className="mt-4"><EmailCard emailId={sel.emailId} /></div>
                ) : sel.kind === "email" ? (
                  <p className="mt-4 rounded-xl border border-dashed border-line/80 p-3 text-[12.5px] text-muted">No email attached yet. Edit the process to attach one from the catalogue, or write it in Emails first.</p>
                ) : null}
                {!sel.href && sel.kind === "screen" && (
                  <p className="mt-4 rounded-xl border border-dashed border-line/80 p-3 text-[12.5px] text-muted">This screen is planned; there is nothing to open yet.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
