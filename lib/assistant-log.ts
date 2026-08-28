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
export type LogKind = "ask" | "onboarding-name" | "onboarding-help";

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
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `INSERT INTO os_assistant_log (id, user_id, user_email, thread, role, text, path, kind)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [uid(), p.userId, p.userEmail, p.thread, p.role, p.text, p.path ?? "", p.kind ?? "ask"]
    );
  } catch {
    /* Losing a log line is a shame. Losing the answer because the log failed
       would be a fault. */
  }
}

/** One person's own history, oldest first — what the panel reopens with. */
export async function myHistory(userId: string, limit = 60): Promise<LogLine[]> {
  if (!hasDb()) return [];
  try {
    const rows = await q<Row>(
      `SELECT ${COLS} FROM os_assistant_log
       WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return rows.map(toLine).reverse();
  } catch {
    return [];
  }
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
