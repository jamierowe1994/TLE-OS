import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * BUGS THAT REPORT THEMSELVES.
 *
 * Howard, 15 Sep 2026: "any writes, any REX calls that don't work, needs to
 * automatically raise a ticket". Until now the only bugs anybody saw were the
 * ones a person pressed the button for, and the worst failures in this product
 * say nothing at all: REX refuses a write, the screen shows what it already had,
 * and the agent carries on thinking it saved.
 *
 * So the places a failure actually happens report it here:
 *
 *   REX      lib/rex rexCall - a refused call, a timeout, a rate limit
 *   Propoly  lib/business/propoly - the same, and a token it would not give
 *   Resend   lib/resend - an email Resend turned down (not our own switches)
 *   Screen   the browser, through /api/bugs/auto - a server error behind a
 *            screen, a script error, a screen that crashed
 *
 * ── One failure, counted, not a thousand rows ────────────────────────────
 *
 * Friday's rate-limit outage would have been thousands of rows. A failure is
 * fingerprinted by where it happened and what went wrong, with ids and numbers
 * taken out, and while a bug with that fingerprint is open it is counted rather
 * than filed again. Closing the bug lets the next occurrence open a fresh one,
 * which is the right signal: it came back.
 *
 * ── Never the cause of a second failure ──────────────────────────────────
 *
 * Every call here is fire-and-forget from the caller, swallows its own errors,
 * and is throttled per fingerprint in memory, so a database under strain is
 * not hit once per failed REX call. Nothing that carries a person's details
 * goes in: the method, the status and REX's own (already token-scrubbed)
 * message, never the request body.
 */

export type FailureSource = "REX" | "Propoly" | "Resend" | "Screen";

export interface Failure {
  source: FailureSource;
  /** Where: "Listings/update", "POST /api/contacts", "send". */
  what: string;
  status?: number | null;
  message: string;
  /** The page, for a screen failure. */
  path?: string;
  /** Who hit it, when there is a person. */
  who?: string;
}

const THROTTLE_MS = 60_000;
/** Occurrences held back by the throttle, added to the count when the minute is up. */
const pending = new Map<string, { n: number; at: number; flush: ReturnType<typeof setTimeout> | null }>();

/* A burst that stops must still be counted: without this, three failures in a
   second read as "seen once" for ever, because the held two only landed when a
   fourth came along. One UPDATE per fingerprint per minute, however many. */
function scheduleFlush(fp: string, entry: { n: number; at: number; flush: ReturnType<typeof setTimeout> | null }) {
  if (entry.flush) return;
  entry.flush = setTimeout(() => {
    const n = entry.n;
    entry.n = 0;
    entry.flush = null;
    if (!n || !hasDb()) return;
    void q(`UPDATE os_bugs SET occurrences = occurrences + $2, last_seen_at = NOW() WHERE fingerprint = $1 AND state = 'open'`, [fp, n]).catch(() => {});
  }, Math.max(1_000, THROTTLE_MS - (Date.now() - entry.at)));
  /* Never the reason a process stays alive. */
  (entry.flush as { unref?: () => void }).unref?.();
}

const normalise = (m: string) =>
  m
    .toLowerCase()
    .replace(/'[^']*'|"[^"]*"/g, "'…'")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 140);

export function fingerprintOf(f: Failure): string {
  return [f.source, f.what, f.status ?? "", normalise(f.message)].join("|");
}

function sentence(f: Failure): string {
  const verb = f.source === "Screen" ? "went wrong on the screen" : "failed";
  return `${f.source} ${f.what} ${verb}${f.status ? ` (${f.status})` : ""}: ${f.message}`.slice(0, 900);
}

export async function logFailure(f: Failure): Promise<void> {
  try {
    if (!hasDb()) return;
    const fp = fingerprintOf(f);
    const now = Date.now();
    const held = pending.get(fp);
    if (held && now - held.at < THROTTLE_MS) {
      held.n += 1;
      scheduleFlush(fp, held);
      return;
    }
    if (held?.flush) clearTimeout(held.flush);
    const n = (held?.n ?? 0) + 1;
    pending.set(fp, { n: 0, at: now, flush: null });
    if (pending.size > 5_000) pending.clear();

    const last = JSON.stringify({ lastMessage: f.message.slice(0, 500), lastPath: f.path ?? null, lastWho: f.who ?? null });
    const counted = await q<{ id: string }>(
      `UPDATE os_bugs
          SET occurrences = occurrences + $2, last_seen_at = NOW(),
              context = COALESCE(context, '{}'::jsonb) || $3::jsonb
        WHERE fingerprint = $1 AND state = 'open'
        RETURNING id`,
      [fp, n, last]
    );
    if (counted.length) return;

    await q(
      `INSERT INTO os_bugs (id, reporter_id, reporter_email, body, path, kind, context, fingerprint, occurrences, last_seen_at)
       VALUES ($1, NULL, $2, $3, $4, 'auto', $5::jsonb, $6, $7, NOW())`,
      [
        uid(),
        f.who ?? "",
        sentence(f),
        f.path ?? "",
        JSON.stringify({ source: f.source, what: f.what, status: f.status ?? null, message: f.message.slice(0, 500), who: f.who ?? null }),
        fp,
        n,
      ]
    );
  } catch {
    /* Reporting a failure must never become one. */
  }
}

/** For callers that must not wait: fire, forget, never throw. */
export function noteFailure(f: Failure): void {
  void logFailure(f).catch(() => {});
}
