import "server-only";
import { hasDb, q } from "@/lib/db";
import { ensureRexLink, type OsUser } from "@/lib/users";
import { rexCall } from "@/lib/rex";
import { changeRexEvent } from "@/lib/rex-diary-write";
import { rexCopiesToOutlook } from "@/lib/rex-outlook-sync";
import { putInOutlook, removeFromOutlook, removeOutlookTwin, icsFile } from "@/lib/outlook-calendar";
import { heldDiary } from "@/lib/diary-cache";
import { recordViewingCancelled, viewingCancelledAlready } from "@/lib/viewing-cancelled";
import { escapeHtml, renderTleEmail } from "@/lib/email/tle-emails";
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
/* The Outlook entry was made under the key of the time it was BOOKED at,
   so that key is kept on the row and reused for every later move. */
function outlookKeyOf(row: OsRow): string {
  const b = row.booking ?? {};
  if (typeof b.outlookKey === "string" && b.outlookKey) return b.outlookKey;
  /* A booking's own time when it reads as one; the row's otherwise - a bad
     stored value must not stop a cancel. */
  const booked = new Date(String(b.startsAt ?? ""));
  const at = Number.isNaN(booked.getTime()) ? new Date(row.starts_at) : booked;
  return `viewing|${String(b.leadId ?? "")}|${b.listingId != null ? String(b.listingId) : "-"}|${at.toISOString()}`;
}

