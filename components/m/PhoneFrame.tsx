"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

/**
 * THE AGENT'S PHONE: one header, and a menu the page slides off to reveal.
 *
 * James, 18 Sep 2026: "super, super simple ... TLE OS in the corner like we
 * do ... a click tab, and it should be the same as the landlord page, where
 * we have that really cool effect where it pulls the page out to the
 * left-hand side and then shows the options ... a pink background just like
 * the landlord one."
 *
 * The same movement as components/landlord/PhoneShell: the page shrinks and
 * moves left, casting a shadow over the pink menu behind it, and tapping the
 * page brings it back. The pink is only mounted while the menu is in use, so
 * an iOS rubber-band never shows it behind a closed page.
 *
 * Only the /m pages use this, and /m is only where a phone lands.
 */

/* One word each (James, 18 Sep 2026: "Calendar, Tenant, Landlord, Property,
   Scan ID" rather than a sentence per line). */
const LINKS: Array<{ href: string; label: string }> = [
  { href: "/m", label: "Calendar" },
  { href: "/m/people?who=tenant", label: "Tenant" },
  { href: "/m/people?who=landlord", label: "Landlord" },
  { href: "/m/properties", label: "Property" },
  { href: "/m/id-check", label: "Scan ID" },
];

export default function PhoneFrame({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  /* The page shrinks about the middle of what is ON SCREEN, not the middle of
     the whole day's list - or a long calendar slides off showing its middle. */
  const [origin, setOrigin] = useState("50% 50%");
  const path = usePathname();

  const close = useCallback(() => {
    setOpen(false);
    /* Kept until the page has slid back over it, or the pink vanishes from
       under a page still on its way home. */
    window.setTimeout(() => setMounted(false), 500);
  }, []);

  const toggle = () => {
    if (open) return close();
    setOrigin(`50% ${Math.round(window.scrollY + window.innerHeight / 2)}px`);
    setMounted(true);
    /* A frame later, so the menu is painted before the page moves off it. */
    requestAnimationFrame(() => setOpen(true));
  };

  /* Landing anywhere new closes it. */
  useEffect(() => {
    close();
  }, [path, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open, close]);

  return (
    <>
      {mounted && (
        <nav
          className="fixed inset-0 z-0 flex flex-col justify-center bg-accent-soft px-7 pb-10 pt-20"
          aria-hidden={!open}
          aria-label="Menu"
          style={{ pointerEvents: open ? "auto" : "none" }}
        >
          <ul className="ml-auto w-[80%] space-y-0.5 text-right">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} onClick={close} className="block py-2 text-[26px] font-bold leading-tight text-ink">
                  {l.label}
                </Link>
              </li>
            ))}
            <li className="pt-5">
              <a href="/dashboard?full=1" className="block py-1.5 text-[15px] font-semibold text-muted">
                Open the Full OS
              </a>
            </li>
            <li>
              <button
                type="button"
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
                  window.location.href = "/sign-in?next=/m";
                }}
                className="block w-full py-1.5 text-right text-[15px] font-semibold text-muted"
              >
                Sign Out
              </button>
            </li>
          </ul>
        </nav>
      )}

      <div
        className="relative z-[1] min-h-dvh bg-page"
        onClick={open ? close : undefined}
        style={{
          /* Further than the landlord portal's 64%: "Search for a Landlord" is the
             longest line in either menu and must clear the page's edge. */
          transform: open ? "scale(0.84) translateX(-74%)" : undefined,
          transformOrigin: origin,
          borderRadius: open ? 26 : 0,
          overflow: open ? "hidden" : undefined,
          boxShadow: open ? "0 30px 70px -18px rgba(40, 25, 20, 0.45)" : undefined,
          transition: "transform 460ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 320ms, box-shadow 460ms",
        }}
      >
        <div className="mx-auto w-full max-w-[520px] px-4 pb-[max(28px,env(safe-area-inset-bottom))] pt-[max(14px,env(safe-area-inset-top))]">
          <header className="mb-6 flex h-11 items-center justify-between">
            <Link href="/m" aria-label="TLE OS, today's calendar" className="block">
              <img src="/brand/tle-os-type.png" alt="TLE OS" className="art-light h-[19px] w-auto" />
              <img src="/brand/tle-os-type-dark.png" alt="" aria-hidden className="art-dark h-[19px] w-auto" />
            </Link>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggle();
              }}
              aria-expanded={open}
              aria-label={open ? "Close the menu" : "Menu"}
              className="-mr-1 flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span className="flex flex-col gap-[5px]">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="block h-[2px] w-[22px] rounded-full bg-ink"
                    style={{
                      transform: open ? (i === 0 ? "translateY(7px) rotate(45deg)" : i === 1 ? "scaleX(0)" : "translateY(-7px) rotate(-45deg)") : undefined,
                      transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                ))}
              </span>
            </button>
          </header>
          {children}
        </div>
      </div>
    </>
  );
}
