"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PostcardSide } from "@/components/Postcard";
import {
  CARD, COLOURS, FONTS, ILLUSTRATIONS, MERGE_FIELDS,
  faultsIn, heightOf, nameOf,
  type ColourKey, type FontKey, type IllustrationKey, type Layer, type PostcardDesign, type Side,
} from "@/lib/postcard-design";

/**
 * The postcard studio.
 *
 * James, 8 Sep 2026: "allow me to move these things around, adjust it, use
 * the brand fonts... almost like a mini Canva."
 *
 * So: drag anything on the card, and a panel for the thing you picked -
 * font, size, weight, colour, alignment, width. Two guides show what is not
 * yours to use: the 5mm trim, and Royal Mail's half of the back. Dragging
 * into either is allowed while you are moving, and told to you plainly
 * afterwards, because a rule that fights the mouse is worse than one that
 * explains itself.
 *
 * Nothing is saved until Save, and nothing may be sent while a card has a
 * fault on it.
 */

const px = (n: number) => `${n}px`;

export default function PostcardStudio() {
  const [designs, setDesigns] = useState<PostcardDesign[]>([]);
  const [openId, setOpenId] = useState<string>("");
  const [side, setSide] = useState<Side>("front");
  const [pick, setPick] = useState<string | null>(null);
  const [tokens, setTokens] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const [showProof, setShowProof] = useState(false);
  const [to, setTo] = useState("");
  const [note, setNote] = useState("");
  const [guides, setGuides] = useState(true);

  const load = useCallback(() => {
    fetch("/api/postcards", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!j.ok) return;
        setDesigns(j.designs);
        setTokens(j.tokens ?? {});
        setOpenId((cur) => cur || j.designs[0]?.id || "");
      })
      .catch(() => {});
  }, []);
  useEffect(load, [load]);

  const design = designs.find((d) => d.id === openId) ?? null;
  const faults = design ? faultsIn(design) : [];
  const layer = design?.layers.find((l) => l.id === pick) ?? null;

  const patch = (id: string, next: Partial<Layer>) => {
    setDirty(true);
    setDesigns((all) =>
      all.map((d) => (d.id !== openId ? d : { ...d, layers: d.layers.map((l) => (l.id === id ? { ...l, ...next } : l)) }))
    );
  };

  /* ── dragging ──
     Pointer events on the card, translated into millimetres. Clamped loosely
     so a picture can still bleed; the checks below say what is wrong rather
     than the mouse refusing to move. */
  const boardRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; dx: number; dy: number; scale: number } | null>(null);

  function onDown(e: React.PointerEvent, l: Layer, scale: number) {
    e.preventDefault();
    const box = boardRef.current?.getBoundingClientRect();
    if (!box) return;
    setPick(l.id);
    drag.current = { id: l.id, dx: (e.clientX - box.left) / scale - l.x, dy: (e.clientY - box.top) / scale - l.y, scale };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }
  function onMove(e: React.PointerEvent) {
    const d = drag.current;
    const box = boardRef.current?.getBoundingClientRect();
    if (!d || !box) return;
    const x = Math.round(((e.clientX - box.left) / d.scale - d.dx) * 2) / 2;
    const y = Math.round(((e.clientY - box.top) / d.scale - d.dy) * 2) / 2;
    patch(d.id, { x: Math.max(-60, Math.min(CARD.w + 10, x)), y: Math.max(-40, Math.min(CARD.h + 10, y)) });
  }
  const onUp = () => { drag.current = null; };

  /* Arrow keys nudge, because a millimetre is hard with a mouse. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!layer || !pick) return;
      const t = e.target as HTMLElement;
      if (t && /input|textarea|select/i.test(t.tagName)) return;
      const step = e.shiftKey ? 5 : 0.5;
      const by: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      const move = by[e.key];
      if (!move) return;
      e.preventDefault();
      patch(pick, { x: layer.x + move[0], y: layer.y + move[1] });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setBusy(true); setSaid(null);
    const r = await fetch("/api/postcards", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ designs }) })
      .then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setSaid(r?.error ?? "Could not save.");
    setTokens(r.tokens ?? {}); setDirty(false); setSaid("Saved.");
  }

  async function sendProof() {
    setBusy(true); setSaid(null);
    const r = await fetch("/api/postcards", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ designId: openId, to, note }) })
      .then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setSaid(r?.error ?? "The proof did not send.");
    setShowProof(false); setTo(""); setNote(""); setSaid("Sent. They get a link to both sides at print size.");
  }

  function addText() {
    const id = `t${Date.now().toString(36)}`;
    setDirty(true);
    setDesigns((all) =>
      all.map((d) =>
        d.id !== openId ? d : { ...d, layers: [...d.layers, { id, kind: "text", side, x: 12, y: 20, w: 55, text: "New line", font: "montserrat", size: 3.4, colour: "ink", lineHeight: 1.4 }] }
      )
    );
    setPick(id);
  }
  function removeLayer(id: string) {
    setDirty(true);
    setDesigns((all) => all.map((d) => (d.id !== openId ? d : { ...d, layers: d.layers.filter((l) => l.id !== id) })));
    setPick(null);
  }
  function shift(id: string, dir: -1 | 1) {
    setDirty(true);
    setDesigns((all) =>
      all.map((d) => {
        if (d.id !== openId) return d;
        const i = d.layers.findIndex((l) => l.id === id);
        const j = i + dir;
        if (i < 0 || j < 0 || j >= d.layers.length) return d;
        const layers = [...d.layers];
        [layers[i], layers[j]] = [layers[j], layers[i]];
        return { ...d, layers };
      })
    );
  }

  const field = "w-full rounded-lg border border-line/80 bg-box px-2.5 py-1.5 text-[12px] outline-none focus:border-ink";
  const label = "block text-[9.5px] font-bold uppercase tracking-wider text-muted";
  const BOARD = 560;
  const scale = BOARD / CARD.w;

  if (!design) return <p className="text-[12.5px] text-muted">Reading the designs…</p>;

  return (
    <div className="space-y-4">
      {/* which card, and what to do with it */}
      <div className="flex flex-wrap items-center gap-2">
        {designs.map((d) => (
          <button
            key={d.id}
            type="button"
            onClick={() => { setOpenId(d.id); setPick(null); }}
            className={`rounded-full px-4 py-2 text-[12.5px] font-semibold transition-colors ${
              d.id === design.id ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40 hover:text-ink"
            }`}
          >
            {d.name}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          {said && <span className="text-[11.5px] text-muted">{said}</span>}
          <a
            href={faults.length || dirty ? undefined : `/api/postcards/${design.id}/artwork?merged=1`}
            target="_blank"
            rel="noreferrer"
            aria-disabled={faults.length > 0 || dirty}
            title={dirty ? "Save first - the artwork is drawn from what is saved" : faults.length ? "Fix the card first" : "A4 PDF at print size with 3mm bleed"}
            className={`rounded-full border border-line/80 px-4 py-2 text-[12.5px] transition-colors hover:border-ink ${faults.length || dirty ? "pointer-events-none opacity-40" : ""}`}
          >
            Print artwork
          </a>
          <button type="button" disabled={busy || faults.length > 0} onClick={() => setShowProof((v) => !v)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] transition-colors hover:border-ink disabled:opacity-40">
            Send a proof
          </button>
          <button type="button" disabled={busy || !dirty || faults.length > 0} onClick={() => void save()} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40">
            {busy ? "Saving…" : dirty ? "Save" : "Saved"}
          </button>
        </span>
      </div>

      {showProof && (
        <div className="rounded-2xl border border-line/80 bg-panel p-5">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Send a proof</p>
          <p className="mt-1 text-[11.5px] text-muted">A link to both sides at print size. No account needed, and nothing is posted.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_auto]">
            <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Their email" className={field} />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="A line to go with it (optional)" className={field} />
            <button type="button" disabled={busy || !to.includes("@")} onClick={() => void sendProof()} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40">Send</button>
          </div>
          {tokens[design.id] && <p className="mt-2 text-[11px] text-muted">Or copy the link: <code className="rounded bg-box px-1.5 py-0.5">/proof/{tokens[design.id]}</code></p>}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        {/* the board */}
        <div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {(["front", "back"] as Side[]).map((s) => (
              <button key={s} type="button" onClick={() => { setSide(s); setPick(null); }}
                className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold capitalize transition-colors ${side === s ? "bg-ink text-page" : "border border-line/80 text-muted hover:border-ink/40"}`}>
                {s}
              </button>
            ))}
            <button type="button" onClick={addText} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink">+ Text</button>
            <label className="ml-auto flex items-center gap-1.5 text-[11.5px] text-muted">
              <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Guides
            </label>
          </div>

          <div ref={boardRef} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} className="relative w-fit touch-none select-none">
            <PostcardSide design={design} side={side} width={BOARD} showZones={guides}>
              {design.layers.filter((l) => l.side === side).map((l) => {
                const h = heightOf(l);
                const hit = l.kind === "image" ? Math.max(h, (l.w * 2) / 3) : h;
                return (
                  <div
                    key={l.id}
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => onDown(e, l, scale)}
                    onClick={() => setPick(l.id)}
                    title={nameOf(l)}
                    style={{
                      position: "absolute",
                      left: px(l.x * scale), top: px(l.y * scale),
                      width: px(l.w * scale), height: px(Math.max(4, hit) * scale),
                      cursor: "move",
                      outline: pick === l.id ? "1.5px solid #101014" : "1px dashed rgba(16,16,20,.18)",
                      outlineOffset: 2,
                      borderRadius: 2,
                      background: pick === l.id ? "rgba(16,16,20,.04)" : "transparent",
                    }}
                  />
                );
              })}
            </PostcardSide>
          </div>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            Drag anything. Arrow keys nudge half a millimetre, with shift five. The dashed border is the 5mm trim, and on the back the
            shaded block is Royal Mail&apos;s - keep out of both. Print artwork gives you the PDF a printer gets: both sides,
            A6 with 3mm of bleed, the type still type and the picture at full resolution.
          </p>

          {faults.length > 0 && (
            <ul className="mt-3 space-y-1.5 rounded-2xl border border-accent-dark/50 bg-accent-soft/30 p-4 text-[12px] text-accent-dark">
              {faults.map((f, i) => (
                <li key={i}>
                  <button type="button" onClick={() => { const l = design.layers.find((x) => x.id === f.layerId); if (l) { setSide(l.side); setPick(l.id); } }} className="text-left underline">
                    {f.says}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* the thing you picked */}
        <div className="space-y-4">
          {!layer ? (
            <section className="rounded-2xl border border-line/80 bg-panel p-5">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Nothing picked</p>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">Click something on the card to change it, or add a line of text.</p>
              <p className="mt-3 text-[11px] leading-relaxed text-muted">
                Anything in braces is filled in per landlord: {MERGE_FIELDS.map((f) => `{${f.key}}`).join(", ")}.
              </p>
            </section>
          ) : (
            <section className="rounded-2xl border border-line/80 bg-panel p-5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{nameOf(layer)}</p>
                <span className="flex gap-1.5">
                  <button type="button" onClick={() => shift(layer.id, -1)} title="Send backwards" className="rounded border border-line/80 px-1.5 text-[11px]">↓</button>
                  <button type="button" onClick={() => shift(layer.id, 1)} title="Bring forwards" className="rounded border border-line/80 px-1.5 text-[11px]">↑</button>
                </span>
              </div>

              {layer.kind === "text" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={label}>The words</label>
                    <textarea value={layer.text ?? ""} onChange={(e) => patch(layer.id, { text: e.target.value })} rows={4} className={`mt-1 ${field}`} />
                    <p className="mt-1 text-[10.5px] text-muted">A blank line starts a new paragraph.</p>
                  </div>
                  <div>
                    <label className={label}>Face</label>
                    <select value={layer.font ?? "montserrat"} onChange={(e) => patch(layer.id, { font: e.target.value as FontKey })} className={`mt-1 ${field}`}>
                      {FONTS.map((f) => <option key={f.key} value={f.key}>{f.name}</option>)}
                    </select>
                    <p className="mt-1 text-[10.5px] text-muted">{FONTS.find((f) => f.key === (layer.font ?? "montserrat"))?.note}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={label}>Size, mm</label>
                      <input type="number" step="0.2" value={layer.size ?? 3} onChange={(e) => patch(layer.id, { size: Number(e.target.value) || 1 })} className={`mt-1 ${field}`} />
                    </div>
                    <div>
                      <label className={label}>Line height</label>
                      <input type="number" step="0.05" value={layer.lineHeight ?? 1.4} onChange={(e) => patch(layer.id, { lineHeight: Number(e.target.value) || 1.2 })} className={`mt-1 ${field}`} />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Toggle on={!!layer.bold} onClick={() => patch(layer.id, { bold: !layer.bold })}>Bold</Toggle>
                    <Toggle on={!!layer.italic} onClick={() => patch(layer.id, { italic: !layer.italic })}>Italic</Toggle>
                    {(["left", "center", "right"] as const).map((a) => (
                      <Toggle key={a} on={(layer.align ?? "left") === a} onClick={() => patch(layer.id, { align: a })}>{a}</Toggle>
                    ))}
                  </div>
                  <div>
                    <label className={label}>Colour</label>
                    <div className="mt-1 flex gap-1.5">
                      {COLOURS.map((c) => (
                        <button key={c.key} type="button" title={c.name} onClick={() => patch(layer.id, { colour: c.key as ColourKey })}
                          className={`h-7 w-7 rounded-full border-2 ${(layer.colour ?? "ink") === c.key ? "border-ink" : "border-line/60"}`} style={{ background: c.hex }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {layer.kind === "image" && (
                <div className="mt-3 space-y-3">
                  <div className="grid gap-2">
                    {ILLUSTRATIONS.map((i) => (
                      <button key={i.key} type="button" onClick={() => patch(layer.id, { src: i.key as IllustrationKey })}
                        className={`flex items-center gap-3 rounded-xl border p-2 text-left transition-colors ${layer.src === i.key ? "border-ink bg-card" : "border-line/80 hover:border-ink/40"}`}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-box">
                          <img src={i.src} alt="" className="h-full w-full object-contain" />
                        </span>
                        <span className="text-[12px]">{i.name}</span>
                      </button>
                    ))}
                  </div>
                  <div>
                    <label className={label}>Width, mm</label>
                    <input type="number" step="2" value={layer.w} onChange={(e) => patch(layer.id, { w: Number(e.target.value) || 10 })} className={`mt-1 ${field}`} />
                  </div>
                </div>
              )}

              {layer.kind === "rule" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={label}>Length, mm</label>
                    <input type="number" step="1" value={layer.w} onChange={(e) => patch(layer.id, { w: Number(e.target.value) || 5 })} className={`mt-1 ${field}`} />
                  </div>
                  <div>
                    <label className={label}>Colour</label>
                    <div className="mt-1 flex gap-1.5">
                      {COLOURS.map((c) => (
                        <button key={c.key} type="button" title={c.name} onClick={() => patch(layer.id, { colour: c.key as ColourKey })}
                          className={`h-7 w-7 rounded-full border-2 ${(layer.colour ?? "ink") === c.key ? "border-ink" : "border-line/60"}`} style={{ background: c.hex }} />
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {layer.kind === "qr" && (
                <div className="mt-3 space-y-3">
                  <div>
                    <label className={label}>Goes to</label>
                    <input value={layer.url ?? ""} onChange={(e) => patch(layer.id, { url: e.target.value })} placeholder="https://…" className={`mt-1 ${field}`} />
                  </div>
                  <div>
                    <label className={label}>Size, mm</label>
                    <input type="number" step="1" value={layer.w} onChange={(e) => patch(layer.id, { w: Number(e.target.value) || 10 })} className={`mt-1 ${field}`} />
                    <p className="mt-1 text-[10.5px] text-muted">Below about 15mm a phone struggles.</p>
                  </div>
                </div>
              )}

              <div className="mt-4 grid grid-cols-3 gap-2">
                <div><label className={label}>X</label><input type="number" step="0.5" value={layer.x} onChange={(e) => patch(layer.id, { x: Number(e.target.value) })} className={`mt-1 ${field}`} /></div>
                <div><label className={label}>Y</label><input type="number" step="0.5" value={layer.y} onChange={(e) => patch(layer.id, { y: Number(e.target.value) })} className={`mt-1 ${field}`} /></div>
                <div><label className={label}>Width</label><input type="number" step="1" value={layer.w} onChange={(e) => patch(layer.id, { w: Number(e.target.value) || 5 })} className={`mt-1 ${field}`} /></div>
              </div>

              {layer.kind !== "wordmark" && (
                <button type="button" onClick={() => removeLayer(layer.id)} className="mt-4 text-[11.5px] text-accent-dark underline">
                  Take this off the card
                </button>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 text-[11px] capitalize transition-colors ${on ? "border-ink bg-ink text-page" : "border-line/80 text-muted hover:border-ink/40"}`}
    >
      {children}
    </button>
  );
}
