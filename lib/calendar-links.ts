import "server-only";
import { payloadSignatureOk, signPayload } from "@/lib/auth";

/**
 * ADD TO CALENDAR, AS A BUTTON (James, 17 Sep 2026).
 *
 * "There doesn't seem to be any calendar invite attached ... the attachment
 * is missed, so other people will miss it." A .ics attachment is easy to
 * overlook and some mail apps bury it. So a confirmation carries buttons in
 * the body: one that downloads the appointment (Apple Calendar, Outlook on a
 * computer or a phone open it straight into the diary), and links for Google
 * Calendar and Outlook on the web, which open with the appointment filled in.
 *
 * The download link carries the appointment itself, signed, so it needs no
 * record behind it and nobody can make one up.
 */

export interface CalendarEvent {
  title: string;
  startsAt: string;
  minutes: number;
  location: string;
  details: string;
  uid: string;
}

export interface CalendarLinks {
  ics: string;
  google: string;
  outlook: string;
}

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

export function calendarLinks(ev: CalendarEvent, origin: string): CalendarLinks {
  const start = new Date(ev.startsAt);
  const end = new Date(start.getTime() + Math.max(15, ev.minutes || 30) * 60000);
  const e = Buffer.from(JSON.stringify({ t: ev.title, s: ev.startsAt, m: ev.minutes, l: ev.location, d: ev.details, u: ev.uid })).toString("base64url");
  const google = new URLSearchParams({ action: "TEMPLATE", text: ev.title, dates: `${stamp(start)}/${stamp(end)}`, location: ev.location, details: ev.details });
  const outlook = new URLSearchParams({ path: "/calendar/action/compose", rru: "addevent", subject: ev.title, startdt: start.toISOString(), enddt: end.toISOString(), location: ev.location, body: ev.details });
  return {
    ics: `${origin}/api/calendar/add?e=${e}&s=${signPayload(e)}`,
    google: `https://calendar.google.com/calendar/render?${google.toString()}`,
    outlook: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook.toString()}`,
  };
}

export function readCalendarLink(e: string | null, s: string | null): CalendarEvent | null {
  if (!e || !payloadSignatureOk(e, s)) return null;
  try {
    const j = JSON.parse(Buffer.from(e, "base64url").toString("utf8")) as { t?: string; s?: string; m?: number; l?: string; d?: string; u?: string };
    if (!j.s || Number.isNaN(new Date(j.s).getTime())) return null;
    return { title: j.t ?? "Appointment", startsAt: j.s, minutes: Number(j.m) || 30, location: j.l ?? "", details: j.d ?? "", uid: j.u ?? `tle-${new Date(j.s).getTime()}` };
  } catch {
    return null;
  }
}

/** The small links, in the email's brown rather than a browser's blue. */
export const LINK = "color:#5a3e36;text-decoration:underline;";

/** The buttons, as the plain-email composer reads them: a button line, then two small links. */
export function calendarLinesFor(links: CalendarLinks): string {
  return `[Add to my calendar](${links.ics})\n\nUsing Google or Outlook on the web? <a href="${links.google}" style="${LINK}">Add it to Google Calendar</a> or <a href="${links.outlook}" style="${LINK}">Outlook</a>.`;
}
