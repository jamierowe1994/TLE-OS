import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { docusealConfigured, docusealSendUnlocked, termsParties, emailTerms, DocusealBlocked } from "@/lib/docuseal";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * One appraisal's contract: where it has got to, and the way to chase it.
 *
 *   GET  → who has signed, who has been emailed, who has opened it
 *   POST → put the landlord's copy in their inbox, first time or again
 *
 * ── Why the state is read rather than stored ──────────────────────────────
 *
 * All of it comes from DocuSeal on every request. It is the system of record
 * for a signature and a second copy of that state is a second thing to be
 * wrong - a file saying "signed" over a contract that is not is worse than a
 * file saying nothing.
 *
 * ── The send needs the agent's signature first ────────────────────────────
 *
 * James, 14 Sep 2026: "we would get the agent to sign before it goes off." So
 * the POST refuses while the agent's half is unsigned. That is not ceremony:
 * DocuSeal signs in order, so a landlord emailed before the agent has signed
 * opens a contract they cannot do anything with.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function whoAndWhat(req: NextRequest, id: string) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  const ma = await getAppraisal(id);
  if (!ma) return { error: NextResponse.json({ ok: false, error: "No such appraisal." }, { status: 404 }) };
  return { me, ma };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const got = await whoAndWhat(req, id);
  if (got.error) return got.error;

  if (!docusealConfigured()) {
    return NextResponse.json({ ok: true, connected: false, sendUnlocked: false, parties: [] });
  }
  try {
    const parties = await termsParties(id);
    return NextResponse.json({
      ok: true,
      connected: true,
      sendUnlocked: docusealSendUnlocked(),
      parties,
    });
  } catch (e) {
    const why = e instanceof DocusealBlocked ? e.message : "Couldn't read the contract just now.";
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  /* Never while wearing somebody else's face: this puts an email in front of a
     landlord and it would be recorded against the person being viewed as. */
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    }
    throw e;
  }

  const { id } = await ctx.params;
  const got = await whoAndWhat(req, id);
  if (got.error) return got.error;

  try {
    const parties = await termsParties(id);
    const agent = parties.find((p) => p.role === "agent");
    const landlord = parties.find((p) => p.role === "landlord");

    if (!landlord) {
      return NextResponse.json(
        { ok: false, error: "There is no contract on this file yet. Prepare and sign it first." },
        { status: 409 }
      );
    }
    if (landlord.completedAt) {
      return NextResponse.json(
        { ok: false, error: `${landlord.name || "They"} signed this already — there is nothing to chase.` },
        { status: 409 }
      );
    }
    if (!agent?.completedAt) {
      return NextResponse.json(
        { ok: false, error: "Sign your half first. Until you do, the landlord opens a contract they can't act on." },
        { status: 409 }
      );
    }

    /* First time or fifth: the same call. What changes is what we tell them. */
    const again = Boolean(landlord.sentAt);
    await emailTerms(landlord);
    return NextResponse.json({
      ok: true,
      again,
      to: landlord.email,
      message: again
        ? `Reminder sent to ${landlord.email}.`
        : `Sent to ${landlord.email}. They can sign it from their own file too.`,
    });
  } catch (e) {
    const why = e instanceof DocusealBlocked ? e.message : "Couldn't send it just now.";
    console.error("[appraisals/terms] send failed", why);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }
}
