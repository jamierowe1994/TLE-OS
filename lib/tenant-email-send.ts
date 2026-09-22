import "server-only";
import { q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { sendAsAgent } from "@/lib/send-as-agent";
import { sendEmail, ResendBlocked } from "@/lib/resend";

/**
 * What every automatic tenant email shares: the send-once log and the send
 * itself. Used by lib/tenant-reminders (the timed ones) and
 * lib/tenant-journey-emails (the ones that follow something happening).
 */

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || "there";
export const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());

/** The hour and the date in London, whatever the server's clock says. */
export function london(now: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

export async function alreadyDone(key: string): Promise<boolean> {
  const rows = await q<{ key: string }>(`SELECT key FROM os_tenant_email_log WHERE key = $1`, [key]);
  return rows.length > 0;
}

export async function logDone(key: string, emailId: string, to: string, outcome: string, detail: string, meta?: unknown) {
  await q(
    `INSERT INTO os_tenant_email_log (key, email_id, sent_to, outcome, detail, meta) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (key) DO UPDATE SET outcome = EXCLUDED.outcome, detail = EXCLUDED.detail, sent_to = EXCLUDED.sent_to,
       meta = COALESCE(EXCLUDED.meta, os_tenant_email_log.meta), sent_at = NOW()
     WHERE os_tenant_email_log.outcome = 'claimed'`,
    [key, emailId, to, outcome, detail, meta == null ? null : JSON.stringify(meta)]
  );
}

/**
 * CLAIM BEFORE SENDING (18 Sep sweep, item 13). Every timed send went
 * check, send, mark: two runs of the cron overlapping - or one run and a
 * hand-pressed one - both saw "not sent" and both sent. The row is written
 * FIRST as a claim; only the run that wrote it goes on to send, and logDone
 * turns the claim into the outcome. A claim older than an hour is a run that
 * died mid-send and is taken over.
 */
export async function claim(key: string, emailId: string, to: string): Promise<boolean> {
  const rows = await q<{ key: string }>(
    `INSERT INTO os_tenant_email_log (key, email_id, sent_to, outcome, detail) VALUES ($1,$2,$3,'claimed','')
     ON CONFLICT (key) DO UPDATE SET sent_at = NOW()
       WHERE os_tenant_email_log.outcome = 'claimed' AND os_tenant_email_log.sent_at < NOW() - INTERVAL '1 hour'
     RETURNING key`,
    [key, emailId, to]
  );
  return rows.length > 0;
}

/** A send that is worth another go next hour gives its claim back. */
export async function release(key: string): Promise<void> {
  await q(`DELETE FROM os_tenant_email_log WHERE key = $1 AND outcome = 'claimed'`, [key]).catch(() => null);
}

/**
 * Send one, as the agent when we know who they are, otherwise on our sender.
 * Returns whether the outcome is final (log it) or worth another go next hour.
 */
export async function deliver(p: {
  agent: OsUser | null;
  to: string;
  toName: string;
  subject: string;
  html: string;
}): Promise<{ sent: boolean; final: boolean; detail: string }> {
  if (p.agent) {
    const r = await sendAsAgent({ me: p.agent, to: p.to, toName: p.toName, subject: p.subject, html: p.html });
    return { sent: r.sent, final: r.sent || r.reason === "no_address", detail: r.detail };
  }
  try {
    await sendEmail({ to: p.to, subject: p.subject, html: p.html, audience: "customer" });
    return { sent: true, final: true, detail: `Sent to ${p.to} from the Letting Experts sender.` };
  } catch (e) {
    const detail = e instanceof Error ? e.message : "The send failed.";
    return { sent: false, final: false, detail: e instanceof ResendBlocked ? detail : `Not sent: ${detail}` };
  }
}


/** An OS user by their display name, the only thing REX's viewings and leads carry. */
export async function userByName(name: string | null | undefined): Promise<OsUser | null> {
  const n = (name ?? "").trim();
  if (!n) return null;
  const rows = await q<{ id: string }>(`SELECT id FROM os_users WHERE LOWER(name) = LOWER($1) LIMIT 1`, [n]).catch(() => []);
  if (!rows[0]) return null;
  const { findUserById } = await import("@/lib/users");
  return findUserById(rows[0].id).catch(() => null);
}
