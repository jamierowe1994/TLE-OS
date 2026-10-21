import "server-only";
import { randomBytes } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { MailboxNotConnected, msAccessTokenFor, msConnectionFor } from "@/lib/microsoft";
import { isInternalAddress } from "@/lib/email-policy";
import { isRoomAddress, parseAddress, sameHome } from "@/lib/address-parse";

/**
 * EMAIL REPLIES ON A PLC, LOGGED ON THE FILE (James, 20 Oct 2026, option A).
 *
 * "If people were to reply via email to the PLC emails, they need to be
 * logged in the system to show the back-and-forth ... tenants' emails coming
 * in, the landlords' emails coming in, as well as any emails between us
 * regarding the property, especially if it's replying to a thread ... We
 * shouldn't do this for every new email coming in. It's only the replies
 * from that thread."
 *
 * ── Which threads ─────────────────────────────────────────────────────────
 *
 * Only two kinds, and nothing else is ever read:
 *
 *   started by the OS   a PLC email that went from somebody's own Outlook:
 *                       Send to Susan for Final Approval, the RLP request,
 *                       the PLC decision the agent sends the landlord. Each
 *                       carries an X-TLE-OS-Thread header; the first check of
 *                       the sender's Sent Items finds it by that header and
 *                       learns the thread's Outlook conversation id.
 *   linked by hand      "Link an Email" on the pack: the person picks one of
 *                       their own Outlook conversations about the home.
 *
 * ── How ───────────────────────────────────────────────────────────────────
 *
 * Every five minutes (POST /api/mail-threads/poll, a Railway cron), for each
 * live thread, Graph is asked for the messages IN THAT CONVERSATION ONLY
 * (`conversationId eq '…'`), out of the mailbox of the person who sent or
 * linked it, with the Mail.Read consent they already gave. Their inbox as a
 * whole is never listed. Replies from the tenant, the landlord, Susan or a
 * colleague all land in that conversation, and so do the person's own
 * replies (Sent Items is part of /me/messages). New ones are copied into
 * os_mail_thread_messages: who, when, to whom, the subject and the words as
 * plain text. Attachments are noted, not copied.
 *
 * A thread is read for 60 days after its last message, then left alone. A
 * person who disconnects Outlook stops their threads being read, and the
 * pack says so rather than going quiet.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const LIVE_DAYS = 60;
const MAX_TEXT = 20_000;
export const THREAD_HEADER = "X-TLE-OS-Thread";

let ready: Promise<void> | null = null;
function ensureTables(): Promise<void> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_mail_threads (
      id TEXT PRIMARY KEY,
      plc_case_id TEXT,
      property_id TEXT,
      address TEXT NOT NULL DEFAULT '',
      mailbox_user_id TEXT NOT NULL,
      mailbox_email TEXT NOT NULL DEFAULT '',
      conversation_id TEXT,
      marker TEXT,
      subject TEXT NOT NULL DEFAULT '',
      sent_to TEXT NOT NULL DEFAULT '',
      started_how TEXT NOT NULL,
      started_what TEXT NOT NULL DEFAULT '',
      started_by TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      bound_at TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ,
      last_polled_at TIMESTAMPTZ,
      poll_note TEXT,
      stopped_at TIMESTAMPTZ
    );
    CREATE INDEX IF NOT EXISTS os_mail_threads_case ON os_mail_threads (plc_case_id);
    CREATE INDEX IF NOT EXISTS os_mail_threads_property ON os_mail_threads (property_id);
    CREATE UNIQUE INDEX IF NOT EXISTS os_mail_threads_once ON os_mail_threads (mailbox_user_id, conversation_id, coalesce(plc_case_id, ''))
      WHERE conversation_id IS NOT NULL;
    CREATE TABLE IF NOT EXISTS os_mail_thread_messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      graph_id TEXT NOT NULL DEFAULT '',
      internet_message_id TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      to_list JSONB NOT NULL DEFAULT '[]',
      cc_list JSONB NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      preview TEXT NOT NULL DEFAULT '',
      body_text TEXT NOT NULL DEFAULT '',
      at TIMESTAMPTZ NOT NULL,
      direction TEXT NOT NULL,
      has_attachments BOOLEAN NOT NULL DEFAULT FALSE,
      web_link TEXT,
      logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS os_mail_thread_messages_once ON os_mail_thread_messages (thread_id, internet_message_id);
    CREATE INDEX IF NOT EXISTS os_mail_thread_messages_at ON os_mail_thread_messages (thread_id, at DESC)`).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

/* ── starting and linking ──────────────────────────────────────────────── */

