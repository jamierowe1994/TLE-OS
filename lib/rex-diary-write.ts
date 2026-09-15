import "server-only";
import { hasDb, q } from "@/lib/db";
import { rexCall, rexRows, rexWritesLocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * AN APPRAISAL BOOKED IN THE OS LANDS IN THE AGENT'S REX DIARY (15 Sep 2026).
 *
 * Until now booking an appraisal in the OS put it on the OS file and nowhere
 * else, so the agent typed it into REX again - or did not, and REX's diary said
 * they were free. James chose: build it behind the allow-list, prove it on his
 * own calendar first.
 *
 * ── What REX wants, measured rather than guessed ─────────────────────────
 *
 *   · CalendarEvents/describeModel: calendar_id, title, description,
 *     starts_at / ends_at {time, tzid}, event_location {description},
 *     appointment_type_id, records[].
 *   · AdminAppointmentTypes: 527 is "TLE - Rental Market Appraisal", 60
 *     minutes, category "appraisal" - the type the lettings agents already use,
 *     so the event looks like one they typed themselves.
 *   · Proven on James's own calendar, 15 Sep 2026: create lands with the
 *     right type, time, location and organiser; update moves it; purge
 *     removes it. Four test entries made and purged.
 *   · The diary is SHARED by six businesses. The calendar is the agent's own
 *     default one, found by their REX login email, and the event is created
 *     with their own REX token so REX records them as the organiser.
 *
 * ── Never the reason a booking fails ─────────────────────────────────────
 *
 * The appraisal is already saved when this runs. Every refusal comes back as
 * an outcome the screen can say out loud - locked, no REX sign-in, no
 * calendar, REX said no - and nothing throws. A second booking of the same
 * appraisal MOVES the event (CalendarEvents/update) rather than adding a
 * second one; the event id is kept on the file.
 */

export const TLE_APPRAISAL_TYPE_ID = 527;
const MINUTES = 60;
const KIND = "rex-diary";

export type DiaryOutcome =
  | { ok: true; eventId: string; moved: boolean }
  | { ok: false; reason: "write_locked" | "no_rex_session" | "no_calendar" | "refused" | "no_time"; detail: string };

async function storedEvent(appraisalId: string): Promise<{ eventId: string; startsAt: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ payload: { eventId?: string; startsAt?: string } }>(
    `SELECT payload FROM os_case_state WHERE kind = $1 AND record_id = $2`,
    [KIND, appraisalId]
  ).catch(() => []);
  const p = rows[0]?.payload;
  return p?.eventId ? { eventId: p.eventId, startsAt: p.startsAt ?? "" } : null;
}

/** The agent's own default calendar, by the email they sign in to REX with. */
export async function calendarFor(rexEmail: string, token: string | null): Promise<string | null> {
  const want = rexEmail.trim().toLowerCase();
  if (!want) return null;
  for (let page = 0; page < 5; page++) {
    const res = await rexCall("Calendars", "search", { limit: 100, offset: page * 100 }, token);
    if (!res.ok) return null;
    const rows = rexRows(res.result) as Array<{ id?: string; is_default?: boolean; owner_user?: { email_address?: string } | null }>;
    const mine = rows.filter((c) => (c.owner_user?.email_address ?? "").toLowerCase() === want);
    const pick = mine.find((c) => c.is_default) ?? mine[0];
    if (pick?.id) return pick.id;
    if (rows.length < 100) break;
  }
  return null;
}

function rexTime(iso: string): { time: string; tzid: string } {
  return { time: new Date(iso).toISOString().replace(".000Z", "+00:00"), tzid: "Europe/London" };
}

export function appraisalEventData(ma: MarketAppraisal, calendarId: string) {
  const start = ma.appointmentAt!;
  const end = new Date(new Date(start).getTime() + MINUTES * 60000).toISOString();
  const address = [ma.address, ma.postcode].filter((x) => x && !ma.address.includes(x)).join(", ") || ma.address;
  const records: { service: string; id: string }[] = [];
  if (ma.rexPropertyId) records.push({ service: "Properties", id: String(ma.rexPropertyId) });
  return {
    calendar_id: calendarId,
    appointment_type_id: TLE_APPRAISAL_TYPE_ID,
    title: `TLE Rental Market Appraisal at ${address} with ${ma.landlord}`,
    description: [
      `Booked in TLE OS.`,
      `Landlord: ${ma.landlord}${ma.landlordMobile ? `, ${ma.landlordMobile}` : ""}`,
    ].join("\n"),
    starts_at: rexTime(start),
    ends_at: rexTime(end),
    event_location: { description: address },
    ...(records.length ? { records } : {}),
  };
}

