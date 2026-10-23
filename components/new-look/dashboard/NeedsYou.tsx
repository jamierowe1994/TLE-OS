"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import ListPopout from "@/components/ListPopout";
import { Ico } from "@/components/new-look/Parts";
import { clearedHere, noticesSlot, useShared } from "@/components/widgets";
import type { Notice } from "@/lib/notices";

/**
 * Needs you, in the new look: the bell's own notices, scoped to the person -
 * the very list the old "Needs attention" tile reads, through the same shared
 * read (noticesSlot) and the same tick (/api/notifications/done), so a line
 * ticked in either look is gone from both.
 *
 * Each line opens where it is dealt with (the design's sage button), and keeps
 * the old tile's tick: struck through for a moment, then cleared, with a few
 * seconds of Undo. "View all" pops out the bell's full open list, as before.
 */

type Row = { id: string; title: string; body: string; href: string | null; hot: boolean };

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
        <span className="nl-dash-line-text">
          <span className="nl-dash-strong">{a.title}</span>
          {a.body && <span className="nl-meta">{a.body}</span>}
        </span>
        {a.href && (
          <Link href={a.href} onClick={onOpen} className="nl-dash-go">
            Open <Ico name="arrow" size={13} />
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
    <section className="nl-dash-col" aria-labelledby="nl-dash-needs">
      <div className="nl-dash-sec-head">
        <h2 id="nl-dash-needs" className="nl-dash-sec-title">
          Needs You
        </h2>
        {!loading && !error && openCount > 0 && <span className="nl-count">{openCount}{more ? "+" : ""}</span>}
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
    </section>
  );
}
