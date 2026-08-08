"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";
import { readTheme, type ThemeChoice } from "@/lib/theme";

/**
 * The OS chrome. The rail is its own encapsulated card — a thin outline the
 * whole way round, floating on the eggshell — and collapses to icons + logo
 * on the « button. FRONT OF HOUSE is the tenancy being made, BACK OFFICE is
 * the book being run. The profile foots the rail with sign-out and the
 * palette picker.
 */
const FRONT: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  // Tenant-side and landlord-side are different jobs — same inbox, different
  // questions — so Leads opens rather than just navigating.
  {
    href: "/leads",
    label: "Leads",
    icon: "target",
    children: [
      { href: "/leads?side=tenant", label: "Tenant" },
      { href: "/leads?side=landlord", label: "Landlord" },
    ],
  },
  { href: "/listings", label: "Listings", icon: "home" },
  { href: "/viewings", label: "Viewings", icon: "calendar" },
  { href: "/applications", label: "Applications", icon: "checklist" },
];
const BACK: NavItem[] = [
  { href: "/compliance", label: "Compliance", icon: "shield" },
  { href: "/portfolio", label: "Portfolio", icon: "folder" },
  { href: "/finances", label: "Finances", icon: "wallet" },
];

/** Clay is the house default; the attribute only exists for the others. */
const ACCENTS = [
  { id: "", label: "Warm Clay", dot: "#de968f" },
  { id: "blush", label: "Blush", dot: "#f0b3bb" },
  { id: "red", label: "Classic Red", dot: "#e31f36" },
];

type NavItem = {
  href: string;
  label: string;
  icon: string;
  children?: { href: string; label: string }[];
};

function applyAccent(id: string) {
  if (id) document.documentElement.dataset.accent = id;
  else delete document.documentElement.dataset.accent;
}

function NavLink({
  item,
  active,
  collapsed,
  currentHref,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  currentHref: string;
}) {
  // Children reveal when the section is active — an always-open tree is just
  // a longer list, and a click-to-open one hides where you already are.
  const showChildren = Boolean(item.children && active && !collapsed);
  return (
    <>
      <Link
        href={item.href}
        title={collapsed ? item.label : undefined}
        // Soft-tint active state: highlight by reducing contrast, not adding it.
        // The icon NEVER moves on collapse — padding stays constant and only
        // the label folds away, which is what makes the animation read as one
        // smooth motion instead of everything re-arranging at once.
        className={`hand flex items-center rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
          active ? "bg-accent-soft/50 font-medium" : "text-muted hover:bg-page hover:text-ink"
        }`}
      >
        <DoodleIcon
          name={item.icon}
          size={17}
          className={`shrink-0 ${active ? "text-accent-dark" : "text-muted"}`}
        />
        <span
          className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity,margin] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
            collapsed ? "ml-0 max-w-0 opacity-0" : "ml-3 max-w-[150px] opacity-100"
          }`}
        >
          {item.label}
        </span>
      </Link>

      {showChildren && (
        <div className="fade-up ml-[26px] flex flex-col gap-0.5 border-l border-line/70 pl-2.5">
          {item.children!.map((c) => {
            const on = currentHref === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                className={`rounded-lg px-2.5 py-1.5 text-[12.5px] transition-colors ${
                  on ? "font-medium text-accent-dark" : "text-muted hover:text-ink"
                }`}
              >
                {c.label}
              </Link>
            );
          })}
        </div>
      )}
    </>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const currentHref = search.toString() ? `${pathname}?${search}` : pathname;
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
        className={`sticky top-3 mb-3 ml-3 mt-3 hidden h-[calc(100vh-24px)] shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel py-5 transition-[width,padding] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${
          collapsed ? "w-[72px] px-2.5" : "w-60 px-4"
        }`}
      >
        {/* Wordmark + the collapse toggle. The logo's pin follows the accent. */}
        <div className={`flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"} px-1`}>
          <div className="flex items-center">
            {/* Monochrome ink, so `.art` alone flips it black → white in the
                dark. It doesn't follow the accent — the mark is the mark. */}
            <img
              src="/brand/house.png"
              alt=""
              aria-hidden
              className="art h-10 w-10 shrink-0 object-contain"
            />
            <div
              className={`hand overflow-hidden whitespace-nowrap text-xl leading-none transition-[max-width,opacity,margin] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[110px] opacity-100"
              }`}
            >
              TLE OS
            </div>
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
              currentHref={currentHref}
            />
          ))}

          {/* The fold between making tenancies and running the book. */}
          <div className="mb-1 mt-3 border-t border-line/70 pt-3">
            <p
              className={`overflow-hidden whitespace-nowrap px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70 transition-[max-height,opacity] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "max-h-0 pb-0 opacity-0" : "max-h-5 pb-1 opacity-100"
              }`}
            >
              Back office
            </p>
          </div>
          {BACK.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
              currentHref={currentHref}
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
            <span
              className={`min-w-0 flex-1 overflow-hidden transition-[max-width,opacity,margin] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "ml-0 max-w-0 opacity-0" : "ml-0 max-w-[150px] opacity-100"
              }`}
            >
              <span className="hand block truncate text-[13px]">The Lettings Experts</span>
              <span className="block whitespace-nowrap text-[10px] text-muted">
                Preview access · {process.env.NEXT_PUBLIC_BUILD}
              </span>
            </span>
            {!collapsed && (
              <>
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