export async function putAppraisalInRexDiary(p: {
  ma: MarketAppraisal;
  userId: string;
}): Promise<DiaryOutcome> {
  const { ma, userId } = p;
  if (!ma.appointmentAt) return { ok: false, reason: "no_time", detail: "No time on the booking, so nothing to put in the diary." };

  const before = await storedEvent(ma.id);
  const method = before ? "update" : "create";
  if (rexWritesLocked("CalendarEvents", method)) {
    return {
      ok: false,
      reason: "write_locked",
      detail: `Putting appraisals in REX's diary is not switched on yet (CalendarEvents/${method} is not on REX_ALLOW_WRITES). Add it to REX by hand for now.`,
    };
  }
  if (before && before.startsAt === ma.appointmentAt) return { ok: true, eventId: before.eventId, moved: false };

  const token = await rexTokenFor(userId).catch(() => null);
  if (!token) {
    return { ok: false, reason: "no_rex_session", detail: "You are not signed in to REX here, so it could not go in your diary. Link REX on your Profile." };
  }
  const emailRow = hasDb()
    ? await q<{ rex_email: string }>(`SELECT rex_email FROM os_rex_tokens WHERE user_id = $1`, [userId]).catch(() => [])
    : [];
  const calendarId = await calendarFor(emailRow[0]?.rex_email ?? "", token);
  if (!calendarId) {
    return { ok: false, reason: "no_calendar", detail: "REX has no calendar for your login, so it could not go in your diary." };
  }

  const data = appraisalEventData(ma, calendarId);
  const send = (d: Record<string, unknown>) =>
    before
      ? /* update_recurring_events is REQUIRED on an update, and must be a
           boolean: absent is a 500 "Undefined Property", "this" and null are
           type errors (all three measured on James's calendar, 15 Sep 2026). */
        rexCall("CalendarEvents", "update", { data: { id: before.eventId, update_recurring_events: false, ...d } }, token)
      : rexCall("CalendarEvents", "create", { data: d, return_id: true }, token);

  let res = await send(data);
  /* A property link REX will not take (a property from another business, say)
     must not cost the diary entry: try once more without it. */
  if (!res.ok && "records" in data) {
    const { records: _drop, ...bare } = data;
    void _drop;
    res = await send(bare);
  }
  if (!res.ok) return { ok: false, reason: "refused", detail: `REX refused the diary entry: ${res.error ?? res.status}` };

  const raw = res.result as unknown;
  const eventId = before?.eventId
    ?? (typeof raw === "string" || typeof raw === "number" ? String(raw) : String((raw as { id?: string } | null)?.id ?? ""));
  if (!eventId) return { ok: false, reason: "refused", detail: "REX said yes but did not say which entry it made." };

  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ($1, $2, $3::jsonb, NOW(), $4)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [KIND, ma.id, JSON.stringify({ eventId, calendarId, startsAt: ma.appointmentAt }), userId]
  ).catch(() => null);
  return { ok: true, eventId, moved: Boolean(before) };
}

/* ── Viewings (15 Sep 2026) ────────────────────────────────────────────────
 *
 * James: a viewing booked in the OS goes straight into REX's diary, and REX
 * confirms it to the applicant AND the landlord exactly as it does when an
 * agent books in REX - the OS's own viewing emails are off for the pilot, so
 * this is how people hear, and nobody hears twice.
 *
 * Measured on James's calendar before any of it was written:
 *   · type 953 "TLE Accompanied Viewing" sends SMS and email to guests and
 *     vendors - but only when asked. CREATING the event sends nothing.
 *   · records [{service:"Contacts"}, {service:"Listings"}] attach correctly;
 *     REX works the landlord out from the listing.
 *   · sendConfirmationMessages {id, guest_confirmations, vendor_confirmations}
 *     is the send. REX refuses the SMS half unless the AGENT has a mobile on
 *     their REX user settings, and says so; the email half still goes.
 *
 * One booking, one event: the same lead, listing and start is recognised
 * (os_case_state 'rex-viewing') and never written twice.
 */

export const TLE_VIEWING_TYPE_ID = 953;

export type ViewingOutcome =
  | { ok: true; eventId: string; duplicate: boolean; confirmed: "sent" | "not_sent"; confirmDetail: string }
  | { ok: false; reason: "write_locked" | "no_rex_session" | "no_calendar" | "refused" | "no_listing"; detail: string };

