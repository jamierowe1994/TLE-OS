import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { requireOwner } from "@/lib/admin";
import { findUserById } from "@/lib/users";
import { startVerification } from "@/lib/verification";
import { resetEmailFor } from "@/lib/verify-email";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";

/**
 * "Reset this person's password."
 *
 * It sends THEM a link. It does not set a password, and it does not show one
 * to the owner — because an admin who can set somebody's password can also
 * read their screens while pretending to be them, and the audit trail can no
 * longer tell the two apart.
 *
 * So the strongest thing an owner can do here is start the same flow the
 * person could start themselves. That is deliberate, not a limitation.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  /* READ-ONLY WHILE VIEWING AS. A write made wearing somebody else's face
     would be recorded against their name in REX — see lib/view-as. */
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    }
    throw e;
  }
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  const subject = userId ? await findUserById(userId) : null;
  if (!subject) return NextResponse.json({ ok: false, error: "No such person." }, { status: 404 });

  try {
    const { token } = await startVerification(subject.email, "reset");
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const mail = resetEmailFor(`${origin}/reset?token=${encodeURIComponent(token)}`);
    await sendEmail({ to: subject.email, subject: mail.subject, html: mail.html, text: mail.text });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  await record({
    kind: "password_reset",
    actorId: owner.id, actorEmail: owner.email,
    subjectId: subject.id, subjectEmail: subject.email,
    detail: "sent by an owner from the admin centre",
    ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "",
  });

  return NextResponse.json({ ok: true, message: `Reset link sent to ${subject.email}.` });
}
