import "server-only";
import { hasDb, q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import { getAppraisal, markAppraisalCancelled, moveAppraisal } from "@/lib/appraisal-store";
import { putAppraisalInDiaries } from "@/lib/appraisal-diary";
import { changeRexEvent } from "@/lib/rex-diary-write";
import { rexCopiesToOutlook } from "@/lib/rex-outlook-sync";
import { removeFromOutlook, removeOutlookTwin } from "@/lib/outlook-calendar";
import { dropFromHeldDiary, moveInHeldDiary } from "@/lib/diary-cache";
import { APPRAISAL_GONE_KIND, type CancelledViewing } from "@/lib/viewing-cancelled";
import { agentUserFor, rewordQueuedPre, scheduleOnBooking } from "@/lib/pre-send";
import { queueVideoChase, queuedVideoChase, VIDEO_CHASE_KIND } from "@/lib/video-chase";
import { presentationsFor, updatePresentation } from "@/lib/present-store";
import { addTouch } from "@/lib/lead-touches";

/**
 * CANCEL AND REARRANGE A MARKET APPRAISAL (James, 15 Oct 2026).
 *
 * "I'd like to be able to cancel not only viewings but also market
 * appraisals, and be able to rearrange them." Built on the viewing cancel
 * (Lorna's ticket, lib/viewing-change + lib/viewing-cancelled), the same way:
 *
 *   - the OS keeps its own word on it. The appraisal row says cancelled
 *     (cancelled_at, and the time it was for), its time goes back to empty so
 *     nothing timed fires for it again, and a row in os_case_state
 *     ("appraisal-cancelled") hides it from every diary straight away - REX
 *     and the agent's Outlook may hold copies for a while longer;
 *   - it leaves the diary now: out of the held office diary, out of the
 *     Outlook entry the OS made, and the copy their REX made in Outlook;
 *   - a second press says it is already cancelled and does nothing again;
 *   - what did not go through is said in plain words, never as done.
 *
 * Rearrange moves the appraisal itself (the file and everything on it stay),
 * then writes the diaries exactly as booking does (lib/appraisal-diary), so
 * the REX entry and the Outlook entry MOVE rather than double. The queued
 * pre-presentation is re-worded for the new time, the video nudge re-dated,
 * the landlord's pre-appraisal page shows the new time, and the lead's log
 * says from when to when.
 *
 * REX stays behind James's lock (REX_ALLOW_WRITES). Nothing here is a new
 * kind of REX write: a cancel is the CalendarEvents/update the viewings use
 * (changeRexEvent, with the blank-location fix from bdb5991a), a move is the
 * update the booking already does. Locked, REX is simply left alone.
 *
 * Emails are never sent from here. The landlord's "cancelled" and "new time"
 * emails are offered on screen, previewed, and go when the agent presses Send
 * (lib/appraisal-confirm, /api/confirmations).
 */

export interface AppraisalChangeResult {
  ok: boolean;
  said: string;
  steps: Record<string, string>;
  appraisal?: MarketAppraisal | null;
  /** The time it was booked for before this change. */
  was?: string | null;
}

/* Owners and the office change anybody's (Susan, Howard, Kirstie, Michael). */
const MANAGES = new Set(["owner", "super_admin", "pretenancy", "compliance"]);

const pretty = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/** Where the appraisal sits in the diaries, and whose diaries those are. */
async function diaryRows(ma: MarketAppraisal): Promise<{ bookerId: string | null; rexEventId: string | null; outlookKey: string | null }> {
  if (!hasDb()) return { bookerId: null, rexEventId: null, outlookKey: null };
  const rows = await q<{ kind: string; record_id: string; updated_by: string | null; event_id: string | null }>(
    `SELECT kind, record_id, updated_by, payload->>'eventId' AS event_id FROM os_case_state
      WHERE (kind = 'rex-diary' AND record_id = $1) OR (kind = 'outlook-event' AND record_id = $2)`,
    [ma.id, `appraisal|${ma.id}`]
  ).catch(() => []);
  const rex = rows.find((r) => r.kind === "rex-diary");
  const out = rows.find((r) => r.kind === "outlook-event");
  return {
    /* Booking wrote both with the booker's own sign-ins, so they are the ones
       that can take them out again. */
    bookerId: rex?.updated_by || out?.updated_by || null,
    rexEventId: rex?.event_id || null,
    outlookKey: out?.event_id ? out.record_id : null,
  };
}

/**
 * Only the appraisal's own agent, an owner or the office (James, 15 Oct 2026).
 * The agent is the one named on it; with nobody named, whoever booked it.
 */
export async function mayChangeAppraisal(me: OsUser, ma: MarketAppraisal, bookerId: string | null): Promise<boolean> {
  if (MANAGES.has(me.role)) return true;
  const agent = await agentUserFor(ma).catch(() => null);
  if (agent) return agent.id === me.id;
  const named = (ma.agent ?? "").trim().toLowerCase();
  if (named) return named === (me.name ?? "").trim().toLowerCase() || named === (me.email ?? "").toLowerCase();
  return bookerId === me.id;
}

function notYours(ma: MarketAppraisal): string {
  const first = (ma.agent ?? "").trim().split(/\s+/)[0];
  return first
    ? `That appraisal is ${first}'s. Only they, an owner or the office can change it.`
    : "That appraisal is another agent's. Only they, an owner or the office can change it.";
}

/** Keep the OS's word that this time is off, so every diary hides it and its Outlook copies. */
async function recordGone(recordId: string, v: CancelledViewing & { appraisalId: string }): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [APPRAISAL_GONE_KIND, recordId, JSON.stringify(v), v.by]
  ).catch(() => null);
}

