"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import Welcome from "@/components/app/Welcome";
import { useAlerts } from "@/components/app/alerts";
import { useSwipeToClose } from "@/components/app/swipe";
import { applyMTheme, type MTheme } from "@/lib/m-theme";
import { appHref } from "@/lib/app-href";

/**
 * THE AGENT'S PHONE: a page, and a bar at the foot.
 *
 * 3 Oct 2026, from James's own pastel mockups: Home, People, a coral "+",
 * Properties and More - icons only, no words under them (James, the same
 * day) - the screen you are on lifted on a pink pill; the TLE OS
 * wordmark and a bell with the unread count at the top of every screen
 * (PhoneTop). "+" opens the quick actions, "More" every other page, the
 * light/dark switch and the account. Drawn here, so Safari and the iPhone app
 * (one plain web view, ios/) show the same thing.
 */

const ICONS = {
  home: <path d="M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5" />,
  people: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2" />,
  properties: <path d="M3 20h18M5 20V9l5-4 5 4v11M15 20v-7h4v7M8.5 12h3M8.5 15.5h3" />,
  more: <path d="M6 12h.01M12 12h.01M18 12h.01" />,
};

const TABS: Array<{ href: string; label: string; match: (p: string) => boolean; icon: keyof typeof ICONS }> = [
  { href: "/agent", label: "Home", icon: "home", match: (p) => p === "/agent" || p.startsWith("/agent/day") || p.startsWith("/agent/event") || p.startsWith("/agent/search") || p.startsWith("/agent/leads") || p.startsWith("/agent/applications") },
  { href: "/agent/people", label: "People", icon: "people", match: (p) => p.startsWith("/agent/people") },
  { href: "/agent/properties", label: "Properties", icon: "properties", match: (p) => p.startsWith("/agent/properties") },
];

/* The full OS's pages an agent reaches for away from a desk. Each opens the
   full OS screen; the app's swipe back returns to the phone. */
const PAGES: Array<{ href: string; label: string; icon: string }> = [
  /* Steve where The Full OS was (James, 3 Oct 2026): his whole conversation,
     full screen (app/agent/steve). */
  { href: "/agent/steve", label: "Steve", icon: "message-2" },
  /* The app's own pages only - never the desktop (James, 3 Oct 2026). */
  { href: "/agent/leads", label: "Leads", icon: "target" },
  { href: "/agent/applications", label: "Applications", icon: "file-contract" },
  { href: "/agent/day", label: "Your Day", icon: "calendar" },
];

type Frame = { more: () => void; quick: () => void; bell: () => void; unread: number };
const FrameContext = createContext<Frame>({ more: () => {}, quick: () => {}, bell: () => {}, unread: 0 });
export const useFrame = () => useContext(FrameContext);
/** Opens the "More" sheet. */
export const useGoTo = () => useContext(FrameContext).more;

type Sheet = "more" | "quick" | "bell" | null;

