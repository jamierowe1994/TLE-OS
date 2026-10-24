"use client";

import { useEffect, useRef, useState } from "react";
import type { MaterialInfo } from "@/lib/matinfo";
import type { DesignSlideId, PresentNote } from "@/lib/present";
import { Ic, Loading, SLIDE_NOTE, kindOf, type Draft, type FactKey } from "./shared";
import type { Up } from "./Builder";

/* The size the preview draws the deck at before scaling it down: the box's own 16 by 9.4. */
const DECK_W = 1440;
const DECK_H = Math.round((1440 * 9.4) / 16);

/**
 * 4. THE DECK. The appraisal deck's twelve slides in order, Cover and Next
 * Steps fixed, the rest switchable; a slide that can't be drawn yet says what
 * it needs and links to the step that supplies it. Beside them the REAL deck:
 * the server draws it from the very body Create would save (POST
 * /api/presentations with preview: true) and it goes into a frame. Below,
 * what tenants will love and what's worth doing first, with ideas to tap.
 */

export type SlideRow = { id: DesignSlideId; title: string; fixed: boolean; blk: string | null; fix: number | null; on: boolean };

/** Ideas to tap, from what's known about the home first, then the ones that suit most homes. */
function loveIdeas(facts: Record<FactKey, string | null>, m: MaterialInfo | null): PresentNote[] {
  const out: PresentNote[] = [];
  const rating = (m?.compliance.epcRating ?? "").trim().toUpperCase();
  const heat = m?.groups.flatMap((g) => g.fields).find((f) => f.label === "Heating")?.value ?? "";
  const beds = Number(facts.beds);
  if (facts.outside && !/^(none|no)\b/i.test(facts.outside)) out.push({ title: facts.outside, line: "Outside space is one of the first things tenants filter for." });
  if (facts.parking && !/^(none|no)\b/i.test(facts.parking)) out.push({ title: `Parking: ${facts.parking.toLowerCase()}`, line: "It saves a tenant a permit, or a walk." });
  if (/^[ABC]$/.test(rating)) out.push({ title: `An EPC rating of ${rating}`, line: "Lower bills, and tenants ask about them." });
  if (/gas/i.test(heat) || /boiler/i.test(heat)) out.push({ title: "Gas central heating", line: "Warm, and cheaper to run than electric." });
  if (facts.furn === "Furnished") out.push({ title: "Ready to move into", line: "Furnished, so a tenant can arrive with a suitcase." });
  if (Number.isFinite(beds) && beds >= 2) out.push({ title: `${beds} good bedrooms`, line: "Room for sharers, a couple with a study, or a small family." });
  out.push({ title: "A good first photo", line: "The front photo does the first viewing." });
  out.push({ title: "Close to shops and buses", line: "Tenants weigh the walk to the shops as much as the rent." });
  return out;
}
function fixIdeas(m: MaterialInfo | null): PresentNote[] {
  const out: PresentNote[] = [];
  const c = m?.compliance;
  const rating = (c?.epcRating ?? "").trim().toUpperCase();
  const assessed = c?.epcAssessedOn ? new Date(c.epcAssessedOn) : null;
  /* An EPC lasts ten years from its assessment. */
  const expired = assessed && !Number.isNaN(assessed.valueOf()) ? new Date(assessed.getFullYear() + 10, assessed.getMonth(), assessed.getDate()) < new Date() : false;
  if (!rating || expired) out.push({ title: "Book an EPC", line: "We can't list without one. We'll arrange it." });
  out.push({ title: "Book the gas safety check before the photos", line: "It's needed before move-in anyway, and tenants ask about the boiler." });
  out.push({ title: "Book the electrical check (EICR)", line: "Every tenancy needs one, every five years." });
  out.push({ title: "Fresh paint in the hallway", line: "The first photo and the first impression." });
  return out;
}

/**
 * The preview, double-buffered: the new deck loads in the frame behind and
 * only swaps in once it has drawn, so the agent never watches it go blank.
 */
