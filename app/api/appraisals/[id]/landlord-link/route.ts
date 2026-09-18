import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { startVerification, VerificationError } from "@/lib/verification";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * A one-time way into their file, for the agent to put in the after-visit email.
 *
 * James, 14 Sep 2026: "when they get their presentation, it'll be a one-time
 * link." The landlord should not be asked to go and find a sign-in page and
 * type their own address in to be sent a second email - they should press the
 * thing in the email they are already reading.
 *
 * ── It mints, it does not send ────────────────────────────────────────────
 *
 * The link goes back to the AGENT, who is composing an email to their own
 * landlord and will send it themselves through REX's mailer. Nothing is
 * emailed from here, which is why this needs no send lock: the one thing that
 * could put a message in front of a landlord is the agent pressing send on a
 * message they have read.
 *
 * ── It is a credential ────────────────────────────────────────────────────
 *
 * Twenty-four hours, spent on first use. Handed to a signed-in member of
 * staff, for a landlord on an appraisal that exists, and never logged. And
 * never while VIEWING AS somebody: a link minted wearing another person's
 * face would be recorded against them.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    }
    throw e;
  }

  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const { id } = await ctx.params;
  const ma = await getAppraisal(id);
  if (!ma) return NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 });

  const email = (ma.landlordEmail ?? "").trim().toLowerCase();
  if (!email.includes("@")) {
    return NextResponse.json(
      { ok: false, error: `No email address on ${ma.landlord}, so there is nowhere for a link to take them.` },
      { status: 409 }
    );
  }

  try {
    /* The account has to exist before a token can mean anything. Landlords are
       matched out of REX rather than registered, so this is the moment the
       portal record is created - idempotent, so a second link does not make a
       second landlord. */
    const match = await landlordByEmail(email);
    if (!match) {
      return NextResponse.json(
        { ok: false, error: `${ma.landlord} is not linked to a contact we hold, so their file cannot be opened yet.` },
        { status: 409 }
      );
    }
    await upsertLandlordAccount(match);

    const { token } = await startVerification(email, "landlord", { keepOthers: true });
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    return NextResponse.json({
      ok: true,
      url: `${origin}/landlord/enter?token=${encodeURIComponent(token)}`,
      expiresInHours: 24,
    });
  } catch (e) {
    const why = e instanceof VerificationError ? e.message : "Could not make a link just now.";
    /* The address is not logged with the failure: it is a landlord's. */
    console.error("[appraisals/landlord-link] failed", why);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }
}
