"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import Welcome from "@/components/app/Welcome";
import { useAlerts } from "@/components/app/alerts";
import { applyMTheme, type MTheme } from "@/lib/m-theme";

/**
 * THE AGENT'S PHONE: a page, four tabs at the foot, and a "+" for the rest.
 *
 * James, 2 Oct 2026, the fourth look of the day: "a nod to the original
 * design of TLE OS, which is this Notion style ... very monochromatic,
 * offering a light and dark mode". The tabs are labelled, plain and quiet; the
 * "+" sits at the top right of each screen's title (PhoneTop), as on his
 * reference's Dashboard, and opens every other page, the light/dark switch,
 * and the account. The bar is drawn here, so Safari and the iPhone app (one
 * plain web view, ios/) show the same thing.
 */

const TABS: Array<{ href: string; label: string; match: (p: string) => boolean; icon: React.ReactNode }> = [
  {
    href: "/app",
    label: "Today",
    match: (p) => p === "/app" || p.startsWith("/app/event"),
    icon: <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v10a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5zM4 10h16M8 3v4M16 3v4" />,
  },
  {
    href: "/app/people",
    label: "People",
    match: (p) => p.startsWith("/app/people"),
    icon: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.3a3.5 3.5 0 0 1 0 6.4M18.5 14.8c1.6.8 2.7 2.5 3 5.2" />,
  },
  {
    href: "/app/properties",
    label: "Properties",
    match: (p) => p.startsWith("/app/properties"),
    icon: <path d="M3.5 10.5 12 4l8.5 6.5M5.5 9v10.5h13V9M10 19.5v-5.5h4v5.5" />,
  },
  {
    href: "/app/id-check",
    label: "Scan ID",
    match: (p) => p.startsWith("/app/id-check"),
    icon: <path d="M3.5 6.5A2.5 2.5 0 0 1 6 4h12a2.5 2.5 0 0 1 2.5 2.5v11A2.5 2.5 0 0 1 18 20H6a2.5 2.5 0 0 1-2.5-2.5zM9 12.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM5.8 16.5c.5-1.6 1.7-2.5 3.2-2.5s2.7.9 3.2 2.5M14.5 10h3.5M14.5 13.5h3.5" />,
  },
];

/* The full OS's pages an agent reaches for away from a desk. Each opens the
   full OS screen; the app's swipe back returns to the phone. */
const PAGES: Array<{ href: string; label: string; icon: string }> = [
  { href: "/leads", label: "Leads", icon: "target" },
  { href: "/listings", label: "Listings", icon: "home" },
  { href: "/viewings", label: "Viewings", icon: "key" },
  { href: "/applications", label: "Applications", icon: "file-contract" },
  { href: "/market-appraisals", label: "Market Appraisals", icon: "checklist" },
  { href: "/dashboard?full=1", label: "The Full OS", icon: "dashboard" },
];

const GoToContext = createContext<() => void>(() => {});
/** Opens the "+" sheet. PhoneTop puts the button beside every title. */
export const useGoTo = () => useContext(GoToContext);

export default function AppFrame({ inApp, theme, children }: { inApp: boolean; theme: MTheme | null; children: React.ReactNode }) {
  const path = usePathname() ?? "/app";
  const [sheet, setSheet] = useState(false);
  const [mode, setMode] = useState<MTheme | null>(theme);
  useEffect(() => setSheet(false), [path]);
  /* The app came to life: the stale-page guard in app/app/layout.tsx stands down. */
  useEffect(() => {
    (window as { __tleAppReady?: boolean }).__tleAppReady = true;
    try {
      sessionStorage.removeItem("app-reloaded");
    } catch {
      /* Nothing to clear. */
    }
  }, []);
  const open = useCallback(() => setSheet(true), []);

  const choose = (t: MTheme) => {
    applyMTheme(t);
    setMode(t);
  };

  /* The download page is reached from the phone site, before there is an app. */
  if (path.startsWith("/app/install")) return <>{children}</>;
  if (!mode) return <Welcome onChoose={choose} />;

  return (
    <GoToContext.Provider value={open}>
      {/* Behind the clock and battery, so a scrolled page never runs under them. */}
      <div aria-hidden className="fixed inset-x-0 top-0 z-30 h-[env(safe-area-inset-top)]" style={{ background: "var(--m-bg)" }} />
      <div className="mx-auto w-full max-w-[560px] px-4 pb-[calc(env(safe-area-inset-bottom)+92px)] pt-[calc(env(safe-area-inset-top)+14px)]">{children}</div>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)]"
        style={{ borderColor: "var(--m-line)", background: "var(--m-card)" }}
      >
        <ul className="mx-auto grid max-w-[560px] grid-cols-4">
          {TABS.map((t) => {
            const on = t.match(path);
            return (
              <li key={t.href}>
                <Link
                  href={t.href}
                  aria-current={on ? "page" : undefined}
                  className="flex h-[58px] flex-col items-center justify-center gap-1 text-[11px]"
                  style={{ color: on ? "var(--m-ink)" : "var(--m-soft)", fontWeight: on ? 600 : 500 }}
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="h-[23px] w-[23px]" fill="none" stroke="currentColor" strokeWidth={on ? 1.9 : 1.5} strokeLinecap="round" strokeLinejoin="round">
                    {t.icon}
                  </svg>
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {sheet && <PagesSheet inApp={inApp} mode={mode} onMode={choose} onClose={() => setSheet(false)} />}
    </GoToContext.Provider>
  );
}

type Me = { name: string; email: string; photo: string | null };

function PagesSheet({ inApp, mode, onMode, onClose }: { inApp: boolean; mode: MTheme; onMode: (t: MTheme) => void; onClose: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const alerts = useAlerts();

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
    window.location.href = "/sign-in?next=/app";
  };

  const row = "m-row flex h-[52px] w-full items-center gap-3 px-4 text-left text-[15.5px] active:bg-panel";

  return (
    <div
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
        className="m-sheet max-h-[90dvh] w-full max-w-[560px] overflow-y-auto rounded-t-[28px] px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3"
        style={{ background: "var(--m-bg)", animation: "m-rise 320ms cubic-bezier(0.22, 1, 0.36, 1) both" }}
        onClick={(e) => e.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-3 block h-[5px] w-[40px] rounded-full" style={{ background: "var(--m-line)" }} />
        <div className="mb-4 flex items-center justify-between px-1">
          <h2 className="m-title text-[22px]">Everything Else</h2>
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
