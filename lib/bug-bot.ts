import "server-only";
import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import { sendEmail } from "@/lib/resend";
import { renderPlain } from "@/lib/campaign-mail";
import { isInternalAddress } from "@/lib/email-policy";

/**
 * THE BUG BOT'S HALF OF THE OS.
 *
 * James, 15 Sep 2026: the bot prepares the fix, he approves it. So the bot is
 * a Claude Code run on a schedule, outside the OS, and this file is all the OS
 * gives it:
 *
 *   takeQueue()   up to N open bugs nobody has looked at, marked as being
 *                 looked at so two runs never work on the same one
 *   record()      what the bot concluded - a fix ready on a branch with a
 *                 plain note, a bug that needs James, or not a bug at all
 *   tellReporter  when James marks a bug Fixed, the person who reported it
 *                 is emailed once so they can try it again
 *
 * ── Nothing here can change the product ──────────────────────────────────
 *
 * The bot writes code on a branch and opens a pull request. Merging it is the
 * only way anything reaches agents, and that is James's press. The OS only
 * ever stores the bot's words and a link, behind the cron key.
 *
 * Ideas are not on the queue: an idea is a decision, not a fault.
 *
 * ── It makes a list now, it does not fix (James, 17 Sep 2026) ──────────────
 *
 * Preparing a fix meant worktrees, commits, pushes and pull requests, and an
 * unattended run stopped on a permission prompt at nearly every one of them -
 * "stuck in the middle space where it finds them, tries to do it, but it
 * can't". So the bot reads the code, finds the cause and records `to_fix`: a
 * plain note with the cause and the fix it would make. James works down that
 * list (listToFix) in a session of his own. fix_ready stays valid so the
 * tickets recorded before today still read correctly.
 */

export type BotState = "" | "looking" | "to_fix" | "fix_ready" | "needs_you" | "not_a_bug";
export const BOT_STATES: BotState[] = ["", "looking", "to_fix", "fix_ready", "needs_you", "not_a_bug"];

/** A run that died mid-bug leaves it "looking"; after this long it goes back on the queue. */
const STALE_HOURS = 3;

export function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface QueuedBug {
  id: string;
  kind: string;
  body: string;
  path: string;
  context: Record<string, unknown> | null;
  occurrences: number;
  createdAt: string;
  lastSeenAt: string | null;
  hasShot: boolean;
  /** What the bot said last time, when a bug comes back round (it was reopened). */
  previousNote: string;
}

export async function takeQueue(limit = 3): Promise<QueuedBug[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    id: string; kind: string; body: string; path: string; context: Record<string, unknown> | null;
    occurrences: number | null; created_at: Date; last_seen_at: Date | null; has_shot: boolean; bot_note: string;
  }>(
    `UPDATE os_bugs b SET bot_state = 'looking', bot_at = NOW()
      WHERE b.id IN (
        SELECT id FROM os_bugs
         WHERE state IN ('open','ack') AND kind <> 'idea'
           AND (bot_state = '' OR (bot_state = 'looking' AND bot_at < NOW() - INTERVAL '${STALE_HOURS} hours'))
         ORDER BY coalesce(last_seen_at, created_at) DESC
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING b.id, b.kind, b.body, b.path, b.context, b.occurrences, b.created_at, b.last_seen_at, b.bot_note,
                EXISTS (SELECT 1 FROM os_bug_shots s WHERE s.bug_id = b.id) AS has_shot`,
    [Math.min(Math.max(limit, 1), 10)]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    body: r.body,
    path: r.path,
    context: r.context,
    occurrences: r.occurrences ?? 1,
    createdAt: new Date(r.created_at).toISOString(),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
    hasShot: r.has_shot,
    previousNote: r.bot_note,
  }));
}

export interface ListedBug {
  id: string;
  body: string;
  path: string;
  occurrences: number;
  lastSeenAt: string;
  note: string;
  foundAt: string | null;
}

/** The bot's list: every open bug it has diagnosed and nobody has fixed yet, newest first. */
export async function listToFix(): Promise<ListedBug[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    id: string; body: string; path: string; occurrences: number | null;
    created_at: Date; last_seen_at: Date | null; bot_note: string; bot_at: Date | null;
  }>(
    `SELECT id, body, path, occurrences, created_at, last_seen_at, bot_note, bot_at FROM os_bugs
      WHERE state IN ('open','ack') AND bot_state = 'to_fix'
      ORDER BY coalesce(last_seen_at, created_at) DESC`
  );
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    path: r.path,
    occurrences: r.occurrences ?? 1,
    lastSeenAt: new Date(r.last_seen_at ?? r.created_at).toISOString(),
    note: r.bot_note,
    foundAt: r.bot_at ? new Date(r.bot_at).toISOString() : null,
  }));
}

export class BotRefused extends Error {}