async function moveOurRow(me: OsUser, row: OsRow, p: ViewingChangeInput, steps: Record<string, string>): Promise<void> {
  if (!hasDb()) return;
  const b = row.booking ?? {};
  const outlookKey = outlookKeyOf(row);
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

/** REX's way of saying an entry is not there (any more) - cancelled entries vanish. */
const isNotFound = (detail: string | null | undefined) => /not found|could not find/i.test(detail ?? "");

export async function changeViewing(me: OsUser, p: ViewingChangeInput): Promise<{ ok: boolean; said: string; steps: Record<string, string> }> {
  const steps: Record<string, string> = {};
  const cancel = p.action === "cancel";

  /* ALREADY OFF (Lorna, 15 Oct 2026). Her second and third presses on the
     same viewing were each a fresh attempt; now a second press says so and
     emails nobody again. The held diary is told once more in case a copy
     from another process still had it. */
  if (cancel) {
    const before = await viewingCancelledAlready(p.viewingId);
    if (before) {
      await recordViewingCancelled(p.viewingId, before).catch(() => undefined);
      return { ok: true, said: "That viewing is already cancelled and out of the diary.", steps: { os: "Already cancelled." } };
    }
  }

  /* The diary's own copy of it: whose it is, when REX can no longer say. */
  const held = p.viewingId.startsWith("rex-")
    ? (await heldDiary().catch(() => null))?.book.appts.find((a) => a.id === p.viewingId) ?? null
    : null;
  const myRexEmail = hasDb()
    ? (await q<{ rex_email: string }>(`SELECT rex_email FROM os_rex_tokens WHERE user_id = $1`, [me.id]).catch(() => []))[0]?.rex_email?.toLowerCase() ?? null
    : null;
  const mineByDiary = (a: { agentEmail?: string; agent?: string } | null) => {
    if (!a) return null;
    const owner = (a.agentEmail ?? "").toLowerCase();
    if (owner) return owner === (me.email ?? "").toLowerCase() || owner === myRexEmail;
    return Boolean(me.name) && (a.agent ?? "").trim().toLowerCase() === (me.name ?? "").trim().toLowerCase();
  };

  /* REX: the diary id is rex-<event id> for anything REX holds. */
  const eventId = p.viewingId.startsWith("rex-") ? p.viewingId.slice(4) : null;
  /* Gone from REX already: cancelled there by an earlier press or by hand.
     The OS still has to catch up - its diary, ledger and the applicant. */
  let goneFromRex = false;
  /* WHOSE VIEWING. Any agent could cancel or move any REX event by its id
     (18 Sep sweep, item 4). An agent changes their own diary: the event's
     organiser by REX id, or by name when REX gives no id. Owners and the
     office are not gated. A refusal changes nothing and emails nobody. */
  let ownViewing: boolean | null = null;
  if (eventId && me.role === "agent") {
    const read = await rexCall("CalendarEvents", "read", { id: eventId }).catch(() => null);
    const ev = (read?.ok ? read.result : null) as { organiser_user?: { id?: unknown; name?: string | null } | null; calendar?: { owner_user?: { id?: unknown; name?: string | null } | null } | null } | null;
    if (!ev) {
      /* REX no longer returns a cancelled entry, so "not found" after an
         earlier press is the expected answer - and the diary's copy says
         whose it was. Anything else (REX not answering) changes nothing. */
      if (cancel && isNotFound(read?.error) && mineByDiary(held) === true) {
        goneFromRex = true;
        ownViewing = true;
      } else {
        return { ok: false, said: "That viewing could not be read just now, so nothing was changed. Try again in a minute.", steps: { rex: "Not read." } };
      }
    } else {
      const who = ev.organiser_user ?? ev.calendar?.owner_user ?? null;
      const mine = await ensureRexLink(me).catch(() => null);
      const byId = who?.id != null && mine ? String(who.id) === String(mine) : null;
      const byName = (who?.name ?? "").trim().toLowerCase() === (me.name ?? "").trim().toLowerCase() && Boolean(me.name);
      if (!(byId === true || (byId === null && byName))) {
        const first = (who?.name ?? "").trim().split(/\s+/)[0];
        return { ok: false, said: first ? `That viewing is ${first}'s. Only they can cancel or move it.` : "That viewing is another agent's. Only they can cancel or move it.", steps: { rex: "Not changed." } };
      }
      ownViewing = true;
    }
  }
  if (ownViewing === null && held) ownViewing = mineByDiary(held);

  /* OURS ONLY: a viewing REX never took. The same rule on whose it is - an
     agent moves their own - read off the row rather than REX. */
  const ourId = p.viewingId.startsWith("os-") ? p.viewingId.slice(3) : null;
  let ourCancelled = false;
  if (ourId) {
    const rows = hasDb()
      ? await q<OsRow>(`SELECT id, author_id, starts_at, booking FROM os_appointments WHERE id = $1`, [ourId]).catch(() => [])
      : [];
    const row = rows[0];
    if (!row) return { ok: false, said: "That viewing could not be found, so nothing was changed.", steps: { os: "Not found." } };
    if (me.role === "agent" && row.author_id && row.author_id !== me.id) {
      return { ok: false, said: "That viewing is another agent's. Only they can cancel or move it.", steps: { os: "Not changed." } };
    }
    ownViewing = row.author_id === me.id;
    if (cancel) {
      /* A viewing only the OS holds used to stay booked: the cancel never
         touched its row or its Outlook entry (15 Oct 2026). */
      ourCancelled = true;
      steps.os = "Cancelled.";
      if (row.booking) {
        const key = outlookKeyOf(row);
        const known = hasDb() ? await q(`SELECT 1 FROM os_case_state WHERE kind = 'outlook-event' AND record_id = $1`, [key]).catch(() => []) : [];
        if (known.length) {
          const gone = await removeFromOutlook(me.id, key).catch(() => ({ ok: false, detail: "Outlook would not take it out - remove it from your calendar yourself." }));
          steps.outlook = gone.detail;
        }
      }
    } else {
      await moveOurRow(me, row, p, steps);
    }
  }

  if (eventId && !goneFromRex) {
    const r = await changeRexEvent({
      userId: me.id,
      eventId,
      ...(cancel ? { cancel: { reason: p.reason === "applicant" ? "applicant" : "organiser" } } : {}),
      ...(p.action === "move" && p.newStartsAt ? { moveTo: { startsAt: p.newStartsAt, minutes: p.minutes } } : {}),
    }).catch((e) => ({ ok: false, detail: e instanceof Error ? e.message : "the diary did not answer" }));
    if (!r.ok && cancel && isNotFound(r.detail)) goneFromRex = true;
    /* Agent screens never name REX; its own words stay in the server log. */
    else if (r.ok) steps.rex = cancel ? "Cancelled in the diary." : "Moved in the diary.";
    else {
      console.error("[viewing-change] diary refused", eventId, r.detail);
      steps.rex = /rex/i.test(r.detail) ? "The diary didn't take it - try again in a minute." : `Not changed: ${r.detail}.`;
    }
  }
  if (goneFromRex) steps.rex = "Cancelled in the diary.";

  /* A cancel that did not take is said as one, and nothing else is done:
     before, the applicant was emailed and the screen said cancelled while the
     viewing stayed booked. */
  if (cancel && !ourCancelled && !steps.rex?.startsWith("Cancelled")) {
    return { ok: false, said: `Nothing was changed - the viewing is still booked. ${steps.rex ?? ""}`.trim(), steps };
  }
  if (p.action === "move" && eventId && !steps.rex?.startsWith("Moved")) {
    return { ok: false, said: `Nothing was changed - the viewing is still at its old time. ${steps.rex ?? ""}`.trim(), steps };
  }

  /* Outlook: only a viewing booked through the OS has an entry, found through
     the booking that made the REX copy. */
  if (eventId && hasDb()) {
    const rows = await q<{ record_id: string }>(
      `SELECT record_id FROM os_case_state WHERE kind = 'rex-viewing' AND payload->>'eventId' = $1 LIMIT 1`,
      [eventId]
    ).catch(() => []);
    let outlookKey = rows[0] ? `viewing|${rows[0].record_id}` : null;
    /* No note of the diary copy (its write is allowed to fail quietly): our
       own row of the booking still carries the key its Outlook entry was made
       under, so that entry is moved or taken out rather than left standing at
       the old time beside the new one (26 Oct 2026, Stuart's double booking). */
    if (!outlookKey) {
      const ours = await q<OsRow>(`SELECT id, author_id, starts_at, booking FROM os_appointments WHERE rex_event_id = $1 AND booking IS NOT NULL LIMIT 1`, [eventId]).catch(() => []);
      const key = ours[0] ? outlookKeyOf(ours[0]) : null;
      const known = key ? await q(`SELECT 1 FROM os_case_state WHERE kind = 'outlook-event' AND record_id = $1`, [key]).catch(() => []) : [];
      if (key && known.length) outlookKey = key;
    }
    const rexCopies = await rexCopiesToOutlook(me.id).catch(() => false);
    /* Their REX copies its diary into Outlook (lib/rex-outlook-sync): REX's
       copy moves or goes with the change above, and ours, if there is one
       from before that was known, is the duplicate - taken out, not moved. */
    if (outlookKey && rexCopies) {
      const gone = await removeFromOutlook(me.id, outlookKey).catch(() => null);
      steps.outlook = gone?.ok ? "Your Outlook follows the diary; the extra copy was taken out." : "Your Outlook follows the diary.";
    } else if (outlookKey) {
      if (cancel) {
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
    /* REX's own copy in their Outlook (Lorna's REX copies 13 of 14 entries):
       left to REX's sync it can stay, and the viewing looks booked in Outlook
       and in our diary. Their own viewing only - never anyone else's calendar. */
    if (cancel && rexCopies && ownViewing === true) {
      const twin = await removeOutlookTwin(me.id, { startsAt: p.oldStartsAt, minutes: p.minutes, who: p.applicantName, address: p.address }).catch(() => null);
      if (twin?.detail && !steps.outlook?.startsWith("Taken out")) steps.outlook = twin.detail;
    }
  }

  /* Cancelled: every copy the OS holds is told now (lib/viewing-cancelled) -
     the ledger, our own row, the held diary - so it shows as cancelled
     everywhere and no reminder text or email goes for it. */
  if (cancel) {
    await recordViewingCancelled(p.viewingId, {
      at: new Date().toISOString(),
      by: me.id,
      byName: me.name || "",
      startsAt: p.oldStartsAt,
      mins: p.minutes,
      address: p.address,
      who: p.applicantName,
      agentEmail: held?.agentEmail ?? (ownViewing ? myRexEmail ?? me.email ?? null : null),
      reason: p.reason === "applicant" ? "applicant" : "organiser",
    });
  }

  /* REX took it, so it moved there - and our own row of it follows, because
     the confirmation and the landlord's portal read the time from it. */
  if (eventId && hasDb() && steps.rex?.startsWith("Moved")) {
    const rows = await q<OsRow>(`SELECT id, author_id, starts_at, booking FROM os_appointments WHERE rex_event_id = $1 LIMIT 1`, [eventId]).catch(() => []);
    if (rows[0]) await moveOurRow(me, rows[0], p, { ...steps, outlook: steps.outlook ?? "handled" });
  }

  /* The applicant - unless the booker is showing them the email instead. */
  if (p.notify === false) {
    return { ok: true, said: [steps.outlook, steps.rex].filter(Boolean).join(" ") || "Moved.", steps };
  }
  /* Opened from the diary or the phone, a viewing REX holds often carries no
     email - the diary entry has none. The ledger's copy of the viewing and
     our own booking of it do, so the applicant is still told (15 Oct 2026). */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((p.applicantEmail ?? "").trim()) && hasDb()) {
    const found = eventId
      ? await q<{ email: string | null }>(
          `SELECT COALESCE(
              (SELECT c->>'email' FROM os_viewings v, jsonb_array_elements(v.contacts) c WHERE v.id = $1 AND COALESCE(c->>'email', '') <> '' LIMIT 1),
              (SELECT booking->>'applicantEmail' FROM os_appointments WHERE rex_event_id = $2 AND COALESCE(booking->>'applicantEmail', '') <> '' LIMIT 1)
            ) AS email`,
          [p.viewingId, eventId]
        ).catch(() => [])
      : ourId
        ? await q<{ email: string | null }>(`SELECT booking->>'applicantEmail' AS email FROM os_appointments WHERE id = $1`, [ourId]).catch(() => [])
        : [];
    if (found[0]?.email) p = { ...p, applicantEmail: found[0].email };
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
              /* Typed by the agent; a ...Line is not escaped for it (see escapeHtml). */
              reasonLine: escapeHtml((p.reasonText ?? "").trim()) || "Something has come up that means it can't go ahead as planned.",
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

  return { ok: true, said: [steps.applicant, steps.outlook, steps.rex ?? steps.os].filter(Boolean).join(" "), steps };
}