async function emailOf(userId: string | null): Promise<string | null> {
  if (!userId || !hasDb()) return null;
  const rows = await q<{ email: string }>(`SELECT email FROM os_users WHERE id = $1`, [userId]).catch(() => []);
  return rows[0]?.email?.toLowerCase() ?? null;
}

async function logOnLead(ma: MarketAppraisal, me: OsUser, body: string): Promise<void> {
  if (!ma.leadId || !hasDb()) return;
  await addTouch({ leadId: ma.leadId, kind: "note", outcome: null, body, byId: me.id, byName: me.name || me.email }).catch(() => null);
}

/**
 * The travel blocks the booker offered either side of the visit (ViewingBooker
 * saveBuffers): the agent's own, touching it either side, naming its street.
 * A cancelled or moved visit takes them out of the diary with it.
 */
async function dropTravel(ma: MarketAppraisal, was: string, ownerId: string): Promise<number> {
  const street = ma.address.split(",")[0].trim().toLowerCase();
  if (!hasDb() || street.length < 4) return 0;
  const rows = await q(
    `UPDATE os_appointments SET cancelled_at = NOW()
      WHERE kind = 'travel' AND cancelled_at IS NULL AND author_id = $1
        /* Ending as the visit starts, or starting as its hour ends - so a new
           block the booker has just saved for the new time is never taken. */
        AND (ABS(EXTRACT(EPOCH FROM (starts_at + mins * INTERVAL '1 minute' - $2::timestamptz))) < 90
          OR ABS(EXTRACT(EPOCH FROM (starts_at - ($2::timestamptz + INTERVAL '60 minutes')))) < 90)
        AND (LOWER(title) LIKE $3 OR LOWER(where_at) LIKE $3)
      RETURNING id`,
    [ownerId, was, `%${street}%`]
  ).catch(() => []);
  return rows.length;
}

const isNotFound = (detail: string | null | undefined) => /not find|not found|NoMatchingRecords/i.test(detail ?? "");

