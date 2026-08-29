import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * The assistant's conversation log.
 *
 * Every exchange, both halves. See the table comment in lib/db.ts for why the
 * assistant's own replies are stored as rows too.
 *
 * ── This is personal data, and it is read by the boss ─────────────────────
 *
 * An agent asking "how do I stop a landlord shouting at me" is being candid
 * with something that feels private and is not. That is a real tension and it
 * gets one honest answer rather than a technical one: the panel says out loud
 * that questions go to James. Nothing here is hidden, so nothing here is a
 * betrayal — and a log people know about is a log they can choose what to put
 * in.
 */

export type LogRole = "agent" | "assistant";
/**
 * `cleared` is a MARKER, not a message.
 *
 * James, 29 Aug: "we should have a clear option... it will still store the
 * conversation, but we need to be able to clear the chat once in a while
 * because it's getting pretty long."
 *
 * Both halves of that matter, and they pull against each other. The whole point
 * of this log is that every question is a guide somebody needed and could not
 * find — that list IS the writing order for the help centre. A clear button
 * that deleted rows would quietly destroy the most valuable thing the assistant
 * produces, and it would do it invisibly, one tidy-up at a time.
 *
 * So nothing is ever deleted. Clearing writes a row saying where the line was
 * drawn, and the panel reads back only what came after the most recent one. The
 * agent gets a fresh screen; the admin console still has every word.
 *
 * A row rather than a column on the user, because it makes the clear itself an
 * event with a time on it, and because it needs no migration.
 */
export type LogKind = "ask" | "onboarding-name" | "onboarding-help" | "cleared";

export interface LogLine {
  id: string;
  userId: string;
  userEmail: string;
  thread: string;
  role: LogRole;
  text: string;
  path: string;
  kind: LogKind;
  createdAt: string;
}

interface Row extends Record<string, unknown> {
  id: string;
  user_id: string;
  user_email: string;
  thread: string;
  role: string;
  text: string;
  path: string;
  kind: string;
  created_at: string;
}

const toLine = (r: Row): LogLine => ({
  id: r.id,
  userId: r.user_id,
  userEmail: r.user_email,
  thread: r.thread,
  role: r.role === "assistant" ? "assistant" : "agent",
  text: r.text,
  path: r.path,
  kind: (r.kind as LogKind) ?? "ask",
  createdAt: r.created_at,
});

const COLS = `id, user_id, user_email, thread, role, text, path, kind,
              created_at::text AS created_at`;

/** Append one line. Never throws — a failed log must not eat the reply. */
export async function logLine(p: {
  userId: string;
  userEmail: string;
  thread: string;
  role: LogRole;
  text: string;
  path?: string;
  kind?: LogKind;
  inTokens?: number;
  outTokens?: number;
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_assistant_log
         (id, user_id, user_email, thread, role, text, path, kind, in_tokens, out_tokens)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [uid(), p.userId, p.userEmail, p.thread, p.role, p.text, p.path ?? "", p.kind ?? "ask",
       p.inTokens ?? 0, p.outTokens ?? 0]
    );
  } catch {
    /* Losing a log line is a shame. Losing the answer because the log failed
       would be a fault. */
  }
}

/**
 * One person's own history, oldest first — what the panel reopens with.
 *
 * Only what has happened since they last cleared. The marker row itself is
 * excluded: it is bookkeeping, not something he said.
 *
 * This is also what gets handed to the model as conversational context, which
 * is the second reason clearing is worth having. A long thread is not just
 * awkward to read, it is carried into every request and paid for on every
 * question. Clearing genuinely starts again rather than only appearing to.
 */
export async function myHistory(userId: string, limit = 60): Promise<LogLine[]> {
  if (!hasDb()) return [];
  try {
    /* Two plain queries rather than one clever one. The single-query version
       used a correlated subquery inside COALESCE with an '-infinity' cast to
       cover "never cleared", which is correct Postgres and completely
       untestable here — there is no database on this machine and none in the
       build. Two obvious statements that cannot be got wrong beat one elegant
       statement nobody can run, and the cost is a round trip on opening a help
       panel. */
    const cut = await q<{ at: string | null }>(
      `SELECT MAX(created_at)::text AS at FROM os_assistant_log
        WHERE user_id = $1 AND kind = 'cleared'`,
      [userId]
    );
    const since = cut[0]?.at ?? null;

    const rows = since
      ? await q<Row>(
          `SELECT ${COLS} FROM os_assistant_log
            WHERE user_id = $1 AND kind <> 'cleared' AND created_at > $2
            ORDER BY created_at DESC LIMIT $3`,
          [userId, since, limit]
        )
      : await q<Row>(
          `SELECT ${COLS} FROM os_assistant_log
            WHERE user_id = $1 AND kind <> 'cleared'
            ORDER BY created_at DESC LIMIT $2`,
          [userId, limit]
        );
    return rows.map(toLine).reverse();
  } catch (e) {
    /* Say something, somewhere. An empty history and a broken query look
       IDENTICAL on screen — and now that clearing exists, a failing read would
       look exactly like a successful clear, so the panel would come back empty
       for ever and read as a feature. The panel still opens; Railway's log gets
       the reason. */
    console.error("[assistant-log] could not read history", e);
    return [];
  }
}

/**
 * Draw a line under everything so far.
 *
 * Deliberately NOT a delete. See the note on LogKind: the questions people ask
 * are the help centre's writing order, and losing them to a tidy-up would be
 * expensive and invisible.
 *
 * The marker carries readable text because the admin transcript renders every
 * row — "Cleared the chat" reads as the event it is, where an empty string
 * would render as a mysterious blank card. It is excluded from the console's
 * question list by kind, so it never looks like something somebody asked.
 */
export async function clearChat(userId: string, userEmail: string): Promise<void> {
  await logLine({
    userId,
    userEmail,
    thread: "clear",
    role: "agent",
    text: "Cleared the chat",
    kind: "cleared",
  });
}

/** Has this person been through the initiation? */
export async function isOnboarded(userId: string): Promise<boolean> {
  if (!hasDb()) return false;
  try {
    const rows = await q<{ n: string }>(
      `SELECT COUNT(*)::text AS n FROM os_assistant_log
       WHERE user_id = $1 AND kind = 'onboarding-help'`,
      [userId]
    );
    return Number(rows[0]?.n ?? 0) > 0;
  } catch {
    return false;
  }
}

/** Everyone, newest first — the admin read. */
export async function allLines(limit = 400): Promise<LogLine[]> {
  if (!hasDb()) return [];
  try {
    const rows = await q<Row>(
      `SELECT ${COLS} FROM os_assistant_log ORDER BY created_at DESC LIMIT $1`,
      [limit]
    );
    return rows.map(toLine);
  } catch {
    return [];
  }
}
