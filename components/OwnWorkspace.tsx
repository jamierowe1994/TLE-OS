"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { can, type Capability } from "@/lib/roles";
import { workspacesFor } from "@/lib/nav";

/**
 * A workspace owns the whole window.
 *
 * ── What this is ──────────────────────────────────────────────────────────
 *
 * Company figures, Pre-tenancy and Marketing are each somebody's entire working
 * screen, with their own chrome and in two cases their own left rail. The
 * agent shell's sidebar on top of that is two rails fighting — on Susan's it
 * used to sit over her tabs so they could not be clicked at all.
 *
 * The rule used to live in app/(os)/admin/layout.tsx, which detected the three
 * routes and unmounted itself for them. That was the right rule in the wrong
 * place: it worked only while the three were nested inside admin, and it made
 * the owner's rail responsible for getting out of everybody else's way. Now the
 * workspaces declare it themselves, and there is nowhere for a fourth one to
 * forget.
 *
 * ── The gate ──────────────────────────────────────────────────────────────
 *
 * Not the only one and not the important one: every route these screens call
 * requires the same capability server-side, so nothing leaks from a page whose
 * data all refuses. This exists so that somebody who does not hold it gets sent
 * to their own screen rather than sitting in front of a permanently loading
 * one, wondering whether it is broken.
 *
 * Decided on the ACTOR via /api/auth/me, never the subject — an owner viewing
 * as an agent keeps his own permissions or he cannot get back out to stop.
 */
export default function OwnWorkspace({
  needs,
  children,
}: {
  needs: Capability;
  children: React.ReactNode;
}) {
  const router = useRouter();
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

  const allowed = role === undefined ? undefined : can(role, needs);

  useEffect(() => {
    if (allowed !== false) return;
    router.replace(workspacesFor(role)[0]?.href ?? "/dashboard");
  }, [allowed, role, router]);

  /* The owner reached this from his admin rail and expects to land back on it.
     Anybody else is ON their own screen, so "back" means the rest of the OS. */
  const backHref = can(role, "admin:open") ? "/admin" : "/dashboard";
  const backLabel = can(role, "admin:open") ? "← Back to my view" : "← Back to TLE OS";

  return (
    <div className="admin-scope">
      {/* ALL the padding, not just the left. These pages declare `min-h-screen`
          as though they own the window; leaving the shell's `py-8` on meant they
          were a full screen tall inside a container inset from the top and
          bottom, and therefore always overflowed by exactly that padding. */}
      <style>{`
        [data-os-sidebar] { display: none !important; }
        [data-os-content] { padding: 0 !important; margin: 0 !important; }
      `}</style>
      {allowed === false ? (
        <p className="py-10 text-center text-[13px] text-muted">
          Taking you to your own screen…
        </p>
      ) : (
        <>
          {/* Held back until we know. Drawn immediately it would say "Back to my
              view" to Susan for a beat, which names a screen she does not have. */}
          {/* BOTTOM centre, not top left.
              Top left is where all three of these screens put their own brand
              block, so the pill sat squarely on top of "The Lettings Expert /
              BUSINESS" and covered the workspace switcher with it. It was
              wrong before this change too — it just only ever landed on James.
              Every other corner is taken as well: the month controls and
              Present are top right, the profile chip bottom left, the
              assistant bubble bottom right. The bottom centre is the one place
              free on all three. */}
          {allowed ? (
            <button
              type="button"
              onClick={() => router.push(backHref)}
              className="fixed bottom-4 left-1/2 z-[80] -translate-x-1/2 rounded-full border border-line/80 bg-panel px-3.5 py-1.5 text-[12px] shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]"
            >
              {backLabel}
            </button>
          ) : null}
          {children}
        </>
      )}
    </div>
  );
}