function DeckPreview({ body, startAt }: { body: unknown; startAt: number }) {
  const json = JSON.stringify(body);
  const frames = [useRef<HTMLIFrameElement>(null), useRef<HTMLIFrameElement>(null)];
  const [docs, setDocs] = useState<[string | null, string | null]>([null, null]);
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const [front, setFront] = useState(0);
  const frontRef = useRef(0);
  frontRef.current = front;
  const loading = useRef<number | null>(null);
  const [busy, setBusy] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const startRef = useRef(startAt);
  startRef.current = startAt;
  /* The deck is drawn at a laptop's size and scaled into the box, so the
     preview shows the presenting layout, never the deck's phone layout. */
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / DECK_W));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const ctl = new AbortController();
    setBusy(true);
    const t = window.setTimeout(() => {
      fetch("/api/presentations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...JSON.parse(json), preview: true, startAt: startRef.current }),
        signal: ctl.signal,
      })
        .then(async (r) => {
          const text = await r.text();
          if (!r.ok || !(r.headers.get("content-type") ?? "").includes("text/html")) {
            let msg = `The preview couldn't be drawn (${r.status}).`;
            try {
              msg = (JSON.parse(text) as { error?: string }).error ?? msg;
            } catch {
              /* not JSON: keep the status */
            }
            setProblem(msg);
            setBusy(false);
            return;
          }
          const back = 1 - frontRef.current;
          setProblem(null);
          /* Already drawn behind (a change undone): bring it forward, nothing to load. */
          if (docsRef.current[back] === text) {
            setFront(back);
            setBusy(false);
            return;
          }
          if (docsRef.current[frontRef.current] === text) {
            setBusy(false);
            return;
          }
          loading.current = back;
          setDocs((d) => {
            const next: [string | null, string | null] = [d[0], d[1]];
            next[back] = text;
            return next;
          });
        })
        .catch(() => {
          if (ctl.signal.aborted) return;
          setProblem("The preview couldn't be reached.");
          setBusy(false);
        });
    }, 400);
    return () => {
      window.clearTimeout(t);
      ctl.abort();
    };
  }, [json]);

  /* A slide clicked in the list: move the frame on screen, no redraw. */
  useEffect(() => {
    frames[front].current?.contentWindow?.postMessage({ go: startAt }, "*");
    // frames are refs; the front one is the one to move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startAt, front]);

  return (
    <>
      <div className="slide deckframe" ref={box}>
        {[0, 1].map((i) =>
          docs[i] ? (
            <iframe
              key={i}
              ref={frames[i]}
              title={i === front ? "Presentation preview" : "Presentation preview, drawing"}
              srcDoc={docs[i] ?? undefined}
              className={i === front ? "front" : "back"}
              style={{ width: DECK_W, height: DECK_H, transform: `scale(${scale})`, transformOrigin: "0 0" }}
              aria-hidden={i !== front}
              tabIndex={i === front ? 0 : -1}
              onLoad={() => {
                if (loading.current !== i) return;
                loading.current = null;
                setFront(i);
                setBusy(false);
              }}
            />
          ) : null
        )}
        {!docs[0] && !docs[1] && <div className="deck-wait">{problem ? problem : <Loading say="Drawing the deck" />}</div>}
        {(docs[0] || docs[1]) && (busy || problem) && <span className="deck-state">{problem ?? "Updating"}</span>}
      </div>
    </>
  );
}

export default function StepDeck({
  S,
  up,
  go,
  slides,
  body,
  startAt,
  first,
  fullHref,
  facts,
  material,
}: {
  S: Draft;
  up: Up;
  go: (k: number) => void;
  slides: SlideRow[];
  body: unknown;
  startAt: number;
  first: string;
  fullHref: string | null;
  facts: Record<FactKey, string | null>;
  material: MaterialInfo | null;
  scottish: boolean;
}) {
  const on = slides.filter((s) => s.on);
  const loves = loveIdeas(facts, material).filter((i) => !S.loves.some((l) => l.title === i.title)).slice(0, 5);
  const fixes = fixIdeas(material).filter((i) => !S.fixes.some((l) => l.title === i.title)).slice(0, 3);
  const flat = kindOf(facts.type) === "flat";

  function note(which: "loves" | "fixes", k: number, part: "title" | "line", v: string) {
    up((s) => ({ [which]: s[which].map((n, i) => (i === k ? { ...n, [part]: v } : n)) }) as Partial<Draft>);
  }
  function idea(which: "loves" | "fixes", n: PresentNote) {
    up((s) => {
      const k = s[which].findIndex((l) => !l.title.trim());
      if (k < 0) return {};
      return { [which]: s[which].map((l, i) => (i === k ? n : l)), cur: "home" } as Partial<Draft>;
    });
  }

  return (
    <div className="pane">
      <div className="deck">
        <div className="slides">
          <div className="sgrp k">
            The appraisal deck · {on.length} of {slides.length} slides
          </div>
          {slides.map((s) => {
            const n = on.indexOf(s) + 1;
            return (
              <div
                key={s.id}
                className={`sl${s.on ? "" : " off"}${s.blk ? " blk" : ""}${S.cur === s.id ? " cur" : ""}`}
                onClick={() => s.on && up({ cur: s.id })}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => e.key === "Enter" && s.on && up({ cur: s.id })}
                aria-current={S.cur === s.id}
              >
                <i>{s.on ? n : "-"}</i>
                <span>
                  <b>{s.title}</b>
                  {s.blk ? (
                    <span>
                      {s.blk}{" "}
                      {s.fix != null && (
                        <a
                          href="#"
                          style={{ color: "inherit" }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            go(s.fix!);
                          }}
                        >
                          Fix
                        </a>
                      )}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>{SLIDE_NOTE[s.id]}</span>
                  )}
                </span>
                {s.fixed ? (
                  <span className="fx">FIXED</span>
                ) : (
                  <button
                    type="button"
                    className={`sw${s.on ? " on" : ""}`}
                    disabled={Boolean(s.blk)}
                    aria-pressed={s.on}
                    aria-label={`Include ${s.title}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      up((st) => ({ off: st.off.includes(s.id) ? st.off.filter((x) => x !== s.id) : [...st.off, s.id], cur: st.cur === s.id ? "cover" : st.cur }));
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        <div className="prev">
          <div className="prev-h">
            <span className="k">The real deck, as {first} will see it</span>
            {fullHref ? (
              <a className="btn sm" href={fullHref} target="_blank" rel="noreferrer" title="The last saved version">
                Open full screen <Ic k="arrow" />
              </a>
            ) : (
              <button type="button" className="btn sm" disabled title="Create it first">
                Open full screen <Ic k="arrow" />
              </button>
            )}
          </div>
          <DeckPreview body={body} startAt={startAt} />
          <div className="prev-n">
            <span>Click a slide on the left to jump to it.{fullHref ? " Full screen opens the last saved version." : " Create it to open it full screen."}</span>
          </div>

          <div className="words">
            <div className="box">
              <h4>What tenants will love</h4>
              <p>Three things, a title and a line each. They go on Your Home.</p>
              {S.loves.map((l, k) => (
                <div className="wl" key={k}>
                  <i>{k + 1}</i>
                  <span>
                    <input value={l.title} onChange={(e) => note("loves", k, "title", e.target.value)} placeholder={flat ? "e.g. A bright, quiet flat" : "e.g. A short walk to the shops"} maxLength={80} />
                    <input className="w" value={l.line} onChange={(e) => note("loves", k, "line", e.target.value)} placeholder="One line on why" maxLength={160} />
                  </span>
                </div>
              ))}
              {S.loves.some((l) => !l.title.trim()) && (
                <div className="ideas">
                  {loves.map((i) => (
                    <button type="button" key={i.title} onClick={() => idea("loves", i)}>
                      + {i.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="box">
              <h4>Worth doing before we list</h4>
              <p>Up to two jobs for the landlord. They go on Your Home too.</p>
              {S.fixes.map((l, k) => (
                <div className="wl" key={k}>
                  <i>{k + 1}</i>
                  <span>
                    <input value={l.title} onChange={(e) => note("fixes", k, "title", e.target.value)} placeholder="e.g. Book an EPC" maxLength={80} />
                    <input className="w" value={l.line} onChange={(e) => note("fixes", k, "line", e.target.value)} placeholder="One line on why" maxLength={160} />
                  </span>
                </div>
              ))}
              {S.fixes.some((l) => !l.title.trim()) && (
                <div className="ideas">
                  {fixes.map((i) => (
                    <button type="button" key={i.title} onClick={() => idea("fixes", i)}>
                      + {i.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
