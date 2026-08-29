import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { rexTokenFor } from "@/lib/rex-user";
import { renderPlain } from "@/lib/campaign-mail";
import { sendMerge } from "@/lib/rex-mailmerge";

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
    // Sent as the agent, so it lands on the landlord's REX timeline under
    // their name — the person the landlord will ring back.
    const actor = await rexTokenFor(verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value));

    // REX addresses a merge by RECORD, never by string — that is what puts the
    // send on the landlord's timeline. Without a contact id there is no record
    // to hang it on, and a bare address would land nowhere anyone will look.
    if (!body.contactId) {
      return NextResponse.json(
        { error: "That landlord has no REX contact record, so the email would land nowhere. Open them in REX first." },
        { status: 400 }
      );
    }
    const sent = await sendMerge(
      { contactId: String(body.contactId) },
      { subject: mail.subject, body: mail.html },
      actor
    );
    if (!sent.ok) {
      if (actor && isExpiredToken({ ok: false, status: 502, result: null, error: sent.error })) {
        return NextResponse.json(
          { error: "Your REX sign-in has lapsed — reconnect it in your profile and try again.", reconnect: true },
          { status: 401 }
        );
      }
      const msg = sent.error;
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
            'Sending is locked on this environment. Set REX_ALLOW_WRITES="MailMerge/queueMergeUsingObjects" to unlock it — and send the first one to a colleague, not a landlord.',
          locked: true,
        },
        { status: 423 }
      );
    }
    return NextResponse.json({ error: e instanceof Error ? e.message : "Send failed." }, { status: 500 });
  }
}