export const newMarker = () => randomBytes(12).toString("hex");

/** The PLC pack's home, for filing: REX's property id where the pack has one, and its address. */
async function caseHome(caseId: string): Promise<{ propertyId: string | null; address: string } | null> {
  const [c] = await q<{ rex_property_id: string | null; address: string }>(`SELECT rex_property_id, address FROM os_plc_cases WHERE id = $1`, [caseId]).catch(() => []);
  return c ? { propertyId: c.rex_property_id || null, address: c.address || "" } : null;
}

/**
 * A PLC email has just gone from this person's Outlook, carrying `marker` in
 * its X-TLE-OS-Thread header. The thread is read from the next check on.
 * Never throws: a send that went must not be reported as failed because the
 * note of it could not be written.
 */
export async function threadStarted(p: {
  caseId: string; userId: string; marker: string; subject: string; to: string; what: string; by: string;
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await ensureTables();
    const home = await caseHome(p.caseId);
    const conn = await msConnectionFor(p.userId).catch(() => null);
    await q(
      `INSERT INTO os_mail_threads (id, plc_case_id, property_id, address, mailbox_user_id, mailbox_email, marker, subject, sent_to, started_how, started_what, started_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'os',$10,$11)`,
      [newMarker(), p.caseId, home?.propertyId ?? null, home?.address ?? "", p.userId, conn?.email ?? "", p.marker, p.subject.slice(0, 300), p.to, p.what, p.by]
    );
  } catch (e) {
    console.error("[mail-threads] a thread could not be noted", p.caseId, e);
  }
}

export class ThreadRefused extends Error {}

/** "Link an Email": one of the person's own Outlook conversations, onto the pack. Read straight away. */
export async function linkThread(p: { caseId: string; userId: string; by: string; conversationId: string; subject: string }): Promise<{ id: string; logged: number }> {
  await ensureTables();
  const home = await caseHome(p.caseId);
  if (!home) throw new ThreadRefused("That pack isn't here any more.");
  const conn = await msConnectionFor(p.userId);
  if (!conn.connected) throw new ThreadRefused("Connect your Outlook on your Profile first. The emails are read from your own mailbox.");
  const id = newMarker();
  const rows = await q<{ id: string }>(
    `INSERT INTO os_mail_threads (id, plc_case_id, property_id, address, mailbox_user_id, mailbox_email, conversation_id, subject, started_how, started_what, started_by, bound_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'linked','Linked from Outlook',$9,NOW())
     ON CONFLICT DO NOTHING RETURNING id`,
    [id, p.caseId, home.propertyId, home.address, p.userId, conn.email ?? "", p.conversationId, p.subject.slice(0, 300), p.by]
  );
  if (!rows.length) throw new ThreadRefused("That conversation is already on this pack.");
  const [t] = await q<ThreadRow>(`SELECT * FROM os_mail_threads WHERE id = $1`, [id]);
  const token = await msAccessTokenFor(p.userId);
  const logged = await readThread(t, token);
  return { id, logged };
}

/** Stop reading a thread. What was logged stays. */
export async function unlinkThread(id: string, by: string): Promise<void> {
  await ensureTables();
  await q(`UPDATE os_mail_threads SET stopped_at = NOW(), poll_note = $2 WHERE id = $1 AND stopped_at IS NULL`, [id, `Taken off by ${by}`]);
}

