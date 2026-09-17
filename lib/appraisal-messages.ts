import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { startVerification } from "@/lib/verification";
import { renderTleEmail } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { skyListShell } from "@/lib/email/shell-sky";
import type { MarketAppraisal } from "@/lib/market-appraisal";
import type { OsUser } from "@/lib/users";

/**
 * A LANDLORD'S MESSAGES, ON THE AGENT'S SIDE (James, 17 Sep 2026).
 *
 * Landlords could message from their property file, and the words went into
 * os_landlord_messages and out as a plain email - and nowhere on the OS. So:
 *
 *   - the agent is emailed properly, with a button straight into the
 *     Messages panel on the appraisal (?messages=1);
 *   - a message nobody has opened shows as "new" on the Market Appraisals
 *     list and on the file, until the panel is opened;
 *   - the agent can reply from the panel, and the landlord is emailed the
 *     reply with a button into the thread on their file.
 */

export interface ThreadMessage {
  id: string;
  from: "landlord" | "agent";
  body: string;
  sentAt: string;
  readAt: string | null;
}

type Row = { id: string; account_id: string; direction: string; body: string; sent_at: Date | string; read_at: Date | string | null };

const iso = (v: Date | string | null) => (v ? new Date(v).toISOString() : null);

export async function threadFor(appraisalId: string): Promise<ThreadMessage[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT id, account_id, direction, body, sent_at, read_at
       FROM os_landlord_messages WHERE appraisal_id = $1 ORDER BY sent_at ASC LIMIT 300`,
    [appraisalId]
  ).catch(() => [] as Row[]);
  return rows.map((r) => ({
    id: r.id,
    from: r.direction === "agent" ? "agent" : "landlord",
    body: r.body,
    sentAt: iso(r.sent_at)!,
    readAt: iso(r.read_at),
  }));
}

/** Unread landlord messages, per appraisal. */
export async function unreadByAppraisal(): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!hasDb()) return out;
  const rows = await q<{ appraisal_id: string; n: number }>(
    `SELECT appraisal_id, count(*)::int AS n FROM os_landlord_messages
      WHERE direction = 'landlord' AND read_at IS NULL AND appraisal_id IS NOT NULL
      GROUP BY appraisal_id`
  ).catch(() => []);
  for (const r of rows) out.set(r.appraisal_id, r.n);
  return out;
}

export async function markThreadRead(appraisalId: string): Promise<void> {
  if (!hasDb()) return;
  await q(
    `UPDATE os_landlord_messages SET read_at = NOW()
      WHERE appraisal_id = $1 AND direction = 'landlord' AND read_at IS NULL`,
    [appraisalId]
  ).catch(() => null);
}

const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The agent's email when a landlord writes: the words, and a button into the panel. */
export function agentMessageEmail(p: { landlord: string; address: string; body: string; link: string; landlordEmail: string }) {
  const firstLine = p.address.split(",")[0].trim() || p.address;
  return {
    subject: `New message from ${p.landlord} about ${firstLine}`,
    text: `${p.landlord} wrote about ${p.address}:\n\n${p.body}\n\nOpen it: ${p.link}\nOr reply to this email to reach them (${p.landlordEmail}).`,
    html: skyListShell({
      heading: "New Message From Your Landlord",
      intro: `${p.landlord} wrote from their property file about ${firstLine}:`,
      rows: [{ title: p.body.length > 600 ? `${p.body.slice(0, 600)}…` : p.body }],
      rowStyle: "bare",
      rowMarkers: false,
      button: "Open the message",
      link: p.link,
      tip: "Reply from the file and they get it by email, or reply to this email and it goes straight to them.",
      tipQuiet: true,
    }),
  };
}

export async function replyAsAgent(p: { ma: MarketAppraisal; me: OsUser; body: string; origin: string }): Promise<{ message: ThreadMessage; emailed: boolean; to: string | null }> {
  const { ma, me } = p;
  const text = p.body.trim();
  /* Their account: the one that wrote on this appraisal, else the landlord's
     own address - a reply can open the conversation too. */
  const prior = await q<{ account_id: string }>(
    `SELECT account_id FROM os_landlord_messages WHERE appraisal_id = $1 ORDER BY sent_at DESC LIMIT 1`,
    [ma.id]
  ).catch(() => []);
  let accountId = prior[0]?.account_id ?? null;
  let to = (ma.landlordEmail ?? "").trim().toLowerCase() || null;
  if (!accountId && to) {
    const match = await landlordByEmail(to);
    if (match) accountId = (await upsertLandlordAccount(match)).id;
  }
  if (!accountId) throw new Error(`${ma.landlord} has no property file to message yet.`);
  if (!to) {
    const acc = await q<{ email: string }>(`SELECT email FROM os_portal_accounts WHERE id = $1`, [accountId]).catch(() => []);
    to = acc[0]?.email ?? null;
  }

  const rows = await q<Row>(
    `INSERT INTO os_landlord_messages (id, account_id, appraisal_id, direction, body, to_email, read_at)
     VALUES ($1, $2, $3, 'agent', $4, $5, NOW())
     RETURNING id, account_id, direction, body, sent_at, read_at`,
    [uid(), accountId, ma.id, text, to ?? ""]
  );
  const r = rows[0];
  const message: ThreadMessage = { id: r.id, from: "agent", body: r.body, sentAt: iso(r.sent_at)!, readAt: iso(r.read_at) };

  let emailed = false;
  if (to) {
    try {
      const { token } = await startVerification(to, "landlord");
      const agentFirst = (me.name || "Your agent").split(/\s+/)[0];
      const { subject, html } = renderTleEmail("landlord-message-reply", {
        firstName: ma.landlord.trim().split(/\s+/)[0] || "there",
        agentFirst,
        address: ma.address.split(",")[0].trim() || ma.address,
        preview: text.slice(0, 90),
        bodyHtml: escape(text).replace(/\n/g, "<br>"),
        link: `${p.origin.replace(/\/+$/, "")}/landlord/enter?token=${encodeURIComponent(token)}&next=/landlord/messages`,
      });
      await sendEmail({ to, subject, html, audience: "customer", replyTo: me.email || undefined });
      await q(`UPDATE os_landlord_messages SET emailed_at = NOW() WHERE id = $1`, [r.id]).catch(() => null);
      emailed = true;
    } catch (e) {
      await q(`UPDATE os_landlord_messages SET email_error = $2 WHERE id = $1`, [r.id, (e instanceof Error ? e.message : String(e)).slice(0, 500)]).catch(() => null);
    }
  }
  return { message, emailed, to };
}
