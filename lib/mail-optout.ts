import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";

/**
 * WHO HAS SAID NO TO MARKETING EMAIL (James, 14 Nov 2026).
 *
 * One list for every mail-out: os_mail_optouts. A person lands on it by
 * pressing Unsubscribe in an email (the link, or their mail app's own button),
 * by marking a mail-out as spam, or when their address bounces for good. A
 * mail-out leaves them out when its list is worked out and again as each copy
 * leaves, so an unsubscribe between Publish and the send still counts.
 *
 * It covers marketing only. Email about somebody's own tenancy or property (a
 * repair, a certificate, their rent) is not marketing and does not look here.
 *
 * The link in the email is the address itself, signed, so it works for a copy
 * that has no send row (a test, a preview) and cannot be made up for somebody
 * else's address.
 */

export type OptOutHow = "link" | "one-click" | "complaint" | "bounce" | "staff";

const secret = () => process.env.AUTH_SECRET || "dev-only-secret-not-for-production";
const clean = (email: string) => email.trim().toLowerCase();
const sign = (email: string) => createHmac("sha256", secret()).update(`unsubscribe|${email}`).digest("base64url").slice(0, 24);

export function unsubscribeToken(email: string): string {
  const e = clean(email);
  return `${Buffer.from(e).toString("base64url")}.${sign(e)}`;
}

/** The address a link was made for, or null if the link was tampered with. */
export function emailFromToken(token: string): string | null {
  const [body, sig] = String(token ?? "").split(".");
  if (!body || !sig) return null;
  let email = "";
  try {
    email = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!email.includes("@")) return null;
  const a = Buffer.from(sign(email));
  const b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b) ? email : null;
}

export function unsubscribeUrl(origin: string, email: string, newsletterId?: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/nl/u/${unsubscribeToken(email)}${newsletterId ? `?n=${encodeURIComponent(newsletterId)}` : ""}`;
}

export async function optOut(email: string, how: OptOutHow, newsletterId?: string | null, byName?: string | null): Promise<void> {
  if (!hasDb()) return;
  const e = clean(email);
  if (!e.includes("@")) return;
  await q(
    `insert into os_mail_optouts (email, how, newsletter_id, by_name) values ($1, $2, $3, $4)
     on conflict (email) do nothing`,
    [e, how, newsletterId ?? null, byName ?? null]
  );
}

/** Back on the lists: only ever by the person themselves, or by staff at their asking. */
export async function optBackIn(email: string): Promise<void> {
  if (!hasDb()) return;
  await q(`delete from os_mail_optouts where email = $1`, [clean(email)]);
}

export async function isOptedOut(email: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ email: string }>(`select email from os_mail_optouts where email = $1`, [clean(email)]);
  return rows.length > 0;
}

/** Every address that is out, for taking off a list in one pass. */
export async function optedOutSet(): Promise<Set<string>> {
  if (!hasDb()) return new Set();
  const rows = await q<{ email: string }>(`select email from os_mail_optouts`);
  return new Set(rows.map((r) => r.email));
}

export type OptOutRow = { email: string; at: string; how: OptOutHow };

export async function optOutList(limit = 500): Promise<OptOutRow[]> {
  if (!hasDb()) return [];
  const rows = await q<{ email: string; at: Date; how: string }>(`select email, at, how from os_mail_optouts order by at desc limit $1`, [limit]);
  return rows.map((r) => ({ email: r.email, at: new Date(r.at).toISOString(), how: r.how as OptOutHow }));
}
