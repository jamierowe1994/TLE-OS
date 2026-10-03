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
import { MORE_ORDER, NAV_DEFAULT, NAV_DESTS, NAV_SLOTS, activeNav, navDest, saveNav, type NavDest, type NavId } from "@/lib/m-nav";

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

/* More's three dots - the one icon that is always on the bar. */
const MORE_DOTS = <path d="M6 12h.01M12 12h.01M18 12h.01" />;

type Frame = { more: () => void; quick: () => void; bell: () => void; unread: number };
const FrameContext = createContext<Frame>({ more: () => {}, quick: () => {}, bell: () => {}, unread: 0 });
export const useFrame = () => useContext(FrameContext);
/** Opens the "More" sheet. */
export const useGoTo = () => useContext(FrameContext).more;

type Sheet = "more" | "quick" | "bell" | null;

export default function AppFrame({ inApp, theme, nav, children }: { inApp: boolean; theme: MTheme | null; nav: NavId[]; children: React.ReactNode }) {
  const path = usePathname() ?? "/agent";
  /* The agent's own three icons (lib/m-nav), changed from More. */
  const [bar, setBar] = useState<NavId[]>(nav);
  const lit = activeNav(bar, path);
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
          {bar.slice(0, 2).map((id) => (
            <Tab key={id} dest={navDest(id)} on={lit === id} />
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
          <Tab dest={navDest(bar[2]!)} on={lit === bar[2]} />
          <li className="flex justify-center">
            <button type="button" onClick={more} aria-label="More" className="flex h-[48px] w-[58px] items-center justify-center rounded-[16px]" style={{ color: "var(--m-muted)" }}>
              <svg viewBox="0 0 24 24" aria-hidden className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                {MORE_DOTS}
              </svg>
            </button>
          </li>
        </ul>
      </nav>

      {sheet === "more" && (
        <PagesSheet
          inApp={inApp}
          mode={mode}
          onMode={choose}
          bar={bar}
          onBar={(b) => {
            saveNav(b);
            setBar(b);
          }}
          onClose={close}
        />
      )}
      {sheet === "quick" && <QuickSheet onClose={close} />}
      {sheet === "bell" && <BellSheet onClose={close} onRead={() => setUnread(0)} />}
    </FrameContext.Provider>
  );
}

function Tab({ dest, on }: { dest: NavDest; on: boolean }) {
  return (
    <li className="flex justify-center">
      <Link
        href={dest.href}
        aria-current={on ? "page" : undefined}
        aria-label={dest.label}
        className="flex h-[48px] w-[58px] items-center justify-center rounded-[16px] transition-colors"
        style={on ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : { color: "var(--m-muted)" }}
      >
        <NavIcon dest={dest} on={on} />
      </Link>
    </li>
  );
}

function NavIcon({ dest, on, size = 24 }: { dest: NavDest; on: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden style={{ width: size, height: size }} fill={on && dest.id === "home" ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={dest.d} />
    </svg>
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

/*
 * MORE (tidied 3 Oct 2026, James: "neaten up everything"). Three layers in
 * one sheet:
 *   - the pages that are not on the bar, then the agent's own name at the
 *     foot, and under it Customise Navigation Bar
 *   - Profile: Appearance, Alerts on This Phone, Test Phone Alerts, Sign Out
 *   - Navigation Bar: pick the three icons beside the "+"
 */
type View = "list" | "profile" | "nav";

function PagesSheet({
  inApp,
  mode,
  onMode,
  bar,
  onBar,
  onClose,
}: {
  inApp: boolean;
  mode: MTheme;
  onMode: (t: MTheme) => void;
  bar: NavId[];
  onBar: (b: NavId[]) => void;
  onClose: () => void;
}) {
  const [view, setView] = useState<View>("list");
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

  /* Each layer starts at the top. */
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
    setNote(null);
  }, [view]);

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
  const title = view === "profile" ? "Profile" : view === "nav" ? "Navigation Bar" : "More";
  const offBar = MORE_ORDER.filter((id) => !bar.includes(id)).map(navDest);
  const showAlerts = alerts.state !== "unsupported" && alerts.state !== "app" && alerts.state !== "loading";

  return (
    <div
      ref={dim}
      className="fixed inset-0 z-[80] flex items-end justify-center"
      style={{ background: "rgba(0, 0, 0, 0.38)", animation: "m-dim 200ms ease-out both" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <style>{`
        @keyframes m-dim { from { opacity: 0 } to { opacity: 1 } }
        @keyframes m-rise { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes m-in { from { opacity: 0; transform: translateX(14px) } to { opacity: 1; transform: none } }
        @media (prefers-reduced-motion: reduce) { .m-sheet, .m-layer { animation: none !important } }
      `}</style>
      <div
        ref={panel}
        className="m-sheet max-h-[90dvh] w-full max-w-[560px] overflow-y-auto overscroll-contain rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
        style={{ background: "var(--m-bg)", animation: "m-rise 320ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-3 block h-[5px] w-[40px] rounded-full" style={{ background: "var(--m-line)" }} />
        <div className="mb-4 flex items-center justify-between gap-3 px-1">
          <div className="flex min-w-0 items-center gap-2.5">
            {view !== "list" && (
              <button type="button" onClick={() => setView("list")} aria-label="Back" className="m-round m-press">
                <svg viewBox="0 0 24 24" aria-hidden className="h-[18px] w-[18px]">
                  <path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            )}
            <h2 className="m-title truncate text-[24px]">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="m-round m-press">
            <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {view === "list" && (
          <div key="list" className="m-layer">
            <ul className="m-group">
              {offBar.map((p) => (
                <li key={p.id} className="m-row">
                  <a href={p.href} className={row}>
                    <span className="text-muted">
                      <NavIcon dest={p} on={false} size={19} />
                    </span>
                    <span className="flex-1">{p.label}</span>
                    <Chevron />
                  </a>
                </li>
              ))}
            </ul>

            <div className="m-group mt-5">
              <button type="button" onClick={() => setView("profile")} className="m-row flex w-full items-center gap-3 px-4 py-3.5 text-left active:bg-panel">
                <Avatar me={me} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-medium">{me?.name ?? " "}</span>
                  <span className="block truncate text-[13.5px] text-muted">Profile, appearance and alerts</span>
                </span>
                <Chevron />
              </button>
            </div>

            <div className="m-group mt-3">
              <button type="button" onClick={() => setView("nav")} className={row}>
                <svg viewBox="0 0 24 24" aria-hidden className="h-[19px] w-[19px] text-muted" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />
                </svg>
                <span className="flex-1">Customise Navigation Bar</span>
                <Chevron />
              </button>
            </div>
          </div>
        )}

        {view === "profile" && (
          <div key="profile" className="m-layer" style={{ animation: "m-in 220ms ease-out both" }}>
            <div className="m-group flex items-center gap-3.5 px-4 py-4">
              <Avatar me={me} big />
              <span className="min-w-0">
                <span className="block truncate text-[18px] font-medium">{me?.name ?? " "}</span>
                <span className="block truncate text-[13.5px] text-muted">{me?.email ?? " "}</span>
              </span>
            </div>

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

            {(showAlerts || inApp) && (
              <>
                <p className="m-eyebrow mb-2 mt-5 px-1">Phone Alerts</p>
                <div className="m-group">
                  {showAlerts && (
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
                  )}
                  {(inApp || alerts.state === "on") && (
                    <button type="button" onClick={test} className={row}>
                      <DoodleIcon name="bell" size={18} className="text-muted" />
                      Test Phone Alerts
                    </button>
                  )}
                </div>
                {alerts.state === "blocked" && (
                  <p className="mt-2 px-1 text-[13.5px] text-muted">This phone has said no to alerts from TLE OS. Turn them back on in the phone&apos;s Settings, under Notifications.</p>
                )}
                {alerts.error && <p className="mt-2 px-1 text-[13.5px] text-muted">{alerts.error}</p>}
                {note && <p className="mt-2 px-1 text-[13.5px] text-muted">{note}</p>}
              </>
            )}

            <div className="m-group mt-5">
              <button type="button" onClick={signOut} className={row} style={{ color: "var(--accent-dark)" }}>
                <DoodleIcon name="logout" size={18} />
                Sign Out
              </button>
            </div>
          </div>
        )}

        {view === "nav" && <NavPicker bar={bar} onBar={onBar} />}
      </div>
    </div>
  );
}

/**
 * Pick the three icons beside the "+". Tap a slot on the bar drawn at the
 * top, then the page to put there; a page already on the bar swaps places
 * with it, so the bar is always three different pages.
 */
function NavPicker({ bar, onBar }: { bar: NavId[]; onBar: (b: NavId[]) => void }) {
  const [slot, setSlot] = useState(0);
  const put = (id: NavId) => {
    const next = [...bar];
    const was = next.indexOf(id);
    if (was === slot) return;
    if (was >= 0) next[was] = next[slot]!;
    next[slot] = id;
    onBar(next);
    setSlot((s) => (s + 1) % NAV_SLOTS);
  };
  const isDefault = bar.join() === NAV_DEFAULT.join();

  return (
    <div key="nav" className="m-layer" style={{ animation: "m-in 220ms ease-out both" }}>
      <p className="px-1 text-[14px] leading-snug text-muted">Tap a space on your bar, then the page you want there. Anything not on the bar stays in More.</p>

      {/* The bar as it will look, the chosen space ringed in coral. */}
      <div className="mt-4 grid h-[70px] grid-cols-5 items-center rounded-[22px] px-2" style={{ background: "var(--m-card)" }}>
        {[0, 1, -1, 2, -2].map((k) =>
          k === -1 ? (
            <span key="plus" className="mx-auto flex h-[44px] w-[44px] items-center justify-center rounded-full text-white opacity-60" style={{ background: "var(--m-coral)" }}>
              <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </span>
          ) : k === -2 ? (
            <span key="more" className="mx-auto flex h-[48px] w-[52px] items-center justify-center opacity-60" style={{ color: "var(--m-muted)" }}>
              <svg viewBox="0 0 24 24" aria-hidden className="h-[24px] w-[24px]" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round">
                {MORE_DOTS}
              </svg>
            </span>
          ) : (
            <button
              key={k}
              type="button"
              onClick={() => setSlot(k)}
              aria-label={`Space ${k + 1}: ${navDest(bar[k]!).label}`}
              aria-pressed={slot === k}
              className="m-press mx-auto flex h-[52px] w-[56px] flex-col items-center justify-center gap-0.5 rounded-[16px] transition-colors"
              style={
                slot === k
                  ? { background: "var(--m-pink-wash)", color: "var(--m-coral)", boxShadow: "inset 0 0 0 2px var(--m-coral)" }
                  : { color: "var(--m-ink)" }
              }
            >
              <NavIcon dest={navDest(bar[k]!)} on={false} size={22} />
              <span className="max-w-full truncate px-0.5 text-[10px] font-medium">{navDest(bar[k]!).label}</span>
            </button>
          )
        )}
      </div>

      <p className="m-eyebrow mb-2 mt-5 px-1">Put in Space {slot + 1}</p>
      <ul className="m-group">
        {NAV_DESTS.map((d) => {
          const at = bar.indexOf(d.id);
          return (
            <li key={d.id} className="m-row">
              <button type="button" onClick={() => put(d.id)} className="m-row flex h-[52px] w-full items-center gap-3 px-4 text-left text-[15.5px] active:bg-panel">
                <span style={{ color: at >= 0 ? "var(--m-coral)" : "var(--m-muted)" }}>
                  <NavIcon dest={d} on={false} size={19} />
                </span>
                <span className="flex-1">{d.label}</span>
                {at >= 0 && (
                  <span className="rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}>
                    Space {at + 1}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {!isDefault && (
        <button type="button" onClick={() => onBar(NAV_DEFAULT)} className="m-btn m-press mt-4 w-full">
          Back to Home, People and Properties
        </button>
      )}
    </div>
  );
}

function Avatar({ me, big }: { me: Me | null; big?: boolean }) {
  return (
    <span
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium ${big ? "h-14 w-14 text-[18px]" : "h-11 w-11 text-[15px]"}`}
      style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}
    >
      {me?.photo ? <img src={me.photo} alt="" className="h-full w-full object-cover" /> : initials(me?.name)}
    </span>
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
