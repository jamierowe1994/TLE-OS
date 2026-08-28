"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

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
const GROUPS: Array<{
  title: string | null;
  rule?: boolean;
  items: Array<{ href: string; label: string; exact?: boolean }>;
}> = [
  {
    title: null,
    items: [
      { href: "/admin", label: "Overview", exact: true },
      { href: "/admin/people", label: "People" },
      { href: "/admin/permissions", label: "Permissions" },
      { href: "/admin/pre-launch", label: "Pre-launch" },
    ],
  },
  {
    /* One entry per person, because that is genuinely how these differ: each is
       somebody's whole working picture, not a feature of the OS. */
    title: "Views",
    rule: true,
    items: [
      { href: "/admin/business", label: "Susan's view" },
      { href: "/admin/marketing", label: "Francesca's view" },
      { href: "/admin/pre-tenancy", label: "Kirstie's view" },
    ],
  },
  {
    title: "System",
    rule: true,
    items: [
      /* Wiring lives HERE and not on an agent's profile. James: "they don't
         need to see that. That's for my referencing and testing." An agent's
         connections page is a different thing — theirs, and further down. */
      { href: "/admin/connections", label: "Wiring" },
      { href: "/admin/activity", label: "Activity" },
      { href: "/admin/todo", label: "To do" },
      /* Deliberately NOT in the "Views" group: VIEW_PREFIXES is derived from
         that group, and any href in it unmounts this rail. Note /emails also
         exists in the main OS nav — that one is the agent-facing audit of
         what currently sends; this is the catalogue of what we would send. */
      { href: "/admin/emails", label: "Emails" },
      /* Where James feeds the assistant. The agent-facing side of it lives in
         the help panel; this is the console behind it. */
      { href: "/admin/assistant", label: "Assistant" },
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
  const inSomeonesView = VIEW_PREFIXES.some((h) => path.startsWith(h));

  /* Not hidden with CSS — not rendered. A hidden rail still traps focus and
     still answers a screen reader, and "why does tab go somewhere invisible"
     is a horrible afternoon. */
  if (inSomeonesView) {
    return (
      <div className="admin-scope">
        <style>{`
          [data-os-sidebar] { display: none !important; }
          [data-os-content] { padding-left: 0 !important; margin-left: 0 !important; }
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
          the report button — all of which must survive. */}
      <style>{`
        [data-os-sidebar] { display: none !important; }
        [data-os-content] { padding-left: 0 !important; margin-left: 0 !important; }
      `}</style>

      <div className="flex gap-5">
        <aside
          data-admin-rail
          className="sticky top-3 mb-3 hidden h-[calc(100vh-24px)] w-60 shrink-0 flex-col overflow-hidden rounded-3xl border border-line/80 bg-panel px-4 py-5 md:flex"
        >
          <div className="flex items-center px-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/house.png" alt="" className="art h-7 w-7" />
            <span className="hand ml-2 text-[17px] leading-none">TLE OS</span>
          </div>
          <p className="mt-1 px-1 text-[9px] font-bold uppercase tracking-[0.16em] text-accent-dark">
            Admin
          </p>

          {/* The line around the outside is the panel's border; this is the one
              under the mark, exactly as the agent rail has it. */}
          <div className="mb-1 mt-3 border-t border-line/70 pt-3" />

          <nav aria-label="Admin" className="min-h-0 flex-1 overflow-y-auto">
            {GROUPS.map((g) => (
              <div
                key={g.title ?? "top"}
                className={
                  g.rule
                    ? "mt-5 border-t border-line/70 pt-4"
                    : g.title
                      ? "mt-3"
                      : ""
                }
              >
                {g.title && (
                  <p className="mb-1.5 px-3 text-[9px] font-bold uppercase tracking-[0.14em] text-muted/70">
                    {g.title}
                  </p>
                )}
                <ul className="space-y-0.5">
                  {g.items.map((t) => {
                    const on = t.exact ? path === t.href : path.startsWith(t.href);
                    return (
                      <li key={t.href}>
                        <Link
                          href={t.href}
                          className={`block rounded-lg px-3 py-2 text-[12.5px] transition-colors ${
                            on
                              ? "bg-accent-soft font-semibold text-accent-dark"
                              : "text-muted hover:text-ink"
                          }`}
                        >
                          {t.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <button
            type="button"
            onClick={() => router.push("/dashboard")}
            className="mt-auto rounded-lg border border-line/80 px-3 py-2 text-[12px] text-muted transition-colors hover:border-ink"
          >
            ← Leave admin
          </button>
        </aside>

        {/* On a phone the rail becomes a scrolling strip — a 240px column beside
            content on a 375px screen leaves neither of them usable. */}
        <nav
          data-admin-rail
          aria-label="Admin"
          className="mb-4 flex gap-1.5 overflow-x-auto pb-1 md:hidden"
        >
          {GROUPS.flatMap((g) => g.items).map((t) => {
            const on = t.exact ? path === t.href : path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[12px] ${
                  on ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 flex-1 py-3">{children}</div>
      </div>
    </div>
  );
}
