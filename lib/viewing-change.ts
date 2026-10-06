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
  /**
   * False = move it but email nobody (James, 6 Oct 2026). Change time runs
   * through the booker, which shows the agent the "new time" email to read
   * and edit before it goes (/api/confirmations), so the change itself must
   * not send its own copy as well. Cancelling still tells them here.
   */
  notify?: boolean;
}

/** One of our own rows in os_appointments, as a move needs it. */
type OsRow = { id: string; author_id: string | null; starts_at: Date; booking: Record<string, unknown> | null };

/**
 * Move or cancel the OS's own record of a viewing.
 *
 * A viewing REX did not take lives only here (and in the agent's Outlook),
 * keyed os-<row id> on the diary. Moving it used to send the applicant a new
 * time while the diary, the row and the Outlook entry all kept the old one.
 * A viewing REX did take still has a row here (rex_event_id set), which the
 * confirmation and the landlord's portal read, so that follows REX's move.
 */
async function moveOurRow(me: OsUser, row: OsRow, p: ViewingChangeInput, steps: Record<string, string>): Promise<void> {
  if (!hasDb()) return;
  const b = row.booking ?? {};
  /* The Outlook entry was made under the key of the time it was BOOKED at,
     so that key is kept on the row and reused for every later move. */
  const outlookKey = typeof b.outlookKey === "string" && b.outlookKey
    ? b.outlookKey
    : `viewing|${String(b.leadId ?? "")}|${b.listingId != null ? String(b.listingId) : "-"}|${new Date(String(b.startsAt ?? row.starts_at)).toISOString()}`;
  if (p.action !== "move" || !p.newStartsAt) return;
  const at = new Date(p.newStartsAt).toISOString();
  await q(
    `UPDATE os_appointments
        SET starts_at = $2::timestamptz, mins = $3::int,
            booking = CASE WHEN booking IS NULL THEN NULL ELSE booking || jsonb_build_object('startsAt', $5::text, 'minutes', $6::int, 'outlookKey', $4::text) END
      WHERE id = $1`,
    /* The time and the length go in twice, once per type: one parameter read
       as a timestamp in one place and as text in another is refused. */
    [row.id, at, p.minutes, outlookKey, at, p.minutes]
  ).catch(() => null);
  /* A test file's viewing is also written on the kit: keep the two agreeing. */
  await q(
    `UPDATE os_test_records SET payload = payload || jsonb_build_object('startsAt', $2::text) WHERE kind = 'viewing' AND payload->>'appointmentId' = $1`,
    [row.id, at]
  ).catch(() => null);
  if (!steps.outlook && b.leadId) {
    const known = await q(`SELECT 1 FROM os_case_state WHERE kind = 'outlook-event' AND record_id = $1`, [outlookKey]).catch(() => []);
    if (known.length) {
      const o = await putInOutlook({
        userId: me.id,
        key: outlookKey,
        subject: `${p.unaccompanied ? "Unaccompanied viewing" : "Viewing"} - ${p.address} with ${p.applicantName}`,
        body: `Booked in TLE OS. Moved from ${pretty(p.oldStartsAt)}.\nApplicant: ${p.applicantName}`,
        showAs: p.unaccompanied ? "free" : "busy",
        location: p.address,
        startsAt: at,
        minutes: p.minutes,
      }).catch(() => ({ ok: false as const, detail: "Could not reach Outlook." }));
      steps.outlook = o.ok ? "Moved in your Outlook calendar." : o.detail;
    }
  }
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
  /* OURS ONLY: a viewing REX never took. The same rule on whose it is - an
     agent moves their own - read off the row rather than REX. */
  const ourId = p.viewingId.startsWith("os-") ? p.viewingId.slice(3) : null;
  if (ourId) {
    const rows = hasDb()
      ? await q<OsRow>(`SELECT id, author_id, starts_at, booking FROM os_appointments WHERE id = $1`, [ourId]).catch(() => [])
      : [];
    const row = rows[0];
    if (!row) return { said: "That viewing could not be found, so nothing was changed.", steps: { os: "Not found." } };
    if (me.role === "agent" && row.author_id && row.author_id !== me.id) {
      return { said: "That viewing is another agent's. Only they can cancel or move it.", steps: { os: "Not changed." } };
    }
    await moveOurRow(me, row, p, steps);
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

  /* REX took it, so it moved there - and our own row of it follows, because
     the confirmation and the landlord's portal read the time from it. */
  if (eventId && hasDb() && steps.rex?.startsWith("Moved")) {
    const rows = await q<OsRow>(`SELECT id, author_id, starts_at, booking FROM os_appointments WHERE rex_event_id = $1 LIMIT 1`, [eventId]).catch(() => []);
    if (rows[0]) await moveOurRow(me, rows[0], p, { ...steps, outlook: steps.outlook ?? "handled" });
  }

  /* The applicant - unless the booker is showing them the email instead. */
  if (p.notify === false) {
    return { said: [steps.outlook, steps.rex].filter(Boolean).join(" ") || "Moved.", steps };
  }
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
