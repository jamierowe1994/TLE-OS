import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { proseEmail } from "@/lib/email/prose";
import { applyMerge, type MergeValues } from "@/lib/message-templates";
import { isInternalAddress } from "@/lib/email-policy";
import { sendAsAgent } from "@/lib/send-as-agent";
import { sendingLocked, switchOn } from "@/lib/switches";
import { findUserById } from "@/lib/users";

/**
 * Compose, preview, and — when it is switched on — send.
 *
 * ── Which switch, and which road ──────────────────────────────────────────
 *
 * The same as every other email an agent writes to one person: "Email to
 * landlords and tenants" (customer_email) decides whether a customer may be
 * written to, and lib/send-as-agent decides the road - their own Outlook when
 * that is armed and connected, otherwise our sender with their address to
 * reply to.
 *
 * Until 15 Oct 2026 this route had a lock of its own, the Railway variable
 * OUTBOUND_COMPOSER_SEND, put on before launch ("don't send anything yet",
 * James, 30 Aug) and never set. So with customer email on, Richard Callow
 * still found Send greyed out on an applicant who had enquired about a home,
 * reading "Sending is off". It also sent on the staff sender, which refuses a
 * customer address, so setting the variable would only have moved the
 * failure. One switch, the one on Admin, Switches, now governs it.
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
 * nobody ever got. The copy is filed by lib/send-as-agent once the send has
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
       button it is about to enable would actually do anything. One of our own
       addresses goes whatever customer email says, as it does in
       lib/send-as-agent - that is how a test reaches the tester. */
    sendEnabled: await mayWrite(to),
  };

  if (b.intent !== "send") {
    return NextResponse.json({ ...preview, sent: false, reason: "Preview only." });
  }

  /* ── from here down, someone pressed Send ─────────────────────────────── */

  if (!preview.sendEnabled) {
    return NextResponse.json(
      { ...preview, sent: false, locked: true, reason: LOCKED_REASON },
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

  const me = await findUserById(actorId);
  if (!me) {
    return NextResponse.json({ ...preview, sent: false, reason: "Sign in first." }, { status: 401 });
  }

  /* lib/send-as-agent files the copy in os_sent_emails itself, whichever road
     it took, and only once it has gone - so nothing is logged here. */
  const r = await sendAsAgent({ me, to, subject: subjectMerged.text, html });
  if (!r.sent) {
    return NextResponse.json(
      { ...preview, sent: false, reason: r.detail },
      { status: r.reason === "refused" ? 502 : 409 }
    );
  }

  return NextResponse.json({ ...preview, sent: true, via: r.via, reason: r.detail });
}

const LOCKED_REASON =
  "Email to landlords and tenants is switched off on Admin, Switches, so it has not been sent " +
  "and nothing has reached them. Send it from Outlook if it cannot wait.";

async function mayWrite(to: string): Promise<boolean> {
  if (sendingLocked()) return false;
  if (isInternalAddress(to)) return true;
  return switchOn("customer_email");
}
