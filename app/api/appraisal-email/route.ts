import { NextResponse } from "next/server";
import { rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { renderPlain } from "@/lib/campaign-mail";

/**
 * Send the pre-appraisal confirmation through REX's own mailer.
 *
 * Through REX rather than a mail service of ours for one reason that matters
 * more than convenience: a send from MailMerge lands on the contact's REX
 * timeline, so the next person to open that landlord sees the email. Anything
 * we sent ourselves would be invisible over there, and the team lives over
 * there.
 *
 * Locked like every other write. Unlike the write-up, this one has never been
 * fired — it puts a real email in front of a real landlord, so it wants a
 * supervised first send to a colleague rather than a landlord.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected on this environment." }, { status: 503 });
  }

  let body: { contactId?: string; to?: string; subject?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const to = (body.to ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const text = body.text ?? "";
  if (!to.includes("@")) {
    return NextResponse.json({ error: "That landlord has no email address on file." }, { status: 400 });
  }
  if (!subject || !text.trim()) {
    return NextResponse.json({ error: "The email needs a subject and a body." }, { status: 400 });
  }

  try {
    // On the letterhead, not as a wall of plain text. The agent writes the
    // words; the logo, the type and the unsubscribe are not theirs to
    // remember.
    const mail = renderPlain(subject, text);
    const res = await rexCall("MailMerge", "createAndSend", {
      subject: mail.subject,
      body: mail.html,
      // REX addresses a merge by RECORD, not by string, which is what puts the
      // send on the timeline. Falling back to a bare address still sends, but
      // lands nowhere anyone will see it.
      ...(body.contactId
        ? { merge_objects: [{ service_name: "Contacts", record_id: Number(body.contactId) }] }
        : { recipients: [to] }),
    });
    if (!res.ok) {
      const msg = res.error ?? `REX refused the send (${res.status}).`;
      // Its own cryptic one, translated — confirmed cause is a contact with no
      // valid email on the REX record.
      return NextResponse.json(
        {
          error: /merge objects passed in are valid/i.test(String(msg))
            ? "REX rejected it — that contact has no valid email address on their REX record."
            : msg,
        },
        { status: 502 }
      );
    }
    return NextResponse.json({ sent: true, onTimeline: Boolean(body.contactId) });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return NextResponse.json(
        {
          error:
            'Sending is locked on this environment. Set REX_ALLOW_WRITES="MailMerge/createAndSend" to unlock it — and send the first one to a colleague, not a landlord.',
          locked: true,
        },
        { status: 423 }
      );
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed." }, { status: 500 });
  }
}
