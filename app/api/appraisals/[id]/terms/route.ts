import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { getAppraisal } from "@/lib/appraisal-store";
import { docusealConfigured, termsParties, DocusealBlocked } from "@/lib/docuseal";
import { contractSendReady, contractSendRecord, sendContractPack, ContractSendRefused } from "@/lib/contract-send";
import { ResendBlocked } from "@/lib/resend";
import { publicOrigin } from "@/lib/origin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { nextAutoNudge, nudgeRecord, viewCounts } from "@/lib/contract-nudge";
import { presentationsFor } from "@/lib/present-store";

/**
 * One appraisal's contract: where it has got to, and the way to chase it.
 *
 *   GET  → who has signed, who has been emailed, who has opened it
 *   POST → the one send: presentation and contract in one email from the
 *          agent (lib/contract-send), first time or again
 *
 * Signatures and opens are DocuSeal's; WHEN it was emailed is ours now, since
 * DocuSeal no longer sends it (15 Sep 2026).
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
    const refs = [...new Set([got.ma.leadId, got.ma.id].filter((r): r is string => Boolean(r)))];
    const [parties, sent, nudge, decks] = await Promise.all([
      termsParties(id),
      contractSendRecord(id),
      nudgeRecord(id),
      Promise.all(refs.map((r) => presentationsFor(r))).then((l) => l.flat()),
    ]);
    const post = decks.filter((d) => d.kind === "post-appraisal").sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null;
    const views = await viewCounts(id, post?.token ?? null);
    const nextNudge = sent ? nextAutoNudge(sent.firstSentAt, nudge) : null;
    return NextResponse.json({
      ok: true,
      connected: true,
      sendUnlocked: await contractSendReady(got.ma.landlordEmail),
      /* The file reads "sent to them" off the landlord party, so our record is
         laid over DocuSeal's, which no longer moves. */
      parties: parties.map((p) => (p.role === "landlord" && sent ? { ...p, sentAt: sent.lastSentAt } : p)),
      sent,
      nudge,
      nextNudgeAt: nextNudge ? nextNudge.toISOString() : null,
      views,
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

    /* The figures moved after the agent signed: the contract they signed says
       something else. Sign again first, which draws up a fresh one. */
    if (got.ma.valuedAt && agent.completedAt < got.ma.valuedAt) {
      return NextResponse.json(
        { ok: false, error: "The rent or the fees changed after you signed, so the contract no longer matches. Draw it up again and sign it, then send." },
        { status: 409 }
      );
    }

    /* First time or fifth: the same email, with a fresh way in. */
    const { again, to } = await sendContractPack({ ma: got.ma, me: got.me, origin: publicOrigin(req) });
    return NextResponse.json({
      ok: true,
      again,
      to,
      message: again
        ? `Reminder sent to ${to}, with a fresh link into their file.`
        : `Sent to ${to}: the presentation and the contract, in one email from you.`,
    });
  } catch (e) {
    const why =
      e instanceof DocusealBlocked || e instanceof ContractSendRefused || e instanceof ResendBlocked
        ? e.message
        : "Couldn't send it just now.";
    console.error("[appraisals/terms] send failed", why);
    return NextResponse.json({ ok: false, error: why }, { status: 502 });
  }
}