/* ── the person's own conversations, for Link an Email ─────────────────── */

export interface Candidate { conversationId: string; subject: string; from: string; at: string; preview: string; count: number; linked: boolean }

/**
 * Conversations in the signed-in person's own mailbox that mention the home
 * (its street line), newest first. Read live, nothing kept.
 */
export async function candidatesFor(caseId: string, userId: string, search?: string): Promise<Candidate[]> {
  await ensureTables();
  const home = await caseHome(caseId);
  if (!home) throw new ThreadRefused("That pack isn't here any more.");
  let token: string;
  try {
    token = await msAccessTokenFor(userId);
  } catch (e) {
    throw new ThreadRefused(e instanceof MailboxNotConnected ? "Connect your Outlook on your Profile first. Only your own emails are offered here." : "Your Outlook didn't answer just now. Try again in a minute.");
  }
  const parsed = parseAddress(home.address);
  const term = (search ?? "").trim() || [parsed.building, parsed.street].filter(Boolean).join(" ") || home.address.split(",")[0];
  const params = new URLSearchParams({
    $search: `"${term.replace(/"/g, "")}"`,
    $top: "40",
    $select: "id,conversationId,subject,from,receivedDateTime,bodyPreview,isDraft",
  });
  const res = await fetch(`${GRAPH}/me/messages?${params}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new ThreadRefused(`Outlook refused the search (${res.status}).`);
  const j = (await res.json().catch(() => ({}))) as { value?: GraphMessage[] };
  const linked = new Set(
    (await q<{ conversation_id: string }>(`SELECT conversation_id FROM os_mail_threads WHERE plc_case_id = $1 AND mailbox_user_id = $2 AND conversation_id IS NOT NULL AND stopped_at IS NULL`, [caseId, userId])).map((r) => r.conversation_id)
  );
  const by = new Map<string, Candidate>();
  for (const m of j.value ?? []) {
    if (m.isDraft || !m.conversationId) continue;
    const at = m.receivedDateTime ?? "";
    const had = by.get(m.conversationId);
    if (had) { had.count += 1; if (at > had.at) Object.assign(had, { at, from: who(m), preview: clean(m.bodyPreview) }); continue; }
    by.set(m.conversationId, { conversationId: m.conversationId, subject: (m.subject ?? "").trim() || "(no subject)", from: who(m), at, preview: clean(m.bodyPreview), count: 1, linked: linked.has(m.conversationId) });
  }
  return [...by.values()].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 15);
}

/* ── reading ───────────────────────────────────────────────────────────── */

interface GraphAddress { emailAddress?: { name?: string; address?: string } }
interface GraphMessage {
  id: string; conversationId?: string; internetMessageId?: string; subject?: string; bodyPreview?: string;
  body?: { content?: string }; from?: GraphAddress; toRecipients?: GraphAddress[]; ccRecipients?: GraphAddress[];
  receivedDateTime?: string; sentDateTime?: string; webLink?: string; hasAttachments?: boolean; isDraft?: boolean;
  internetMessageHeaders?: { name: string; value: string }[];
}
type ThreadRow = {
  id: string; plc_case_id: string | null; property_id: string | null; address: string; mailbox_user_id: string; mailbox_email: string;
  conversation_id: string | null; marker: string | null; subject: string; sent_to: string; started_how: string; started_what: string; started_by: string;
  created_at: Date; bound_at: Date | null; last_message_at: Date | null; last_polled_at: Date | null; poll_note: string | null; stopped_at: Date | null;
};

const clean = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, 240);
const who = (m: GraphMessage) => m.from?.emailAddress?.name || m.from?.emailAddress?.address || "";
const addrs = (list?: GraphAddress[]) => (list ?? []).map((a) => ({ name: a.emailAddress?.name ?? "", email: (a.emailAddress?.address ?? "").toLowerCase() })).filter((a) => a.email);

async function graph<T>(token: string, path: string, text = false): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    headers: { Authorization: `Bearer ${token}`, ...(text ? { Prefer: 'outlook.body-content-type="text"' } : {}) },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Outlook said ${res.status}`);
  return (await res.json()) as T;
}

