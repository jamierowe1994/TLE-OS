import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { sendMerge } from "@/lib/rex-mailmerge";
import { rexTokenFor } from "@/lib/rex-user";
import { renderPlain } from "@/lib/campaign-mail";
import { getAppraisal } from "@/lib/appraisal-store";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { VIDEO_CHASE_KIND, videoRecorded } from "@/lib/video-chase";

/**
 * Send what's due.
 *
 * Run on a cron beside the campaign runner and the e-sign poll. Safe to run
 * twice: a row is claimed by moving it out of 'queued' in the same statement
 * that selects it, so two overlapping runs cannot both send the same email.
 *
 * ── Sent as the OFFICE, and that is a real compromise ───────────────────────
 *
 * Every other send in the OS goes out under the agent's own REX token so it
 * lands on the landlord's timeline in their name. A cron has no session, and
 * an agent's token would have to be held for days and used while they are not
 * there — which is a worse thing to build than a send that says The Letting
 * Experts. The queued_by column keeps the name of whoever queued it, so the
 * record still knows whose email it was.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  /* No secret set: open on a laptop, CLOSED in production.
     
     This used to return true unconditionally — "an environment nobody has
     locked down yet". That was survivable only while middleware happened to
     redirect every unauthenticated request, which made it look locked when it
     was not. Now that cron routes are deliberately exempt from that redirect
     (they authenticate themselves), an unset secret in production would put
     this endpoint on the open internet. Fail shut. */
  if (!secret) return process.env.NODE_ENV !== "production";
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

type Due = {
  id: string;
  kind: string;
  ref: string;
  to_email: string;
  contact_id: string | null;
  subject: string;
  body: string;
  html: string | null;
  queued_by: string;
};

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
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  }
  /* Claim and select in ONE statement. Two overlapping cron runs — a slow one
     and its successor — would otherwise both read the same due rows and send
     the landlord two copies. */
  const due = await q<Due>(
    `UPDATE os_scheduled_sends
        SET state = 'sending'
      WHERE id IN (
        SELECT id FROM os_scheduled_sends
         WHERE state = 'queued' AND send_at <= NOW()
         ORDER BY send_at
         LIMIT 25
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, kind, ref, to_email, contact_id, subject, body, html, queued_by`
  ).catch(() => []);

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of due) {
    /* ── The agent's video nudge: a colleague, by Resend, and checked again
       before it goes. Somebody who recorded on Monday must not be nagged on
       Tuesday for something already done - that check is the whole email. ── */
    if (row.kind === VIDEO_CHASE_KIND) {
      try {
        const ma = await getAppraisal(row.ref);
        if (!ma || (await videoRecorded(ma))) {
          await q(`UPDATE os_scheduled_sends SET state = 'cancelled', error = $2 WHERE id = $1`, [
            row.id,
            ma ? "A video was recorded before this was due, so it was not sent." : "The appraisal no longer exists.",
          ]);
          skipped.push(row.id);
          continue;
        }
        const mail = row.html ? { subject: row.subject, html: row.html } : renderPlain(row.subject, row.body);
        await sendEmail({ to: row.to_email, subject: mail.subject, html: mail.html, text: row.body });
        await q(
          `UPDATE os_scheduled_sends SET state = 'sent', sent_at = NOW(), error = NULL WHERE id = $1`,
          [row.id]
        );
        sent.push(row.id);
      } catch (e) {
        /* Back to 'queued' when sending is switched off here: that is the
           environment, not this email, and it will be true again next run. */
        const locked = e instanceof ResendBlocked;
        const message = e instanceof Error ? e.message : "Send failed.";
        await q(`UPDATE os_scheduled_sends SET state = $2, error = $3 WHERE id = $1`, [
          row.id,
          locked ? "queued" : "failed",
          message,
        ]).catch(() => []);
        failed.push({ id: row.id, error: message });
      }
      continue;
    }

    try {
      /* Landlord sends go by REX so they land on the timeline. Without REX
         the row waits rather than fails: that is the environment, not the
         email, and the video nudge above does not need it. */
      if (!rexConfigured()) {
        await q(`UPDATE os_scheduled_sends SET state = 'queued', error = $2 WHERE id = $1`, [
          row.id,
          "REX isn't connected here, so this waits.",
        ]).catch(() => []);
        failed.push({ id: row.id, error: "REX isn't connected here." });
        continue;
      }
      const mail = renderPlain(row.subject, row.body);
      // By RECORD — that is what puts the send on the landlord's REX timeline
      // rather than nowhere anyone will look. A queued send with no contact id
      // cannot be delivered that way, so it fails loudly instead of quietly
      // going somewhere nobody checks.
      if (!row.contact_id) {
        throw new Error(`No REX contact on this queued send (${row.to_email}), so it would land nowhere.`);
      }
      /* Queued by a person, sent by a timer. The queue records who queued it,
         so it goes out as THEM - that is the point of queuing rather than
         sending. With no REX link for that person it refuses, because the
         alternative is a landlord hearing from the office account. */
      const merged = await sendMerge(
        { contactId: row.contact_id },
        { subject: mail.subject, body: mail.html },
        await rexTokenFor(row.queued_by ?? null)
      );
      if (!merged.ok) throw new Error(merged.error);

      await q(
        `UPDATE os_scheduled_sends SET state = 'sent', sent_at = NOW(), error = NULL WHERE id = $1`,
        [row.id]
      );
      sent.push(row.id);
    } catch (e) {
      /* Back to 'queued' on a LOCKED environment, because that is not a
         failure of this email — it is the environment, and it will be true
         again next run. Anything else is the email's own problem and stays
         failed rather than retrying at somebody's landlord forever. */
      const locked = e instanceof RexWriteBlocked;
      const message = locked
        ? 'Sending is locked. Set REX_ALLOW_WRITES="MailMerge/queueMergeUsingObjects" to unlock it.'
        : e instanceof Error
          ? e.message
          : "Send failed.";
      await q(`UPDATE os_scheduled_sends SET state = $2, error = $3 WHERE id = $1`, [
        row.id,
        locked ? "queued" : "failed",
        message,
      ]).catch(() => []);
      failed.push({ id: row.id, error: message });
    }
  }

  return NextResponse.json({ ok: true, claimed: due.length, sent: sent.length, skipped: skipped.length, failed });
}

/** A dry read: what is due, without sending it. */
export async function GET() {
  if (!hasDb()) return NextResponse.json({ ok: true, due: 0, rows: [] });
  const rows = await q<{ id: string; to_email: string; subject: string; send_at: string }>(
    `SELECT id, to_email, subject, send_at
       FROM os_scheduled_sends
      WHERE state = 'queued' AND send_at <= NOW()
      ORDER BY send_at LIMIT 50`
  ).catch(() => []);
  return NextResponse.json({ ok: true, due: rows.length, rows });
}
