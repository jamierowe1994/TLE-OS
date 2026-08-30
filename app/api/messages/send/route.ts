import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import { proseEmail } from "@/lib/email/prose";
import { applyMerge, type MergeValues } from "@/lib/message-templates";
import { COMPOSER_LOCKED_REASON, composerSendEnabled } from "@/lib/outbound";

/**
 * Compose, preview, and — when it is switched on — send.
 *
 * ── The order of the guards is the whole design ───────────────────────────
 *
 * Render first, refuse second, send last. So while sending is off this route
 * still does something genuinely useful: it produces the exact HTML that would
 * have gone, which is what makes reviewing the templates possible at all. A
 * lock that refuses before rendering leaves nothing to review, and the
 * templates get approved by reading the source instead, which is not the same
 * thing as seeing the email.
 *
 * ── Nothing is logged as sent that was not sent ───────────────────────────
 *
 * os_sent_emails is the Activity log an agent opens to see what a landlord
 * received. Writing a preview into it would put an email in that log which
 * nobody ever got. The insert is inside the sent branch, after the send
 * succeeded, and nowhere else.
 *
 * ── Unresolved merge fields refuse ────────────────────────────────────────
 *
 * `{{firstName}}` with no first name comes back as `{{firstName}}`, not "".
 * The route refuses to send with any still in the text, because the failure it
 * prevents is "Hi ," arriving at a landlord, and that is not recoverable by
 * apologising afterwards.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  /* The USER ID, synchronously. verifySessionToken is not async and returns no
     email — the same shape app/api/email-templates uses. */
  const actorId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }

  const b = (await req.json().catch(() => ({}))) as {
    to?: string;
    subject?: string;
    body?: string;
    merge?: MergeValues;
    /** The composer asks for a preview on every keystroke-ish; send is explicit. */
    intent?: "preview" | "send";
  };

  const to = (b.to ?? "").trim();
  const merge = b.merge ?? {};
  const subjectMerged = applyMerge(b.subject ?? "", merge);
  const bodyMerged = applyMerge(b.body ?? "", merge);
  const missing = [...new Set([...subjectMerged.missing, ...bodyMerged.missing])];

  /* NOT emailShell. That one takes a heading, a hero image, a button and a
     link — it is the shape of a transactional email, and forcing prose through
     it would put a button on a note that has nothing to press. See
     lib/email/prose. */
  const html = proseEmail(bodyMerged.text);

  const preview = {
    ok: true as const,
    to,
    subject: subjectMerged.text,
    html,
    missing,
    /* Said on every response, so the composer never has to guess whether the
       button it is about to enable would actually do anything. */
    sendEnabled: composerSendEnabled(),
  };

  if (b.intent !== "send") {
    return NextResponse.json({ ...preview, sent: false, reason: "Preview only." });
  }

  /* ── from here down, someone pressed Send ─────────────────────────────── */

  if (!composerSendEnabled()) {
    return NextResponse.json(
      { ...preview, sent: false, locked: true, reason: COMPOSER_LOCKED_REASON },
      { status: 409 }
    );
  }
  if (!to.includes("@")) {
    return NextResponse.json(
      { ...preview, sent: false, reason: `"${to || "(blank)"}" is not an email address.` },
      { status: 400 }
    );
  }
  if (missing.length) {
    return NextResponse.json(
      {
        ...preview,
        sent: false,
        reason: `Not sent. These have nothing to fill them: ${missing
          .map((m) => `{{${m}}}`)
          .join(", ")}.`,
      },
      { status: 400 }
    );
  }

  try {
    const { sendEmail } = await import("@/lib/resend");
    await sendEmail({ to, subject: subjectMerged.text, html });
  } catch (e) {
    return NextResponse.json(
      { ...preview, sent: false, reason: (e as Error).message },
      { status: 502 }
    );
  }

  /* Only now. See the note at the top. */
  if (hasDb()) {
    await q(
      `INSERT INTO os_sent_emails (id, to_email, subject, html, actor_email)
       VALUES ($1,$2,$3,$4,$5)`,
      [`msg-${crypto.randomUUID()}`, to, subjectMerged.text, html, actorId]
    ).catch(() => {
      /* Filing the copy is not the job. Delivering was. */
    });
  }

  return NextResponse.json({ ...preview, sent: true, reason: "Sent." });
}
