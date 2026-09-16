"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import PlacePicker from "@/components/landlord/PlacePicker";
import type { LandlordPlace } from "@/lib/landlord-account";

/**
 * THE PHONE'S NAVIGATION: a drawer the page slides off to reveal.
 *
 * James, 15 Sep 2026: "rather than having all of these buttons at the top ...
 * the Letting Experts in the top left and a navigation button in the top
 * right ... as we click it, I want it to almost reduce in size and then move
 * over slightly, revealing the rest of the navigation bar", on pink, with the
 * page casting a shadow over it.
 *
 * It buys back the whole of the pill row - four chips and a scrollbar above
 * every page - which is why everything can now start higher up the screen.
 *
 * ── Why the page moves rather than a panel arriving ───────────────────────
 *
 * A panel sliding over the top hides where you were. This keeps the page on
 * screen, shrunk and pushed aside, so the menu reads as something BEHIND the
 * page rather than on top of it - and getting back is tapping the thing you
 * were looking at, which needs no explaining.
 *
 * Phone only. From sm up the portal keeps its pills and its sidebar.
 */

const Ctx = createContext<{ open: boolean; toggle: () => void } | null>(null);

/** The three lines, for the header. Does nothing off a phone. */
export function PhoneNavButton() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  return (
    <button
      type="button"
      onClick={ctx.toggle}
      aria-expanded={ctx.open}
      aria-label={ctx.open ? "Close the menu" : "Menu"}
      className="-mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:hidden"
    >
      <span className="flex flex-col gap-[5px]">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block h-[2px] w-[22px] rounded-full bg-ink"
            style={{
              transform: ctx.open
                ? i === 0
                  ? "translateY(7px) rotate(45deg)"
                  : i === 1
                    ? "scaleX(0)"
                    : "translateY(-7px) rotate(-45deg)"
                : undefined,
              transition: "transform 320ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        ))}
      </span>
    </button>
  );
}

export default function PhoneShell({
  signedIn,
  letHere,
  places = [],
  signOut,
  children,
}: {
  signedIn: boolean;
  letHere: boolean;
  /** Every property this landlord has with us. Fewer than two draws nothing. */
  places?: LandlordPlace[];
  /** LandlordSignOut, passed in so this stays free of the session. */
  signOut: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  /**
   * THE PINK ONLY EXISTS WHILE THE DRAWER IS OPEN.
   *
   * James, 15 Sep 2026: "the background on the phone has changed. Where the
   * camera cutout is, it is now pink ... I want it all white." He read it
   * exactly right - the menu was fixed behind the page at all times, so an
   * iOS rubber-band at the top pulled the page away and showed it. Mounted
   * only from the moment it opens until the page has finished sliding back,
   * the canvas is white whenever the drawer is not in use.
   */
  const [mounted, setMounted] = useState(false);
  const path = usePathname() ?? "/landlord";
  const params = useSearchParams();
  const base = path.startsWith("/landlord/demo") ? "/landlord/demo" : "/landlord";

  /* The sample's stop and the preview bar survive a click, as they do in the
     sidebar. */
  const keep = new URLSearchParams();
  if (params?.get("stage")) keep.set("stage", params.get("stage")!);
  if (params?.get("from") === "admin") keep.set("from", "admin");
  /* Which property they are in survives every move around the menu. Without
     it, tapping Documents from the Bristol flat would land on whichever one
     the portal picks by default. */
  if (params?.get("p")) keep.set("p", params.get("p")!);
  const q = keep.size ? `?${keep.toString()}` : "";

  /* A link closes it, and so does landing anywhere new. */
  useEffect(() => {
    setOpen(false);
    const t = window.setTimeout(() => setMounted(false), 500);
    return () => window.clearTimeout(t);
  }, [path]);

  /* And so does growing past a phone. The button is sm:hidden, so a window
     dragged wider while the drawer is open would otherwise leave the page
     shrunk with nothing on screen able to put it back. */
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 640) {
        setOpen(false);
        setMounted(false);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      window.setTimeout(() => setMounted(false), 500);
    };
    window.addEventListener("keydown", onKey);
    const had = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = had;
    };
  }, [open]);

  const links = [
    { href: `${base}${q}`, label: "Home" },
    { href: `${base}/journey${q}`, label: "Journey" },
    { href: `${base}/documents${q}`, label: "Documents" },
    { href: `${base}/maintenance${q}`, label: "Maintenance" },
    /* My details earns its place here rather than being a fifth thing James
       asked for: the avatar that used to open it is off the phone's header
       now, so without this row it is not reachable on a phone at all - and it
       holds the repair authority and the payment line. */
    ...(signedIn && base === "/landlord" ? [{ href: "/landlord/profile", label: "My details" }] : []),
  ];

  return (
    <Ctx.Provider
      value={{
        open,
        toggle: () => {
          if (open) {
            setOpen(false);
            /* Kept until the page has finished sliding back over it, or the
               pink vanishes from under a page still on its way home. */
            window.setTimeout(() => setMounted(false), 500);
          } else {
            setMounted(true);
            /* A frame later, so the menu is painted before the page moves off
               it and there is never a white gap behind the slide. */
            requestAnimationFrame(() => setOpen(true));
          }
        },
      }}
    >
      {/* THE MENU, behind the page. Pink, on a phone, and only while wanted. */}
      {mounted && (
      <nav
        className="fixed inset-0 z-0 flex flex-col justify-center bg-accent-soft px-7 pb-10 pt-24 sm:hidden"
        aria-hidden={!open}
        style={{ pointerEvents: open ? "auto" : "none" }}
      >
        {/* Which property, above the four views of it. Nothing at all for a
            landlord with one, which is most of them. */}
        <PlacePicker places={places} />
        <ul className="ml-auto w-[62%] space-y-1 text-right">
          {links.map((l) => (
            <li key={l.label}>
              <Link href={l.href} className="block py-2.5 text-[24px] font-bold leading-tight">
                {l.label}
              </Link>
            </li>
          ))}
          <li className="pt-2">
            {signedIn ? (
              signOut
            ) : (
              <Link href="/landlord/sign-in" className="block py-2.5 text-right text-[24px] font-bold leading-tight text-muted">
                Sign in
              </Link>
            )}
          </li>
        </ul>
      </nav>
      )}

      {/* THE PAGE, which slides off to the left and casts a shadow over it. */}
      <div
        className="relative z-[1] min-h-screen bg-white sm:!transform-none"
        onClick={
          open
            ? () => {
                setOpen(false);
                window.setTimeout(() => setMounted(false), 500);
              }
            : undefined
        }
        style={{
          transform: open ? "scale(0.84) translateX(-64%)" : undefined,
          transformOrigin: "center",
          borderRadius: open ? 26 : 0,
          overflow: open ? "hidden" : undefined,
          boxShadow: open ? "0 30px 70px -18px rgba(40, 25, 20, 0.45)" : undefined,
          transition: "transform 460ms cubic-bezier(0.22, 1, 0.36, 1), border-radius 320ms, box-shadow 460ms",
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
  );
}
