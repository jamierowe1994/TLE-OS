import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { sendAsAgent } from "@/lib/send-as-agent";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { renderPlain } from "@/lib/campaign-mail";

/**
 * Chasing a set of terms that hasn't come back.
 *
 * ── Why this is an email and not a resend ───────────────────────────────────
 *
 * Measured against REX on 14 Aug 2026: `EsignRequests` exposes create, read,
 * search and setStatus and NOTHING ELSE — there is no resend and no remind.
 * Reading a request back gives the DocuSign envelope id but no signing URL,
 * so we cannot re-fire the original "sign here" email or link anybody to it.
 *
 * The two alternatives were both worse. Issuing a fresh envelope gives them a
 * working link and leaves TWO open contracts on the record. Doing nothing but
 * ticking a box makes the OS lie about having chased.
 *
 * So this is what it says it is: a short note from the agent, in their name,
 * pointing at the DocuSign email already sitting in the landlord's inbox and
 * offering to send it again. It goes from their own mailbox, so the reply is
 * theirs, and the drop-box copy still files it against the landlord in REX -
 * the next person to open them can see the chase happened.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function wording(o: {
  landlordFirst: string;
  address: string;
  sentAt: string | null;
  agentName: string;
  agentPhone: string;
}): { subject: string; text: string } {
  const when = o.sentAt
    ? new Date(o.sentAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;
  const where = o.address || "your property";
  return {
    subject: `Your terms of business — ${where}`,
    text: `Hi ${o.landlordFirst},

Just a quick note — the terms of business for ${where} are still waiting on your signature.

They went out${when ? ` on ${when}` : ""} from DocuSign, so the email will be in your inbox under "The Letting Experts". It's worth a look in your junk folder too; that is where it usually is.

If you can't find it, reply to this and I'll send it straight out again. And if there's anything in it you'd like to talk through first, ring me on ${o.agentPhone} — that's often quicker than email.

Kind regards,
${o.agentName}
The Letting Experts`,
  };
}

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
  let body: {
    to?: string;
    contactId?: string;
    landlordName?: string;
    address?: string;
    sentAt?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  const to = (body.to ?? "").trim();
  if (!to.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "That landlord has no email address on file, so there's nothing to send to." },
      { status: 400 }
    );
  }

  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "Sign in first — a chase goes out in a named agent's name, never the office's." },
      { status: 401 }
    );
  }

  const mailText = wording({
    landlordFirst: (body.landlordName ?? "").trim().split(/\s+/)[0] || "there",
    address: (body.address ?? "").trim(),
    sentAt: body.sentAt ?? null,
    agentName: me.name,
    agentPhone: "0161 883 2525",
  });

  try {
    /* From the agent who is chasing, so the landlord's reply reaches them and
       not a shared inbox - the same road as every other customer email here
       (lib/send-as-agent). It went through REX's mailer until 16 Sep, which
       needed a REX contact id and told the agent to "open them in REX first"
       when there wasn't one; the timeline is kept by the drop-box copy. */
    const mail = renderPlain(mailText.subject, mailText.text);
    const sent = await sendAsAgent({
      me,
      to,
      toName: (body.landlordName ?? "").trim() || undefined,
      subject: mail.subject,
      html: mail.html,
    });
    if (!sent.sent) {
      return NextResponse.json({ ok: false, error: sent.detail }, { status: sent.reason === "no_address" ? 400 : 502 });
    }

    return NextResponse.json({ ok: true, to, via: sent.via, onTimeline: sent.timeline });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "That didn't send." },
      { status: 500 }
    );
  }
}

/** The wording, for a screen that wants to show it before it goes. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    sample: wording({
      landlordFirst: "Sam",
      address: "12 Example Road",
      sentAt: null,
      agentName: "Your name",
      agentPhone: "0161 883 2525",
    }),
  });
}
