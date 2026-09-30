import type { Newsletter } from "@/lib/newsletters";
import { londonDayOffset, londonHHMM } from "@/lib/london-time";

/** "9:00 today", "9:00 tomorrow", "Thu 8 Oct, 9:00" - London time. */
export function whenText(iso: string): string {
  const d = londonDayOffset(iso);
  const t = londonHHMM(iso);
  if (d === 0) return `${t} today`;
  if (d === 1) return `${t} tomorrow`;
  const day = new Date(iso).toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short" });
  return `${day}, ${t}`;
}

/** The one-line state of an email, and how loudly to say it. */
export function statusLine(n: Newsletter, armed: boolean): { text: string; tone: "neutral" | "accent" | "good" } {
  const p = n.progress;
  switch (n.status) {
    case "draft":
      return { text: "Draft", tone: "neutral" };
    case "scheduled":
      if (!armed && n.sendAt && Date.parse(n.sendAt) <= Date.now()) return { text: "Held: sending is off", tone: "accent" };
      return { text: n.sendAt ? `Sends ${whenText(n.sendAt)}` : "Scheduled", tone: "neutral" };
    case "sending":
      return { text: p ? `Sending: ${p.sent} of ${p.sent + p.failed + p.queued}` : "Sending", tone: "neutral" };
    case "sent":
      return { text: p && p.failed ? `Sent to ${p.sent}, ${p.failed} failed` : `Sent to ${p?.sent ?? n.recipients.length}`, tone: p && p.failed ? "accent" : "good" };
    case "missed":
      return { text: "Missed: held too long", tone: "accent" };
    default:
      return { text: n.status, tone: "neutral" };
  }
}