export async function cancelAppraisal(me: OsUser, id: string): Promise<AppraisalChangeResult> {
  const steps: Record<string, string> = {};
  const ma = await getAppraisal(id).catch(() => null);
  if (!ma) return { ok: false, said: "That appraisal could not be found, so nothing was changed.", steps };

  /* ALREADY OFF: a second press, or a second screen, does nothing again and
     emails nobody (Lorna's viewing was pressed three times). */
  if (ma.cancelledAt) {
    return { ok: true, said: "That appraisal is already cancelled and out of the diary.", steps: { os: "Already cancelled." }, appraisal: ma, was: ma.cancelledWas ?? null };
  }
  if (!ma.appointmentAt) return { ok: false, said: "There is no time on this appraisal, so there is nothing to cancel.", steps };
  if (new Date(ma.appointmentAt).getTime() < Date.now()) {
    return { ok: false, said: "That visit has already been, so it can't be cancelled. Mark the appraisal lost if it isn't going ahead.", steps };
  }
  const d = await diaryRows(ma);
  if (!(await mayChangeAppraisal(me, ma, d.bookerId))) return { ok: false, said: notYours(ma), steps };

  const was = ma.appointmentAt;
  const diaryOwner = d.bookerId ?? me.id;

  /* 1. The file. From here on it is cancelled whatever the diaries say. */
  const after = await markAppraisalCancelled(ma.id, me.name || me.email);
  if (!after?.cancelledAt) return { ok: false, said: "That didn't save, so the appraisal is still booked. Try again in a minute.", steps };
  steps.os = "Cancelled.";

  /* 2. Anything waiting to go for it: the pre-presentation email to the
     landlord and the agent's video nudge. Sent ones are history. */
  if (hasDb()) {
    const refs = [...new Set([ma.id, ma.leadId].filter((r): r is string => Boolean(r)))];
    const stopped = await q<{ kind: string }>(
      `UPDATE os_scheduled_sends SET state = 'cancelled', error = 'The appraisal was cancelled, so it was not sent.'
        WHERE state = 'queued' AND kind IN ('pre-appraisal', $2) AND ref = ANY($1)
        RETURNING kind`,
      [refs, VIDEO_CHASE_KIND]
    ).catch(() => []);
    if (stopped.some((s) => s.kind === "pre-appraisal")) steps.queue = "The pre-presentation email that was waiting will not go.";
    else if (stopped.length) steps.queue = "The reminder that was waiting will not go.";
  }

  /* 3. REX's diary, only through the existing update and only if James's lock
     lets it. Its own words stay in the server log - agent screens never
     name it. Gone already counts as done. */
  if (d.rexEventId) {
    const r = await changeRexEvent({ userId: diaryOwner, eventId: d.rexEventId, cancel: { reason: "organiser" } }).catch((e) => ({
      ok: false,
      detail: e instanceof Error ? e.message : "the diary did not answer",
    }));
    if (r.ok || isNotFound(r.detail)) {
      steps.rex = "Cancelled in the office diary.";
      /* Rebooked later, it is a new entry - never the cancelled one revived. */
      if (hasDb()) await q(`DELETE FROM os_case_state WHERE kind = 'rex-diary' AND record_id = $1`, [ma.id]).catch(() => null);
    } else {
      console.error("[appraisal-change] REX diary cancel not taken", d.rexEventId, r.detail);
      steps.rex = /not switched on/i.test(r.detail)
        ? "The office diary copy is left as it is - changing it from here is not switched on."
        : "The office diary copy didn't take the change - it's hidden here, but tell the office.";
    }
    await dropFromHeldDiary(`rex-${d.rexEventId}`).catch(() => undefined);
  }

  /* 4. The OS's word, read by every diary: hides REX's entry and any copy of
     it in the agent's Outlook from now on. */
  await recordGone(d.rexEventId ? `rex-${d.rexEventId}` : `appraisal-${ma.id}`, {
    at: new Date().toISOString(),
    by: me.id,
    byName: me.name || "",
    startsAt: was,
    mins: 60,
    address: ma.address,
    who: ma.landlord,
    agentEmail: await emailOf(diaryOwner),
    reason: "organiser",
    appraisalId: ma.id,
  });

  /* 5. Outlook: the entry the OS made, then the copy their REX made. */
  if (d.outlookKey) {
    const gone = await removeFromOutlook(diaryOwner, d.outlookKey).catch(() => ({ ok: false, detail: "Outlook would not take it out - remove it from your calendar yourself." }));
    steps.outlook = gone.detail;
  }
  if (d.rexEventId && (await rexCopiesToOutlook(diaryOwner).catch(() => false))) {
    const twin = await removeOutlookTwin(diaryOwner, { startsAt: was, minutes: 60, who: ma.landlord, address: ma.address }).catch(() => null);
    if (twin?.detail && !steps.outlook?.startsWith("Taken out")) steps.outlook = twin.detail;
  }

  await dropTravel(ma, was, diaryOwner);

  /* 6. The lead's log. */
  await logOnLead(ma, me, `Market appraisal on ${pretty(was)} cancelled by ${me.name || me.email}.`);

  return {
    ok: true,
    said: ["Cancelled - it's off the diary.", steps.outlook, steps.rex, steps.queue].filter(Boolean).join(" "),
    steps,
    appraisal: after,
    was,
  };
}

