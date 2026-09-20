"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { AccessRow, AccessState } from "@/lib/access-board";

/**
 * CAN WE GET IN? - the fortnight ahead, on the Viewings screen.
 *
 * James, 20 Sep 2026: "really important for us to track which ones do and
 * don't have access, as well as what the most important ones are". So this
 * leads with the ones that are not sorted, soonest first - the chase list -
 * and says how many are fine rather than listing them. Each row opens the
 * property, where the viewing itself carries the asking and the confirming.
 *
 * Quiet when there is nothing to chase: a card that says "all sorted" every
 * day is a card people stop reading.
 */

const WORDS: Record<AccessState, { label: string; tone: string; rank: number }> = {
  none: { label: "No access details", tone: "bg-accent-soft text-accent-dark", rank: 0 },
  keys: { label: "Keys to collect", tone: "bg-accent-soft/70 text-accent-dark", rank: 1 },
  "to-ask": { label: "Nobody asked yet", tone: "bg-accent-soft/70 text-accent-dark", rank: 1 },
  asked: { label: "Asked, no answer", tone: "bg-[#f1ece6] text-[#6b5a53]", rank: 2 },
  sorted: { label: "Sorted", tone: "bg-[#e7ece0] text-[#43513a]", rank: 3 },
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export default function AccessBoard({ days = 14 }: { days?: number }) {
  const [rows, setRows] = useState<AccessRow[] | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/viewings/access?days=${days}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; rows?: AccessRow[] } | null) => {
        if (live && j?.ok) setRows(j.rows ?? []);
      })
      .catch(() => live && setRows([]));
    return () => { live = false; };
  }, [days]);

  if (rows === null || rows.length === 0) return null;
  const chase = rows.filter((r) => r.state !== "sorted" && r.state !== "asked");
  const asked = rows.filter((r) => r.state === "asked");
  const sorted = rows.length - chase.length - asked.length;
  if (!chase.length && !asked.length) return null;

  /* One line per PROPERTY, not per viewing: three people seeing the same
     house on Monday is one door to get opened. The soonest one leads, and
     the state shown is the worst of them. */
  const byHome = new Map<string, { row: AccessRow; count: number }>();
  for (const r of [...chase, ...asked]) {
    const held = byHome.get(r.listingId);
    if (!held) byHome.set(r.listingId, { row: r, count: 1 });
    else byHome.set(r.listingId, { row: WORDS[r.state].rank < WORDS[held.row.state].rank ? r : held.row, count: held.count + 1 });
  }
  const homes = [...byHome.values()].sort((a, b) => WORDS[a.row.state].rank - WORDS[b.row.state].rank || a.row.startsAt.localeCompare(b.row.startsAt));
  const list = homes.slice(0, 8);

  return (
    <section className="fade-up rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line/60 pb-3">
        <h2 className="hand flex items-center gap-2.5 text-[17px] leading-tight">
          <DoodleIcon name="key" size={15} className="text-accent-dark" />
          Can We Get In?
        </h2>
        <p className="text-[11.5px] text-muted">
          The next {days} days · {chase.length} to sort{asked.length ? `, ${asked.length} waiting on an answer` : ""}
          {sorted ? ` · ${sorted} sorted` : ""} · by property
        </p>
      </div>

      <ul className="mt-3 divide-y divide-line/40">
        {list.map(({ row: r, count }) => (
          <li key={r.listingId} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5">
            <span className="w-[140px] shrink-0 text-[11.5px] text-muted">{when(r.startsAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] font-semibold">{r.address}</span>
              <span className="block truncate text-[11px] text-muted">
                {count > 1 ? `${count} viewings` : r.who}
                {r.agent ? ` · with ${r.agent}` : ""}
                {r.through ? ` · ${r.through}` : ""}
                {r.test ? " · test file" : ""}
              </span>
            </span>
            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${WORDS[r.state].tone}`}>{WORDS[r.state].label}</span>
            <a
              href={`/listings?open=${encodeURIComponent(r.listingId)}`}
              className="shrink-0 rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold transition-colors hover:border-ink/40"
            >
              Sort it
            </a>
          </li>
        ))}
      </ul>
      {list.length < homes.length && (
        <p className="mt-2.5 text-[11.5px] text-muted">And {homes.length - list.length} more.</p>
      )}
    </section>
  );
}
