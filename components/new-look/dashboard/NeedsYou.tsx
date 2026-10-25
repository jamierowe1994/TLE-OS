"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ListPopout from "@/components/ListPopout";
import { Ico } from "@/components/new-look/Parts";
import { clearedHere, noticesSlot, useShared } from "@/components/widgets";
import type { Notice } from "@/lib/notices";
import { useSlideOver } from "@/lib/use-slide-over";

/**
 * Needs you, in the new look: the bell's own notices, scoped to the person -
 * the very list the old "Needs attention" tile reads, through the same shared
 * read (noticesSlot) and the same tick (/api/notifications/done), so a line
 * ticked in either look is gone from both.
 *
 * Pressing a line opens it in a small drawer (James, 25 Oct 2026: "I should
 * be able to click individually into these to see what the task is and then
 * tick them off"): the notice in full, when it came, the record it is about,
 * a way there and the same Done tick. The row keeps its way there as an arrow
 * alone ("drop the word Open and just have the arrow"); Call, Chase, Send and
 * Sign are arrows too, since every one of them only opens the record - the
 * verb is its label for a screen reader and on hover, and the drawer's own
 * button says where it goes. The tick is the old tile's: struck through for a
 * moment, then cleared, with a few seconds of Undo. "View all" pops out the
 * bell's full open list, as before.
 */

type Row = { id: string; title: string; body: string; href: string | null; hot: boolean; tone: Notice["tone"]; act: string; at: string; kind: Notice["kind"] };

/** What the record behind a notice is, from where it opens. */
function aboutOf(href: string): { what: string; go: string } {
  const path = href.split("?")[0];
  if (path.startsWith("/leads")) return { what: "A lead", go: "Open the Lead" };
  if (path.startsWith("/market-appraisals")) return { what: "A market appraisal", go: "Open the Appraisal" };
  if (path.startsWith("/listings")) return { what: "A listing", go: "Open the Listing" };
  if (path.startsWith("/applications")) return { what: "A let in progress", go: "Open the Application" };
  if (path.startsWith("/portfolio")) return { what: "A managed home", go: "Open the Home" };
  if (path.startsWith("/viewings")) return { what: "The diary", go: "Open the Diary" };
  if (path.startsWith("/compliance")) return { what: "Compliance", go: "Open Compliance" };
  if (path.startsWith("/maintenance")) return { what: "A repair", go: "Open the Job" };
  return { what: "Where it is dealt with", go: "Go to It" };
}

const fmtAt = (iso: string) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "Not recorded";
  return d.toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
};

/**
 * The button's word, from what the notice is (lib/notifications names each
 * by its id). Only where the item tells us what doing it means; otherwise Open.
 */
function actionFor(n: Notice): string {
  const id = n.id;
  if (/^(lead|still-looking|moved):/.test(id)) return "Call";
  if (/^terms-agent:/.test(id)) return "Sign";
  if (/^(terms-email|pre):/.test(id)) return "Send";
  if (n.kind === "chase") return "Chase";
  return "Open";
}

/** How many the board reads at once (the old tile's own limit). A full page
 *  means there may be more, so the count says "12+" rather than a total. */
const READ = 12;

