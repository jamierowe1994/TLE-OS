import "server-only";
import { hasDb, q } from "@/lib/db";
import { msAccessTokenFor, MailboxNotConnected } from "@/lib/microsoft";
import { forgetOutlookDiary } from "@/lib/outlook-diary";

/**
 * EVERY APPOINTMENT GOES INTO THE AGENT'S OWN OUTLOOK DIARY (15 Sep 2026).
 *
 * James: "We should never have to sign into REX ever again." Agents already
 * sign in to Microsoft here (lib/microsoft - Calendars.ReadWrite is on the
 * consent they gave), and REX's own calendar sync is, in his words, a nightmare
 * that often does not save. So the OS writes the appointment into their Outlook
 * calendar itself, the moment it is booked, with no sync in between.
 *
 * ── Their diary only, and nobody emailed ────────────────────────────────
 *
 * No attendees are added. An attendee on an Outlook event is an invitation
 * Outlook sends from the agent's mailbox, and the confirmations are ours to
 * send (lib/viewing-confirm), worded by us, once. The event is a block in
 * their day with the address, who is coming and a way back to the file.
 *
 * ── Once, and moved rather than doubled ─────────────────────────────────
 *
 * Every event is keyed (os_case_state 'outlook-event'): booking the same thing
 * again moves the event instead of adding a second, and Graph's transactionId
 * makes a retried create a no-op on Microsoft's side too.
 *
 * Never throws: a diary that did not take must not cost the booking. The
 * outcome comes back in words for the screen.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const KIND = "outlook-event";

export type OutlookOutcome =
  | { ok: true; eventId: string; moved: boolean; duplicate: boolean }
  | { ok: false; reason: "not_connected" | "refused"; detail: string };

/** "2026-09-16T07:00:00" on the London clock - what Graph wants beside timeZone. */
function londonWall(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour")}:${g("minute")}:${g("second")}`;
}

export async function putInOutlook(p: {
  userId: string;
  /** Stable for this appointment: "viewing|lead|listing|start", "appraisal|<id>". */
  key: string;
  subject: string;
  /** Plain text. */
  body: string;
  location: string;
  startsAt: string;
  minutes: number;
  /** "free" for something in their diary that does not take their time (an unaccompanied viewing). */
  showAs?: "busy" | "free";
  /** Rewrite the entry even at the same time - its details changed (lib/viewing-brief). */
  force?: boolean;
}): Promise<OutlookOutcome> {
  let token: string;
  try {
    token = await msAccessTokenFor(p.userId);
  } catch (e) {
    return {
      ok: false,
      reason: "not_connected",
      detail: e instanceof MailboxNotConnected
        ? "Your Outlook is not connected here, so it could not go in your calendar. Connect it on your Profile."
        : "Could not reach your Outlook just now.",
    };
  }

  const rows = hasDb()
    ? await q<{ payload: { eventId?: string; startsAt?: string } }>(
        `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
        [KIND, p.key]
      ).catch(() => [])
    : [];
  const before = rows[0]?.payload?.eventId ? rows[0].payload : null;
  if (before?.eventId && before.startsAt === p.startsAt && !p.force) {
    return { ok: true, eventId: before.eventId, moved: false, duplicate: true };
  }

  const end = new Date(new Date(p.startsAt).getTime() + Math.max(15, p.minutes || 30) * 60000).toISOString();
  const event = {
    subject: p.subject.slice(0, 250),
    body: { contentType: "text", content: p.body.slice(0, 4000) },
    start: { dateTime: londonWall(p.startsAt), timeZone: "Europe/London" },
    end: { dateTime: londonWall(end), timeZone: "Europe/London" },
    location: { displayName: p.location.slice(0, 250) },
    showAs: p.showAs ?? "busy",
    isReminderOn: true,
    reminderMinutesBeforeStart: 30,
    categories: ["TLE OS"],
  };

  let res: Response;
  try {
    res = before?.eventId
      ? await fetch(`${GRAPH}/me/events/${encodeURIComponent(before.eventId)}`, {
          method: "PATCH",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(event),
          cache: "no-store",
        })
      : await fetch(`${GRAPH}/me/events`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          /* transactionId: a create retried after a timeout is recognised by
             Microsoft and not made twice. */
          body: JSON.stringify({ ...event, transactionId: p.key.slice(0, 200) }),
          cache: "no-store",
        });
  } catch {
    return { ok: false, reason: "refused", detail: "Could not reach Outlook just now." };
  }

  /* An event deleted in Outlook since: make it again rather than fail. */
  if (before?.eventId && res.status === 404) {
    if (hasDb()) await q(`DELETE FROM os_case_state WHERE kind = $1 AND record_id = $2`, [KIND, p.key]).catch(() => null);
    return putInOutlook(p);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, reason: "refused", detail: `Outlook refused the calendar entry (${res.status}). ${detail.slice(0, 200)}` };
  }
  const j = (await res.json().catch(() => ({}))) as { id?: string };
  const eventId = j.id ?? before?.eventId ?? "";
  if (hasDb() && eventId) {
    await q(
      `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
       VALUES ($1, $2, $3::jsonb, NOW(), $4)
       ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
      [KIND, p.key, JSON.stringify({ eventId, startsAt: p.startsAt }), p.userId]
    ).catch(() => null);
  }
  /* The diary reads Outlook back in (lib/outlook-diary): let it see this now. */
  forgetOutlookDiary(p.userId);
  return { ok: true, eventId, moved: Boolean(before), duplicate: false };
}

