"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The OS chrome. The rail splits where the work splits: FRONT OF HOUSE is the
 * tenancy being made (lead → keys), BACK OFFICE is the book being run. The
 * profile lives at the foot with sign-out and the palette picker — every
 * agent gets to choose their accent, and the choice is three CSS variables.
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

/** Clay is the house default; the attribute only exists for the others. */
const ACCENTS = [
  { id: "", label: "Warm Clay", dot: "#de968f" },
  { id: "blush", label: "Blush", dot: "#f0b3bb" },
  { id: "red", label: "Classic Red", dot: "#e31f36" },
];

function applyAccent(id: string) {
  if (id) document.documentElement.dataset.accent = id;
  else delete document.documentElement.dataset.accent;
}

function NavLink({
  item,
  active,
}: {
  item: { href: string; label: string; icon: string };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      // The soft-tint active state from the reference: highlight by reducing
      // contrast, not adding it — a wash of the accent, no card, no shadow.
      className={`hand flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] transition-colors ${
        active
          ? "bg-accent-soft font-medium"
          : "text-muted hover:bg-card/70 hover:text-ink"
      }`}
    >
      <DoodleIcon
        name={item.icon}
        size={17}
        className={active ? "text-accent-dark" : "text-muted"}
      />
      {item.label}
    </Link>
  );
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  const [accent, setAccent] = useState("");

  // Rehydrate the saved palette before first paint matters little on a
  // wireframe — a flash of clay is fine, correctness on nav isn't optional.
  useEffect(() => {
    const saved = localStorage.getItem("os-accent") ?? "";
    setAccent(saved);
    applyAccent(saved);
  }, []);

  function pickAccent(id: string) {
    setAccent(id);
    localStorage.setItem("os-accent", id);
    applyAccent(id);
  }

  async function signOut() {
    await fetch("/api/key", { method: "DELETE" }).catch(() => null);
    router.push("/key");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-line/70 px-4 py-6 lg:flex">
        {/* Wordmark: the little buildings over the name, like the mock. */}
        <div className="flex items-center gap-2.5 px-3">
          <img
            src="/illustrations/notioly/buildings.svg"
            alt=""
            aria-hidden
            className="h-9 w-9"
          />
          <div>
            <div className="hand text-2xl leading-none">TLE OS</div>
            <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-accent-dark">
              Internal preview
            </div>
          </div>
        </div>

        <nav className="mt-7 flex flex-col gap-1">
          {FRONT.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}

          {/* The fold between making tenancies and running the book. */}
          <div className="mb-1 mt-3 border-t border-line/70 pt-3">
            <p className="px-3 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
              Back office
            </p>
          </div>
          {BACK.map((item) => (
            <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </nav>

        {/* ── Profile, at the foot ── */}
        <div className="mt-auto">
          {profileOpen && (
            <div className="fade-up mb-2 rounded-2xl border border-line/60 bg-card p-3">
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted">
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
            onClick={() => setProfileOpen((o) => !o)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-card/70"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-dark">
              TLE
            </span>
            <span className="min-w-0 flex-1">
              <span className="hand block truncate text-[13px]">The Lettings Experts</span>
              <span className="block text-[10px] text-muted">Preview access</span>
            </span>
            <span className={`text-muted transition-transform ${profileOpen ? "rotate-180" : ""}`}>
              ▾
            </span>
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
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