/** An OS-started thread: find the sent email by its header and learn its conversation. */
async function bind(t: ThreadRow, token: string): Promise<boolean> {
  const since = new Date(new Date(t.created_at).getTime() - 10 * 60_000).toISOString();
  const params = new URLSearchParams({
    $filter: `sentDateTime ge ${since}`,
    $orderby: "sentDateTime desc",
    $top: "40",
    $select: "id,conversationId,subject,toRecipients,sentDateTime,internetMessageHeaders",
  });
  const j = await graph<{ value?: GraphMessage[] }>(token, `/me/mailFolders/SentItems/messages?${params}`);
  const hit = (j.value ?? []).find((m) => (m.internetMessageHeaders ?? []).some((h) => h.name.toLowerCase() === THREAD_HEADER.toLowerCase() && h.value.trim() === t.marker))
    /* A server that dropped the header: the same subject to the same person, after it was sent. */
    ?? (j.value ?? []).find((m) => (m.subject ?? "").trim() === t.subject.trim() && addrs(m.toRecipients).some((a) => a.email === t.sent_to.toLowerCase()));
  if (!hit?.conversationId) return false;
  const claimed = await q(
    `UPDATE os_mail_threads SET conversation_id = $2, bound_at = NOW(), poll_note = NULL WHERE id = $1 AND conversation_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM os_mail_threads o WHERE o.mailbox_user_id = $3 AND o.conversation_id = $2 AND coalesce(o.plc_case_id,'') = coalesce($4,'') AND o.id <> $1)
     RETURNING id`,
    [t.id, hit.conversationId, t.mailbox_user_id, t.plc_case_id]
  );
  if (!claimed.length) {
    /* The same conversation is already on the pack (Send Again on a reminder): one thread, not two. */
    await q(`UPDATE os_mail_threads SET stopped_at = NOW(), poll_note = 'Same conversation as another thread on this pack' WHERE id = $1`, [t.id]);
    return false;
  }
  t.conversation_id = hit.conversationId;
  return true;
}

/** Every message in the conversation, copied in once each. Returns how many were new. */
async function readThread(t: ThreadRow, token: string): Promise<number> {
  if (!t.conversation_id) return 0;
  const params = new URLSearchParams({
    $filter: `conversationId eq '${t.conversation_id.replace(/'/g, "''")}'`,
    $top: "50",
    $select: "id,internetMessageId,conversationId,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,body,webLink,hasAttachments,isDraft",
  });
  const j = await graph<{ value?: GraphMessage[] }>(token, `/me/messages?${params}`, true);
  const mine = (t.mailbox_email || "").toLowerCase();
  let added = 0;
  let latest: string | null = null;
  for (const m of j.value ?? []) {
    if (m.isDraft || m.conversationId !== t.conversation_id) continue;
    const fromEmail = (m.from?.emailAddress?.address ?? "").toLowerCase();
    const at = (fromEmail === mine ? m.sentDateTime ?? m.receivedDateTime : m.receivedDateTime ?? m.sentDateTime) ?? new Date().toISOString();
    if (!latest || at > latest) latest = at;
    const rows = await q<{ id: string }>(
      `INSERT INTO os_mail_thread_messages (id, thread_id, graph_id, internet_message_id, from_name, from_email, to_list, cc_list, subject, preview, body_text, at, direction, has_attachments, web_link)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
       ON CONFLICT (thread_id, internet_message_id) DO NOTHING RETURNING id`,
      [newMarker(), t.id, m.id, m.internetMessageId || m.id, m.from?.emailAddress?.name ?? "", fromEmail,
        JSON.stringify(addrs(m.toRecipients)), JSON.stringify(addrs(m.ccRecipients)), (m.subject ?? "").slice(0, 300), clean(m.bodyPreview),
        (m.body?.content ?? m.bodyPreview ?? "").slice(0, MAX_TEXT), at, fromEmail === mine ? "out" : "in", Boolean(m.hasAttachments), m.webLink ?? null]
    );
    added += rows.length;
  }
  await q(
    `UPDATE os_mail_threads SET last_polled_at = NOW(), poll_note = NULL, last_message_at = GREATEST(coalesce(last_message_at, $2::timestamptz), $2::timestamptz) WHERE id = $1`,
    [t.id, latest ?? new Date(t.bound_at ?? t.created_at).toISOString()]
  );
  return added;
}

