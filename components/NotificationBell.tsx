"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import { NOTICE_ICON, type Notice } from "@/lib/notices";
import { whenAgo } from "@/lib/lead-spine";

/**
 * The bell: live, and the same on every screen.
 *
 * It was drawn on day one as chrome with a permanent red dot and a title
 * saying "(wireframe)". Now it reads /api/notifications once a minute, wears
 * the unread count, and opens a panel of what happened - each line going to
 * the file it is about. Opening the panel is what marks things read: the
 * count is "things you have not looked at", not "things you have not dealt
 * with", because the file is where dealing happens.
 *
 * Desktop alerts are the same opt-in the pre-tenancy feed offers: nothing
 * fires until the person says yes in the browser, and then only for notices
 * newer than the last poll.
 */

const REFRESH_MS = 60_000;

export default function NotificationBell({ compact = false }: { compact?: boolean }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState<"unsupported" | "default" | "granted" | "denied">("default");
  const [loaded, setLoaded] = useState(false);
  const newestSeen = useRef<string | null>(null);
  /* The panel is PORTALLED to the body and pinned to the bell's corner.
     Inside the page header it sat under the stat cards: every fade-up card
     is its own stacking context, and a later sibling paints over an earlier
     one whatever z-index the header asks for. The body has no such siblings. */
  const bell = useRef<HTMLButtonElement | null>(null);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const place = useCallback(() => {
    const r = bell.current?.getBoundingClientRect();
    if (r) setAnchor({ top: r.bottom + 8, right: Math.max(8, window.innerWidth - r.right) });
  }, []);
  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, place]);

  useEffect(() => {
    setAlerts(typeof Notification === "undefined" ? "unsupported" : Notification.permission);
  }, []);

  const load = useCallback(async () => {
    /* A hidden bell (the mobile bar on a desktop, the header bell on a
       phone) does not poll - the visible one does, and one poll a minute per
       screen is the whole budget. */
    if (bell.current && !bell.current.offsetParent) return;
    try {
      const r = await fetch("/api/notifications?limit=40", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { ok?: boolean; notices?: Notice[]; unread?: number };
      if (!j.ok) return;
      const list = j.notices ?? [];
      /* Desktop alerts for what arrived since the LAST poll only - the first
         load says nothing, or every sign-in would fire the whole history. */
      if (newestSeen.current && typeof Notification !== "undefined" && Notification.permission === "granted") {
        const fresh = list.filter((n) => n.at > (newestSeen.current as string));
        if (fresh.length > 3) {
          new Notification(`${fresh.length} things happened`, { body: "Open the bell to see them.", icon: "/icons/app/icon-192.png", tag: "tle-bell-burst" });
        } else {
          for (const n of fresh) new Notification(n.title, { body: n.body, icon: "/icons/app/icon-192.png", tag: `tle-bell-${n.id}` });
        }
      }
      if (list[0]) newestSeen.current = list[0].at;
      setNotices(list);
      setUnread(j.unread ?? 0);
      setLoaded(true);
    } catch {
      /* A bell that cannot read simply keeps its last answer. */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  /* Opening marks everything read: the count is about looking, not doing. */
  async function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) {
      setUnread(0);
      await fetch("/api/notifications", { method: "POST" }).catch(() => {});
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const size = compact ? "h-9 w-9" : "h-10 w-10";

  return (
    /* Below lg the page header's bell hides and the mobile top bar's shows -
       one bell per screen, never two. */
    <div className={compact ? "relative" : "absolute right-0 top-0 z-30 hidden lg:block"}>
      <button
        ref={bell}
        type="button"
        onClick={() => void toggle()}
        className={`relative flex ${size} shrink-0 items-center justify-center rounded-full border border-line/80 bg-page transition-colors hover:border-ink/40`}
        title={unread ? `${unread} new` : "Notifications"}
        aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
      >
        <DoodleIcon name="bell" size={17} className="text-ink" />
        {unread > 0 && (
          <span className="figures absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open &&
        anchor &&
        typeof document !== "undefined" &&
        createPortal(
        <>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-[150] cursor-default" />
          <div
            style={{ top: anchor.top, right: anchor.right }}
            className="fade-up fixed z-[160] w-[min(92vw,380px)] overflow-hidden rounded-2xl border border-line/80 bg-card shadow-[0_24px_60px_-20px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line/60 px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">What happened</p>
              {alerts === "default" && (
                <button
                  type="button"
                  onClick={() => void Notification.requestPermission().then((p) => setAlerts(p))}
                  className="text-[11px] font-semibold text-accent-dark transition-colors hover:text-ink"
                >
                  Desktop alerts
                </button>
              )}
              {alerts === "granted" && <span className="text-[10.5px] text-muted">Desktop alerts on</span>}
            </div>
            <ul className="max-h-[60vh] divide-y divide-line/50 overflow-y-auto">
              {!loaded && <li className="px-4 py-6 text-center text-[12px] text-muted">Reading…</li>}
              {loaded && !notices.length && (
                <li className="px-4 py-6 text-center text-[12px] text-muted">Nothing yet. Deal moves, money, packs and campaign steps land here.</li>
              )}
              {notices.map((n) => {
                const row = (
                  <span className="flex items-start gap-3 px-4 py-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft/60">
                      <DoodleIcon name={NOTICE_ICON[n.kind]} size={14} className="text-accent-dark" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold">{n.title}</span>
                      <span className="flex items-start gap-1.5 text-[11.5px] leading-snug text-muted">
                        <span
                          aria-hidden
                          className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                            n.tone === "ok" ? "bg-emerald-600" : n.tone === "warn" ? "bg-amber-500" : "bg-line"
                          }`}
                        />
                        <span className="min-w-0">{n.body}</span>
                      </span>
                      <span className="mt-0.5 block text-[10.5px] text-muted">{whenAgo(n.at)}</span>
                    </span>
                  </span>
                );
                return (
                  <li key={n.id} className="transition-colors hover:bg-page">
                    {n.href ? (
                      <Link href={n.href} onClick={() => setOpen(false)} className="block">
                        {row}
                      </Link>
                    ) : (
                      row
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
