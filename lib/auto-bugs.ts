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

/**
 * ── WHAT IS NOT A BUG (16 Sep 2026) ──────────────────────────────────────
 *
 * The first day of this list, 27 tickets: 21 were the Propoly page of the
 * wiring sheet in Admin asking Propoly for things it does not allow - a
 * refusal is that page's ANSWER - including one ticket for the path it asks
 * about precisely because it does not exist. Three were one afternoon's bulk
 * pull being throttled, filed three times over because a timeout, a gateway
 * error and a rate limit fingerprint separately. Two were the seconds during a
 * deploy when the old instance has gone and the new one is not up.
 *
 * Not one was a defect, and on Monday twelve agents start reporting real ones.
 * A list that cries wolf is worse than no list: nobody reads the twelfth
 * ticket, and the bug bot spends its hour on the noise. So two rules here, and
 * the third - a probe's refusal - sits with the probe, which is the only place
 * that knows it is one.
 */

const THROTTLE_MS = 60_000;

/** Slow, busy or briefly broken: worth knowing once, not worth three tickets. */
const TRANSIENT = new Set([408, 429, 502, 503, 504]);

/**
 * A DEPLOY IS NOT A FAULT.
 *
 * Railway swaps instances by stopping one and starting the next; for a few
 * seconds in between, a screen that asks for anything gets a 502 from the edge
 * and reports it. The report reaches the NEW instance, which has just started,
 * so its own uptime is the tell.
 *
 * A gateway error that is really ours does not stop when the deploy finishes:
 * it files as soon as one arrives more than two minutes after boot, and a
 * sustained one is on the Watchdog and in Railway's logs regardless.
 */
function duringADeploy(f: Failure): boolean {
  return f.source === "Screen" && TRANSIENT.has(f.status ?? 0) && process.uptime() < 120;
}

/** Propoly timing out and Propoly rate limiting us are one thing: it was busy. */
function wasBusy(f: Failure): boolean {
  return f.source !== "Screen" && f.status != null && TRANSIENT.has(f.status);
}
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
  /* One bucket for "it was busy", per place we call. Keeping the endpoint keeps
     the useful half - that it is the deals list that struggles - while a
     timeout, a 429 and a 502 on the same call stop being three tickets about
     one bad afternoon. */
  if (wasBusy(f)) return [f.source, f.what, "busy"].join("|");
  return [f.source, f.what, f.status ?? "", normalise(f.message)].join("|");
}

function sentence(f: Failure): string {
  /* Worded without the status, because this one row will be counted against
     every kind of busy; the latest is in the context. And never "refused the
     read" for a timeout - the caller's message is written for the one case. */
  if (wasBusy(f)) return `${f.source} ${f.what} was slow or busy - it timed out or turned us away`.slice(0, 900);
  const verb = f.source === "Screen" ? "went wrong on the screen" : "failed";
  return `${f.source} ${f.what} ${verb}${f.status ? ` (${f.status})` : ""}: ${f.message}`.slice(0, 900);
}

export async function logFailure(f: Failure): Promise<void> {
  try {
    if (!hasDb()) return;
    if (duringADeploy(f)) return;
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
