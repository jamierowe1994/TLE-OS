import "server-only";
import type { NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";
import { ensureRexLink } from "@/lib/users";
import { readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * WHOSE BOOK AM I LOOKING AT?
 *
 * The single question every data route must ask before it fetches anything.
 * TLE OS is multi-tenant as of today: an agent sees their own work and nobody
 * else's.
 *
 * ── Why this is a separate file and not a line in each route ──────────────
 *
 * Scoping that lives in each route is scoping that gets forgotten in the next
 * route. One resolver, imported everywhere, means "did we scope this?" has a
 * single answer you can grep for.
 *
 * ── The three answers, and why `null` is dangerous ────────────────────────
 *
 *   { rexUserId: "57533", everything: false }  an agent — their work only
 *   { rexUserId: null,    everything: true }   an owner — the whole business
 *   { rexUserId: null,    everything: false }  SIGNED IN BUT UNLINKED
 *
 * The third is the one that matters. A person with an OS account but no REX id
 * cannot be shown "their" anything, and the tempting fallback — show them
 * everything — is exactly wrong on a multi-tenant platform. So it is a
 * distinct state, and routes must render an explanation rather than a book.
 *
 * ── View-as ──────────────────────────────────────────────────────────────
 *
 * When an owner is viewing as somebody, the scope becomes that person's. That
 * is the entire point: not to wear their name, but to see their screen. It can
 * also carry a REX id for a person with NO OS account, because the people we
 * most want to test as — Rhiannon, Kayleigh — have not been invited yet.
 */

export interface Scope {
  /** Filter every REX query by this. Null means unscoped. */
  rexUserId: string | null;
  /** True only for an owner looking at the whole business. */
  everything: boolean;
  /** Signed in, but we cannot work out which REX person they are. */
  unlinked: boolean;
  /** Whose name to put on the page. */
  label: string;
}

export async function scopeFor(req: NextRequest): Promise<Scope> {
  const { actor, subject, viewingAs } = await whoIs(req);

  if (!actor) return { rexUserId: null, everything: false, unlinked: true, label: "" };

  /* Viewing as somebody with no OS account: the REX id rides on the cookie.
     Checked against the ACTOR being an owner, same as everything else. */
  if (actor.role === "owner") {
    const va = readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
    if (va?.ownerId === actor.id && va.rexUserId) {
      return {
        rexUserId: va.rexUserId,
        everything: false,
        unlinked: false,
        label: va.label || "them",
      };
    }
  }

  if (viewingAs && subject) {
    const rexId = await ensureRexLink(subject);
    return {
      rexUserId: rexId,
      everything: false,
      unlinked: !rexId,
      label: subject.name || subject.email,
    };
  }

  /* An owner sees the business. Susan and James run it; scoping them to their
     own REX id would show Susan zero listings, which is true and useless. */
  if (actor.role === "owner") {
    return { rexUserId: null, everything: true, unlinked: false, label: "the whole business" };
  }

  const rexId = await ensureRexLink(actor);
  return {
    rexUserId: rexId,
    everything: false,
    unlinked: !rexId,
    label: actor.name || actor.email,
  };
}

/** The REX criteria for a scope, ready to spread into a search. */
export function scopeCriteria(
  scope: Scope,
  field = "listing_agent_1_id"
): Array<{ name: string; type: string; value: string }> {
  return scope.rexUserId ? [{ name: field, type: "=", value: scope.rexUserId }] : [];
}
