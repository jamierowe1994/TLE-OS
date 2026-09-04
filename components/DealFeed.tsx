"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { eventSentence, eventTone, hrefFor, type DealEvent } from "@/lib/business/deal-events";

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
const LAST_SEEN_KEY = "tle-feed-last-seen-id";

/**
 * The install prompt Chrome hands a page whose manifest qualifies. Kept so
 * the "Install" button can call it; Safari never fires it, so that button
 * says "Add to Dock" and points at the share menu instead.
 */
interface InstallPrompt extends Event {
  prompt: () => Promise<void>;
}

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

/** The feed in its own small window, chrome-free. */
export function popOutFeed(): void {
  window.open("/feed", "tle-feed", "popup=yes,width=440,height=760,top=80,left=80");
}

export default function DealFeed({
  compact = false,
  limit,
  desktop = false,
  popout = false,
}: {
  compact?: boolean;
  limit?: number;
  /** The full page: offers install and desktop alerts, and pings on new rows. */
  desktop?: boolean;
  /** Already in its own window: no pop-out button, links open in the main window. */
  popout?: boolean;
}) {
  const [events, setEvents] = useState<DealEvent[] | null>(null);
  const [lastSeenAt, setLastSeenAt] = useState<string | null>(null);
  const [scope, setScope] = useState<"all" | "mine">("mine");
  const [error, setError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<"unsupported" | "default" | "granted" | "denied">("default");
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [installed, setInstalled] = useState(false);
  /* The newest row id this browser has already seen. Anything newer on a
     later poll is news and gets a notification; the first load never does. */
  const seenId = useRef<number | null>(null);

  useEffect(() => {
    if (!desktop) return;
    setAlerts(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
    setInstalled(window.matchMedia("(display-mode: standalone)").matches);
    try {
      const v = localStorage.getItem(LAST_SEEN_KEY);
      if (v) seenId.current = Number(v);
    } catch {
      /* private window; the first poll seeds it */
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, [desktop]);

  const ping = useCallback((fresh: DealEvent[]) => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    /* One notification per move, newest last so they stack in order. More
       than four at once collapses to a single count: a burst after a quiet
       spell is a summary, not a drumroll. */
    if (fresh.length > 4) {
      new Notification(`${fresh.length} deals moved`, { body: "Open the feed to see them.", icon: "/icons/app/icon-192.png", tag: "tle-feed-burst" });
      return;
    }
    for (const e of [...fresh].reverse()) {
      new Notification(e.property || "A deal moved", { body: eventSentence(e), icon: "/icons/app/icon-192.png", tag: `tle-feed-${e.id}` });
    }
  }, []);

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
      const rows = data.events ?? [];
      if (desktop && rows.length) {
        const newest = rows[0].id;
        if (seenId.current != null && newest > seenId.current) {
          ping(rows.filter((e) => e.id > (seenId.current as number)));
        }
        seenId.current = Math.max(newest, seenId.current ?? 0);
        try {
          localStorage.setItem(LAST_SEEN_KEY, String(seenId.current));
        } catch {
          /* fine */
        }
      }
      setEvents(rows);
      setLastSeenAt(data.lastSeenAt ?? null);
      setScope(data.scope ?? "mine");
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the feed.");
    }
  }, [compact, limit, desktop, ping]);

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
      {desktop && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {alerts === "granted" ? (
            <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11.5px] text-emerald-800">
              Desktop alerts on
            </span>
          ) : alerts === "denied" ? (
            <span className="rounded-full border border-line px-3 py-1 text-[11.5px] text-muted" title="Allow notifications for this site in the browser's settings">
              Alerts blocked in the browser
            </span>
          ) : alerts === "default" ? (
            <button
              type="button"
              onClick={() => void Notification.requestPermission().then((p) => setAlerts(p))}
              className="rounded-full border border-ink px-3 py-1 text-[11.5px] font-medium transition hover:bg-ink hover:text-white"
            >
              Turn on desktop alerts
            </button>
          ) : null}
          {!installed && installPrompt && (
            <button
              type="button"
              onClick={() => void installPrompt.prompt().then(() => setInstallPrompt(null))}
              className="rounded-full border border-line px-3 py-1 text-[11.5px] text-muted transition hover:border-ink hover:text-ink"
            >
              Install as an app
            </button>
          )}
          {!popout && (
            <button
              type="button"
              onClick={popOutFeed}
              className="rounded-full border border-line px-3 py-1 text-[11.5px] text-muted transition hover:border-ink hover:text-ink"
              title="Open the feed in a small window you can leave to one side"
            >
              Pop out
            </button>
          )}
          {!popout && (
            <a
              href="/api/pretenancy/feed/shortcut"
              className="rounded-full border border-line px-3 py-1 text-[11.5px] text-muted transition hover:border-ink hover:text-ink"
              title="A shortcut for your desktop that opens the feed in its own window"
            >
              Download desktop shortcut
            </a>
          )}
          {!installed && !installPrompt && !popout && (
            <span className="text-[11px] text-muted">
              Or keep it in your Dock: Chrome, the install icon in the address bar. Safari, File, Add to Dock.
            </span>
          )}
        </div>
      )}
      {events.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          Nothing has moved since the watcher started. It looks every few minutes.
        </p>
      ) : (
        <ol className={compact ? "space-y-2" : "space-y-3"}>
          {events.map((e) => {
            const tone = eventTone(e.event);
            const href = hrefFor(e);
            const inner = (
              <>
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
              </>
            );
            /* Every row is a door. In the pop-out the door opens in the main
               window, so the small one stays where she left it. */
            return (
              <li key={e.id}>
                {href ? (
                  <Link
                    href={href}
                    target={popout ? "tle-os" : undefined}
                    className="-mx-2 flex items-start gap-2.5 rounded-lg px-2 py-1 transition hover:bg-line/30"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div className="flex items-start gap-2.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
