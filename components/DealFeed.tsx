"use client";

import { useCallback, useEffect, useState } from "react";
import { eventSentence, eventTone, type DealEvent } from "@/lib/business/deal-events";

/**
 * The activity feed: every deal move Propoly made, newest first.
 *
 * Kirstie asked (4 Sep) for one place she can leave open rather than opening
 * each deal to see if anything changed. So this refreshes itself every minute
 * and never clears - a move she has not read is still there when she looks.
 * Under each line is who was told, so "did Sam get the email" is answered
 * without asking.
 *
 * `compact` is the dashboard tile: fewer lines, no told line, no header.
 */

const REFRESH_MS = 60_000;

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${time}`;
}

function lastLooked(iso: string | null): string {
  if (!iso) return "Not looked yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "Checked just now";
  if (mins < 60) return `Checked ${mins} min ago`;
  return `Checked ${when(iso)}`;
}

export default function DealFeed({
  compact = false,
  limit,
}: {
  compact?: boolean;
  limit?: number;
}) {
  const [events, setEvents] = useState<DealEvent[] | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "mine">("mine");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pretenancy/feed?limit=${limit ?? (compact ? 12 : 80)}`, { cache: "no-store" });
      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        scope?: "all" | "mine";
        lastSeenAt?: string | null;
        events?: DealEvent[];
      };
      if (!data.ok) throw new Error(data.error ?? "Could not load the feed.");
      setEvents(data.events ?? []);
      setLastSeenAt(data.lastSeenAt ?? null);
      setScope(data.scope ?? "mine");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the feed.");
    }
  }, [compact, limit]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (error && !events) {
    return <p className="text-[12.5px] text-red-600">{error}</p>;
  }
  if (!events) {
    return (
      <div className="space-y-2.5" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-line/40" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {!compact && (
        <p className="mb-3 text-[11.5px] text-muted">
          {lastLooked(lastSeenAt)}
          {scope === "all" ? " · every deal on the book" : " · your deals"}
        </p>
      )}
      {events.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Nothing has moved since the watcher started. It looks every few minutes.
        </p>
      ) : (
        <ol className={compact ? "space-y-2" : "space-y-3"}>
          {events.map((e) => {
            const tone = eventTone(e.event);
            return (
              <li key={e.id} className="flex items-start gap-2.5">
                <span
                  aria-hidden
                  className={`mt-[7px] h-2 w-2 shrink-0 rounded-full ${
                    tone === "ok" ? "bg-emerald-600" : tone === "warn" ? "bg-amber-500" : "bg-line"
                  }`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className={`truncate ${compact ? "text-[12px]" : "text-[13px]"} font-semibold leading-tight`}>
                      {e.property || "Unnamed property"}
                    </p>
                    <span className="shrink-0 text-[10.5px] tabular-nums text-muted">{when(e.at)}</span>
                  </div>
                  <p className={`${compact ? "text-[11.5px]" : "text-[12.5px]"} leading-snug text-muted`}>
                    {eventSentence(e)}
                    {!compact && e.agentName ? ` · ${e.agentName}` : ""}
                  </p>
                  {!compact && e.toldNote && (
                    <p className="mt-0.5 text-[11px] leading-snug text-muted/80">{e.toldNote}</p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
