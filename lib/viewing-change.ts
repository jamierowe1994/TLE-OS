import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { changeRexEvent } from "@/lib/rex-diary-write";
import { putInOutlook, removeFromOutlook, icsFile } from "@/lib/outlook-calendar";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";

/**
 * CANCELLING OR MOVING A VIEWING, IN-HOUSE (15 Sep 2026).
 *
 * The drawer's Cancel and Reschedule were hidden for the pilot because they
 * sent nothing: an agent cancelling would have had the applicant turn up
 * anyway. James chose: the applicant is told by email from us, the agent's own
 * calendar follows, REX's diary copy follows, and the landlord sees it on
 * their portal rather than by email.
 *
 *   REX       the diary entry is cancelled (with REX's reason) or moved
 *   Outlook   the OS-made entry is taken out or moved (only viewings booked
 *             in the OS have one - a viewing typed into REX never did)
 *   applicant viewing-cancelled or viewing-moved, reply-to the agent, the new
 *             time attached as a calendar file
 *
 * Each step answers in words and none stops the others.
 */

export interface ViewingChangeInput {
  viewingId: string;
  action: "cancel" | "move";
  reason?: "organiser" | "applicant";
  reasonText?: string;
  newStartsAt?: string;
  oldStartsAt: string;
  minutes: number;
  applicantName: string;
  applicantEmail: string | null;
  address: string;
  /** Nobody from us is going, so the moved email must not promise an agent. */
  unaccompanied?: boolean;
}

const pretty = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" });

export async function changeViewing(me: OsUser, p: ViewingChangeInput): Promise<{ said: string; steps: Record<string, string> }> {
  const steps: Record<string, string> = {};

  /* REX: the diary id is rex-<event id> for anything REX holds. */
  const eventId = p.viewingId.startsWith("rex-") ? p.viewingId.slice(4) : null;
  if (eventId) {
    const r = await changeRexEvent({
      userId: me.id,
      eventId,
      ...(p.action === "cancel" ? { cancel: { reason: p.reason === "applicant" ? "applicant" : "organiser" } } : {}),
      ...(p.action === "move" && p.newStartsAt ? { moveTo: { startsAt: p.newStartsAt, minutes: p.minutes } } : {}),
    }).catch((e) => ({ ok: false, detail: e instanceof Error ? e.message : "REX did not answer" }));
    steps.rex = r.ok ? (p.action === "cancel" ? "Cancelled in REX." : "Moved in REX.") : `Not changed in REX: ${r.detail}.`;
  }

  /* Outlook: only a viewing booked through the OS has an entry, found through
     the booking that made the REX copy. */
  if (eventId && hasDb()) {
    const rows = await q<{ record_id: string }>(
      `SELECT record_id FROM os_case_state WHERE kind = 'rex-viewing' AND payload->>'eventId' = $1 LIMIT 1`,
      [eventId]
    ).catch(() => []);
    const outlookKey = rows[0] ? `viewing|${rows[0].record_id}` : null;
    if (outlookKey) {
      if (p.action === "cancel") {
        steps.outlook = (await removeFromOutlook(me.id, outlookKey)).detail;
      } else if (p.newStartsAt) {
        const o = await putInOutlook({
          userId: me.id,
          key: outlookKey,
          subject: `Viewing - ${p.address} with ${p.applicantName}`,
          body: `Booked in TLE OS. Moved from ${pretty(p.oldStartsAt)}.\nApplicant: ${p.applicantName}`,
          location: p.address,
          startsAt: p.newStartsAt,
          minutes: p.minutes,
        });
        steps.outlook = o.ok ? "Moved in your Outlook calendar." : o.detail;
      }
    }
  }

  /* The applicant. */
  const to = (p.applicantEmail ?? "").trim();
  const firstName = p.applicantName.trim().split(/\s+/)[0] || "there";
  const agentName = me.name || "Your agent";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    steps.applicant = `${p.applicantName || "The applicant"} has no email on their record - ring them.`;
  } else {
    try {
      if (p.action === "cancel") {
        const { subject, html } = renderTleEmail("viewing-cancelled", {
          firstName,
          address: p.address,
          whenPretty: pretty(p.oldStartsAt),
          reasonLine: (p.reasonText ?? "").trim() || "Something has come up that means it can't go ahead as planned.",
          agentName,
        });
        await sendEmail({ to, subject, html, audience: "customer", replyTo: me.email || undefined });
      } else if (p.newStartsAt) {
        const { subject, html } = renderTleEmail("viewing-moved", {
          firstName,
          address: p.address,
          oldWhen: pretty(p.oldStartsAt),
          whenPretty: pretty(p.newStartsAt),
          agentName,
          meetLine: p.unaccompanied
            ? `It is still unaccompanied, so nobody from us will be there - ${agentName} will send you how to get in.`
            : `${agentName} will meet you there.`,
        });
        const ics = icsFile({
          uid: `viewing-${p.viewingId}`,
          summary: `Viewing - ${p.address}`,
          description: `With ${agentName}, The Letting Experts.`,
          location: p.address,
          startsAt: p.newStartsAt,
          minutes: p.minutes,
        });
        await sendEmail({
          to, subject, html, audience: "customer", replyTo: me.email || undefined,
          attachments: [{ filename: "viewing.ics", content: Buffer.from(ics, "utf8").toString("base64") }],
        });
      }
      steps.applicant = `${firstName} has been emailed.`;
    } catch (e) {
      steps.applicant = `${firstName} was not emailed: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}. Tell them yourself.`;
    }
  }

  return { said: [steps.applicant, steps.outlook, steps.rex].filter(Boolean).join(" "), steps };
}
