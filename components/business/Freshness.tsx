"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Loaded 17 hours ago · Refresh" — in the business header, above every tab.
 *
 * James: "we should have it loaded from Propoly, like 17 hours ago or whatever.
 * They should have a manual refresh button where they can force a refresh, just
 * in case they need up-to-date info and we are only running on a cron system."
 *
 * ── Why the header and not each tile ──────────────────────────────────────
 *
 * Because the question is asked once, about the screen, not eleven times about
 * eleven tiles. Per-tile ages would be more precise and completely unreadable —
 * and each tile already carries its own source badge for the "where did this
 * come from" half of the question. This answers "how old is what I'm looking
 * at", which is the half that decides whether to trust it on a call.
 *
 * It shows the OLDEST of the sources, deliberately. A header claiming "loaded 2
 * minutes ago" because REX answered recently, while PayProp's figures are from
 * yesterday, is worse than no header: the figures are only as fresh as the
 * slowest thing feeding them.
 */

function ago(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "at an unknown time";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

interface Source {
  label: string;
  feeds: string;
  computedAt: string | null;
}

export default function Freshness() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [oldest, setOldest] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/business/freshness", { cache: "no-store" });
      if (!r.ok) return;
      const d = (await r.json()) as { sources?: Source[]; oldest?: string | null };
      setSources(d.sources ?? []);
      setOldest(d.oldest ?? null);
    } catch {
      /* Freshness failing must never take the figures down with it — this is
         a caption, not a data source. */
    }
  }, []);

  useEffect(() => {
    void load();
    /* Re-tick every minute so "just now" becomes "2 minutes ago" while the
       page is open. Susan leaves this on a second screen during calls. */
    const t = setInterval(() => setSources((s) => (s ? [...s] : s)), 60_000);
    return () => clearInterval(t);
  }, [load]);

  async function refresh() {
    setBusy(true);
    setSaid(null);
    try {
      const r = await fetch("/api/business/freshness", { method: "POST" });
      const d = (await r.json()) as { cleared?: string[] };
      setSaid(
        d.cleared?.length
          ? `Cleared ${d.cleared.join(", ")}. Reloading…`
          : "Nothing to clear."
      );
      await load();
      /* A full reload, because every tab holds its own fetched state and there
         is no way to tell eleven of them to forget it from here. */
      if (d.cleared?.length) setTimeout(() => window.location.reload(), 700);
    } catch {
      setSaid("Couldn't refresh just now.");
    } finally {
      setBusy(false);
    }
  }

  const detail = sources
    ?.map((s) => `${s.label}: ${s.computedAt ? ago(s.computedAt) : "never"} (${s.feeds})`)
    .join("\n");

  return (
    <div className="flex items-center gap-2 text-[11px] text-muted">
      <span title={detail ?? undefined} className={detail ? "cursor-help" : undefined}>
        {sources == null
          ? "Checking how fresh this is…"
          : oldest
            ? `Loaded ${ago(oldest)}`
            : "Not loaded yet"}
      </span>
      <button
        type="button"
        onClick={refresh}
        disabled={busy}
        className="rounded-lg border border-line/80 px-2 py-1 text-[11px] transition-colors hover:border-ink disabled:opacity-50"
      >
        {busy ? "Refreshing…" : "Refresh"}
      </button>
      {said ? <span className="text-[10.5px]">{said}</span> : null}
    </div>
  );
}
