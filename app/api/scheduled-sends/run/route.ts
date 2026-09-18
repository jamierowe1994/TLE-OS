import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { RexWriteBlocked } from "@/lib/rex";
import { findUserById } from "@/lib/users";
import { sendAsAgent } from "@/lib/send-as-agent";
import { plainTextOf, renderPlain } from "@/lib/campaign-mail";
import { getAppraisal } from "@/lib/appraisal-store";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { VIDEO_CHASE_KIND, videoRecorded } from "@/lib/video-chase";
import { runDeckReminders } from "@/lib/deck-reminders";
import { runContractNudges } from "@/lib/contract-nudge";
import { runInstructionSweep } from "@/lib/rex-instruct";
import { publicOrigin } from "@/lib/origin";

/**
 * Send what's due.
 *
 * Run on a cron beside the campaign runner and the e-sign poll. Safe to run
 * twice: a row is claimed by moving it out of 'queued' in the same statement
 * that selects it, so two overlapping runs cannot both send the same email.
 *
 * ── It goes out as the person who queued it (16 Sep 2026) ─────────────────
 *
 * This used to send through REX MailMerge, which landed it on the landlord's
 * REX timeline - and refused without REX connected, without its method on the
 * write lock, and without a REX contact id on the row. The one email that
 * actually uses this queue is the pre-appraisal deck, scheduled the day before
 * the visit, so on any of those three the landlord simply never heard from us
 * and the failure sat in a table.
 *
 * Now it goes the same way as every other customer email (lib/send-as-agent):
 * from the mailbox of whoever queued it, blind-copied to their REX drop-box so
 * the timeline is kept, and on the Letting Experts sender with their address
 * to reply to when their mailbox is not connected. A cron holding no session
 * is not a problem here - the refresh token it uses is the one that agent gave
 * us, which is the same credential their own screens use.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The switch is off, or nothing is armed here: wait rather than fail. */
class SendWaiting extends Error {}

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
  /* Either form: the Railway cron services all send x-cron-key. */
  const given = req.headers.get("x-cron-key") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
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
  send_at: string;
  queued_by: string;
  queued_by_id: string | null;
};

/** A timed email this late has missed its moment. "See you tomorrow" sent the
 *  day after the visit is worse than no email. */
const TOO_LATE_MS = 12 * 60 * 60 * 1000;

/**
 * Should a queued pre-appraisal still go? (18 Sep 2026)
 *
 * The row is written when the visit is booked and its words are frozen then,
 * date and all. A visit that was since moved, lost or has already happened
 * must not get it. `ref` is the appraisal's id or its lead's, depending on
 * which screen queued it.
 */