export default function NeedsYou({ onCount }: { onCount?: (n: number | null, more: boolean) => void }) {
  const { data, loading, error } = useShared<{ notices: Notice[]; unread: number; seenAt: string | null }>(
    noticesSlot,
    `/api/notifications?limit=${READ}&open=1`,
    (j) => (j.ok && Array.isArray(j.notices) ? { notices: j.notices as Notice[], unread: Number(j.unread ?? 0), seenAt: (j.seenAt as string | null) ?? null } : null)
  );
  const [fading, setFading] = useState<Set<string>>(new Set());
  const [, setCleared] = useState(0);
  const [undoId, setUndoId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const undoTimer = useRef<number | null>(null);
  useEffect(() => () => { if (undoTimer.current) window.clearTimeout(undoTimer.current); }, []);

  const [showAll, setShowAll] = useState(false);
  /* The line open in the drawer. */
  const [detail, setDetail] = useState<Row | null>(null);
  const [everything, setEverything] = useState<Notice[] | null>(null);
  const [allError, setAllError] = useState<string | null>(null);
  useEffect(() => {
    if (!showAll) return;
    let gone = false;
    setAllError(null);
    fetch("/api/notifications?limit=100&open=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; notices?: Notice[] }) => {
        if (gone) return;
        if (j.ok && Array.isArray(j.notices)) setEverything(j.notices);
        else setAllError("The rest of the list couldn't be read just now.");
      })
      .catch(() => { if (!gone) setAllError("The rest of the list couldn't be read just now."); });
    return () => { gone = true; };
  }, [showAll]);

  const shape = (n: Notice): Row => ({
    id: n.id,
    title: n.title,
    body: n.body,
    href: n.href,
    hot: n.tone === "warn" || (data?.seenAt ? n.at > data.seenAt : true),
    tone: n.tone,
    act: actionFor(n),
    at: n.at,
    kind: n.kind,
  });
  const items = (data?.notices ?? []).filter((n) => !clearedHere.has(n.id)).map(shape);
  const allItems = everything ? everything.filter((n) => !clearedHere.has(n.id)).map(shape) : items;
  const openCount = items.filter((a) => !fading.has(a.id)).length;
  const more = (data?.notices.length ?? 0) >= READ;

  useEffect(() => {
    onCount?.(loading || error ? null : openCount, more);
  }, [onCount, loading, error, openCount, more]);

  const save = (id: string, isDone: boolean) =>
    fetch("/api/notifications/done", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, done: isDone }),
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean }) => Boolean(j.ok))
      .catch(() => false);
  const forget = () => { noticesSlot.p = null; noticesSlot.last = undefined; };
  const tick = (id: string) => {
    if (fading.has(id)) return;
    setSaveError(null);
    setFading((cur) => new Set(cur).add(id));
    const gone = new Promise((r) => window.setTimeout(r, 650));
    void Promise.all([save(id, true), gone]).then(([ok]) => {
      setFading((cur) => { const next = new Set(cur); next.delete(id); return next; });
      if (!ok) { setSaveError("That tick didn't save. Try again."); return; }
      clearedHere.add(id);
      forget();
      setCleared((n) => n + 1);
      setUndoId(id);
      if (undoTimer.current) window.clearTimeout(undoTimer.current);
      undoTimer.current = window.setTimeout(() => setUndoId(null), 6000);
    });
  };
  const undo = () => {
    const id = undoId;
    if (!id) return;
    setUndoId(null);
    clearedHere.delete(id);
    forget();
    setCleared((n) => n + 1);
    void save(id, false).then((ok) => {
      if (ok) return;
      clearedHere.add(id);
      setCleared((n) => n + 1);
      setSaveError("Undo didn't save. Try again.");
    });
  };

  const line = (a: Row, onOpen?: () => void) => {
    const ticked = fading.has(a.id);
    return (
      <li key={a.id} className={`${ticked ? "is-ticked" : ""}${a.hot ? "" : " is-seen"}`}>
        <button type="button" className="nl-dash-tick" aria-label={ticked ? "Done" : "Mark as done"} title="Mark as done" onClick={() => tick(a.id)}>
          {ticked && <Ico name="check" size={11} />}
        </button>
        <button
          type="button"
          className="nl-dash-line-text nl-dash-need-open"
          onClick={() => {
            setShowAll(false);
            setDetail(a);
          }}
          aria-label={`${a.title}. Show the detail.`}
        >
          <span className="nl-dash-strong">
            {/* The priority: clay for a warning, coral for new since you last
                looked, quiet once seen. */}
            <i className={`nl-dash-pri${a.tone === "warn" ? " is-warn" : a.hot ? " is-new" : ""}`} aria-hidden />
            {a.title}
          </span>
          {a.body && <span className="nl-meta">{a.body}</span>}
        </button>
        {a.href && (
          <Link href={a.href} onClick={onOpen} className="nl-dash-go is-icon" aria-label={a.act} title={a.act}>
            <Ico name="arrow" size={14} />
          </Link>
        )}
      </li>
    );
  };

  const foot = saveError ? (
    <p className="nl-dash-note nl-dash-warn">{saveError}</p>
  ) : undoId ? (
    <p className="nl-dash-note">
      Marked as done.{" "}
      <button type="button" onClick={undo} className="nl-link">
        Undo
      </button>
    </p>
  ) : null;

  return (
    <section className="nl-dash-card nl-dash-col" aria-labelledby="nl-dash-needs">
      <div className="nl-dash-card-h">
        <h3 id="nl-dash-needs">Needs You</h3>
        {!loading && !error && openCount > 0 && <span className="nl-meta">{openCount}{more ? "+" : ""} {openCount === 1 && !more ? "thing" : "things"}</span>}
      </div>
      {loading ? (
        <p className="nl-dash-wait">
          <span className="nl-dash-spin" aria-hidden />
          Reading the bell…
        </p>
      ) : error ? (
        <p className="nl-dash-note nl-dash-warn">Your list couldn&rsquo;t be read just now. Try again in a moment.</p>
      ) : items.length === 0 ? (
        <p className="nl-dash-note">Nothing needs you right now.</p>
      ) : (
        <ul className="nl-dash-needs">{items.slice(0, 5).map((a) => line(a))}</ul>
      )}
      {foot}
      {!loading && !error && items.length > 0 && (
        <div className="nl-dash-acts">
          <button type="button" className="nl-link" onClick={() => setShowAll(true)}>
            View all
          </button>
          {!foot && <span className="nl-meta">Tick a line when it&rsquo;s dealt with and it clears. The bell keeps everything.</span>}
        </div>
      )}

      <ListPopout
        open={showAll}
        onClose={() => setShowAll(false)}
        icon="bell"
        title="Needs You"
        sub="The same list as the bell, newest first. Tick a line when it's dealt with and it clears."
      >
        <div data-look="new" className="nl-dash-pop">
          <ul className="nl-dash-needs">{allItems.map((a) => line(a, () => setShowAll(false)))}</ul>
          {everything === null && !allError && <p className="nl-dash-note">Reading the rest of the list…</p>}
          {allError && <p className="nl-dash-note nl-dash-warn">{allError}</p>}
          {everything !== null && allItems.length === 0 && <p className="nl-dash-note">Nothing needs you right now.</p>}
          {foot}
        </div>
      </ListPopout>

      <NoticeDrawer
        row={detail}
        ticked={detail ? fading.has(detail.id) || clearedHere.has(detail.id) : false}
        cleared={detail ? clearedHere.has(detail.id) : false}
        onTick={() => detail && tick(detail.id)}
        onClose={() => setDetail(null)}
        saveError={saveError}
      />
    </section>
  );
}

