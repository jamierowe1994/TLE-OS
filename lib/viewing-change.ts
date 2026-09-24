import "server-only";
import { hasDb, q } from "@/lib/db";
import { ensureRexLink, type OsUser } from "@/lib/users";
import { rexCall } from "@/lib/rex";
import { changeRexEvent } from "@/lib/rex-diary-write";
import { rexCopiesToOutlook } from "@/lib/rex-outlook-sync";
import { putInOutlook, removeFromOutlook, icsFile } from "@/lib/outlook-calendar";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendAsAgent } from "@/lib/send-as-agent";

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
 *   applicant viewing-cancelled or viewing-moved, from the agent's own Outlook
 *             where that is armed (lib/send-as-agent) and on our sender with
 *             their address to reply to otherwise, the new time attached as a
 *             calendar file
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
  /* WHOSE VIEWING. Any agent could cancel or move any REX event by its id
     (18 Sep sweep, item 4). An agent changes their own diary: the event's
     organiser by REX id, or by name when REX gives no id. Owners and the
     office are not gated. A refusal changes nothing and emails nobody. */
  if (eventId && me.role === "agent") {
    const read = await rexCall("CalendarEvents", "read", { id: eventId }).catch(() => null);
    const ev = (read?.ok ? read.result : null) as { organiser_user?: { id?: unknown; name?: string | null } | null; calendar?: { owner_user?: { id?: unknown; name?: string | null } | null } | null } | null;
    if (!ev) return { said: "That viewing could not be read just now, so nothing was changed. Try again in a minute.", steps: { rex: "Not read." } };
    const who = ev.organiser_user ?? ev.calendar?.owner_user ?? null;
    const mine = await ensureRexLink(me).catch(() => null);
    const byId = who?.id != null && mine ? String(who.id) === String(mine) : null;
    const byName = (who?.name ?? "").trim().toLowerCase() === (me.name ?? "").trim().toLowerCase() && Boolean(me.name);
    if (!(byId === true || (byId === null && byName))) {
      const first = (who?.name ?? "").trim().split(/\s+/)[0];
      return { said: first ? `That viewing is ${first}'s. Only they can cancel or move it.` : "That viewing is another agent's. Only they can cancel or move it.", steps: { rex: "Not changed." } };
    }
  }
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
    /* Their REX copies its diary into Outlook (lib/rex-outlook-sync): REX's
       copy moves or goes with the change above, and ours, if there is one
       from before that was known, is the duplicate - taken out, not moved. */
    if (outlookKey && steps.rex?.startsWith(p.action === "cancel" ? "Cancelled" : "Moved") && (await rexCopiesToOutlook(me.id))) {
      const gone = await removeFromOutlook(me.id, outlookKey).catch(() => null);
      steps.outlook = gone?.ok ? "Your Outlook follows REX; the extra copy was taken out." : "Your Outlook follows REX.";
    } else if (outlookKey) {
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
      /* One send, written either way, so the verdict on the screen is one
         sentence and the choice of mailbox is made in one place. */
      const mail =
        p.action === "cancel"
          ? { ...renderTleEmail("viewing-cancelled", {
              firstName,
              address: p.address,
              whenPretty: pretty(p.oldStartsAt),
              reasonLine: (p.reasonText ?? "").trim() || "Something has come up that means it can't go ahead as planned.",
              agentName,
            }), attachments: undefined as { filename: string; content: string; contentType?: string }[] | undefined }
          : p.newStartsAt
            ? { ...renderTleEmail("viewing-moved", {
                firstName,
                address: p.address,
                oldWhen: pretty(p.oldStartsAt),
                whenPretty: pretty(p.newStartsAt),
                agentName,
                meetLine: p.unaccompanied
                  ? `It is still unaccompanied, so nobody from us will be there - ${agentName} will send you how to get in.`
                  : `${agentName} will meet you there.`,
              }), attachments: [{
                filename: "viewing.ics",
                content: Buffer.from(icsFile({
                  uid: `viewing-${p.viewingId}`,
                  summary: `Viewing - ${p.address}`,
                  description: `With ${agentName}, The Letting Experts.`,
                  location: p.address,
                  startsAt: p.newStartsAt,
                  minutes: p.minutes,
                }), "utf8").toString("base64"),
                contentType: "text/calendar",
              }] }
            : null;
      if (!mail) {
        steps.applicant = "No new time was given, so nothing was sent.";
      } else {
        const r = await sendAsAgent({ me, to, toName: p.applicantName, subject: mail.subject, html: mail.html, attachments: mail.attachments });
        steps.applicant = r.sent ? `${firstName}: ${r.detail}` : `${firstName} was NOT emailed. ${r.detail}`;
      }
    } catch (e) {
      steps.applicant = `${firstName} was not emailed: ${e instanceof Error ? e.message.replace(/\.$/, "") : "unknown"}. Tell them yourself.`;
    }
  }

  return { said: [steps.applicant, steps.outlook, steps.rex].filter(Boolean).join(" "), steps };
}