async function preAppraisalStillStands(ref: string, sendAt: string): Promise<string | null> {
  if (!ref) return null;
  const rows = await q<{ stage: string; appointment_at: string | Date | null }>(
    `SELECT stage, appointment_at FROM os_market_appraisals
      WHERE id = $1 OR lead_id = $1 OR id = 'lead-' || $1
      ORDER BY created_at DESC LIMIT 1`,
    [ref]
  ).catch(() => null);
  /* Could not look: say nothing rather than cancel on a guess. */
  if (rows === null) return null;
  const ma = rows[0];
  if (!ma) return null;
  if (ma.stage === "lost") return "The appraisal was marked lost before this was due, so it was not sent.";
  if (!ma.appointment_at) return null;
  const visit = new Date(ma.appointment_at).getTime();
  if (visit < Date.now()) return "The visit had already happened by the time this was due, so it was not sent.";
  /* Queued for the day before. A visit now more than two days after the send
     time has been moved, and the words in this email name the old date. */
  if (visit - new Date(sendAt).getTime() > 2 * 24 * 60 * 60 * 1000) {
    return "The visit was moved after this was written, so it was not sent. Queue it again from the appraisal.";
  }
  return null;
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
      RETURNING id, kind, ref, to_email, contact_id, subject, body, html, send_at, queued_by, queued_by_id`
  ).catch(() => []);

  const sent: string[] = [];
  const skipped: string[] = [];
  const failed: { id: string; error: string }[] = [];

  for (const row of due) {
    /* ── Too late, or overtaken by events: cancelled, never sent. Without this
       a queue held back by a switch fires everything it ever held the minute
       the switch goes on - the 20 August landlord email, again. ── */
    const late = Date.now() - new Date(row.send_at).getTime() > TOO_LATE_MS;
    const overtaken = late
      ? "This was due more than twelve hours ago, so it was not sent."
      : row.kind === "pre-appraisal"
        ? await preAppraisalStillStands(row.ref, row.send_at)
        : null;
    if (overtaken) {
      await q(`UPDATE os_scheduled_sends SET state = 'cancelled', error = $2 WHERE id = $1`, [row.id, overtaken]).catch(() => []);
      skipped.push(row.id);
      continue;
    }

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
        await sendEmail({ to: row.to_email, subject: mail.subject, html: mail.html, text: plainTextOf(row.body) });
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
      /* Queued by a person, sent by a timer: it goes out as THEM, which is the
         point of queuing rather than sending. Whoever queued it must still be
         here - an email in a departed colleague's name is not ours to send. */
      /* By ID. This looked the person up by `queued_by`, which holds their
         NAME, so nobody was ever found and every queued email - the automatic
         pre-presentation among them - ended as "failed" (16-18 Sep 2026). */
      const queuerId = row.queued_by_id || row.queued_by;
      const queuer = queuerId ? await findUserById(queuerId).catch(() => null) : null;
      if (!queuer) {
        throw new Error("Whoever queued this no longer has an account here, so it cannot go out in their name.");
      }
      const mail = renderPlain(row.subject, row.body);
      const out = await sendAsAgent({
        me: queuer,
        to: row.to_email,
        subject: mail.subject,
        html: row.html ?? mail.html,
      });
      /* A switch that is off, or a lock, will be off again in a minute and is
         not this email's fault; a missing address never fixes itself. */
      if (!out.sent) {
        if (out.reason === "switched_off") throw new SendWaiting(out.detail);
        throw new Error(out.detail);
      }

      await q(
        `UPDATE os_scheduled_sends SET state = 'sent', sent_at = NOW(), error = NULL WHERE id = $1`,
        [row.id]
      );
      sent.push(row.id);
    } catch (e) {
      /* Back to 'queued' when the environment is what stopped it - a switch
         off, a lock on - because that is not this email's fault and will be
         true again next run. Anything else is the email's own problem and
         stays failed rather than retrying at somebody's landlord forever. */
      const locked = e instanceof SendWaiting || e instanceof RexWriteBlocked;
      const message = e instanceof Error ? e.message : "Send failed.";
      await q(`UPDATE os_scheduled_sends SET state = $2, error = $3 WHERE id = $1`, [
        row.id,
        locked ? "queued" : "failed",
        message,
      ]).catch(() => []);
      failed.push({ id: row.id, error: message });
    }
  }

  /* The agent's own presentation emails: the day-before "not built yet" and
     the on-the-day copy. Swept here rather than queued, so a visit that is
     booked late, moved, or built at midnight is still judged on the day. */
  const decks = await runDeckReminders(publicOrigin(req)).catch((e) => ({ chased: 0, sent: 0, failed: [e instanceof Error ? e.message : "Deck reminders failed."] }));

  /* Landlords who have not signed: nudged two, five and nine days after the
     terms went (lib/contract-nudge). */
  const nudges = await runContractNudges(publicOrigin(req)).catch((e) => ({ sent: 0, failed: [e instanceof Error ? e.message : "Nudges failed."] }));

  /* Signed files REX still has no property for (lib/rex-instruct). */
  const instructions = await runInstructionSweep().catch((e) => ({ tried: 0, linked: 0, failed: [e instanceof Error ? e.message : "Sweep failed."] }));
  return NextResponse.json({ ok: true, claimed: due.length, sent: sent.length, skipped: skipped.length, failed, decks, nudges, instructions });
}

/** A dry read: what is due, without sending it. Same key as the run: this
 *  path skips the sign-in door, and the rows are landlords' addresses. */
export async function GET(req: NextRequest) {
  if (!authorised(req)) {
    return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, due: 0, rows: [] });
  const rows = await q<{ id: string; to_email: string; subject: string; send_at: string }>(
    `SELECT id, to_email, subject, send_at
       FROM os_scheduled_sends
      WHERE state = 'queued' AND send_at <= NOW()
      ORDER BY send_at LIMIT 50`
  ).catch(() => []);
  return NextResponse.json({ ok: true, due: rows.length, rows });
}
