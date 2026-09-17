"use client";

import { useCallback, useEffect, useState } from "react";

/** Shared types and helpers for the admin screens. */

export type Person = {
  rexId: string; name: string; email: string; userId: string | null;
  role: string | null; hasAccount: boolean; hasPhoto: boolean;
  createdAt: string | null; lastSeenAt: string | null;
  /** From the TEG Team Hub: Basic | Pro | Academy, or null. Support Team
   *  correctly have none — a blank here is not always a gap. */
  partnerPackage: string | null;
  hasBio: boolean;
};
export type Audit = {
  id: string; kind: string; actorEmail: string; subjectEmail: string; detail: string; at: string;
};
export type Todo = { id: string; title: string; detail: string; area: string; state: string };
export type AdminData = {
  me: { id: string; email: string; name: string };
  people: Person[];
  summary: { staff: number; withAccounts: number; neverSignedIn: number; noPhoto: number; notInvited: number };
  audit: Audit[];
  todos: Todo[];
};

export const when = (iso: string | null) =>
  !iso
    ? "never"
    : new Date(iso).toLocaleString("en-GB", {
        day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
      });

export const AUDIT_KIND: Record<string, string> = {
  sign_in: "signed in",
  sign_in_failed: "failed sign-in",
  password_reset: "reset sent",
  view_as_start: "started viewing as",
  view_as_end: "stopped viewing as",
};

/**
 * Every admin screen loads the same payload. 401, 403 and 404 mean "not
 * yours to see"; anything else going wrong is a failure, not a refusal.
 *
 * It never throws. Before 17 Sep 2026 a dropped connection ("Load failed" on
 * an iPhone) was an unhandled rejection: the page sat on its loading dots
 * for ever and the only trace was a Screen bug.
 */
export async function loadAdmin(): Promise<AdminData | "denied" | "failed"> {
  try {
    const r = await fetch("/api/admin", { cache: "no-store" });
    if (r.status === 401 || r.status === 403 || r.status === 404) return "denied";
    if (!r.ok) return "failed";
    return (await r.json()) as AdminData;
  } catch {
    return "failed";
  }
}

/**
 * The admin payload with its three outcomes. A reload that fails after a
 * good load keeps the figures already on screen rather than blanking them;
 * `failed` is only for a screen that has nothing to show.
 */
export function useAdmin() {
  const [d, setD] = useState<AdminData | null>(null);
  const [denied, setDenied] = useState(false);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    loadAdmin().then((x) => {
      if (x === "denied") setDenied(true);
      else if (x === "failed") setFailed(true);
      else setD(x);
    });
  }, []);
  useEffect(load, [load]);
  return { d, denied, failed: failed && !d, load };
}