export async function rearrangeAppraisal(me: OsUser, id: string, startsAt: string, origin: string, minutes = 60): Promise<AppraisalChangeResult> {
  const steps: Record<string, string> = {};
  const at = new Date(startsAt);
  if (Number.isNaN(at.getTime())) return { ok: false, said: "Pick a new day and time first.", steps };
  if (at.getTime() < Date.now() - 60_000) return { ok: false, said: "That time has already gone. Pick one still to come.", steps };
  const ma = await getAppraisal(id).catch(() => null);
  if (!ma) return { ok: false, said: "That appraisal could not be found, so nothing was changed.", steps };
  const d = await diaryRows(ma);
  if (!(await mayChangeAppraisal(me, ma, d.bookerId))) return { ok: false, said: notYours(ma), steps };

  const wasCancelled = Boolean(ma.cancelledAt);
  const was = ma.appointmentAt ?? ma.cancelledWas ?? null;
  const iso = at.toISOString();
  if (!wasCancelled && was && new Date(was).getTime() === at.getTime()) {
    return { ok: true, said: "It's already at that time - nothing changed.", steps: { os: "Unchanged." }, appraisal: ma, was };
  }

  /* 1. The file, at the new time - and on again if it was cancelled. */
  const moved = await moveAppraisal(ma.id, iso);
  if (!moved?.appointmentAt) return { ok: false, said: "That didn't save, so the appraisal is still at its old time. Try again in a minute.", steps };
  steps.os = "Moved.";

  /* Nothing kept from an earlier cancel or move may hide the new time: the
     same REX entry moved back (its cancel did not take), or a slot rebooked
     at the very time it was called off for. */
  if (hasDb()) {
    await q(
      `DELETE FROM os_case_state WHERE kind = $1 AND payload->>'appraisalId' = $2
          AND ((payload->>'startsAt')::timestamptz = $3::timestamptz OR record_id = $4)`,
      [APPRAISAL_GONE_KIND, ma.id, iso, d.rexEventId ? `rex-${d.rexEventId}` : `appraisal-${ma.id}`]
    ).catch(() => null);
  }

  /* 2. The diaries, written exactly as a booking writes them: REX's entry and
     the Outlook entry are moved, not doubled. In whoever's diary it already
     is; a new booking goes in the diary of whoever books it, as booking does. */
  const diaryOwner = d.bookerId ?? me.id;
  const { rexDiary, outlook } = await putAppraisalInDiaries(moved, diaryOwner);
  if (rexDiary?.ok) {
    steps.rex = rexDiary.moved ? "Moved in the office diary." : "In the office diary.";
    if (rexDiary.moved) await moveInHeldDiary(`rex-${rexDiary.eventId}`, iso, minutes).catch(() => undefined);
  } else if (rexDiary && d.rexEventId && rexDiary.reason !== "test_file") {
    console.error("[appraisal-change] REX diary move not taken", d.rexEventId, rexDiary.detail);
    steps.rex = rexDiary.reason === "write_locked"
      ? "The office diary copy is still at the old time - changing it from here is not switched on."
      : "The office diary copy didn't move - tell the office.";
  }
  if (outlook?.ok) steps.outlook = "viaRex" in outlook ? "Your Outlook follows the diary." : outlook.moved ? "Moved in your Outlook calendar." : "In your Outlook calendar.";
  else if (outlook) steps.outlook = outlook.detail;

  /* The old slot's copies in Outlook (REX's twin, an OS entry Outlook would
     not move) are hidden from the diary, the same way a cancel hides them. */
  if (was && !wasCancelled) {
    await recordGone(`moved|${ma.id}|${was}`, {
      at: new Date().toISOString(),
      by: me.id,
      byName: me.name || "",
      startsAt: was,
      mins: 60,
      address: ma.address,
      who: ma.landlord,
      agentEmail: await emailOf(diaryOwner),
      reason: "organiser",
      appraisalId: ma.id,
    });
  }

  if (was && !wasCancelled) await dropTravel(ma, was, diaryOwner);

  /* 3. What was waiting for it follows the new time. */
  try {
    if (wasCancelled) {
      /* Back on: the pre-presentation is scheduled the way booking schedules it. */
      await scheduleOnBooking({ ma: moved, me, origin });
    } else {
      const r = await rewordQueuedPre(moved);
      if (r) steps.queue = "The pre-presentation email waiting to go now gives the new time.";
      if ((await queuedVideoChase(moved.id))?.state === "queued") await queueVideoChase({ ma: moved, me, origin });
    }
  } catch (e) {
    console.error("[appraisal-change] queue", e instanceof Error ? e.message : e);
  }
  /* The landlord's pre-appraisal page names the visit: give it the new time. */
  await newTimeOnDecks(moved).catch(() => undefined);

  /* 4. The lead's log: from when to when. */
  await logOnLead(
    ma,
    me,
    wasCancelled
      ? `Market appraisal rebooked for ${pretty(iso)} by ${me.name || me.email} (it was cancelled${was ? `, was ${pretty(was)}` : ""}).`
      : `Market appraisal moved from ${was ? pretty(was) : "no time"} to ${pretty(iso)} by ${me.name || me.email}.`
  );

  return {
    ok: true,
    said: [wasCancelled ? `Rebooked for ${pretty(iso)}.` : `Moved to ${pretty(iso)}.`, steps.outlook, steps.rex, steps.queue].filter(Boolean).join(" "),
    steps,
    appraisal: (await getAppraisal(ma.id).catch(() => null)) ?? moved,
    was,
  };
}

/** The pre-appraisal deck carries the visit's time; a moved visit moves it. */
async function newTimeOnDecks(ma: MarketAppraisal): Promise<void> {
  if (!ma.appointmentAt) return;
  const whenPretty = new Date(ma.appointmentAt).toLocaleString("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
  });
  for (const ref of [...new Set([ma.leadId, ma.id].filter((r): r is string => Boolean(r)))]) {
    for (const row of await presentationsFor(ref).catch(() => [])) {
      if (row.kind !== "pre-appraisal") continue;
      await updatePresentation(row.token, { ...row.deck, whenPretty, startsAt: ma.appointmentAt });
    }
  }
}