export default function AppFrame({ inApp, theme, children }: { inApp: boolean; theme: MTheme | null; children: React.ReactNode }) {
  const path = usePathname() ?? "/agent";
  const [sheet, setSheet] = useState<Sheet>(null);
  const [mode, setMode] = useState<MTheme | null>(theme);
  const [unread, setUnread] = useState(0);
  useEffect(() => setSheet(null), [path]);
  /* The app came to life: the stale-page guard in app/agent/layout.tsx stands down. */
  useEffect(() => {
    (window as { __tleAppReady?: boolean }).__tleAppReady = true;
    try {
      sessionStorage.removeItem("app-reloaded");
    } catch {
      /* Nothing to clear. */
    }
  }, []);
  /* The bell's count, read on arrival and once a minute, like the desktop bell. */
  useEffect(() => {
    const read = () =>
      fetch("/api/notifications?limit=40", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: { ok?: boolean; unread?: number }) => j.ok && setUnread(j.unread ?? 0))
        .catch(() => null);
    void read();
    const t = window.setInterval(read, 60_000);
    return () => window.clearInterval(t);
  }, []);
  const more = useCallback(() => setSheet("more"), []);
  const quick = useCallback(() => setSheet("quick"), []);
  const bell = useCallback(() => setSheet("bell"), []);
  const close = useCallback(() => setSheet(null), []);

  const choose = (t: MTheme) => {
    applyMTheme(t);
    setMode(t);
  };

  if (!mode) return <Welcome onChoose={choose} />;

  return (
    <FrameContext.Provider value={{ more, quick, bell, unread }}>
      {/* Behind the clock and battery, so a scrolled page never runs under them. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)]" style={{ background: "var(--m-bg)" }} />
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[calc(env(safe-area-inset-bottom)+100px)] pt-[calc(env(safe-area-inset-top)+10px)]">{children}</div>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]"
        style={{ borderColor: "var(--m-line)", background: "var(--m-bg)" }}
      >
        <ul className="mx-auto grid h-[62px] max-w-[560px] grid-cols-5 items-center px-2">
          {TABS.slice(0, 2).map((t) => (
            <Tab key={t.href} tab={t} on={t.match(path)} />
          ))}
          <li className="flex justify-center">
            <button
              type="button"
              onClick={quick}
              aria-label="Quick actions"
              className="m-press flex h-[50px] w-[50px] items-center justify-center rounded-full text-white shadow-[0_8px_18px_-8px_rgba(222,124,112,0.9)]"
              style={{ background: "var(--m-coral)" }}
            >
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                style={{ transform: sheet === "quick" ? "rotate(135deg)" : "none", transition: "transform 480ms cubic-bezier(0.34, 1.56, 0.64, 1)" }}
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          </li>
          <Tab tab={TABS[2]!} on={TABS[2]!.match(path)} />
          <li className="flex justify-center">
            <button type="button" onClick={more} aria-label="More" className="flex h-[48px] w-[58px] items-center justify-center rounded-[16px]" style={{ color: "var(--m-muted)" }}>
              <svg viewBox="0 0 24 24" aria-hidden className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                {ICONS.more}
              </svg>
            </button>
          </li>
        </ul>
      </nav>

      {sheet === "more" && <PagesSheet inApp={inApp} mode={mode} onMode={choose} onClose={close} />}
      {sheet === "quick" && <QuickSheet onClose={close} />}
      {sheet === "bell" && <BellSheet onClose={close} onRead={() => setUnread(0)} />}
    </FrameContext.Provider>
  );
}

function Tab({ tab, on }: { tab: (typeof TABS)[number]; on: boolean }) {
  return (
    <li className="flex justify-center">
      <Link
        href={tab.href}
        aria-current={on ? "page" : undefined}
        aria-label={tab.label}
        className="flex h-[48px] w-[58px] items-center justify-center rounded-[16px] transition-colors"
        style={on ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : { color: "var(--m-muted)" }}
      >
        <svg viewBox="0 0 24 24" aria-hidden className="h-[24px] w-[24px]" fill={on && tab.icon === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          {ICONS[tab.icon]}
        </svg>
      </Link>
    </li>
  );
}

/** A sheet up from the foot: the dim, the handle, a title and a close. */
function SheetShell({ title, label, onClose, children }: { title: string; label: string; onClose: () => void; children: React.ReactNode }) {
  const panel = useRef<HTMLDivElement | null>(null);
  const dim = useRef<HTMLDivElement | null>(null);
  useSwipeToClose(panel, dim, onClose);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);
  return (
    <div
      ref={dim}
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: "rgba(40, 28, 25, 0.38)", animation: "m-dim 200ms ease-out both" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <style>{`
        @keyframes m-dim { from { opacity: 0 } to { opacity: 1 } }
        @keyframes m-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .m-sheet { animation: none !important } }
      `}</style>
      <div
        ref={panel}
        className="m-sheet max-h-[90dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
        style={{ background: "var(--m-bg)", animation: "m-rise 320ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-3 block h-[5px] w-[40px] rounded-full" style={{ background: "var(--m-line)" }} />
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 className="m-title text-[24px]">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="m-round m-press">
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* What the coral "+" offers: the phone's own jobs, as quick action tiles -
   white cards with a soft wash in the corner, an icon in a tinted square, a
   line saying what each does (James's reference, 3 Oct 2026). Adding leads,
   properties and applications stays on the full OS for now - the phone
   writes only the Right to Rent check. */
const QUICK: Array<{ href: string; label: string; line: string; icon: string; tone: "pink" | "sage" }> = [
  { href: "/agent/id-check", label: "Scan an ID", line: "Capture and check an ID.", icon: "camera", tone: "pink" },
  { href: "/agent/day", label: "Your Day", line: "Today's appointments.", icon: "calendar", tone: "sage" },
  { href: "/agent/people?who=tenant", label: "Find a Tenant", line: "Applicants and tenants.", icon: "user", tone: "sage" },
  { href: "/agent/people?who=landlord", label: "Find a Landlord", line: "Owners of our homes.", icon: "key", tone: "pink" },
  { href: "/agent/properties", label: "Find a Property", line: "Every home on your book.", icon: "home", tone: "pink" },
  { href: "/agent/search", label: "Search Everything", line: "People and properties.", icon: "search", tone: "sage" },
];

/**
 * The quick actions sheet - the button agents press most, so it has life
 * (James, 3 Oct 2026: "beautifully animate up ... a little bit of
 * bounciness"). The sheet rises on a spring that overshoots and settles, the
 * tiles pop in one after another behind it, and it drops away when closed
 * rather than vanishing. Transform and opacity only, so it stays smooth on
 * an old phone; reduced motion gets a plain fade.
 */
function QuickSheet({ onClose }: { onClose: () => void }) {
  const [leaving, setLeaving] = useState(false);
  const panel = useRef<HTMLDivElement | null>(null);
  const dim = useRef<HTMLDivElement | null>(null);
  useSwipeToClose(panel, dim, onClose);
  const leave = useCallback(() => {
    setLeaving(true);
    window.setTimeout(onClose, 220);
  }, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && leave();
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [leave]);

  return (
    <div
      ref={dim}
      className={`q-dim fixed inset-0 z-[80] flex items-end justify-center ${leaving ? "q-out" : ""}`}
      onClick={leave}
      role="dialog"
      aria-modal="true"
      aria-label="Quick actions"
    >
      <style>{`
        .q-dim { background: rgba(40, 28, 25, 0.4); animation: q-dim-in 260ms ease-out both; }
        .q-sheet { animation: q-rise 560ms cubic-bezier(0.32, 1.42, 0.52, 1) both; }
        .q-tile { animation: q-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .q-bar { animation: q-grow 600ms cubic-bezier(0.34, 1.56, 0.64, 1) 260ms both; transform-origin: left; }
        .q-out { animation: q-dim-out 220ms ease-in both; }
        .q-out .q-sheet { animation: q-fall 220ms cubic-bezier(0.4, 0, 1, 1) both; }
        @keyframes q-dim-in { from { opacity: 0 } to { opacity: 1 } }
        @keyframes q-dim-out { from { opacity: 1 } to { opacity: 0 } }
        @keyframes q-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes q-fall { from { transform: translateY(0) } to { transform: translateY(105%) } }
        @keyframes q-pop { from { opacity: 0; transform: translateY(22px) scale(0.92) } to { opacity: 1; transform: none } }
        @keyframes q-grow { from { transform: scaleX(0) } to { transform: scaleX(1) } }
        @media (prefers-reduced-motion: reduce) {
          .q-sheet, .q-tile, .q-bar, .q-out .q-sheet { animation: q-dim-in 200ms ease-out both !important; transform: none !important; }
        }
      `}</style>
      <div
        ref={panel}
        className="q-sheet max-h-[90dvh] overscroll-contain w-full max-w-[560px] overflow-y-auto rounded-t-[30px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
        style={{ background: "var(--m-bg)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-4 block h-[5px] w-[40px] rounded-full" style={{ background: "var(--m-line)" }} />
        <div className="mb-5 flex items-start justify-between px-1">
          <div>
            <h2 className="m-title text-[28px] leading-none">Quick Actions</h2>
            <span aria-hidden className="q-bar mt-2.5 block h-[3px] w-10 rounded-full" style={{ background: "var(--m-coral)" }} />
          </div>
          <button type="button" onClick={leave} aria-label="Close" className="m-round m-press">
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-3">
          {QUICK.map((q, i) => {
            const wash = q.tone === "pink" ? "var(--m-pink-wash)" : "var(--m-green-wash)";
            return (
              <li key={q.href} className="q-tile" style={{ animationDelay: `${120 + i * 55}ms` }}>
                <Link
                  href={q.href}
                  className="m-press relative flex h-full min-h-[150px] flex-col overflow-hidden rounded-[24px] border p-4"
                  style={{ background: "var(--m-card)", borderColor: "var(--m-line)" }}
                >
                  <span aria-hidden className="pointer-events-none absolute -right-12 -top-12 h-24 w-24 rounded-full opacity-80" style={{ background: wash }} />
                  <span className="relative flex h-11 w-11 items-center justify-center rounded-[14px]" style={{ background: wash }}>
                    <DoodleIcon name={q.icon} size={21} />
                  </span>
                  <span className="relative mt-3 text-[16.5px] font-semibold leading-tight">{q.label}</span>
                  <span className="relative mt-1 flex flex-1 items-end justify-between gap-2">
                    <span className="text-[12.5px] leading-snug text-muted">{q.line}</span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border" style={{ borderColor: "var(--m-line)", background: "var(--m-bg)" }}>
                      <Chevron />
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

type Notice = { id: string; at: string; title: string; body: string; href: string | null };

function BellSheet({ onClose, onRead }: { onClose: () => void; onRead: () => void }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/notifications?limit=40", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; notices?: Notice[]; error?: string }) => {
        if (!j.ok) throw new Error(j.error ?? "Your notifications did not load.");
        setNotices(j.notices ?? []);
        /* Opening the bell is what marks them read, as on the desktop. */
        void fetch("/api/notifications", { method: "POST" }).then(onRead).catch(() => null);
      })
      .catch((e: Error) => setError(e.message));
  }, [onRead]);
  return (
    <SheetShell title="Notifications" label="Notifications" onClose={onClose}>
      {error ? (
        <p className="px-1 text-[14px] text-muted">{error}</p>
      ) : !notices ? (
        <div role="status" className="flex items-center gap-3 px-1 py-6 text-[14px] text-muted">
          <span className="block h-5 w-5 animate-spin rounded-full border-[2.5px] border-[color:var(--m-line)] border-t-[color:var(--m-coral)]" />
          Loading your notifications
        </div>
      ) : notices.length === 0 ? (
        <p className="px-1 py-6 text-center text-[14.5px] text-muted">Nothing new. You are all caught up.</p>
      ) : (
        <ul className="m-group">
          {notices.map((n) => {
            const inner = (
              <>
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--m-coral)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium leading-snug">{n.title}</span>
                  {n.body && <span className="mt-0.5 block text-[13.5px] leading-snug text-muted">{n.body}</span>}
                  <span className="mt-1 block text-[12px] text-muted">{ago(n.at)}</span>
                </span>
              </>
            );
            return (
              <li key={n.id} className="m-row">
                {n.href ? (
                  <a href={appHref(n.href)} className="flex gap-3 px-4 py-3.5 active:bg-panel">
                    {inner}
                  </a>
                ) : (
                  <div className="flex gap-3 px-4 py-3.5">{inner}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </SheetShell>
  );
}

function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

type Me = { name: string; email: string; photo: string | null };

function PagesSheet({ inApp, mode, onMode, onClose }: { inApp: boolean; mode: MTheme; onMode: (t: MTheme) => void; onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const alerts = useAlerts();
  const panel = useRef<HTMLDivElement | null>(null);
  const dim = useRef<HTMLDivElement | null>(null);
  useSwipeToClose(panel, dim, onClose);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { user?: { name?: string; email?: string; photo?: string | null } | null }) => {
        if (j.user?.name) setMe({ name: j.user.name, email: j.user.email ?? "", photo: j.user.photo ?? null });
      })
      .catch(() => null);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = was;
    };
  }, [onClose]);

  const test = async () => {
    setNote("Sending...");
    const j = (await fetch("/api/push/test", { method: "POST" })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "No connection." }))) as { ok: boolean; error?: string };
    setNote(j.ok ? "Sent. It should arrive in a few seconds." : j.error ?? "That did not send.");
  };

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/sign-in?next=/agent";
  };

  const row = "m-row flex h-[52px] w-full items-center gap-3 px-4 text-left text-[15.5px] active:bg-panel";

  return (
    <div
      ref={dim}
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: "rgba(0, 0, 0, 0.38)", animation: "m-dim 200ms ease-out both" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Everything else"
    >
      <style>{`
        @keyframes m-dim { from { opacity: 0 } to { opacity: 1 } }
        @keyframes m-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @media (prefers-reduced-motion: reduce) { .m-sheet { animation: none !important } }
      `}</style>
      <div
        ref={panel}
        className="m-sheet max-h-[90dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
        style={{ background: "var(--m-bg)", animation: "m-rise 320ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-3 block h-[5px] w-[40px] rounded-full" style={{ background: "var(--m-line)" }} />
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 className="m-title text-[24px]">More</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="m-round m-press">
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <ul className="m-group">
          {PAGES.map((p) => (
            <li key={p.href} className="m-row">
              <a href={p.href} className={row}>
                <DoodleIcon name={p.icon} size={18} className="text-muted" />
                <span className="flex-1">{p.label}</span>
                <Chevron />
              </a>
            </li>
          ))}
        </ul>

        <p className="m-eyebrow mb-2 mt-5 px-1">Appearance</p>
        <div className="grid grid-cols-2 gap-2">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onMode(t)}
              aria-pressed={mode === t}
              className="m-press flex h-12 items-center justify-center gap-2 rounded-[14px] border text-[15px] font-medium"
              style={
                mode === t
                  ? { background: "var(--m-ink)", color: "var(--m-bg)", borderColor: "var(--m-ink)" }
                  : { background: "var(--m-card)", borderColor: "var(--m-line)" }
              }
            >
              <span aria-hidden className="h-3.5 w-3.5 rounded-full border" style={{ background: t === "light" ? "#ffffff" : "#121212", borderColor: "#8a8a87" }} />
              {t === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>

        {alerts.state !== "unsupported" && alerts.state !== "app" && alerts.state !== "loading" && (
          <>
            <p className="m-eyebrow mb-2 mt-5 px-1">Phone Alerts</p>
            <div className="m-group">
              <button
                type="button"
                disabled={alerts.state === "busy" || alerts.state === "blocked"}
                onClick={alerts.state === "on" ? alerts.turnOff : alerts.turnOn}
                className={`${row} justify-between`}
              >
                <span className="flex items-center gap-3">
                  <DoodleIcon name="bell" size={18} className="text-muted" />
                  {alerts.state === "blocked" ? "Alerts Are Blocked" : "Alerts on This Phone"}
                </span>
                <Toggle on={alerts.state === "on"} busy={alerts.state === "busy"} />
              </button>
            </div>
            {alerts.state === "blocked" && (
              <p className="mt-2 px-1 text-[13.5px] text-muted">This phone has said no to alerts from TLE OS. Turn them back on in the phone&apos;s Settings, under Notifications.</p>
            )}
            {alerts.error && <p className="mt-2 px-1 text-[13.5px] text-muted">{alerts.error}</p>}
          </>
        )}

        <div className="m-group mt-5">
          <div className="m-row flex items-center gap-3 px-4 py-3.5">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-[15px] font-medium" style={{ background: "var(--m-pink-wash)" }}>
              {me?.photo ? <img src={me.photo} alt="" className="h-full w-full object-cover" /> : initials(me?.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[16px] font-medium">{me?.name ?? " "}</span>
              <span className="block truncate text-[13.5px] text-muted">{me?.email ?? " "}</span>
            </span>
          </div>
          {(inApp || alerts.state === "on") && (
            <button type="button" onClick={test} className={row}>
              <DoodleIcon name="bell" size={18} className="text-muted" />
              Test Phone Alerts
            </button>
          )}
          <button type="button" onClick={signOut} className={row} style={{ color: "var(--accent-dark)" }}>
            <DoodleIcon name="logout" size={18} />
            Sign Out
          </button>
        </div>
        {note && <p className="mt-2 px-1 text-[13.5px] text-muted">{note}</p>}
      </div>
    </div>
  );
}

/** An iPhone-style switch: ink when on. */
function Toggle({ on, busy }: { on: boolean; busy: boolean }) {
  return (
    <span
      aria-hidden
      className="relative inline-flex h-[30px] w-[50px] shrink-0 items-center rounded-full transition-colors duration-200"
      style={{ background: on ? "var(--m-green)" : "var(--m-fill)", opacity: busy ? 0.6 : 1 }}
    >
      <span
        className="absolute left-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,0.2)] transition-transform duration-200"
        style={{ transform: on ? "translateX(20px)" : "none" }}
      />
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0" style={{ color: "var(--m-soft)" }}>
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function initials(name: string | undefined): string {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}