/**
 * The five-minute check. Live threads, oldest-checked first, grouped by
 * mailbox so each person's token is fetched once. A thread that cannot be
 * read says why on the pack.
 */
export async function pollThreads(opts: { caseId?: string; limit?: number; budgetMs?: number } = {}): Promise<{ threads: number; bound: number; logged: number; problems: number }> {
  /* Never longer than this: the rest wait for the next check, oldest-checked first. */
  const stopAt = Date.now() + (opts.budgetMs ?? 60_000);
  if (!hasDb()) return { threads: 0, bound: 0, logged: 0, problems: 0 };
  await ensureTables();
  const rows = await q<ThreadRow>(
    `SELECT * FROM os_mail_threads
      WHERE stopped_at IS NULL AND coalesce(last_message_at, created_at) > NOW() - INTERVAL '${LIVE_DAYS} days'
        ${opts.caseId ? "AND plc_case_id = $2" : ""}
      ORDER BY last_polled_at NULLS FIRST LIMIT $1`,
    opts.caseId ? [opts.limit ?? 200, opts.caseId] : [opts.limit ?? 200]
  );
  const byBox = new Map<string, ThreadRow[]>();
  for (const t of rows) byBox.set(t.mailbox_user_id, [...(byBox.get(t.mailbox_user_id) ?? []), t]);
  let bound = 0, logged = 0, problems = 0;
  for (const [userId, threads] of byBox) {
    let token: string;
    try {
      token = await msAccessTokenFor(userId);
    } catch (e) {
      const note = e instanceof MailboxNotConnected ? "Their Outlook isn't connected any more, so replies aren't being read." : "Their Outlook didn't answer at the last check.";
      await q(`UPDATE os_mail_threads SET last_polled_at = NOW(), poll_note = $2 WHERE id = ANY($1)`, [threads.map((t) => t.id), note]).catch(() => undefined);
      problems += threads.length;
      continue;
    }
    for (const t of threads) {
      if (Date.now() > stopAt) break;
      try {
        if (!t.conversation_id) {
          if (await bind(t, token)) bound += 1;
          else {
            /* Not in Sent Items after two days: it never went from Outlook, so there is no thread to read. */
            const old = Date.now() - new Date(t.created_at).getTime() > 2 * 864e5;
            await q(`UPDATE os_mail_threads SET last_polled_at = NOW(), poll_note = $2, stopped_at = CASE WHEN $3 THEN NOW() ELSE NULL END WHERE id = $1 AND conversation_id IS NULL`,
              [t.id, old ? "The sent email was never found in Outlook, so replies can't be followed." : "Waiting for the sent email to show in Outlook.", old]);
            continue;
          }
        }
        logged += await readThread(t, token);
      } catch (e) {
        problems += 1;
        await q(`UPDATE os_mail_threads SET last_polled_at = NOW(), poll_note = $2 WHERE id = $1`, [t.id, `The last check failed: ${e instanceof Error ? e.message : "unknown"}.`]).catch(() => undefined);
      }
    }
  }
  return { threads: rows.length, bound, logged, problems };
}

/* ── what the screens show ─────────────────────────────────────────────── */

