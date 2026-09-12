"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import NotificationBell from "@/components/NotificationBell";
import DoodleIcon from "@/components/DoodleIcon";
import { readTheme, type ThemeChoice } from "@/lib/theme";
import { FRONT, BACK, railFor, type NavItem } from "@/lib/nav";

/**
 * The OS chrome. The rail is its own encapsulated card — a thin outline the
 * whole way round, floating on the eggshell — and collapses to icons + logo
 * on the « button. FRONT OF HOUSE is the tenancy being made, BACK OFFICE is
 * the book being run. The profile foots the rail with sign-out and the
 * palette picker.
 *
 * The three groups live in lib/nav.ts rather than here, because the assistant
 * has to be able to read the same list in order to send anyone to a screen.
 */

function NavLink({
  item,
  active,
  collapsed,
  currentHref,
  open,
  anyOpen,
  onToggle,
  go,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  currentHref: string;
  /** Opened by hand, rather than by being the section you are standing in. */
  open: boolean;
  /** Some group is open by hand - so the one you stand in yields to it. */
  anyOpen: boolean;
  onToggle: () => void;
  /** Plays the page out before it changes. See `goTo` in Shell. */
  go: (href: string) => void;
}) {
  /*
   * A section with children OPENS rather than navigating.
   *
   * It used to reveal them only once you were already inside the section,
   * which meant the only way to see that Leads has a tenant side and a
   * landlord side was to load the leads page first and find out (James, 10
   * Sep 2026). Now the parent is a button: it reveals what is underneath and
   * goes nowhere, and you choose the side you actually wanted.
   *
   * Still open while you are standing in the section, so walking into Leads
   * from anywhere else does not fold the children away behind you.
   *
   * ONE group open at a time (James, 12 Sep 2026: "when we click on things
   * like Leads and Portfolio, the whole thing breaks... we can't see the
   * other tabs"). Two open groups pushed the back office off the bottom of a
   * rail that cannot scroll. So a group opened by hand closes the one you
   * are standing in, and the rail itself scrolls if a screen is still too
   * short for it.
   */
  const hasKids = Boolean(item.children?.length);
  const showChildren = Boolean(hasKids && !collapsed && (anyOpen ? open : active));
  const asButton = hasKids && !collapsed;
  const Parent = (asButton ? "button" : Link) as React.ElementType;
  return (
    <>
      {/* Collapsed, there is nowhere to reveal children TO, so the rail falls
          back to a plain link rather than offering a click that does nothing
          anybody can see. */}
      <Parent
        {...(asButton
          ? { type: "button" as const, onClick: onToggle, "aria-expanded": showChildren }
          : { href: item.href, onClick: (e: React.MouseEvent) => { e.preventDefault(); go(item.href); } })}
        title={collapsed ? item.label : undefined}
        /* The handle the new-starter tour hangs its spotlight on. The href is
           already unique per item, so this carries no new source of truth -
           it just means the tour is not matching on `a[href="..."]`, which
           would also match any link to the same screen inside a page. */
        data-nav={item.href}
        // Soft-tint active state: highlight by reducing contrast, not adding it.
        // The icon NEVER moves on collapse — padding stays constant and only
        // the label folds away, which is what makes the animation read as one
        // smooth motion instead of everything re-arranging at once.
        className={`hand flex w-full items-center rounded-xl px-3 py-2.5 text-left text-[13.5px] transition-colors ${
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
        {asButton && (
          <span
            aria-hidden
            className={`ml-auto text-[10px] text-muted transition-transform duration-200 ${showChildren ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        )}
      </Parent>

      {showChildren && (
        <div className="fade-up ml-[26px] flex flex-col gap-0.5 border-l border-line/70 pl-2.5">
          {item.children!.map((c) => {
            const on = currentHref === c.href;
            return (
              <Link
                key={c.href}
                href={c.href}
                onClick={(e) => { e.preventDefault(); go(c.href); }}
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
  /* Which section has been opened BY HAND. The section you are standing in is
     open anyway, so this only ever holds one you have reached for from
     somewhere else - which is the whole point of it. */
  const [openSection, setOpenSection] = useState<string | null>(null);
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
  /* Matches .page-leaving .os-mast in globals.css: the fall is 400ms, and
     navigating before it lands cut the old screen off mid-drop. */
  const EXIT_MS = 400;
  const goTo = useCallback(
    (href: string) => {
      if (href === currentHref) return;
      setLeaving(href);
      window.setTimeout(() => router.push(href), EXIT_MS);
    },
    [currentHref, router]
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
  const [me, setMe] = useState<{ name?: string; email?: string; photo?: string | null } | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { role?: string | null; subjectRole?: string | null; user?: { name?: string; email?: string; photo?: string | null } } | null) => {
        setRole(j?.role ?? null);
        setSubjectRole(j?.subjectRole ?? null);
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
  const mine = role === undefined ? [] : railFor(role, subjectRole);

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
    router.push("/sign-in");
    router.refresh();
  }

  return (
    /* os-type: the agents' own title face, Bricolage Grotesque (11 Sep) - see globals.css. */
    <div className="os-type flex min-h-screen">
      {/* Tagged so /admin can hide it — an owner in the admin centre is not
          doing an agent's job, and the rail invites them to wander into the
          business-wide book by accident. See app/(os)/admin/layout.tsx. */}
      <aside
        data-os-sidebar
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
              /* Nearly the height of the house beside it (James, 12 Sep
                 2026: "make it as big as the small building icon"). */
              /* Lighter than the headings (James, 12 Sep): at 800 the mark
                 sat heavy against the dainty items under it. */
              className={`hand overflow-hidden whitespace-nowrap text-[29px] font-semibold leading-none tracking-[-0.02em] transition-[max-width,opacity,margin] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "ml-0 max-w-0 opacity-0" : "ml-2 max-w-[130px] opacity-100"
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
        <nav className="os-rail mt-4 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto overflow-x-hidden pb-2">
          {FRONT.map((item) => (
            <NavLink
              key={item.href}
              item={item}
              active={pathname.startsWith(item.href)}
              collapsed={collapsed}
              currentHref={currentHref}
              open={openSection === item.href}
              anyOpen={openSection !== null}
              onToggle={() => setOpenSection((o) => (o === item.href ? null : item.href))}
              go={goTo}
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
              open={openSection === item.href}
              anyOpen={openSection !== null}
              onToggle={() => setOpenSection((o) => (o === item.href ? null : item.href))}
              go={goTo}
            />
          ))}

          {/* Only what this person actually holds, and only once we know.
              Rendering it optimistically and hiding it later would flash an
              Admin link at every agent. */}
          {mine.length > 0 && (
            <>
              <div className="mb-1 mt-3 border-t border-line/70 pt-3">
                <p
                  className={`overflow-hidden whitespace-nowrap px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70 transition-[max-height,opacity] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                    collapsed ? "max-h-0 pb-0 opacity-0" : "max-h-5 pb-1 opacity-100"
                  }`}
                >
                  Yours only
                </p>
              </div>
              {mine.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={pathname.startsWith(item.href)}
                  collapsed={collapsed}
                  currentHref={currentHref}
                  open={openSection === item.href}
                  anyOpen={openSection !== null}
                  onToggle={() => setOpenSection((o) => (o === item.href ? null : item.href))}
                  go={goTo}
                />
              ))}
            </>
          )}
        </nav>

        {/* ── Profile, at the foot ── */}
        <div className="mt-auto">
          {profileOpen && !collapsed && (
            <div className="fade-up mb-2 rounded-2xl border border-line/80 bg-panel p-3">
              {/* ONE door, not three.
                  "Your profile", "Your settings" and "Your account" were three
                  entries for one idea — James: "they're the same thing". Three
                  doors to the same room means every visit starts with a guess,
                  and the thing somebody wants is behind whichever one they did
                  not pick. Appearance moved inside too: a theme picker in a
                  dropdown is a setting hiding from the settings page. */}
              <Link
                href="/profile"
                onClick={() => setProfileOpen(false)}
                className="mb-2 flex items-center gap-2 rounded-lg border border-line/70 px-2.5 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40"
              >
                <DoodleIcon name="user" size={14} className="text-accent-dark" />
                Your profile
                <span className="ml-auto text-muted">→</span>
              </Link>
              <button
                type="button"
                onClick={signOut}
                className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left text-xs font-semibold text-muted transition-colors hover:text-ink"
              >
                <DoodleIcon name="logout" size={14} className="text-muted" />
                Sign out
              </button>
            </div>
          )}
          <button
            type="button"
            data-os-profile
            // Collapsed, there's no room for the panel — the tap reopens the rail.
            onClick={() => (collapsed ? toggleCollapsed() : setProfileOpen((o) => !o))}
            className={`flex w-full items-center gap-3 rounded-xl py-2.5 text-left transition-colors hover:bg-page ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            {/* Whose screen this is. It said "The Letting Experts" — true of
                everybody, and therefore no use to anybody. Once agents have
                their own scoped view, the foot of the sidebar is the one place
                that answers "am I looking at MY figures". */}
            {me?.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={me.photo}
                alt=""
                className="h-8 w-8 shrink-0 rounded-full object-cover"
              />
            ) : (
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-dark">
                {(me?.name || me?.email || "?")
                  .split(/[\s@.]+/)
                  .filter(Boolean)
                  .slice(0, 2)
                  .map((w) => w[0]?.toUpperCase())
                  .join("")}
              </span>
            )}
            <span
              className={`min-w-0 flex-1 overflow-hidden transition-[max-width,opacity,margin] duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? "ml-0 max-w-0 opacity-0" : "ml-0 max-w-[150px] opacity-100"
              }`}
            >
              <span className="hand block truncate text-[13px]">
                {me?.name || me?.email || "Signing in…"}
              </span>
              <span className="block truncate whitespace-nowrap text-[10px] text-muted">
                {me?.email && me?.name ? me.email : "The Letting Experts"}
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
          <span className="flex items-center gap-2">
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
          {/* Keyed on the path so the screen replays when you actually change
              screen, and not when a filter changes the query string. */}
          <div key={pathname} ref={flowRef} className={`page-flow ${leaving ? "page-leaving" : ""}`}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