/** One line of Needs You in full, with its Done tick and the way to it. */
function NoticeDrawer({
  row,
  ticked,
  cleared,
  onTick,
  onClose: closeNow,
  saveError,
}: {
  row: Row | null;
  ticked: boolean;
  cleared: boolean;
  onTick: () => void;
  onClose: () => void;
  saveError: string | null;
}) {
  const { shown, close } = useSlideOver(Boolean(row), closeNow, row?.id);
  useEffect(() => {
    if (!row) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [row, close]);
  /* Ticked here: it clears from the list behind, and the drawer goes a moment later. */
  const [closing, setClosing] = useState(false);
  useEffect(() => setClosing(false), [row?.id]);
  useEffect(() => {
    if (!row || !closing || !cleared) return;
    const id = window.setTimeout(close, 450);
    return () => window.clearTimeout(id);
  }, [row, closing, cleared, close]);
  if (!row || typeof document === "undefined") return null;
  const about = row.href ? aboutOf(row.href) : null;
  return createPortal(
    <div data-look="new" className="nl-drawer-wrap nl-dash-drawer is-small" data-shown={shown} role="dialog" aria-modal="true" aria-label={row.title}>
      <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={close} />
      <div className="nl-drawer">
        <div className="nl-drawer-head">
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">
              Needs You · {fmtAt(row.at)}
              {row.tone === "warn" ? " · needs doing" : ""}
            </p>
            <h2 className="nl-dash-drawer-title">{row.title}</h2>
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" onClick={close}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
        <div className="nl-drawer-body">
          {row.body ? <p className="nl-dash-need-body">{row.body}</p> : <p className="nl-dash-note">Nothing more was written on this one.</p>}
          <dl className="nl-dash-dl">
            <div><dt>When</dt><dd>{fmtAt(row.at)}</dd></div>
            <div>
              <dt>About</dt>
              <dd>
                {about && row.href ? (
                  <Link href={row.href} className="nl-link" onClick={() => closeNow()}>{about.what}</Link>
                ) : (
                  <span className="nl-meta">No record is linked to this one.</span>
                )}
              </dd>
            </div>
          </dl>
          {saveError && <p className="nl-dash-note nl-dash-warn">{saveError}</p>}
        </div>
        <div className="nl-drawer-foot">
          <button
            type="button"
            className={`nl-btn nl-btn--secondary nl-btn--sm nl-dash-done${ticked ? " is-done" : ""}`}
            disabled={ticked}
            onClick={() => {
              setClosing(true);
              onTick();
            }}
          >
            <Ico name="check" size={14} />
            {ticked ? "Done" : "Mark as done"}
          </button>
          {about && row.href && (
            <Link href={row.href} className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => closeNow()}>
              {about.go} <Ico name="arrow" size={14} />
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
