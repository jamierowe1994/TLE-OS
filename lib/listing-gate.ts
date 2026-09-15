import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessFor } from "@/lib/area-access";
import { AREA_DEFS, canAct, levelOf, lockedSentence } from "@/lib/area-map";
import type { OsUser } from "@/lib/users";

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
