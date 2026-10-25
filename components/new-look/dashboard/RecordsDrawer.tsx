"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ico } from "@/components/new-look/Parts";
import { useSlideOver } from "@/lib/use-slide-over";
import type { FrontRecord, FrontRecords, RangeDays, RecordKind, SourceBucket } from "@/lib/front-dash";

/**
 * The list behind a front dashboard figure (new look, 25 Oct 2026), in the new
 * look's side drawer. James: "Each of these needs to be a clickable item where
 * they can actually see what's going on."
 *
 * The header repeats the figure and its days; the rows are the records that
 * make it up (GET /api/dashboard/front/records, the same reads and the same
 * scoping as the figure, so the count always matches) and each one opens its
 * own page. Terms out lists every set still out with who it's for, when it
 * went, how long it has waited and whether it is late, and opens the place to
 * chase it from. Full screen on a phone.
 *
 * A list that can't be read says so; nothing is ever shown from an old read.
 */

export type RecordAsk = {
  kind: RecordKind;
  /** The range, or one day of it (a bar on the leads chart). Terms take neither. */
  days?: RangeDays;
  day?: string;
  source?: SourceBucket | null;
  /** Title Case, as the figure is labelled. */
  title: string;
  /** The figure as the dashboard shows it. */
  figure: number;
  /** The days in words: "Last 30 days", "Mon 20 Oct", "Out now". */
  range: string;
  /** What the figure counts, in a line. */
  note?: string;
  /** The full screen for the lot. */
  board: { href: string; label: string };
};

const fmtWhen = (iso: string | null, withTime: boolean) => {
  if (!iso) return "Not recorded";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Not recorded";
  return d.toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
  });
};

/** The kinds whose rows carry a real time of day, not just a date. */
const TIMED = new Set<RecordKind>(["leads", "tenant", "appraisals", "passports", "viewings"]);

function query(ask: RecordAsk, offset: number): string {
  const p = new URLSearchParams({ kind: ask.kind });
  if (ask.day) p.set("day", ask.day);
  else if (ask.days) p.set("days", String(ask.days));
  if (ask.source) p.set("source", ask.source);
  if (offset) p.set("offset", String(offset));
  return `/api/dashboard/front/records?${p}`;
}

type Got = { rows: FrontRecord[]; total: number; more: boolean; lateAfterDays?: number };

export default function RecordsDrawer({ ask, onClose: closeNow }: { ask: RecordAsk | null; onClose: () => void }) {
  const key = ask ? query(ask, 0) : null;
  const { shown, close } = useSlideOver(Boolean(ask), closeNow, key);
  const [got, setGot] = useState<Got | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState<"idle" | "busy" | "failed">("idle");

  useEffect(() => {
    if (!ask) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ask, close]);

  useEffect(() => {
    setGot(null);
    setError(null);
    setMore("idle");
    if (!ask) return;
    const ctl = new AbortController();
    fetch(query(ask, 0), { cache: "no-store", signal: ctl.signal })
      .then((r) => r.json() as Promise<FrontRecords>)
      .then((j) => {
        if (j.ok) setGot({ rows: j.rows, total: j.total, more: j.more, lateAfterDays: j.lateAfterDays });
        else setError(j.error.replace(/\.$/, ""));
      })
      .catch((e) => {
        if ((e as Error)?.name !== "AbortError") setError("That list couldn't be read just now");
      });
    return () => ctl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loadMore = () => {
    if (!ask || !got || more === "busy") return;
    setMore("busy");
    fetch(query(ask, got.rows.length), { cache: "no-store" })
      .then((r) => r.json() as Promise<FrontRecords>)
      .then((j) => {
        if (!j.ok) return setMore("failed");
        setGot((g) => (g ? { ...g, rows: [...g.rows, ...j.rows], more: j.more, total: j.total } : g));
        setMore("idle");
      })
      .catch(() => setMore("failed"));
  };

  if (!ask || typeof document === "undefined") return null;
  const terms = ask.kind === "terms";
  const late = got ? got.rows.filter((r) => r.late).length : 0;

  return createPortal(
    <div data-look="new" className="nl-drawer-wrap nl-dash-drawer" data-shown={shown} role="dialog" aria-modal="true" aria-label={`${ask.title}, ${ask.range}`}>
      <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={close} />
      <div className="nl-drawer">
        <div className="nl-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">{ask.range}</p>
            <h2 className="nl-dash-drawer-title">{ask.title}</h2>
            <p className="nl-dash-drawer-fig">
              <b>{ask.figure.toLocaleString("en-GB")}</b>
              {terms && got && late > 0 && <em className="is-late">{late} late</em>}
            </p>
            {ask.note && <p className="nl-meta">{ask.note}</p>}
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="nl-drawer-body">
          {error ? (
            <p className="nl-dash-note nl-dash-warn">{error}. Nothing is shown rather than an old list.</p>
          ) : !got ? (
            <p className="nl-dash-wait">
              <span className="nl-dash-spin" aria-hidden />
              Reading the list…
            </p>
          ) : got.total === 0 ? (
            <p className="nl-dash-note">{terms ? "Nothing out for signature right now." : "None in these days."}</p>
          ) : (
            <div>
              {got.total !== ask.figure && (
                <p className="nl-dash-note nl-dash-drawer-drift">
                  {got.total.toLocaleString("en-GB")} now - the figure was read a moment ago and something has changed since.
                </p>
              )}
              {terms && got.lateAfterDays != null && (
                <p className="nl-meta nl-dash-drawer-lede">Late means unsigned for more than {got.lateAfterDays} days, past the last automatic nudge. Longest waiting first.</p>
              )}
              <ul className="nl-dash-recs">
                {got.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={r.href} className="nl-dash-rec" onClick={() => closeNow()}>
                      <span className="nl-dash-line-text">
                        <span className="nl-dash-strong">
                          {(r.fresh || r.late) && <i className={`nl-dash-pri ${r.late ? "is-warn" : "is-new"}`} aria-hidden />}
                          {r.name}
                        </span>
                        {r.property && <span className="nl-meta">{r.property}</span>}
                        <span className="nl-dash-rec-facts">
                          {terms ? (
                            <>
                              <span>Sent {fmtWhen(r.at, false)}</span>
                              <span>
                                {r.waiting == null ? "Days waiting not known" : `${r.waiting} ${r.waiting === 1 ? "day" : "days"} waiting`}
                              </span>
                              {r.late && <span className="is-late">Late</span>}
                            </>
                          ) : (
                            <>
                              <span>{fmtWhen(r.at, TIMED.has(ask.kind))}</span>
                              {r.source && <span>{r.source}</span>}
                            </>
                          )}
                          <span className={r.fresh ? "is-new" : undefined}>{r.status}</span>
                        </span>
                      </span>
                      <span className="nl-dash-rec-go" aria-hidden>
                        <Ico name="arrow" size={14} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              {got.more && (
                <div className="nl-dash-acts">
                  <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={loadMore} disabled={more === "busy"}>
                    {more === "busy" ? "Reading…" : `Show more (${(got.total - got.rows.length).toLocaleString("en-GB")} to go)`}
                  </button>
                  {more === "failed" && <span className="nl-meta nl-dash-warn">That didn&rsquo;t load. Try again.</span>}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="nl-drawer-foot">
          <Link href={ask.board.href} className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => closeNow()}>
            {ask.board.label}
          </Link>
        </div>
      </div>
    </div>,
    document.body
  );
}
