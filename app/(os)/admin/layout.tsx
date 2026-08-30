"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import WorkspaceRail from "@/components/WorkspaceRail";
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
      { href: "/admin/permissions", label: "Permissions", needs: "manage:roles" },
      { href: "/admin/pre-launch", label: "Pre-launch", needs: "see:reports" },
    ],
  },
  {
    /* One entry per person, because that is genuinely how these differ: each is
       somebody's whole working picture, not a feature of the OS. */
    title: "Views",
    rule: true,
    items: [
      { href: "/admin/business", label: "Susan's view", needs: "see:business" },
      { href: "/admin/marketing", label: "Francesca's view", needs: "see:business" },
      { href: "/admin/pre-tenancy", label: "Kirstie's view", needs: "see:pretenancy" },
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
      /* Separate from Wiring on purpose. Wiring reports and never changes
         anything - its own note says a page that could arm a send is a page
         that can arm one by accident. This is the one that arms, and it is
         owner-gated rather than merely admin-gated. */
      { href: "/admin/switches", label: "Switches", needs: "manage:roles" },
      { href: "/admin/activity", label: "Activity", needs: "see:people" },
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
      { href: "/admin/emails", label: "Emails", needs: "see:business" },
      /* Where James feeds the assistant. The agent-facing side of it lives in
         the help panel; this is the console behind it. */
      { href: "/admin/assistant", label: "Steve", needs: "see:reports" },
    ],
  },
];

/**
 * A person's view takes the WHOLE window.
 *
 * Susan's, Francesca's and Kirstie's are each somebody's entire working screen
 * with its own left rail. Mine on top of theirs is two rails fighting, and on
 * Susan's it sat over her tabs so they could not be clicked at all.
 *
 * Derived from the Views group rather than written out again, and decided HERE
 * rather than in each page. Three pages had to remember to hide it and one
 * didn't — which is not a mistake anybody makes on purpose, it is what happens
 * when a rule lives in three places. Add a fourth view to the group above and
 * it inherits this for free.
 */
const VIEW_PREFIXES = GROUPS.find((g) => g.title === "Views")!.items.map((i) => i.href);

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
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

  /* Somebody holding one screen should land ON it. Kirstie clicking Admin
     would otherwise arrive at an Overview she cannot read, with a rail
     offering her exactly one thing — a door that opens onto a corridor. */
  const firstUsable = groups[0]?.items[0]?.href;
  useEffect(() => {
    if (role === undefined || path !== "/admin") return;
    if (can(role, "see:people")) return; // the Overview is theirs to read
    if (firstUsable && firstUsable !== "/admin") router.replace(firstUsable);
  }, [role, path, firstUsable, router]);

  const inSomeonesView = VIEW_PREFIXES.some((h) => path.startsWith(h));

  /* Not hidden with CSS — not rendered. A hidden rail still traps focus and
     still answers a screen reader, and "why does tab go somewhere invisible"
     is a horrible afternoon. */
  if (inSomeonesView) {
    return (
      <div className="admin-scope">
        {/* ALL the padding, not just the left. These pages declare
            `min-h-screen` as though they own the window; leaving the shell's
            `py-8` on meant they were a full screen tall inside a container
            inset from the top and bottom, and therefore always overflowed by
            exactly that padding. The horizontal-only reset was written when
            this selector matched nothing, so it never had to be right. */}
        <style>{`
          [data-os-sidebar] { display: none !important; }
          [data-os-content] { padding: 0 !important; margin: 0 !important; }
        `}</style>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          className="fixed left-4 top-4 z-[80] rounded-full border border-line/80 bg-panel px-3.5 py-1.5 text-[12px] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]"
        >
          ← Back to my view
        </button>
        {children}
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

      <div className="flex gap-5">
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
