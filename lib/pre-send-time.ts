import { londonParts } from "@/lib/london-time";

/**
 * WHEN THE PRE-PRESENTATION GOES (Howard's tickets, approved by James 1 Oct 2026).
 *
 * It used to go at 9am the day before the visit. Howard: "day before is too
 * late". Now, the Fine & Country way:
 *
 *   booked by the agent doing it   offered a video in the booking flow, then
 *                                  it goes the moment they press Send
 *   booked by anybody else         the agent is told, and has two hours to
 *                                  record a video or send it sooner; after
 *                                  that it goes anyway
 *   visit under three hours away   no wait at all
 *
 * The agent who books it themselves gets the same two hours as a backstop, in
 * case they close the booker without choosing - a pre-presentation must never
 * simply not go.
 *
 * Client-safe: the numbers and the words. The sending is lib/pre-send.
 */

export const PRE_SEND_HOLD_MS = 2 * 60 * 60 * 1000;
/** A visit closer than this does not wait the two hours. */
export const PRE_SEND_SOON_MS = 3 * 60 * 60 * 1000;

const dayKey = (d: Date) => {
  const p = londonParts(d);
  return `${p.year}-${p.month}-${p.day}`;
};

/** "3:40pm", on the London clock. */
export function londonClock(at: string | Date): string {
  return new Date(at)
    .toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "numeric", minute: "2-digit", hour12: true })
    .replace(/\s/g, "")
    .toLowerCase();
}

/**
 * "at 3:40pm today" / "at 9:00am tomorrow" / "on Thursday 8 October at 9:00am".
 * A moment already past reads "in the next few minutes": the queue runs every
 * five, and a time in the past on screen looks like a mistake.
 */
export function preSendWhen(at: string | Date, now = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.valueOf())) return "";
  if (d.getTime() <= now.getTime()) return "in the next few minutes";
  const clock = londonClock(d);
  if (dayKey(d) === dayKey(now)) return `at ${clock} today`;
  if (dayKey(d) === dayKey(new Date(now.getTime() + 86_400_000))) return `at ${clock} tomorrow`;
  const day = d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" });
  return `on ${day} at ${clock}`;
}

/** "went at 1:40pm today" / "went on Thursday 8 October". */
export function preSentWhen(at: string | Date, now = new Date()): string {
  const d = new Date(at);
  if (Number.isNaN(d.valueOf())) return "";
  if (dayKey(d) === dayKey(now)) return `at ${londonClock(d)} today`;
  return `on ${d.toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long" })}`;
}

/** What the booking did with the pre-presentation, told back to the booker. */
export interface PreOnBooking {
  appraisalId: string;
  /** Booked by the agent who will do the visit. */
  self: boolean;
  agentName: string;
  landlord: string;
  address: string;
  deck: { token: string; url: string } | null;
  state: "queued" | "sent" | "none";
  /** ISO: when it goes (queued) or went (sent). */
  at: string | null;
  /** Booked for somebody else: they were emailed and it is on their bell. */
  told: boolean;
  /** Why it is not on its way, when it is not. */
  detail?: string;
}