/** A calendar file for an email attachment, so the other side can add it with one click. */
export function icsFile(p: { uid: string; summary: string; description: string; location: string; startsAt: string; minutes: number }): string {
  const start = new Date(p.startsAt);
  const end = new Date(start.getTime() + Math.max(15, p.minutes || 30) * 60000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
  const fold = (line: string) => (line.length <= 74 ? line : line.match(/.{1,74}/g)!.join("\r\n "));
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//The Letting Experts//TLE OS//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${p.uid}@thelettingexperts`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    fold(`SUMMARY:${esc(p.summary)}`),
    fold(`DESCRIPTION:${esc(p.description)}`),
    fold(`LOCATION:${esc(p.location)}`),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Take an OS-made event back out of the agent's Outlook (a cancelled viewing). */
export async function removeFromOutlook(userId: string, key: string): Promise<{ ok: boolean; detail: string }> {
  if (!hasDb()) return { ok: false, detail: "No database here." };
  const rows = await q<{ payload: { eventId?: string } }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, key]
  ).catch(() => []);
  const eventId = rows[0]?.payload?.eventId;
  if (!eventId) return { ok: false, detail: "It was not in your Outlook from the OS, so there was nothing to take out." };
  let token: string;
  try {
    token = await msAccessTokenFor(userId);
  } catch {
    return { ok: false, detail: "Your Outlook is not connected, so take it out of your calendar yourself." };
  }
  const res = await fetch(`${GRAPH}/me/events/${encodeURIComponent(eventId)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res || (!res.ok && res.status !== 404)) return { ok: false, detail: "Outlook would not take it out - remove it from your calendar yourself." };
  await q(`DELETE FROM os_case_state WHERE kind = $1 AND record_id = $2`, [KIND, key]).catch(() => null);
  forgetOutlookDiary(userId);
  return { ok: true, detail: "Taken out of your Outlook calendar." };
}

/**
 * Take out the copy of a cancelled viewing that REX put in the agent's Outlook
 * (Lorna's ticket, 15 Oct 2026). Some people's REX copies its diary into their
 * Outlook (lib/rex-outlook-sync); when the OS cancels the REX entry, REX's
 * copy in Outlook is left to REX's own sync, which "often doesn't save" - and
 * the viewing stays in their calendar. Only an entry starting at exactly that
 * time whose subject names the viewer (or, with no surname, the street) is
 * taken, and never one the OS made itself (those go by removeFromOutlook).
 */
export async function removeOutlookTwin(
  userId: string,
  v: { startsAt: string; minutes: number; who: string; address: string }
): Promise<{ ok: boolean; detail: string }> {
  let token: string;
  try {
    token = await msAccessTokenFor(userId);
  } catch {
    return { ok: false, detail: "Your Outlook is not connected, so check your calendar yourself." };
  }
  const start = new Date(v.startsAt);
  if (Number.isNaN(start.getTime())) return { ok: false, detail: "No time to look for." };
  const from = new Date(start.getTime() - 60_000).toISOString();
  const to = new Date(start.getTime() + Math.max(15, v.minutes) * 60_000 + 60_000).toISOString();
  const res = await fetch(
    `${GRAPH}/me/calendarView?startDateTime=${encodeURIComponent(from)}&endDateTime=${encodeURIComponent(to)}&$select=id,subject,start,categories,isCancelled&$top=50`,
    { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' }, cache: "no-store", signal: AbortSignal.timeout(8000) }
  ).catch(() => null);
  if (!res?.ok) return { ok: false, detail: "Outlook didn't answer, so check your calendar yourself." };
  const j = (await res.json().catch(() => ({}))) as { value?: { id?: string; subject?: string; start?: { dateTime?: string }; categories?: string[]; isCancelled?: boolean }[] };
  const parts = v.who.trim().split(/\s+/);
  const word = (parts.length > 1 ? parts[parts.length - 1] : v.address.split(",")[0]).trim().toLowerCase();
  if (word.length < 3) return { ok: false, detail: "Nothing to match it by." };
  const twins = (j.value ?? []).filter((e) => {
    if (!e.id || e.isCancelled || (e.categories ?? []).includes("TLE OS")) return false;
    const s = e.start?.dateTime;
    const at = s ? new Date(/[zZ]$/.test(s) ? s : `${s}Z`).getTime() : NaN;
    return Math.abs(at - start.getTime()) < 60_000 && (e.subject ?? "").toLowerCase().includes(word);
  });
  if (!twins.length) return { ok: true, detail: "" };
  let gone = 0;
  for (const e of twins) {
    const del = await fetch(`${GRAPH}/me/events/${encodeURIComponent(e.id!)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }).catch(() => null);
    if (del && (del.ok || del.status === 404)) gone++;
  }
  forgetOutlookDiary(userId);
  return gone === twins.length
    ? { ok: true, detail: "Taken out of your Outlook calendar." }
    : { ok: false, detail: "Outlook would not take it out - remove it from your calendar yourself." };
}