export interface ThreadMessage {
  id: string; fromName: string; fromEmail: string; to: { name: string; email: string }[]; cc: { name: string; email: string }[];
  subject: string; preview: string; text: string; at: string; direction: "in" | "out"; ours: boolean; hasAttachments: boolean;
}
export interface MailThread {
  id: string; caseId: string | null; address: string; subject: string; startedHow: "os" | "linked"; startedWhat: string; startedBy: string;
  mailbox: string; mailboxUserId: string; createdAt: string; lastPolledAt: string | null; note: string | null; stopped: boolean; waiting: boolean;
  messages: ThreadMessage[];
}

async function shape(rows: ThreadRow[]): Promise<MailThread[]> {
  if (!rows.length) return [];
  const msgs = await q<{ id: string; thread_id: string; from_name: string; from_email: string; to_list: ThreadMessage["to"]; cc_list: ThreadMessage["cc"]; subject: string; preview: string; body_text: string; at: Date; direction: "in" | "out"; has_attachments: boolean }>(
    `SELECT id, thread_id, from_name, from_email, to_list, cc_list, subject, preview, body_text, at, direction, has_attachments FROM os_mail_thread_messages WHERE thread_id = ANY($1) ORDER BY at`,
    [rows.map((r) => r.id)]
  );
  return rows.map((t) => ({
    id: t.id, caseId: t.plc_case_id, address: t.address, subject: t.subject, startedHow: t.started_how === "linked" ? "linked" : "os",
    startedWhat: t.started_what, startedBy: t.started_by, mailbox: t.mailbox_email, mailboxUserId: t.mailbox_user_id,
    createdAt: new Date(t.created_at).toISOString(), lastPolledAt: t.last_polled_at ? new Date(t.last_polled_at).toISOString() : null,
    note: t.poll_note, stopped: Boolean(t.stopped_at), waiting: !t.conversation_id && !t.stopped_at,
    messages: msgs.filter((m) => m.thread_id === t.id).map((m) => ({
      id: m.id, fromName: m.from_name, fromEmail: m.from_email, to: m.to_list ?? [], cc: m.cc_list ?? [], subject: m.subject, preview: m.preview,
      text: m.body_text, at: new Date(m.at).toISOString(), direction: m.direction, ours: isInternalAddress(m.from_email), hasAttachments: m.has_attachments,
    })),
  }));
}

/** The threads on one PLC pack, newest first. Stopped ones that logged nothing are left out. */
export async function threadsForCase(caseId: string): Promise<MailThread[]> {
  if (!hasDb()) return [];
  await ensureTables();
  const rows = await q<ThreadRow>(`SELECT * FROM os_mail_threads WHERE plc_case_id = $1 ORDER BY coalesce(last_message_at, created_at) DESC`, [caseId]);
  return (await shape(rows)).filter((t) => !t.stopped || t.messages.length > 0);
}

/**
 * The threads about a home, for its page: by REX property id, or by address
 * where the pack had none (rooms share a house's id, so the address decides).
 */
export async function threadsForHome(propertyIds: string[], addresses: string[]): Promise<MailThread[]> {
  if (!hasDb()) return [];
  await ensureTables();
  const streets = [...new Set(addresses.map((a) => parseAddress(a).street).filter(Boolean))];
  if (!propertyIds.length && !streets.length) return [];
  const rows = await q<ThreadRow>(
    `SELECT * FROM os_mail_threads WHERE property_id = ANY($1) OR address ILIKE ANY($2) ORDER BY coalesce(last_message_at, created_at) DESC LIMIT 40`,
    [propertyIds, streets.map((s) => `%${s.replace(/[%_]/g, "")}%`)]
  );
  /* The address decides; the property id only for a pack on the whole home,
     since every room of a house shares the house's REX id. */
  const mine = rows.filter((r) => addresses.some((a) => sameHome(r.address, a)) || (r.property_id && propertyIds.includes(r.property_id) && !isRoomAddress(r.address)));
  return (await shape(mine)).filter((t) => t.messages.length > 0);
}
