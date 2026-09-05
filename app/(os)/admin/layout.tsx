"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import WorkspaceRail from "@/components/WorkspaceRail";
import { workspacesFor } from "@/lib/nav";
import { can, type Capability } from "@/lib/roles";

/**
 * Admin's own rail — the SAME panel as the agent sidebar, different contents.
 *
 * James, 28 Aug: "the same navigation bar style that we have put on the
 * homepage, with the line around the outside… it's just a mirror version with
 * just different options."
 *
 * That is the right instinct and worth naming: an owner stepping into admin has
 * not gone to a different product, they have changed what they are working on.
 * A rail that looks the same says so. A differently-shaped one makes admin feel
 * bolted on, which is exactly what it is underneath and exactly what it should
 * not feel like.
 *
 * So: same rounded panel, same border, same wordmark, same rule under it, same
 * type and spacing. Only the list below the line differs — and the word ADMIN
 * under the mark, which is the one thing that has to be unmistakable.
 */

/* `rule` draws a divider and a gap ABOVE the group.
   James, 28 Aug: "We should have a break line, then a bit of a gap, then
   Views, so then all the different views, and then Systems, with another break
   just above Systems."
   
   The point is that these are three different KINDS of thing, not one list of
   eleven. The top four are the OS itself; Views are other people's whole
   screens; System is plumbing. A heading alone was not enough separation to
   make that read at a glance. */
/**
 * Every entry now names the capability it needs, and the rail only draws what
 * you can actually use.
 *
 * It used to draw all eleven for anybody who could open admin at all, which was
 * survivable while admin meant "James and Susan" and stops being survivable the
 * moment somebody is given ONE screen. Kirstie's whole job is the run-up to a
 * move-in; a rail offering her Wiring, Permissions and Susan's figures — every
 * one of which refuses her — is a menu of ten doors and one key.
 *
 * The pages were never unguarded; they each check for themselves. This stops
 * the rail advertising what they will refuse.
 */
const GROUPS: Array<{
  title: string | null;
  rule?: boolean;
  items: Array<{ href: string; label: string; exact?: boolean; needs: Capability }>;
}> = [
  {
    title: null,
    items: [
      /* Overview is the staff census, so it wants the same capability its
         tiles do — otherwise it is the one link that greets a pre-tenancy
         user with a refusal. */
      { href: "/admin", label: "Overview", exact: true, needs: "see:people" },
      { href: "/admin/people", label: "People", needs: "see:people" },
      /* see:roles, not manage:roles. Susan reads the map; only James
         redraws it. The page hides its own controls the same way. */
      { href: "/admin/permissions", label: "Permissions", needs: "see:roles" },
      { href: "/admin/pre-launch", label: "Pre-launch", needs: "see:prelaunch" },
      /* ONE entry, not four.
         Onboarding, Tenant passport and PLC handover each had their own line
         here, which was three rail entries for one idea - "show me the thing I
         built" - and a rail that grows an entry per demo stops being a rail.
         They all live under Portals now, in the folder for the person who
         actually sees them. The pages are unchanged and still reachable
         directly; this is where you find them. */
      { href: "/admin/portals", label: "Portals", needs: "see:reports" },
    ],
  },
  {
    /* One entry per person, because that is genuinely how these differ: each is
       somebody's whole working picture, not a feature of the OS.

       They no longer LIVE here. Each is its own top-level workspace now — a
       person opening their own screen should not be walking through a door
       marked Admin to reach it, and Susan reading /admin/business in the
       address bar was the same problem written down. These are shortcuts into
       somebody else's workspace, which is a different thing from owning it. */
    title: "Views",
    rule: true,
    items: [
      { href: "/company-figures", label: "Susan's view", needs: "see:business" },
      { href: "/marketing-hub", label: "Francesca's view", needs: "see:marketing" },
      { href: "/pre-tenancy", label: "Kirstie's view", needs: "see:pretenancy" },
    ],
  },
  {
    title: "System",
    rule: true,
    items: [
      /* Wiring lives HERE and not on an agent's profile. James: "they don't
         need to see that. That's for my referencing and testing." An agent's
         connections page is a different thing — theirs, and further down. */
      { href: "/admin/connections", label: "Wiring", needs: "see:wiring" },
      /* Wiring says what the OS is connected to. Testing says whether the
         processes built on those connections have been walked by a person -
         the red, amber, green James asked for on 4 Sep so that the run-up to
         agents being let in is a list of walks, not a feeling. */
      { href: "/admin/testing", label: "Testing", needs: "see:wiring" },
      /* Separate from Wiring on purpose. Wiring reports and never changes
         anything - its own note says a page that could arm a send is a page
         that can arm one by accident. This is the one that arms, and it is
         owner-gated rather than merely admin-gated. */
      { href: "/admin/switches", label: "Switches", needs: "manage:switches" },
      /* manage:people, not see:people. The audit log records what was done
         TO people - invites, resets, who viewed as whom - and it is James's
         record of his own actions rather than a staff list. Susan holds
         see:people for the census and does not need this. */
      { href: "/admin/activity", label: "Activity", needs: "manage:people" },
      /* Not beside Kirstie's view, which is where it superficially belongs.
         This is a measurement OF her decisions, and a page that scores
         somebody sitting inside their own screen invites them to read it while
         deciding - which is exactly what would destroy the measurement. */
      { href: "/admin/plc-checks", label: "PLC checks", needs: "see:reports" },
      { href: "/admin/todo", label: "To do", needs: "see:reports" },
      /* Deliberately NOT in the "Views" group: VIEW_PREFIXES is derived from
         that group, and any href in it unmounts this rail. Note /emails also
         exists in the main OS nav — that one is the agent-facing audit of
         what currently sends; this is the catalogue of what we would send. */
      /* see:reports, not see:business. It was the only System entry Susan's
         capabilities reached, and a catalogue of every template the OS could
         send is plumbing rather than a business figure. */
      { href: "/admin/emails", label: "Emails", needs: "see:reports" },
      /* Where James feeds the assistant. The agent-facing side of it lives in
         the help panel; this is the console behind it. */
      { href: "/admin/assistant", label: "Steve", needs: "see:reports" },
      /* Where Steve's knowledge is written. The same screen Susan, Francesca,
         Michael and Kirstie get as a workspace of their own. */
      { href: "/knowledge", label: "Knowledge", needs: "edit:knowledge" },
      /* Next to Steve on purpose: these are written for HIS Guides tab, and
         sit here only while they are being drafted and checked. */
      { href: "/admin/guides", label: "Guides", needs: "see:reports" },
    ],
  },
];

