import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { addInvite, invites, markInviteSent, removeInvite, tabUsage, bugs } from "@/lib/pilot";
import { lettingsAgents } from "@/lib/rex-agents";
import { findUserByEmail } from "@/lib/users";
import { startVerification } from "@/lib/verification";
import { verifyEmailFor } from "@/lib/verify-email";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";

/** The pre-launch area: who's invited, what they use, what's broken. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });

  const roster = (await lettingsAgents().catch(() => [])).map((a) => ({
    rexId: a.id, name: a.name, email: a.email,
  }));
  const invited = await invites();
  const byEmail = new Map(invited.map((i) => [i.email.toLowerCase(), i]));

  const candidates = await Promise.all(
    roster.map(async (r) => {
      const inv = byEmail.get(r.email.toLowerCase());
      const acct = await findUserByEmail(r.email);
      return {
        ...r,
        invited: Boolean(inv),
        sentAt: inv?.sentAt ?? null,
        hasAccount: Boolean(acct),
        lastSeenAt: null as string | null,
      };
    })
  );

  return NextResponse.json({
    candidates,
    usage: await tabUsage(),
    bugs: (await bugs(50)).filter((b) => b.state === "open" || b.state === "ack"),
  });
}

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });

  const { email, name, rexUserId, send } = (await req.json().catch(() => ({}))) as {
    email?: string; name?: string; rexUserId?: string; send?: boolean;
  };
  if (!email) return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });

  await addInvite({ email, name, rexUserId, by: owner.email });

  if (!send) return NextResponse.json({ ok: true, message: `${email} added to the pilot.` });

  /* Sending is a separate act from inviting, so a list can be built up over a
     week and fired in one go — and so a mis-click adds a row rather than an
     email somebody has to be told to ignore. */
  try {
    const { token } = await startVerification(email, "join");
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const mail = verifyEmailFor(`${origin}/join?token=${encodeURIComponent(token)}`);
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    await markInviteSent(email);
    await record({
      kind: "password_reset",
      actorId: owner.id, actorEmail: owner.email, subjectEmail: email,
      detail: "pilot invite sent",
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
  return NextResponse.json({ ok: true, message: `Invite sent to ${email}.` });
}

export async function DELETE(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const { email } = (await req.json().catch(() => ({}))) as { email?: string };
  if (email) await removeInvite(email);
  return NextResponse.json({ ok: true });
}