/**
 * Who is told a fix is waiting.
 *
 * ── Not every owner (James, 16 Sep 2026) ──────────────────────────────────
 *
 * This asked os_users for role = 'owner', which is James AND Susan. So every
 * prepared fix mailed them both, and Susan cannot do anything with one: the
 * mail asks you to open a pull request and merge it, or to tell Claude Code
 * to push it. She has neither. Her half of the bug bot's output was a mail
 * she could only read and file.
 *
 * Approving a fix is a DEVELOPER's job, not an owner's, and the OS has no
 * role for that - so it is named here rather than inferred from a role that
 * means something else. BUG_BOT_APPROVERS overrides it without a deploy when
 * somebody else starts merging these.
 *
 * The internal-domain filter stays: this is the last gate before a send, and
 * a typo in an environment variable must not be what puts the OS domain in
 * front of somebody outside (lib/email-policy).
 */
const BUG_BOT_APPROVERS = ["james@therecruitmentexperts.co.uk"] as const;

async function approvers(): Promise<string[]> {
  const configured = (process.env.BUG_BOT_APPROVERS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const list = configured.length ? configured : [...BUG_BOT_APPROVERS];
  return list.filter((e) => e.includes("@") && isInternalAddress(e));
}

export async function record(
  id: string,
  p: { state: BotState; note?: string; branch?: string; pr?: string },
  origin: string
): Promise<{ emailed: string[] }> {
  if (!hasDb()) throw new BotRefused("No database here.");
  if (!BOT_STATES.includes(p.state)) throw new BotRefused("Unknown state.");
  const note = (p.note ?? "").trim().slice(0, 4000);
  const pr = (p.pr ?? "").trim();
  if (p.state === "fix_ready" && (!note || !/^https:\/\/github\.com\//.test(pr))) {
    throw new BotRefused("A fix needs a note saying what broke and why, and the GitHub link to the change.");
  }
  if ((p.state === "to_fix" || p.state === "needs_you" || p.state === "not_a_bug") && !note) {
    throw new BotRefused("Say why, in a sentence James can act on.");
  }

  const rows = await q<{ body: string; path: string; bot_state: string }>(
    `SELECT body, path, bot_state FROM os_bugs WHERE id = $1`,
    [id]
  );
  if (!rows[0]) throw new BotRefused("No such bug.");
  const wasReady = rows[0].bot_state === "fix_ready";

  await q(
    `UPDATE os_bugs SET bot_state = $2, bot_note = $3, bot_branch = $4, bot_pr = $5, bot_at = NOW() WHERE id = $1`,
    [id, p.state, note, (p.branch ?? "").trim().slice(0, 200), pr.slice(0, 300)]
  );

  /* One email per fix, not per run: a bot re-recording the same fix is quiet.
     A to_fix is not emailed at all - it joins the list on Pre-launch, and a
     mail per line of a list is the noise the list exists to replace. */
  const emailed: string[] = [];
  if ((p.state === "fix_ready" || p.state === "needs_you") && !(wasReady && p.state === "fix_ready")) {
    const reported = rows[0].body.length > 300 ? `${rows[0].body.slice(0, 300)}…` : rows[0].body;
    const subject =
      p.state === "fix_ready" ? `Fix ready for you to approve: ${reported.slice(0, 60)}` : `A bug needs you: ${reported.slice(0, 60)}`;
    const text = [
      p.state === "fix_ready"
        ? "The bug bot has prepared a fix. Nothing is live until you approve it."
        : "The bug bot looked at this and could not fix it on its own.",
      "",
      `What was reported${rows[0].path ? ` on ${rows[0].path}` : ""}:`,
      reported,
      "",
      p.state === "fix_ready" ? "What broke, and the fix:" : "Why it needs you:",
      note,
      "",
      ...(p.state === "fix_ready"
        ? [
            `To put it live, open ${pr} and press Merge pull request, or tell Claude Code "push the bug bot fix".`,
            "Not happy with it? Close the pull request and say why on Pre-launch.",
          ]
        : []),
      "",
      `All bugs: ${origin}/admin/pre-launch`,
    ].join("\n");
    for (const to of await approvers()) {
      try {
        await sendEmail({ to, subject, html: renderPlain(subject, text).html, text });
        emailed.push(to);
      } catch {
        /* The note is on Pre-launch either way. */
      }
    }
  }
  return { emailed };
}

/**
 * The person who reported it hears it is fixed - once, and only a person.
 * An automatic bug has nobody to tell.
 */
export async function tellReporter(id: string, origin: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ reporter_email: string; body: string; path: string; kind: string; told_at: Date | null }>(
    `SELECT reporter_email, body, path, kind, told_at FROM os_bugs WHERE id = $1`,
    [id]
  ).catch(() => []);
  const b = rows[0];
  if (!b || b.told_at || b.kind === "auto" || !b.reporter_email.includes("@") || !isInternalAddress(b.reporter_email)) return false;

  const said = b.body.length > 400 ? `${b.body.slice(0, 400)}…` : b.body;
  const subject = "Fixed: what you reported in TLE OS";
  const text = [
    "Thank you for reporting this. It has been fixed and is live now.",
    "",
    "You said:",
    said,
    "",
    b.path ? `Try it again here: ${origin}${b.path}` : `Try it again in TLE OS: ${origin}`,
    "",
    "Still not right? Tell Steve in the bottom-right corner and it comes straight back.",
  ].join("\n");
  try {
    await sendEmail({ to: b.reporter_email, subject, html: renderPlain(subject, text).html, text });
    await q(`UPDATE os_bugs SET told_at = NOW() WHERE id = $1`, [id]);
    return true;
  } catch {
    return false;
  }
}
