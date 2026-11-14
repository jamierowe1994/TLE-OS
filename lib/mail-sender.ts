import "server-only";
import { hasDb, q } from "@/lib/db";
import { mailoutDomains, mailoutFromAllowed } from "@/lib/resend";
import { londonParts } from "@/lib/london-time";

/**
 * WHO A MAIL-OUT COMES FROM, AND HOW FAST IT GOES (James, 14 Nov 2026).
 *
 * "We'll let the marketing team pick that email. We should have a section to
 * show what email they want it to come from, and they'll be able to punch
 * that in."
 *
 * ── The address ───────────────────────────────────────────────────────────
 *
 * Marketing type a name, the address and where replies go. Any address works
 * straight away as long as it is on a domain already verified for sending
 * (lib/resend mailoutDomains): nothing has to be created per address. A new
 * domain or subdomain is the one thing a screen cannot do, because it needs
 * DNS records adding; once James has verified one and listed it in
 * RESEND_MARKETING_DOMAINS it appears here as a choice.
 *
 * ── The pace ──────────────────────────────────────────────────────────────
 *
 * A domain that has only ever sent a few dozen emails a day and then sends
 * three thousand in an hour looks, to Gmail and Outlook, like a hijacked
 * account, and the mail lands in junk for everyone afterwards. So a mail-out
 * goes out at a set number a day, climbing over the first week of sending -
 * the schedule the sending service itself publishes for a new domain - and a
 * big list simply takes a few days the first time. Nothing to remember: the
 * cap counts the days mail-outs have actually gone and moves itself along.
 */

export type MailSender = { name: string; email: string; replyTo: string };

const KEY = "marketing_sender";
const isEmail = (s: string) => /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(s);

export class MailSenderError extends Error {}

export async function getMailSender(): Promise<MailSender | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: Partial<MailSender> | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  const v = rows[0]?.value;
  if (!v || typeof v.email !== "string" || !isEmail(v.email)) return null;
  return { name: String(v.name ?? "").trim() || "The Letting Experts", email: v.email.trim().toLowerCase(), replyTo: String(v.replyTo ?? "").trim().toLowerCase() };
}

/** `Name <address>`, the way the sending service wants it. */
export function fromLine(s: MailSender): string {
  return `${s.name.replace(/[<>"\r\n]/g, "").trim() || "The Letting Experts"} <${s.email}>`;
}

export async function setMailSender(input: Partial<MailSender>, by: string): Promise<MailSender> {
  const name = String(input.name ?? "").replace(/[<>"\r\n]/g, "").trim().slice(0, 80);
  const email = String(input.email ?? "").trim().toLowerCase();
  const replyTo = String(input.replyTo ?? "").trim().toLowerCase();
  if (!name) throw new MailSenderError("Give it a name, as people will see it in their inbox.");
  if (!isEmail(email)) throw new MailSenderError("That isn't a complete email address.");
  if (!mailoutFromAllowed(email)) {
    const ok = mailoutDomains();
    throw new MailSenderError(
      ok.length
        ? `It has to be an address ending ${ok.map((d) => `@${d}`).join(" or ")}. Any other domain needs setting up for sending first: ask James.`
        : "No sending domain is set up yet: ask James."
    );
  }
  if (replyTo && !isEmail(replyTo)) throw new MailSenderError("The reply address isn't a complete email address.");
  const next: MailSender = { name, email, replyTo };
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify(next), by]
  );
  return next;
}

/* ── The pace ────────────────────────────────────────────────────────────── */

/** Most copies in a day, by how many days mail-outs have gone before. Then the last figure for good. */
export const DAILY_RAMP = [150, 250, 400, 700, 1000, 1500, 2000] as const;

export function capForDay(daysSentBefore: number): number {
  return DAILY_RAMP[Math.min(Math.max(0, daysSentBefore), DAILY_RAMP.length - 1)];
}

export type Pace = { cap: number; sentToday: number; left: number; daysSentBefore: number; warming: boolean };

/** Today's allowance for mail-outs, London days. */
export async function mailoutPace(): Promise<Pace> {
  if (!hasDb()) return { cap: DAILY_RAMP[0], sentToday: 0, left: DAILY_RAMP[0], daysSentBefore: 0, warming: true };
  const rows = await q<{ day: string; n: string }>(
    `select to_char(s.sent_at at time zone 'Europe/London', 'YYYY-MM-DD') as day, count(*)::text as n
       from os_newsletter_sends s join os_newsletters n on n.id = s.newsletter_id
      where n.audience = 'customers' and s.state = 'sent' and s.sent_at is not null
      group by 1`
  );
  const p = londonParts(Date.now());
  const today = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  const sentToday = Number(rows.find((r) => r.day === today)?.n ?? 0);
  const daysSentBefore = rows.filter((r) => r.day !== today).length;
  const cap = capForDay(daysSentBefore);
  return { cap, sentToday, left: Math.max(0, cap - sentToday), daysSentBefore, warming: daysSentBefore < DAILY_RAMP.length - 1 };
}

/** How many days a list of this size takes from here, for the screen. */
export function daysToSend(count: number, pace: Pace): number {
  let left = count - pace.left;
  let days = 1;
  let before = pace.daysSentBefore + 1;
  while (left > 0 && days < 60) {
    left -= capForDay(before);
    before += 1;
    days += 1;
  }
  return days;
}
