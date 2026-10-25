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

/** The PM Dashboard's own lists (app/api/overview/records), drawn by the same pop-out. */
export type PmRecordKind = "managed" | "arrears" | "maintenance" | "compliance" | "applications" | "market";

export type RecordAsk = {
  kind: RecordKind | PmRecordKind;
  /** Where the list is read from; the front dashboard's by default. */
  endpoint?: string;
  /** The five column headings, where the list isn't people and dates (the PM Dashboard's). */
  columns?: [string, string, string, string, string];
  /** What an empty list says. */
  empty?: string;
  /** False where the list is knowingly a wider count than the figure (the PM Dashboard's
   *  Managed homes against the whole book): the header shows the list's own count and
   *  the "something has changed" line is not said. */
  drift?: boolean;
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
const TIMED = new Set<string>(["leads", "tenant", "appraisals", "passports", "viewings"]);

function query(ask: RecordAsk, offset: number): string {
  const p = new URLSearchParams({ kind: ask.kind });
  if (ask.day) p.set("day", ask.day);
  else if (ask.days) p.set("days", String(ask.days));
  if (ask.source) p.set("source", ask.source);
  if (offset) p.set("offset", String(offset));
  return `${ask.endpoint ?? "/api/dashboard/front/records"}?${p}`;
}

type Got = { rows: FrontRecord[]; total: number; more: boolean; lateAfterDays?: number };

/** One tick for sent, two for opened, as a message app does (James, 25 Oct 2026). */
function Ticks({ opened }: { opened: boolean | null | undefined }) {
  const two = opened === true;
  return (
    <span
      className={`nl-ticks${two ? " is-read" : ""}`}
      title={opened == null ? "Sent. Whether it's been opened isn't recorded for e-signature requests." : two ? "Opened by the landlord" : "Sent, not opened yet"}
    >
      <svg width="20" height="14" viewBox="0 0 20 14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M1.5 7.5l3.5 3.5 7-8" />
        {two && <path d="M8 11l7-8" />}
      </svg>
      <span>{opened == null ? "Sent" : two ? "Opened" : "Not opened"}</span>
    </span>
  );
}

/** Nudge one set: asks once ("Email Roman"), then sends from the person's own mailbox. */
function Nudge({ r }: { r: FrontRecord }) {
  const [state, setState] = useState<"idle" | "ask" | "going" | "done" | "failed">("idle");
  const [said, setSaid] = useState<string | null>(null);
  const first = (r.name.split(" & ")[0] ?? "").trim().split(/\s+/)[0] || "them";
  const go = async () => {
    setState("going");
    const j = (await fetch("/api/dashboard/front/nudge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id }) })
      .then((x) => x.json())
      .catch(() => null)) as { ok?: boolean; error?: string; to?: string } | null;
    if (j?.ok) {
      setState("done");
      setSaid(`Nudged ${j.to || first}`);
    } else {
      setState("failed");
      setSaid(j?.error ?? "That didn't send. Try again.");
    }
  };
  if (state === "done") return <span className="nl-dash-nudge-said is-ok">{said}</span>;
  if (state === "ask" || state === "going") {
    return (
      <span className="nl-dash-nudge">
        <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={state === "going"} onClick={() => void go()}>
          {state === "going" ? "Sending…" : `Email ${first}`}
        </button>
        <button type="button" className="nl-link" disabled={state === "going"} onClick={() => setState("idle")}>
          Cancel
        </button>
      </span>
    );
  }
  return (
    <span className="nl-dash-nudge">
      {state === "failed" && <span className="nl-dash-nudge-said is-bad">{said}</span>}
      <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => setState("ask")}>
        Nudge
      </button>
    </span>
  );
}

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
    <div data-look="new" className="nl-drawer-wrap nl-dash-drawer nl-dash-modal" data-shown={shown} role="dialog" aria-modal="true" aria-label={`${ask.title}, ${ask.range}`}>
      <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={close} />
      <div className="nl-drawer">
        <div className="nl-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">{ask.range}</p>
            <h2 className="nl-dash-drawer-title">{ask.title}</h2>
            <p className="nl-dash-drawer-fig">
              <b>{(ask.drift === false && got ? got.total : ask.figure).toLocaleString("en-GB")}</b>
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
            <p className="nl-dash-note">{ask.empty ?? (terms ? "Nothing out for signature right now." : "None in these days.")}</p>
          ) : (
            <div>
              {got.total !== ask.figure && ask.drift !== false && (
                <p className="nl-dash-note nl-dash-drawer-drift">
                  {got.total.toLocaleString("en-GB")} now - the figure was read a moment ago and something has changed since.
                </p>
              )}
              {terms && got.lateAfterDays != null && (
                <p className="nl-meta nl-dash-drawer-lede">Late means unsigned for more than {got.lateAfterDays} days, past the last automatic nudge. Longest waiting first.</p>
              )}
              {/* Wide and in columns (James, 25 Oct 2026): every row lines up under its heading, no dots.
                  The rows drop in one after another; terms add Opened (one tick sent, two opened) and a Nudge. */}
              <div className={`nl-dash-table${terms ? " is-terms" : ""}`} role="table" aria-label={ask.title}>
                <div className="nl-dash-trow nl-dash-thead" role="row">
                  <span role="columnheader">{ask.columns?.[0] ?? (terms ? "For" : "Name")}</span>
                  <span role="columnheader">{ask.columns?.[1] ?? "Property"}</span>
                  <span role="columnheader">{ask.columns?.[2] ?? (terms ? "Sent" : "When")}</span>
                  <span role="columnheader">{ask.columns?.[3] ?? (terms ? "Waiting" : "Source")}</span>
                  <span role="columnheader">{ask.columns?.[4] ?? "Status"}</span>
                  {terms && <span role="columnheader">Opened</span>}
                  {terms && <span aria-hidden />}
                  <span aria-hidden />
                </div>
                {got.rows.map((r, i) => {
                  const cells = (
                    <>
                      <span role="cell" className="nl-dash-strong">{r.name}</span>
                      <span role="cell" className="nl-meta">{r.property || "-"}</span>
                      <span role="cell">{fmtWhen(r.at, !terms && TIMED.has(ask.kind))}</span>
                      <span role="cell">
                        {terms
                          ? r.waiting == null
                            ? "Not known"
                            : `${r.waiting} ${r.waiting === 1 ? "day" : "days"}`
                          : r.source || "-"}
                      </span>
                      <span role="cell" className={r.late ? "is-late" : r.fresh ? "is-new" : undefined}>
                        {r.late ? `Late · ${r.status}` : r.status}
                      </span>
                    </>
                  );
                  const delay = { animationDelay: `${Math.min(i, 14) * 60 + 140}ms` };
                  if (!terms) {
                    return (
                      <Link key={r.id} href={r.href} className="nl-dash-trow nl-dash-rec nl-dash-rec-in" style={delay} role="row" onClick={() => closeNow()}>
                        {cells}
                        <span role="cell" className="nl-dash-rec-go" aria-hidden>
                          <Ico name="arrow" size={14} />
                        </span>
                      </Link>
                    );
                  }
                  /* A terms row holds a button, so the row is a block with the
                     link stretched over it and the Nudge sitting above the link. */
                  return (
                    <div key={r.id} className="nl-dash-trow nl-dash-rec nl-dash-rec-in is-term" style={delay} role="row">
                      {cells}
                      <span role="cell"><Ticks opened={r.opened} /></span>
                      <span role="cell" className="nl-dash-rec-nudge"><Nudge r={r} /></span>
                      <Link href={r.href} role="cell" className="nl-dash-rec-go nl-dash-rec-stretch" aria-label={`Open ${r.name}`} onClick={() => closeNow()}>
                        <Ico name="arrow" size={14} />
                      </Link>
                    </div>
                  );
                })}
              </div>
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