export async function putViewingInRexDiary(p: {
  userId: string;
  leadId: string;
  listingId: string | null;
  contactId: string | null;
  applicantName: string;
  address: string;
  startsAt: string;
  minutes: number;
}): Promise<ViewingOutcome> {
  if (!p.listingId) return { ok: false, reason: "no_listing", detail: "No listing on the booking, so REX would not know which home it is." };
  const key = `${p.leadId}|${p.listingId}|${new Date(p.startsAt).toISOString()}`;
  if (hasDb()) {
    const seen = await q<{ payload: { eventId?: string } }>(
      `SELECT payload FROM os_case_state WHERE kind = 'rex-viewing' AND record_id = $1`,
      [key]
    ).catch(() => []);
    if (seen[0]?.payload?.eventId) {
      return { ok: true, eventId: seen[0].payload.eventId, duplicate: true, confirmed: "not_sent", confirmDetail: "Already in REX from the first time this was booked." };
    }
  }
  if (rexWritesLocked("CalendarEvents", "create")) {
    return { ok: false, reason: "write_locked", detail: "Putting viewings in REX's diary is not switched on yet. Add it to REX by hand for now." };
  }
  const token = await rexTokenFor(p.userId).catch(() => null);
  if (!token) return { ok: false, reason: "no_rex_session", detail: "You are not signed in to REX here, so it could not go in your diary. Link REX on your Profile." };
  const emailRow = hasDb()
    ? await q<{ rex_email: string }>(`SELECT rex_email FROM os_rex_tokens WHERE user_id = $1`, [p.userId]).catch(() => [])
    : [];
  const calendarId = await calendarFor(emailRow[0]?.rex_email ?? "", token);
  if (!calendarId) return { ok: false, reason: "no_calendar", detail: "REX has no calendar for your login, so it could not go in your diary." };

  const end = new Date(new Date(p.startsAt).getTime() + Math.max(15, p.minutes || 30) * 60000).toISOString();
  const records: { service: string; id: string }[] = [{ service: "Listings", id: String(p.listingId) }];
  if (p.contactId) records.push({ service: "Contacts", id: String(p.contactId) });
  const res = await rexCall(
    "CalendarEvents",
    "create",
    {
      data: {
        calendar_id: calendarId,
        appointment_type_id: TLE_VIEWING_TYPE_ID,
        /* In REX's own form, the one agents already read. REX only makes a
           title up in its own screen; the API refuses an empty one ("The title
           field is required", measured 15 Sep 2026). */
        title: `TLE Accompanied Viewing at ${p.address || "the property"} with ${p.applicantName}`,
        description: `Booked in TLE OS.${p.contactId ? "" : ` Applicant: ${p.applicantName} (not yet a REX contact).`}`,
        starts_at: rexTime(p.startsAt),
        ends_at: rexTime(end),
        event_location: { description: p.address },
        records,
      },
      return_id: true,
    },
    token
  );
  if (!res.ok) return { ok: false, reason: "refused", detail: `REX refused the diary entry: ${res.error ?? res.status}` };
  const raw = res.result as unknown;
  const eventId = typeof raw === "string" || typeof raw === "number" ? String(raw) : String((raw as { id?: string } | null)?.id ?? "");
  if (!eventId) return { ok: false, reason: "refused", detail: "REX said yes but did not say which entry it made." };

  await q(
    `INSERT INTO os_case_state (kind, record_id, payload, updated_at, updated_by)
     VALUES ('rex-viewing', $1, $2::jsonb, NOW(), $3)
     ON CONFLICT (kind, record_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()`,
    [key, JSON.stringify({ eventId, calendarId, listingId: p.listingId, contactId: p.contactId }), p.userId]
  ).catch(() => null);

  /* REX's own confirmations, to the applicant and the landlord. */
  let confirmed: "sent" | "not_sent" = "not_sent";
  let confirmDetail = "";
  if (!p.contactId) {
    confirmDetail = `${p.applicantName} is not a REX contact yet, so REX had nobody to confirm to. Tell them yourself.`;
  } else if (rexWritesLocked("CalendarEvents", "sendConfirmationMessages")) {
    confirmDetail = "REX's confirmations are not switched on from the OS yet, so nobody was told. Send the confirmation from the event in REX.";
  } else {
    const sent = await rexCall(
      "CalendarEvents",
      "sendConfirmationMessages",
      { id: eventId, guest_confirmations: true, vendor_confirmations: true },
      token
    );
    /* "OK" is not "sent". REX answers 200 with sent_totals of nought when it
       refuses the batch - measured 15 Sep 2026: an SMS-and-email type with no
       mobile on the sending REX user sends NEITHER, and still says OK. */
    const totals = (sent.result as { guests?: { sent_totals?: { email?: number; sms?: number } }; vendors?: { sent_totals?: { email?: number; sms?: number } } } | null) ?? null;
    const count = (t?: { email?: number; sms?: number }) => Number(t?.email ?? 0) + Number(t?.sms ?? 0);
    const out = count(totals?.guests?.sent_totals) + count(totals?.vendors?.sent_totals);
    if (sent.ok && out > 0) {
      confirmed = "sent";
      confirmDetail = "REX sent its confirmation to the applicant and the landlord.";
    } else if (sent.ok) {
      confirmDetail = "In your diary, but REX sent no confirmation - usually because your REX user has no mobile number in its settings. Add one in REX, then send the confirmation from the event.";
    } else {
      confirmDetail = `In the diary, but REX did not send the confirmations: ${sent.error ?? sent.status}`;
    }
  }
  return { ok: true, eventId, duplicate: false, confirmed, confirmDetail };
}
