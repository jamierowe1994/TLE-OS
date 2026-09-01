import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexTokenFor } from "@/lib/rex-user";
import { rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { toRexApplication, type TenancyLink } from "@/lib/tenancy-link";

/**
 * Write the landlord–property–tenant link into REX, as the object REX already
 * uses for it: a TenancyApplication.
 *
 * The link is made once, when an offer is accepted, and updated only when it
 * ends. Referencing, deposits and signatures never touch it — see the note in
 * lib/tenancy-link.ts for why that matters.
 *
 * The landlord side needs no payload: the listing already carries them through
 * its own Landlord relationship (type 179 on this account), so writing the
 * application against listing_id links all three.
 *
 * Locked like every other write — lib/rex.ts refuses unless REX_ALLOW_WRITES
 * names TenancyApplications/create and /update. Nothing has been fired at REX
 * from here yet; the shape is proven by reading real accepted applications
 * back out, not by having written one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  /* Same fix as the applications route: this wrote to REX with no actor, so
     the record would carry the office account rather than the agent. A write
     into the live system six businesses share should always be answerable to
     a person. */
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { error: "Sign in first — a tenancy application is filed under an agent's name." },
      { status: 401 }
    );
  }
  const actorToken = await rexTokenFor(me.id).catch(() => null);
  if (!actorToken) {
    return NextResponse.json(
      {
        error:
          "No REX sign-in held for you, so this would be filed under the office account rather " +
          "than your name. Link your REX account on Profile, then try again.",
      },
      { status: 409 }
    );
  }

  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected on this environment." }, { status: 503 });
  }

  let link: TenancyLink;
  try {
    link = (await req.json()) as TenancyLink;
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (!link?.listingId || !Number(link.listingId)) {
    return NextResponse.json({ error: "A listing id is required." }, { status: 400 });
  }
  if (!link.tenants?.some((t) => t.contactId)) {
    return NextResponse.json(
      { error: "At least one tenant needs a REX contact before they can be linked." },
      { status: 400 }
    );
  }

  const data = toRexApplication(link);
  const updating = Boolean(link.rexApplicationId);

  try {
    const res = await rexCall(
      "TenancyApplications",
      updating ? "update" : "create",
      { data: updating ? { ...data, id: Number(link.rexApplicationId) } : data },
      actorToken
    );
    if (!res.ok) {
      return NextResponse.json({ error: res.error ?? `REX refused (${res.status}).` }, { status: 502 });
    }
    const id =
      typeof res.result === "object" && res.result
        ? String((res.result as { id?: string | number }).id ?? link.rexApplicationId ?? "")
        : String(res.result ?? "");
    return NextResponse.json({ ok: true, rexApplicationId: id || link.rexApplicationId, updated: updating });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return NextResponse.json(
        {
          error:
            'Writes to REX are locked here. Set REX_ALLOW_WRITES="TenancyApplications/create,TenancyApplications/update" to unlock the link.',
          locked: true,
        },
        { status: 423 }
      );
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed." }, { status: 500 });
  }
}
