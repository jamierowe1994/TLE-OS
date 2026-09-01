import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getTegPerson } from "@/lib/teg-people";

/**
 * What the TEG Team Hub knows about the person signed in.
 *
 * GET /api/teg/me → { partnerPackage, bio, photoUrl, jobTitle } | nulls
 *
 * Their OWN record only. There is no id parameter on purpose: the Hub holds
 * bank details, HMRC UTRs and home addresses for every person in the group,
 * and an endpoint that takes an email is one missing check away from being a
 * staff-directory dump. Anything needing somebody else's record goes through
 * the admin routes, which are capability-gated.
 *
 * Even so, only the four public-facing fields are returned — the ones that end
 * up on a landlord deck or a profile page. Nothing sensitive leaves the
 * server, whoever is asking.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const me = await findUserById(userId);
  if (!me) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });

  const person = await getTegPerson({ email: me.email, rexId: me.rexUserId });

  /* 200 with nulls, not 404. Most people have no bio and nobody has a photo
     yet, so "we hold nothing for you" is the normal state and the caller
     should render a page, not an error. */
  return NextResponse.json({
    partnerPackage: person?.partnerPackage ?? null,
    bio: person?.bio ?? null,
    photoUrl: person?.photoUrl ?? null,
    jobTitle: person?.jobTitle ?? null,
    /* Their OWN home address, and the reason this route takes no id parameter.
       Used once: to prefill the travel-time origin on their profile when they
       have not set one. Everything else about it — that it is never shown to a
       landlord or tenant, never on a deck, never in the admin list — is
       enforced at the query in lib/teg-people.ts, not here. */
    homeAddress: person?.homeAddress ?? null,
  });
}
