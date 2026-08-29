import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { isExpiredToken, rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { sendMerge } from "@/lib/rex-mailmerge";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexTokenFor } from "@/lib/rex-user";
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
 * offering to send it again. It lands on the REX timeline like every other
 * send, which means the next person to open that landlord can see the chase
 * happened.
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
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected here." }, { status: 503 });
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
    const mail = renderPlain(mailText.subject, mailText.text);
    const actor = await rexTokenFor(userId);
    // By RECORD — that is what puts the send on the landlord's REX timeline.
    // Without a contact id there is no record to hang it on.
    if (!body.contactId) {
      return NextResponse.json(
        { ok: false, error: `No REX contact record for ${to}, so a chaser would land nowhere. Open them in REX first.` },
        { status: 400 }
      );
    }
    const sent = await sendMerge(
      { contactId: String(body.contactId) },
      { subject: mail.subject, body: mail.html },
      actor
    );

    if (!sent.ok) {
      const res = { ok: false as const, status: 502, result: null, error: sent.error };
      if (actor && isExpiredToken(res)) {
        return NextResponse.json(
          { ok: false, error: "Your REX sign-in has lapsed — reconnect it in your profile.", reconnect: true },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { ok: false, error: res.error ?? `REX refused it (${res.status}).` },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true, to });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return NextResponse.json(
        {
          ok: false,
          locked: true,
          error:
            'Chasing is locked here. Set REX_ALLOW_WRITES="MailMerge/queueMergeUsingObjects" to unlock it — and send the first one to a colleague, not a landlord.',
        },
        { status: 423 }
      );
    }
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
