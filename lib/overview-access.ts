import "server-only";
import type { NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import type { Who } from "@/lib/admin";
import { grantWholeBusiness } from "@/lib/scope";
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
  if (await wholeOverviewFor(req, who)) grantWholeBusiness(req);
}