/**
 * A person's view takes the WHOLE window — and it no longer does so from here.
 *
 * This layout used to detect the three view routes and unmount its own rail for
 * them, because they were nested inside /admin and would otherwise have had two
 * rails fighting. They are top-level workspaces now, so this layout never
 * mounts on them at all and the whole-window treatment lives in
 * <OwnWorkspace/>, which each of the three wraps itself in.
 *
 * That is the better place for it in any case: the rule was "a workspace owns
 * the window", and it now sits with the workspaces rather than with the one
 * neighbour that happened to need to get out of their way.
 */

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  /* Undefined until we know. Same rule the agent rail follows for the Admin
     link: filtering optimistically would draw the full list and then take
     entries away, which looks like a glitch to everyone and like a demotion to
     the person it happens to. Every hook here sits ABOVE the early return
     below — there is no ESLint in this repo to catch it if they drift. */
  const [role, setRole] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let gone = false;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { role?: string | null } | null) => {
        if (!gone) setRole(j?.role ?? null);
      })
      .catch(() => {
        if (!gone) setRole(null);
      });
    return () => {
      gone = true;
    };
  }, []);

  const groups = useMemo(() => {
    if (role === undefined) return [];
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => can(role, i.needs)) })).filter(
      (g) => g.items.length > 0
    );
  }, [role]);

  /**
   * The admin area is the OWNER'S, and this is the last line that says so.
   *
   * The rail already only draws what you hold, and every page and API route
   * here checks for itself — but "the menu is empty" is not the same statement
   * as "this is not yours", and somebody who reaches /admin by typing it, or by
   * following an old bookmark, deserves the second one. Their own workspace is
   * one click away rather than a dead end.
   *
   * Decided on the ACTOR (via /api/auth/me), so an owner viewing as somebody
   * else keeps admin and can always get back out to stop.
   */
  useEffect(() => {
    if (role === undefined || can(role, "admin:open")) return;
    const mine = workspacesFor(role)[0]?.href;
    router.replace(mine ?? "/dashboard");
  }, [role, router]);

  if (role !== undefined && !can(role, "admin:open")) {
    return (
      <div className="admin-scope py-10 text-center">
        <p className="text-[13px] text-muted">Taking you to your own screen…</p>
      </div>
    );
  }

  return (
    <div className="admin-scope">
      {/* The agent sidebar steps aside for the whole of /admin. Done in CSS
          against the element rather than by restructuring the tree, because
          the shell also carries the theme, the intro gate, the view-as bar and
          the report button — all of which must survive.

          The content padding is deliberately LEFT ALONE here. The rule used to
          strip it too, but the selector matched nothing, so every admin page
          has always been laid out inside the shell's padding and looks right
          that way. Now that the handle exists, stripping it would move every
          admin screen flush to the window edge — a change nobody asked for. */}
      <style>{`
        [data-os-sidebar] { display: none !important; }
      `}</style>

      {/* Stacked below md, side by side above it. The rail already swaps a
          240px column for a scrolling strip at that breakpoint (see
          WorkspaceRail); this is the other half of the same idea — a strip
          belongs ABOVE the content, not in a column beside it, which is what
          `flex` alone was doing and why admin pages were unreadable on a
          phone. */}
      <div className="flex flex-col gap-5 md:flex-row">
        <WorkspaceRail
          label="Admin"
          groups={groups}
          footer={
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="w-full rounded-lg border border-line/80 px-3 py-2 text-[12px] text-muted transition-colors hover:border-ink"
            >
              ← Leave admin
            </button>
          }
        />

        <div className="min-w-0 flex-1 py-3">{children}</div>
      </div>
    </div>
  );
}
