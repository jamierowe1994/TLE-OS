import "server-only";
import type { NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import type { Who } from "@/lib/admin";
import { grantAgentBook, grantWholeBusiness } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * Who sees the WHOLE business on the Overview board.
 *
 * James, 2 Oct 2026: "the overall list is just for Michael so he can keep
 * track of compliance and stuff... everybody can have their own version of
 * it." So everyone else's Overview is their own homes, and this short list of
 * named people - not a role, because a role grows (lib/plc-approvers has the
 * same reasoning) - gets every home. Owners always see the whole business.
 *
 * Held in os_settings under "overview_whole_business" so it can change without
 * a deploy. Emails, because that is what the session proves.
 */
export const DEFAULT_OVERVIEW_WHOLE = ["michael.healy@thelettingexperts.co.uk"];
const KEY = "overview_whole_business";

export async function overviewWholeList(): Promise<string[]> {
  if (!hasDb()) return DEFAULT_OVERVIEW_WHOLE;
  try {
    const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]);
    const saved = Array.isArray(rows[0]?.value?.emails)
      ? (rows[0]!.value!.emails as unknown[]).map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => e.includes("@"))
      : [];
    return saved.length ? saved : DEFAULT_OVERVIEW_WHOLE;
  } catch {
    return DEFAULT_OVERVIEW_WHOLE;
  }
}

export async function seesWholeOverview(person: { role: string; email: string | null }): Promise<boolean> {
  if (person.role === "owner") return true;
  const e = (person.email ?? "").trim().toLowerCase();
  return e !== "" && (await overviewWholeList()).includes(e);
}

/**
 * The Overview's answer for this request: the whole business, or the person's
 * own homes. An owner viewing as somebody sees THEIR Overview, so it follows
 * the person being viewed - and a view-as of someone with no account (the REX
 * id on the cookie) is never widened. /api/overview, its records drawer and the
 * pop-out boards all ask this, so a tile and the list it opens read one book.
 */
export async function wholeOverviewFor(req: NextRequest, who: Who): Promise<boolean> {
  const { actor, subject, viewingAs } = who;
  if (!actor) return false;
  if (viewingAs) return !!subject && (await seesWholeOverview(subject));
  const viewAsCookie = actor.role === "owner" && !!readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  return !viewAsCookie && (await seesWholeOverview(actor));
}

/**
 * THE AGENT PICKER (Michael Healy, 1 Nov 2026): somebody who sees the whole
 * business can narrow the Overview to one agent's managed book - the book that
 * agent's own Overview shows (managedBookFor their REX id). Every agent with a
 * home on the book, by name, with how many homes.
 */
export type OverviewAgent = { id: string; name: string; homes: number };

export async function overviewAgents(): Promise<OverviewAgent[]> {
  const { book } = await managedBookFor(null);
  const by = new Map<string, OverviewAgent>();
  for (const p of book.properties) {
    /* "name:" ids are agents REX has no user for: there is no book to read. */
    if (!p.agent?.id || p.agent.id.startsWith("name:") || p.test) continue;
    const held = by.get(p.agent.id) ?? { id: p.agent.id, name: p.agent.name || "Agent not named", homes: 0 };
    held.homes++;
    by.set(p.agent.id, held);
  }
  return [...by.values()].sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
}

/**
 * The agent a whole-business Overview request asks for (?agent=<REX user id>),
 * or null for the whole business. Only for somebody the Overview shows
 * everything to (`whole`); anybody else's ?agent= is ignored, so it can never
 * show an agent another agent's book. The name comes from the book, for the
 * REX PM tasks the boards match by name; a book that can't be read leaves it
 * blank and the homes still decide.
 */
export async function overviewAgentFor(req: NextRequest, whole: boolean): Promise<{ rexUserId: string; name: string } | null> {
  if (!whole) return null;
  const id = (req.nextUrl.searchParams.get("agent") ?? "").trim();
  if (!/^\d{1,12}$/.test(id)) return null;
  const named = await overviewAgents().then((all) => all.find((a) => a.id === id)?.name ?? "").catch(() => "");
  return { rexUserId: id, name: named };
}

/**
 * A board opened in the Overview's pop-out (?overview=1) reads the same book as
 * the tile that opened it.
 *
 * Michael Healy, 27 Oct 2026: "tenancy reviews state 107 overdue and then i
 * click in it and states nothing to review?" The tile is read for the whole
 * business (he is on the list above), but the pop-out fetched the board as
 * him, scoped to his own REX user, who manages almost nothing. Only widens a
 * request for somebody the Overview already shows everything to.
 */
export async function widenForOverview(req: NextRequest, who: Who): Promise<void> {
  if (req.nextUrl.searchParams.get("overview") !== "1") return;
  if (!(await wholeOverviewFor(req, who))) return;
  /* An agent picked on the Overview: that agent's book, as the tile read it. */
  const agent = await overviewAgentFor(req, true);
  if (agent) grantAgentBook(req, agent);
  else grantWholeBusiness(req);
}
