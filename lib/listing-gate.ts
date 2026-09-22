import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import { ensureRexLink, type OsUser } from "@/lib/users";
import { readListingDetails } from "@/lib/listing-details";

/**
 * Who may change a live advert from the OS, checked in the route itself.
 *
 * The same three rules as Push to the portals (app/api/listings/publish):
 * signed in and not viewing as somebody; the owner, Susan, or an agent; and an
 * agent only where the button's own switch lets them. The switch is read here
 * as well as in the middleware because the middleware fails open, and a
 * failure here must not become a change on Rightmove.
 */
export async function gateListingWrite(req: NextRequest, areaId: string): Promise<{ actor: OsUser } | { refuse: NextResponse }> {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return { refuse: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  if (viewingAs) {
    return { refuse: NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to change a listing." }, { status: 403 }) };
  }
  if (!["owner", "super_admin", "agent"].includes(actor.role)) {
    return { refuse: NextResponse.json({ ok: false, error: "Changing the advert is for the listing's agent." }, { status: 403 }) };
  }
  const area = AREA_DEFS.find((a) => a.id === areaId);
  if (!area) return { refuse: NextResponse.json({ ok: false, error: "No such switch." }, { status: 500 }) };
  if (actor.role === "agent") {
    const access = await accessFor(actor).catch(() => null);
    if (!access || !canAct(access, area)) {
      return {
        refuse: NextResponse.json({ ok: false, areaLocked: area.id, error: lockedSentence(area, levelOf(access, area.id)) }, { status: 423 }),
      };
    }
  }
  return { actor };
}

/**
 * WHOSE ADVERT IS IT.
 *
 * The gate above says an agent may change adverts; it did not say WHICH. Any
 * agent could edit, re-photograph, publish or archive a colleague's listing
 * by its id (18 Sep sweep, item 4). A listing is its agent's: the one REX
 * names on it, matched by REX id or by email. Owners and the office are not
 * agents and are not gated. Answers a sentence for the screen, or null.
 *
 * One REX read per write. A listing that cannot be read is refused rather
 * than allowed, because "REX was slow" must not become "anyone may".
 */
export async function listingIsTheirs(actor: OsUser, id: number): Promise<string | null> {
  if (actor.role !== "agent") return null;
  const mine = await ensureRexLink(actor).catch(() => null);
  const details = await readListingDetails(id).catch(() => null);
  if (!details) return "That listing could not be read just now, so nothing was changed. Try again in a minute.";
  const a = details.agent;
  if (a.id && mine && String(a.id) === String(mine)) return null;
  if (a.email && a.email.trim().toLowerCase() === actor.email.trim().toLowerCase()) return null;
  if (!a.id && !a.email) return null; // nobody's yet: the first agent to take it on
  if (!mine) return "Connect your sign-in to the listings system on your Profile first - an advert is changed as its agent.";
  const first = a.name?.trim().split(/\s+/)[0];
  return first ? `That advert is ${first}'s. Only its agent can change it.` : "That advert is another agent's. Only its agent can change it.";
}
