import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { appraisalIdForLead, getAppraisal } from "@/lib/appraisal-store";
import { queueVideoChase } from "@/lib/video-chase";
import { publicOrigin } from "@/lib/origin";

/**
 * The queue: emails written now and sent later.
 *
 * Only the pre-appraisal uses it today. It is the one email in the run that is
 * better late — the day before the visit, close enough that it is still in
 * mind when the agent knocks. See PRE_APPRAISAL_LEAD_DAYS.
 *
 * What is stored is the FINISHED EMAIL, not a recipe for it. A queue entry
 * that rebuilds its own wording at send time can fail hours after anybody is
 * watching, and the agent who queued it would never have seen what actually
 * went out. See os_scheduled_sends in lib/db.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = {
  id: string;
  kind: string;
  ref: string;
  to_email: string;
  subject: string;
  send_at: string;
  state: string;
  queued_by: string;
  sent_at: string | null;
  error: string | null;
};

export async function POST(req: NextRequest) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, error: "No database on this environment, so nothing can be queued." },
      { status: 503 }
    );
  }

  let body: {
    kind?: string;
    ref?: string;
    to?: string;
    contactId?: string | null;
    sendAt?: string;
    subject?: string;
    text?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }

  const to = (body.to ?? "").trim();
  const subject = (body.subject ?? "").trim();
  const text = body.text ?? "";
  const sendAt = body.sendAt ?? "";

  if (!to.includes("@")) {
    return NextResponse.json(
      { ok: false, error: "That landlord has no email address on file, so there's nothing to queue." },
      { status: 400 }
    );
  }
  if (!subject || !text.trim()) {
    return NextResponse.json({ ok: false, error: "The email needs a subject and a body." }, { status: 400 });
  }
  const when = new Date(sendAt);
  if (Number.isNaN(when.valueOf())) {
    return NextResponse.json({ ok: false, error: "That isn't a date." }, { status: 400 });
  }

  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { ok: false, error: "Sign in first — a queued email still goes out in a named agent's name." },
      { status: 401 }
    );
  }

  const id = randomBytes(9).toString("base64url");
  await q(
    `INSERT INTO os_scheduled_sends
       (id, kind, ref, to_email, contact_id, subject, body, send_at, queued_by, queued_by_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
    [
      id,
      (body.kind ?? "pre-appraisal").trim(),
      (body.ref ?? "").trim(),
      to,
      body.contactId ?? null,
      subject,
      text,
      when.toISOString(),
      me.name,
      me.id,
    ]
  );

  /* The pre-appraisal carries the deck the video sits on, so queuing it is
     the moment to make sure the agent gets asked for the video first. Once,
     and never in the way: a nudge that cannot be queued is reported in the
     response, not thrown at the landlord's email. */
  let videoChase: { queued: boolean; sendAt?: string; reason?: string } | null = null;
  const ref = (body.ref ?? "").trim();
  if ((body.kind ?? "pre-appraisal") === "pre-appraisal" && ref) {
    try {
      const ma = await getAppraisal(appraisalIdForLead(ref));
      if (ma) {
        const origin = publicOrigin(req);
        videoChase = await queueVideoChase({ ma, me, origin });
      }
    } catch (e) {
      videoChase = { queued: false, reason: e instanceof Error ? e.message : "Couldn't queue the video nudge." };
    }
  }

  return NextResponse.json({ ok: true, id, sendAt: when.toISOString(), videoChase });
}

/** What's queued — for a record, or everything still to go. */
export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, rows: [] });
  const ref = req.nextUrl.searchParams.get("ref");
  const rows = await q<Row>(
    ref
      ? `SELECT id, kind, ref, to_email, subject, send_at, state, queued_by, sent_at, error
           FROM os_scheduled_sends WHERE ref = $1 ORDER BY send_at`
      : `SELECT id, kind, ref, to_email, subject, send_at, state, queued_by, sent_at, error
           FROM os_scheduled_sends WHERE state = 'queued' ORDER BY send_at LIMIT 200`,
    ref ? [ref] : []
  ).catch(() => []);
  return NextResponse.json({ ok: true, rows });
}

/**
 * Cancel one.
 *
 * Marked, not deleted. A queue that empties itself cannot be asked what it
 * did, and "why did that landlord never get their pre-appraisal" is exactly
 * the question this table exists to answer.
 */
export async function DELETE(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true });
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
  await q(
    `UPDATE os_scheduled_sends SET state = 'cancelled' WHERE id = $1 AND state = 'queued'`,
    [id]
  ).catch(() => []);
  return NextResponse.json({ ok: true });
}
