"use client";

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

/** Every admin screen loads the same payload; 404 means "not an owner". */
export async function loadAdmin(): Promise<AdminData | null> {
  const r = await fetch("/api/admin");
  if (!r.ok) return null;
  return (await r.json()) as AdminData;
}
