import "server-only";
import { finalAskSent, gateFor, sentAnywayNow, type PlcCase } from "@/lib/plc";
import { claimFinalAsk, PlcRefused, recordFinalAsk, releaseFinalAsk } from "@/lib/plc-store";
import { finalApprover } from "@/lib/plc-approvers";
import { plcFinalApprovalEmail } from "@/lib/email/agent-emails";
import { ResendBlocked, sendEmail } from "@/lib/resend";
import { msConnectionFor, msSendMail } from "@/lib/microsoft";
import { newMarker, threadStarted, THREAD_HEADER } from "@/lib/mail-threads";
import { isTestCase } from "@/lib/test-guard";

/**
 * Send to Susan for Final Approval (20 Oct 2026).
 *
 * The first check is done and the pack waits on a final approver. Kirstie
 * used to tell Susan herself; this emails her a link straight to the pack
 * and writes the press on the case, so the pack can say "With Susan for
 * final approval, sent 20 Oct by Kirstie" and Send Again can be a reminder.
 *
 * It does not move the pack. The state stays `checked`, Susan approves on
 * the same screen she always did, and her decision (or anybody's send back)
 * ends the wait because finalAskNow only reads a pack still in `checked`.
 *
 * The email is internal mail on the OS sender (lib/resend sendEmail): the
 * same sending lock, internal-recipient guard and archive as every other
 * email to our own people. A reply goes to whoever pressed.
 *
 * From 21 Oct 2026 it goes from the presser's own Outlook where that is
 * connected (lib/mail-threads): Susan's reply ("you've missed the EICR")
 * then lands in the same conversation in their mailbox, and the five-minute
 * check logs it on the pack. Without Outlook it goes as before, and her
 * reply is not followed.
 */

const SITE = (process.env.OS_PUBLIC_URL || process.env.OS_ORIGIN || "https://tle-os.co.uk").replace(/\/+$/, "");

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-10-30" as "Fri 30 Oct 2026". A move-in has no time of day, so no timezone either. */
function prettyYmd(ymd: string | null): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd ?? "");
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Can this person send this pack for final approval, and if not, why not. */
export async function finalAskOffer(
  c: PlcCase,
  me: { email: string | null } | null,
  canWork: boolean
): Promise<{ approver: { name: string; firstName: string } | null; canSend: boolean; blocked: string | null }> {
  if (c.state !== "checked") return { approver: null, canSend: false, blocked: null };
  const approver = await finalApprover();
  const plain = approver ? { name: approver.name, firstName: approver.firstName } : null;
  if (!approver) {
    return { approver: null, canSend: false, blocked: "Nobody to send it to: no final approver on the list holds an owner or super-admin login." };
  }
  if (me?.email && me.email.toLowerCase() === approver.email) {
    return { approver: plain, canSend: false, blocked: null };
  }
  if (!canWork) return { approver: plain, canSend: false, blocked: "Only the compliance team can send a pack for final approval." };
  if (!gateFor(c).ready) {
    return { approver: plain, canSend: false, blocked: "Something required is missing from the pack, so it can't go for final approval yet." };
  }
  return { approver: plain, canSend: true, blocked: null };
}

export async function askFinalApproval(
  c: PlcCase,
  me: { id?: string | null; name: string; email: string | null }
): Promise<{ case: PlcCase; message: string }> {
  if (c.state !== "checked") throw new PlcRefused("This pack isn't waiting on the final approval.");
  if (!gateFor(c).ready) throw new PlcRefused("Something required is missing from the pack, so it can't go for final approval yet.");
  const approver = await finalApprover();
  if (!approver) throw new PlcRefused("Nobody to send it to: no final approver on the list holds an owner or super-admin login.");
  const myEmail = (me.email ?? "").toLowerCase();
  if (myEmail && myEmail === approver.email) throw new PlcRefused("This one is waiting on you, so there is nobody to send it to. Approve it here.");

  /* A test pack's email comes to whoever pressed (Howard walking a test
     file), never to Susan: nothing about a test pack reaches a real person. */
  const test = isTestCase(c);
  if (test && !myEmail) throw new PlcRefused("This is a test pack, and with no email on your login there is nobody to send the test to.");
  const to = test ? myEmail : approver.email;

  /* The double-click guard. Claimed before the email, so a second press
     landing while the first is still sending finds the lock and stops. */
  if (!(await claimFinalAsk(c.id))) {
    throw new PlcRefused(`It went to ${approver.firstName} a moment ago. Send Again works after a minute.`);
  }

  const reminder = Boolean(finalAskSent(c));
  const mail = plcFinalApprovalEmail({
    firstName: test ? (me.name.split(/\s+/)[0] || "there") : approver.firstName,
    property: c.address,
    agentName: c.agentName && c.agentName !== "Unassigned" ? c.agentName : "",
    moveIn: prettyYmd(c.moveInDate),
    checkedBy: c.checkedBy || "compliance",
    checkNote: c.checkNote ?? "",
    sentBy: me.name,
    sentAnyway: Boolean(sentAnywayNow(c)),
    reminder,
    link: `${SITE}/pre-tenancy/plc?case=${encodeURIComponent(c.id)}`,
  });

  let sent = false;
  let note: string | undefined;
  const subject = test ? `[Test] ${mail.subject}` : mail.subject;
  try {
    /* Their own Outlook first, so the reply can be followed. A test pack
       stays on our sender: nothing about a test is logged as a thread. */
    const marker = newMarker();
    const viaMailbox = !test && me.id ? await msConnectionFor(me.id).then((c) => c.connected).catch(() => false) : false;
    let mailboxSent = false;
    if (viaMailbox && me.id) {
      try {
        await msSendMail(me.id, { to: { email: to, name: approver.name }, subject, body: mail.html, headers: { [THREAD_HEADER]: marker } });
        mailboxSent = true;
      } catch {
        /* Outlook refused: our sender below, as before. */
      }
    }
    if (mailboxSent && me.id) {
      await threadStarted({ caseId: c.id, userId: me.id, marker, subject, to, what: reminder ? "Final approval reminder" : "Sent for final approval", by: me.name });
    } else {
      await sendEmail({ to, subject, html: mail.html, text: mail.text, replyTo: myEmail || undefined });
    }
    sent = true;
  } catch (e) {
    note = (e instanceof ResendBlocked || e instanceof Error ? e.message : "it failed").replace(/\.+$/, "");
    /* Nothing went, so nothing to guard: a retry need not wait the minute. */
    await releaseFinalAsk(c.id).catch(() => null);
  }

  const saved = await recordFinalAsk(c.id, {
    at: new Date().toISOString(),
    by: me.name,
    byEmail: myEmail || null,
    to,
    toName: test ? me.name : approver.name,
    sent,
    ...(note ? { note } : {}),
    ...(test ? { test: true } : {}),
  });

  const message = sent
    ? test
      ? `This is a test pack, so the email came to you (${to}) instead of ${approver.firstName}.`
      : `${reminder ? "Reminder sent" : "Sent"} to ${approver.firstName} (${to}).`
    : `The email to ${test ? "you" : approver.firstName} did not go: ${note}.`;
  return { case: saved, message };
}
