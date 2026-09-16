import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { renderPlain } from "@/lib/campaign-mail";
import { sendAsAgent } from "@/lib/send-as-agent";

/**
 * The appraisal emails: confirming the appointment, before the visit, after it.
 *
 * ── It used to go through REX, and that is what changed (16 Sep 2026) ────
 *
 * This route sent through REX's MailMerge, for a reason that was good at the
 * time: a merge lands on the landlord's REX timeline, where the team lived.
 * James, 15 Sep: "we should never have to sign into REX ever again", and the
 * confirmations are ours to send. The timeline is kept anyway - a send from
 * the agent's own mailbox is BCC'd to their REX email dropbox (lib/microsoft),
 * so it files itself against the contact exactly as a merge did.
 *
 * What that buys, beyond the decision:
 *
 *   • It works without REX. MailMerge needed REX connected, REX_ALLOW_WRITES
 *     naming the method, and a REX contact id - so pressing Send on a test
 *     appraisal, whose landlord is deliberately kept out of REX, could only
 *     ever fail. Every one of Howard's appraisal tests started there.
 *   • It stops the screen saying "Open them in REX first", which is the one
 *     thing an agent screen must never say.
 *   • The reply comes back to the agent, in their own inbox, and shows on the
 *     record beside everything else (components/MailThread).
 *
 * Same two brakes as every other customer send, applied in lib/send-as-agent:
 * the customer-email switch decides whether a real landlord may be written to,
 * and it falls back to the Letting Experts sender when a mailbox is not
 * connected rather than losing the email.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  /* READ-ONLY WHILE VIEWING AS. An email sent wearing somebody else's face
     would go out in their name - see lib/view-as. */
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
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  let body: { contactId?: string; to?: string; subject?: string; text?: string; name?: string };
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

  /* On the letterhead, not as a wall of plain text. The agent writes the
     words; the logo, the type and the footer are not theirs to remember. */
  const mail = renderPlain(subject, text);
  const sent = await sendAsAgent({
    me,
    to,
    toName: (body.name ?? "").trim() || undefined,
    subject: mail.subject,
    html: mail.html,
  });
  if (!sent.sent) return NextResponse.json({ error: sent.detail }, { status: 502 });
  return NextResponse.json({ sent: true, via: sent.via, onTimeline: sent.timeline, said: sent.detail });
}
