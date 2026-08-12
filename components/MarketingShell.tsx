"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Marketing's own workspace.
 *
 * Not a page inside the agents' OS: a different person doing a different job.
 * Marketing writes the words the whole company sends, and they should be able
 * to open a screen that is only that — no leads, no compliance, no diary.
 *
 * The rail is permanently collapsed and holds ONE thing, because there is one
 * thing. It exists at all so there is somewhere for the second thing to go
 * (social, letters, the review chase) without a redesign, and so the shape of
 * the app doesn't change under them when it arrives.
 */

const RAIL = [{ href: "/marketing", label: "Marketing emails", icon: "mail" }];

export default function MarketingShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="flex min-h-screen">
      {/* ── the rail: always collapsed, tooltips instead of labels ── */}
      <aside className="sticky top-0 flex h-screen w-[72px] shrink-0 flex-col items-center gap-3 border-r border-line/70 bg-panel px-2.5 py-4">
        {/* The pin on its own, cropped out of the full lockup with CSS rather
            than saved as a second file — one logo on disk, so there's only
            ever one to replace. 271/465 of the artwork is the pin; the width
            below is that ratio at this height. */}
        <Link href="/marketing" title="TLE Marketing" aria-label="TLE Marketing">
          <span
            className="block h-8 w-[19px]"
            style={{
              backgroundImage: "url(/brand/tle-logo.png)",
              backgroundRepeat: "no-repeat",
              backgroundPosition: "left center",
              backgroundSize: "auto 32px",
            }}
          />
        </Link>

        <nav className="mt-2 flex flex-col items-center gap-1.5">
          {RAIL.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-label={item.label}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                  active
                    ? "border-accent-dark bg-accent-soft/40"
                    : "border-transparent hover:border-line hover:bg-card"
                }`}
              >
                <DoodleIcon name={item.icon} className="h-5 w-5" />
              </Link>
            );
          })}
        </nav>

        {/* Back to the door, so a wrong turn at the PIN isn't a dead end. */}
        <button
          type="button"
          onClick={() => router.push("/key?switch=1")}
          title="Switch workspace"
          aria-label="Switch workspace"
          className="mt-auto flex h-9 w-9 items-center justify-center rounded-xl border border-line/70 text-[13px] text-muted hover:border-ink/30 hover:text-ink"
        >
          ⇄
        </button>
      </aside>

      {/* ── the page ── */}
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-page/90 px-6 py-3.5 backdrop-blur">
          <h1 className="hand text-[22px] leading-none">TLE Marketing</h1>
        </header>
        <main className="px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
