"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { warmRoute } from "@/lib/route-warm";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import SignedOutWatch from "@/components/SignedOutWatch";
import SearchPalette, { OPEN_SEARCH } from "@/components/SearchPalette";
import DoodleIcon from "@/components/DoodleIcon";
import LaunchNav from "@/components/LaunchNav";
import { useNewLook } from "@/lib/use-new-look";
import { readTheme, type ThemeChoice } from "@/lib/theme";
import { FRONT, BACK, railFor, type NavItem } from "@/lib/nav";
import { AREA_DEFS, areaForPage, canAct, canSee, levelOf, lockedSentence, type AreaAccess } from "@/lib/area-map";

/** See `practising` below. Not in lib/nav: it is there for three days. */
const PRACTICE_ITEM: NavItem = { href: "/practice", label: "Practice Files", icon: "checklist" };
import { fetchMe } from "@/lib/me";

/**
 * The OS chrome (11 Oct 2026): a Mist (#FBFBFB) window, the page a white
 * rounded panel framed in it, and the Launch Day sidebar flat on the grey
 * (components/LaunchNav), collapsing to icons. Dark mode re-colours the same
 * frame through the --shell-* tokens (app/globals.css).
 *
 * The groups live in lib/nav.ts rather than here, because the assistant has
 * to be able to read the same list in order to send anyone to a screen.
 */

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  /* A pop-out over a page (?panel=, Overview's boards, 21 Oct 2026) is still
     that page, so its menu entry stays lit. */
  const menuSearch = new URLSearchParams(search.toString());
  menuSearch.delete("panel");
  const currentHref = menuSearch.toString() ? `${pathname}?${menuSearch}` : pathname;
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);
  /*
   * Changing screen is a movement, not a swap.
   *
   * React unmounts the old page the instant the route changes, so there is
   * nothing left to animate out - the only way to show it leaving is to play
   * the fall FIRST and navigate when it lands. `leaving` holds the href we
   * are on the way to; the class it puts on the content is what the CSS
   * hangs the fall off.
   *
   * Cleared by the URL changing rather than by a second timer, so a slow
   * route cannot leave the page stuck face down.
   *
   * ⚠️ THE WHOLE URL, not the pathname. body-fall ends at opacity 0 with
   * `both`, so the page is HELD invisible until this clears - and it used to
   * clear on `pathname`, which does not change when a nav child differs only
   * by its query string. Leads (All / Tenant / Landlord) and Maintenance
   * (Jobs / Contractors) are exactly that shape, so the first click from
   * another screen worked and every click between siblings played the fall
   * and then stayed face down. James, 10 Sep 2026: "the first click works...
   * as I try to scroll through the different ones, it doesn't load anything."
   * It had loaded. It was lying at the bottom of the animation.
   */
  const [leaving, setLeaving] = useState<string | null>(null);
  useEffect(() => { setLeaving(null); }, [currentHref]);
  /* The fade between screens (lib/new-look "fade", James, 24 Oct 2026): "a
     gentle fade out and then a gentle fade in... every time we click onto a
     screen, everything fades in rather than jumping." Same `leaving` as the
     fall, only the paint differs. Null until the switch answers, and null is
     the fall. */
  const fadeLook = useNewLook("fade") === true;
  /* Which screen the fade-out started on. The fall puts its class on whatever
     is mounted while `leaving` is set, the new screen included for the frame
     before the effect above clears it; for a fade that frame would show the
     new screen at full strength and then dim it. So the fade-out belongs to
     the screen it started on, and the new one fades in from the first frame. */
  const [leftFrom, setLeftFrom] = useState<string | null>(null);
  const fadingOut = leaving !== null && leftFrom === currentHref;

  /* How far each area is switched on for this person (lib/area-map, 15 Sep
     2026). Null until it answers, and null reads as everything on - the rail
     must not flash empty at a pilot agent while it asks. Asked again when the
     screen changes, so a switch James moves shows up on the next click. */
  const [areaAccess, setAreaAccess] = useState<AreaAccess | null>(null);
  useEffect(() => {
    let gone = false;
    fetch("/api/area-access", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!gone && j && typeof j.gated === "boolean") setAreaAccess({ gated: j.gated, tester: Boolean(j.tester), levels: j.levels ?? {} }); })
      .catch(() => {});
    return () => { gone = true; };
  }, [pathname]);
  const pageVisible = (href: string) => {
    const area = areaForPage(href);
    return !area || canSee(areaAccess, area);
  };
  /* A section is on the rail when any page in it is (4 Oct 2026): Compliance
     has its own switch now, and can be open while the rest of Portfolio is
     hidden - the section then shows Compliance alone. */
  const visible = (item: NavItem) => (item.children?.length ? item.children.some((c) => pageVisible(c.href)) : pageVisible(item.href));
  const trimmed = (item: NavItem): NavItem => (item.children?.length ? { ...item, children: item.children.filter((c) => pageVisible(c.href)) } : item);
  const hereArea = areaForPage(pathname);
  /* Phase 1 of the pilot (lib/phases): while any area is on Practice, an
     agent's own test files are one press away, under the screens they are
     practising on. Gone from the rail the moment nothing is on Practice. */
  /* On the rail for anybody the areas gate (an agent in phases 1 and 2), not
     only while a level reads "practice": in phase 2 nothing does, and the
     files are still how they walk both portals (22 Sep 2026). Owners are
     never gated and have the Testing page instead. */
  const practising = Boolean(areaAccess?.gated);
  const hereLocked = hereArea && areaAccess?.gated && canSee(areaAccess, hereArea) && !canAct(areaAccess, hereArea) ? hereArea : null;
  const closedArea = pathname === "/dashboard" ? AREA_DEFS.find((a) => a.id === search.get("closed")) ?? null : null;
  /* Matches .page-leaving .os-mast in globals.css: the fall is 400ms, and
     navigating before it lands cut the old screen off mid-drop. */
  const EXIT_MS = 400;
  /* Matches .page-fading in globals.css. Quicker out than in on purpose: the
     old screen only has to get out of the way, the new one is the thing you
     watch arrive. Nothing to wait for when motion is turned off. */
  const FADE_OUT_MS = 280;
  const goTo = useCallback(
    (href: string) => {
      if (href === currentHref) return;
      /* The new screen's reads start NOW and run under the fall, rather than
         after it (lib/route-warm). The code for it too. */
      warmRoute(href);
      router.prefetch(href);
      setLeaving(href);
      setLeftFrom(currentHref);
      const still = fadeLook && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      window.setTimeout(() => router.push(href), fadeLook ? (still ? 0 : FADE_OUT_MS) : EXIT_MS);
    },
    [currentHref, router, fadeLook]
  );
  /* ── Landing one piece at a time ─────────────────────────────────────────
     James, 11 Sep 2026: "the bits on the page should flow up individually
     ... the button should flow up, and then the calendar, and then the
     right-hand side, each with a separate timing."

     When a screen mounts, every top-level block that carries fade-up gets its
     own delay, duration and travel, in page order: the first starts once the
     masthead is most of the way home, and each one after it a beat later,
     alternately a little quicker or slower than its neighbour so the screen
     reads as pieces landing rather than one sheet arriving. Blocks nested in
     another fade-up, or in a .cascade, keep their own timing. Before paint,
     so nothing starts and then jumps. */
  const flowRef = useRef<HTMLDivElement>(null);
  /* The wraparound frame (James, 10 Oct 2026): the page sits in a white panel
     inset from a grey window, the sidebar flat on the grey beside it. The
     frame's left edge follows the sidebar - as it collapses, and to the
     window's edge where a workspace (Kirstie's, Michael's, admin) hides it. */
  const sideRef = useRef<HTMLElement>(null);
  const [frameLeft, setFrameLeft] = useState(8);
  useEffect(() => {
    const el = sideRef.current;
    if (!el) return;
    /* A workspace's own rail (components/WorkspaceRail) stands in for the
       sidebar where it hides it: the frame starts after whichever is showing. */
    const rail = document.querySelector<HTMLElement>("[data-admin-rail]");
    const place = () => {
      const side = el.getBoundingClientRect();
      const r = rail?.getBoundingClientRect();
      const right = side.width > 0 ? side.right : r && r.width > 0 && getComputedStyle(rail!).position === "fixed" ? r.right : 0;
      setFrameLeft(right > 0 ? Math.round(right) + 8 : 8);
    };
    place();
    const ro = new ResizeObserver(place);
    ro.observe(el);
    if (rail) ro.observe(rail);
    window.addEventListener("resize", place);
    return () => { ro.disconnect(); window.removeEventListener("resize", place); };
  }, [pathname]);
  useLayoutEffect(() => {
    const root = flowRef.current;
    if (!root) return;
    const DUR = [0.74, 0.88, 0.66];
    const RISE = [28, 36, 22];
    let i = 0;
    root.querySelectorAll<HTMLElement>(".fade-up").forEach((el) => {
      if (el.parentElement?.closest(".fade-up, .cascade, .os-mast-frame")) return;
      const n = Math.min(i, 9);
      el.style.setProperty("--flow-delay", `${300 + n * 130}ms`);
      el.style.setProperty("--flow-dur", `${DUR[i % 3]}s`);
      el.style.setProperty("--flow-rise", `${RISE[i % 3]}px`);
      i += 1;
    });
  }, [pathname]);
  const [collapsed, setCollapsed] = useState(false);
  /* The new look's sidebar and frame (lib/new-look "nav", 23 Oct 2026): flat,
     full height, one straight line down to a white page - no rounded window. */
  const navLook = useNewLook("nav") === true;
  /* With the new Leads page on, Leads opens to just Tenant and Landlord
     (James, 24 Oct 2026: "get rid of that tab where we click Add a tenant or
     Add a landlord. Just have it as a dropdown for leads"). Adding a lead is
     the page's own Add lead button. The old Leads page keeps Add new lead. */
  const leadsLook = useNewLook("leads") === true;
  const frontItems = (items: NavItem[]): NavItem[] =>
    leadsLook ? items.map((i) => (i.href === "/leads" && i.children ? { ...i, children: i.children.filter((c) => c.href !== "/leads?new=1") } : i)) : items;
  const [theme, setTheme] = useState<ThemeChoice>("auto");
  /* The one extra screen this person holds, if any — James gets Admin, Susan
     gets Company figures, Kirstie Pre-tenancy, Francesca Marketing, an agent
     nothing. Decided on the ACTOR's role, so an owner viewing as an agent keeps
     his own entry and can always get back to stop.

     A role rather than the old `canAdmin` boolean: that boolean was true for
     five of the six roles and drew a link into James's admin for every one of
     them. Undefined until we know — see the render below. */
  const [role, setRole] = useState<string | null | undefined>(undefined);
  /* Whose screens to DRAW, when an owner is viewing as somebody. Null the
     rest of the time. See railFor in lib/nav for why this is separate from
     the role above, which is still what decides permission. */
  const [subjectRole, setSubjectRole] = useState<string | null>(null);
  /* A team admin with no Admin of their own still gets the team page (Kirstie, 23 Oct 2026). */
  const [teamAdmin, setTeamAdmin] = useState(false);
  const [me, setMe] = useState<{ name?: string; email?: string; photo?: string | null } | null>(null);

  useEffect(() => {
    fetchMe()
      .then((j) => {
        setRole(j?.role ?? null);
        setSubjectRole(j?.subjectRole ?? null);
        setTeamAdmin(Boolean(j?.teamAdmin) && !j?.subjectRole);
        /* The SUBJECT, not the actor — while viewing as somebody, the foot
           should show whose screen you are looking at, which is the whole
           point of the red banner above it agreeing. */
        setMe(j?.user ?? null);
      })
      .catch(() => setRole(null));
  }, []);

  /* Empty until /api/auth/me answers, so nothing is drawn optimistically and
     then taken away — which reads as a glitch to everyone and as a demotion to
     the person it happens to. */
  const rail = role === undefined ? [] : railFor(role, subjectRole);
  const mine = teamAdmin && !rail.some((w) => w.href === "/admin") ? [...rail, { href: "/admin/team", label: "People", icon: "user" }] : rail;

  useEffect(() => {
    /* The accent picker is gone (11 Sep 2026): the OS runs the house clay
       for everyone. Anyone who had chosen Blush or Red before that would
       otherwise keep it on this browser for ever, so the choice is cleared
       here rather than merely no longer offered. */
    delete document.documentElement.dataset.accent;
    try { localStorage.removeItem("os-accent"); } catch {}
    setCollapsed(localStorage.getItem("os-nav-collapsed") === "1");
    setTheme(readTheme() ?? "auto");
  }, []);

  /**
   * The new-starter tour asking the rail to show it something.
   *
   * Same shape as the `os-set-theme` event just below: a window event rather
   * than lifted state, so the tour does not have to be mounted inside Shell
   * to drive it. It needs two things - the rail open, because a spotlight on
   * a 72px icon column explains nothing, and the profile panel open, because
   * that is where "Your profile" actually lives.
   *
   * Deliberately NOT persisted. Collapsing the rail is somebody's own habit,
   * and a tour that quietly rewrites a setting on its way past is a tour that
   * gets blamed for it later. This holds for the visit; their stored answer
   * comes back on the next load.
   */
  useEffect(() => {
    const onShell = (e: Event) => {
      const d = (e as CustomEvent).detail as { expand?: boolean; profile?: boolean };
      if (d?.expand) setCollapsed(false);
      if (d?.profile !== undefined) setProfileOpen(d.profile);
    };
    window.addEventListener("os-shell", onShell);
    return () => window.removeEventListener("os-shell", onShell);
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

  function toggleCollapsed() {
    setCollapsed((c) => {
      localStorage.setItem("os-nav-collapsed", c ? "0" : "1");
      // Whether the rail is folded is a per-person habit, so it travels too.
      void fetch("/api/prefs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "os-nav-collapsed", value: c ? "0" : "1" }),
      }).catch(() => { /* browser copy still holds it */ });
      if (!c) setProfileOpen(false); // the panel has nowhere to live at 72px
      return !c;
    });
  }

  async function signOut() {
    /* The session, not the old access code. This still called /api/key and
       pushed to /key — both retired when the shared code went. Signing out
       cleared a cookie nothing reads and landed on a page that redirects. */
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    /* A full load, not a router push (2 Oct 2026): the boards keep their last
       answer in the tab (lib/page-cache, the dashboard tiles, the diary), and
       only a fresh page empties all of it - so the next person to sign in on
       this tab never sees the last person's book, even for a moment. */
    window.location.assign("/sign-in");
  }

  return (
    /* os-type: the agents' own title face, Bricolage Grotesque (11 Sep) - see globals.css. */
    <div data-nav-look={navLook ? "new" : undefined} className={`os-type flex min-h-screen ${navLook ? "bg-[var(--nv-page)]" : "lg:bg-[var(--shell-bg)]"}`}>
      {/* The grey round the page: a clear rounded window over the content,
          grey everywhere outside it. The window still scrolls as before, so
          nothing that scrolls the page or sticks to it changes; content just
          passes under the 8px margin, as it would inside a scrolling panel. */}
      {!navLook && <div
        data-os-frame
        aria-hidden
        className="pointer-events-none fixed z-[45] hidden rounded-[18px] lg:block"
        style={{ top: 8, right: 8, bottom: 8, left: frameLeft, boxShadow: "0 0 0 100vmax var(--shell-bg), inset 0 0 0 1px var(--shell-rim)" }}
      />}
      {/* Tagged so /admin can hide it — an owner in the admin centre is not
          doing an agent's job, and the rail invites them to wander into the
          business-wide book by accident. See app/(os)/admin/layout.tsx. */}
      <aside
        ref={sideRef}
        data-os-sidebar
        className={navLook
          ? `nl-nav sticky top-[var(--os-band-h,0px)] z-[50] hidden h-[calc(100vh-var(--os-band-h,0px))] shrink-0 flex-col overflow-hidden transition-[width] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${collapsed ? "w-[72px]" : "w-[264px]"}`
          : `sticky top-[calc(12px+var(--os-band-h,0px))] z-[50] mb-3 ml-2 mt-3 hidden h-[calc(100vh-24px-var(--os-band-h,0px))] shrink-0 flex-col overflow-hidden bg-[var(--shell-nav-bg)] px-2.5 py-3 transition-[width] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] lg:flex ${
          collapsed ? "w-[72px]" : "w-60"
        }`}
      >
        {/* The sidebar (James, 11 Oct 2026: Mist and Launch Day, chosen in
            the look lab): Linear-clean, in components/LaunchNav. */}
        <LaunchNav
          front={frontItems([...FRONT, ...(practising ? [PRACTICE_ITEM] : [])]).filter(visible)}
          back={BACK.filter(visible).map(trimmed)}
          mine={mine}
          pathname={pathname}
          currentHref={currentHref}
          go={goTo}
          collapsed={collapsed}
          onToggleCollapse={toggleCollapsed}
          me={me}
          onSignOut={signOut}
          menuOpen={profileOpen}
          onMenu={setProfileOpen}
          look={navLook ? "new" : undefined}
        />
      </aside>

      {/* Mobile: a simple top bar; the wireframe is a desktop pitch first. */}
      <div className={navLook ? "flex min-w-0 flex-1 flex-col bg-[var(--nv-page)] lg:border-l lg:border-[var(--nv-line)]" : "flex min-w-0 flex-1 flex-col bg-card lg:ml-2 lg:bg-[var(--shell-panel)]"}>
        <header className="flex items-center justify-between border-b border-line/70 px-5 py-4 lg:hidden">
          {navLook ? <span className="nl-nav-logo">TLE OS</span> : <span className="hand text-2xl">TLE OS</span>}
          <span className="flex items-center gap-2">
            {/* Search rides it too (15 Oct 2026): below lg the sidebar and
                its Search are hidden, and a phone has no ⌘K, so Search for
                anything - and Recent in it - had no way in on a phone. */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event(OPEN_SEARCH))}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-line/80 bg-page transition-colors hover:border-ink/40"
              title="Search for anything"
              aria-label="Search for anything"
            >
              <DoodleIcon name="search" size={16} className="text-ink" />
            </button>
            {/* The bell rides the mobile bar so a screen without a page header
                still has it - the page headers carry their own on desktop. */}
            <NotificationBell compact />
            <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent-dark">
              Preview
            </span>
          </span>
        </header>
        {/* data-os-content is the handle the admin layout reaches for when a
            person's whole view needs the window. It was being targeted by CSS
            that matched nothing, so "full screen" was never full screen — the
            view sat inside this padding and overflowed by exactly its height. */}
        {/* pb-28, not py-8's 32px: Steve sits fixed in the bottom-right corner,
            and the last row of every page was ending up under him. The extra
            bottom padding is his lane, so the end of the page always scrolls
            clear of his face (James, 6 Sep 2026). From xl the right padding
            is the same lane sideways: he spans 12-72px in from the edge, and
            the last column of a wide table was ending up under him, so the
            content stops 84px short and nothing collides. */}
        <main data-os-content className="w-full flex-1 px-5 pb-28 pt-8 lg:px-10 xl:pr-[84px] 2xl:pl-14">
          <SignedOutWatch />
          <SearchPalette />
          {/* Keyed on the path so the screen replays when you actually change
              screen, and not when a filter changes the query string. */}
          {/* Said once, above the screen, in the same words a refused save
              uses - so an agent who presses something on a look-only screen
              has already been told why nothing will happen. */}
          {(hereLocked || closedArea) && (
            <p role="status" className="mb-5 rounded-xl border border-line/80 bg-card px-4 py-2.5 text-[12.5px] leading-relaxed text-muted">
              {hereLocked && levelOf(areaAccess, hereLocked.id) === "practice" ? (
                <>
                  {hereLocked.label} is in practice mode: real records are look only for now, and your own test files work in full.{" "}
                  <Link href="/practice" className="font-semibold text-accent-dark underline underline-offset-2">Open your practice files</Link>
                </>
              ) : hereLocked
                ? lockedSentence(hereLocked, levelOf(areaAccess, hereLocked.id))
                : `${closedArea!.label} is not switched on for you yet. It opens as testing finishes.`}
            </p>
          )}
          {/* page-fade and page-flow never sit together, so the fall's rules
              and the stagger cannot reach a page that fades. */}
          <div key={pathname} ref={flowRef} className={fadeLook ? `page-fade ${fadingOut ? "page-fading" : ""}` : `page-flow ${leaving ? "page-leaving" : ""}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
