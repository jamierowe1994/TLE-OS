"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { readTheme, type ThemeChoice } from "@/lib/theme";

/**
 * The OS chrome. The rail is its own encapsulated card — a thin outline the
 * whole way round, floating on the eggshell — and collapses to icons + logo
 * on the « button. FRONT OF HOUSE is the tenancy being made, BACK OFFICE is
 * the book being run. The profile foots the rail with sign-out and the
 * palette picker.
 */
const FRONT = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/leads", label: "Leads", icon: "target" },
  { href: "/listings", label: "Listings", icon: "home" },
  { href: "/viewings", label: "Viewings", icon: "calendar" },
  { href: "/applications", label: "Applications", icon: "checklist" },
];
const BACK = [
  { href: "/property-management", label: "Property management", icon: "key" },
  { href: "/portfolio", label: "Portfolio", icon: "folder" },
  { href: "/finances", label: "Finances", icon: "wallet" },
];

/** Clay is the house default; the attribute only exists for the others.
 *  Each palette brings its own cut of the logo — the pin matches the accent. */
const ACCENTS = [
  { id: "", label: "Warm Clay", dot: "#de968f", logo: "/brand/logo-clay.png" },
  { id: "blush", label: "Blush", dot: "#f0b3bb", logo: "/brand/logo-blush.png" },
  { id: "red", label: "Classic Red", dot: "#e31f36", logo: "/brand/logo-red.png" },
];

function applyAccent(id: string) {
  if (id) document.documentElement.dataset.accent = id;
  else delete document.documentElement.dataset.accent;
}

function NavLink({
  item,
  active,
  collapsed,
}: {
  item: { href: string; label: string; icon: string };
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      // Soft-tint active state: highlight by reducing contrast, not adding it.
      className={`hand flex items-center gap-3 rounded-xl py-2.5 text-[13.5px] transition-colors ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${active ? "bg-accent-soft/50 font-medium" : "text-muted hover:bg-page hover:text-ink"}`}
    >
      <DoodleIcon
        name={item.icon}
        size={17}
        className={active ? "text-accent-dark" : "text-muted"}
      />
      {!collapsed && item.label}
    </Link>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [accent, setAccent] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>("auto");

  useEffect(() => {
    const saved = localStorage.getItem("os-accent") ?? "";
    setAccent(saved);
    applyAccent(saved);
    setCollapsed(localStorage.getItem("os-nav-collapsed") === "1");
    setTheme(readTheme() ?? "auto");
  }, []);

  /** ThemeGate owns the paint transition; the click point seeds it. */
  function pickTheme(next: ThemeChoice, e: React.MouseEvent) {
    setTheme(next);
    window.dispatchEvent(
      new CustomEvent("os-set-theme", {
        detail: { choice: next, origin: { x: e.clientX, y: e.clientY } },
      })
    );
  }

  function pickAccent(id: string) {
    setAccent(id);
    localStorage.setItem("os-accent", id);
    applyAccent(id);
  }

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("os-nav-collapsed", c ? "0" : "1");
      if (!c) setProfileOpen(false); // the panel has nowhere to live at 72px
      return !c;
    });
  }

  async function signOut() {
    await fetch("/api/key", { method: "DELETE" }).catch(() => null);
    router.push("/key");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside
        className={`sticky top-3 mb-3 ml-3 mt-3 hidden h-[calc(100vh-24px)] shrink-0 flex-col rounded-3xl border border-line/80 bg-panel py-5 transition-[width] duration-300 lg:flex ${
          collapsed ? "w-[72px] px-2.5" : "w-60 px-4"
        }`}
      >
        {/* Wordmark + the collapse toggle. The logo's pin follows the accent. */}
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"} px-1`}>
          <div className="flex items-center gap-2">
            <img
              src={(ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0]).logo}
              alt=""
              aria-hidden
              className="art h-10 w-10 shrink-0 object-contain"
            />
            {!collapsed && <div className="hand text-xl leading-none">TLE OS</div>}
          </div>
          <button
            type="button"
            onClick={toggleCollapsed}
            title={collapsed ? "Expand" : "Collapse"}
            className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[11px] text-muted transition-colors hover:text-ink"
          >
            {collapsed ? "»" : "«"}
          </button>
        </div>

        {/* The break bar, then the nav sits a touch lower. */}
        <div className="mt-4 border-t border-line/70" />
        <nav className="mt-4 flex flex-col gap-1">
          {FRONT.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}

          {/* The fold between making tenancies and running the book. */}
          <div className="mb-1 mt-3 border-t border-line/70 pt-3">
            {!collapsed && (
              <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
                Back office
              </p>
            )}
          </div>
          {BACK.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
            />
          ))}
        </nav>

        {/* ── Profile, at the foot ── */}
        <div className="mt-auto">
          {profileOpen && !collapsed && (
            <div className="fade-up mb-2 rounded-2xl border border-line/80 bg-panel p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
                Appearance
              </p>
              <div className="mt-2 flex gap-1">
                {(["light", "dark", "auto"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={(e) => pickTheme(t, e)}
                    className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[10.5px] font-medium capitalize transition-colors ${
                      theme === t
                        ? "border-accent-dark bg-accent-soft text-accent-dark"
                        : "border-line/70 text-muted hover:text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <p className="mt-3 text-[10px] font-bold uppercase tracking-wide text-muted">
                Your accent
              </p>
              <div className="mt-2 flex gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    title={a.label}
                    onClick={() => pickAccent(a.id)}
                    className={`h-7 w-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      accent === a.id ? "border-ink" : "border-line/60"
                    }`}
                    style={{ backgroundColor: a.dot }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={signOut}
                className="mt-3 flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                <DoodleIcon name="logout" size={14} className="text-muted" />
                Sign out
              </button>
            </div>
          )}
          <button
            type="button"
            // Collapsed, there's no room for the panel — the tap reopens the rail.
            onClick={() => (collapsed ? toggleCollapsed() : setProfileOpen((o) => !o))}
            className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-left transition-colors hover:bg-page ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-dark">
              TLE
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="hand block truncate text-[13px]">The Lettings Experts</span>
                  <span className="block text-[10px] text-muted">Preview access</span>
                </span>
                <span
                  className={`text-muted transition-transform ${profileOpen ? "rotate-180" : ""}`}
                >
                  ▾
                </span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile: a simple top bar; the wireframe is a desktop pitch first. */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-line/70 px-5 py-4 lg:hidden">
          <span className="hand text-2xl">TLE OS</span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
            Preview
          </span>
        </header>
        <main className="w-full flex-1 px-5 py-8 lg:px-10 2xl:px-14">
          {children}
        </main>
      </div>
    </div>
  );
}
