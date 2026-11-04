import "server-only";
import { hasDb, q } from "@/lib/db";
import { payloadSignatureOk, signPayload } from "@/lib/auth";
import { bugShot } from "@/lib/pilot";
import { mediaFor } from "@/lib/bug-media";
import { GithubRefused, getPr, githubConfigured, markReady, mergePr, prNumberFrom } from "@/lib/github-pr";

/**
 * SEND TO CLAUDE (James, 4 Nov 2026): "When I click Send to Claude, it will
 * then just start working on that ticket, and then I want it to automatically
 * get rid of that ticket for me. I would like that to do it off of my
 * subscription rather than anything else."
 *
 * So a ticket is handed to a Claude Code routine on claude.ai, which runs on
 * James's own plan, not the OS's API key:
 *
 *   1. James presses Send to Claude on Tickets. The ticket is marked
 *      with_claude, leaves his open list, and the routine is fired with a
 *      brief: what was reported, where, and a link back here carrying a token
 *      for that one ticket.
 *   2. The routine's session reads the ticket and its pictures through that
 *      link (GET /api/bugs/claude), works the fix in the repository on its own
 *      branch, adds tickets/shipped/<id>.json beside the fix, opens a pull
 *      request, and says how it went (POST /api/bugs/claude): fix ready with
 *      the pull request, or a question for James, or "not a fault" with the
 *      answer for the person who asked.
 *   3. James presses Push It Live on the ticket (pushClaudeFix, below), or
 *      merges on GitHub. When the deploy carrying the fix boots, lib/ticket-sweep
 *      marks the ticket Fixed and the reporter gets the usual email. Nobody
 *      ticks it.
 *
 * ── Why a token per ticket, not the cron key ─────────────────────────────
 *
 * The cron key runs every timer in the OS. The routine's session only needs
 * one ticket, so the link it is given opens that ticket and nothing else, and
 * stops working after TOKEN_DAYS. It is the same signing secret as every
 * other link the OS sends (lib/auth signPayload).
 */

const TOKEN_DAYS = 7;

export function ticketToken(id: string, now = Date.now()): string {
  const exp = now + TOKEN_DAYS * 86_400_000;
  return `${exp}.${signPayload(`claude-ticket.${id}.${exp}`)}`;
}

export function ticketTokenOk(id: string, token: string | null | undefined, now = Date.now()): boolean {
  if (!id || !token) return false;
  const dot = token.indexOf(".");
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  if (!Number.isFinite(exp) || exp < now) return false;
  return payloadSignatureOk(`claude-ticket.${id}.${exp}`, token.slice(dot + 1));
}

export interface TicketForClaude {
  id: string;
  kind: string;
  state: string;
  body: string;
  path: string;
  reporter: string;
  createdAt: string;
  occurrences: number;
  /** What the browser told us: viewport, browser, what they attached. */
  context: Record<string, unknown>;
  /** The screen as it looked when they reported it, as a data URL, or null. */
  shot: string | null;
  /** Their own pictures and recordings: links that last five minutes. */
  media: Array<{ id: string; mime: string; url: string }>;
  /** What Claude or the bug bot said last time, when this comes back round. */
  previousNote: string;
  /** Their other reports this week, so a duplicate is seen as one. */
  sameReporterRecent: Array<{ id: string; at: string; state: string; body: string }>;
}

export async function ticketForClaude(id: string): Promise<TicketForClaude | null> {
  if (!hasDb()) return null;
  const rows = await q<{
    id: string; kind: string; state: string; body: string; path: string; reporter_email: string;
    created_at: Date; occurrences: number | null; context: Record<string, unknown> | null; bot_note: string;
  }>(
    `SELECT id, kind, state, body, path, reporter_email, created_at, occurrences, context, bot_note FROM os_bugs WHERE id = $1`,
    [id]
  );
  const b = rows[0];
  if (!b) return null;
  const recent = b.reporter_email
    ? await q<{ id: string; created_at: Date; state: string; body: string }>(
        `SELECT id, created_at, state, left(body, 300) AS body FROM os_bugs
          WHERE reporter_email = $1 AND id <> $2 AND kind <> 'auto' AND created_at > NOW() - INTERVAL '10 days'
          ORDER BY created_at DESC LIMIT 15`,
        [b.reporter_email, id]
      ).catch(() => [])
    : [];
  return {
    id: b.id,
    kind: b.kind,
    state: b.state,
    body: b.body,
    path: b.path,
    reporter: b.kind === "auto" ? "" : b.reporter_email,
    createdAt: new Date(b.created_at).toISOString(),
    occurrences: b.occurrences ?? 1,
    context: b.context ?? {},
    shot: await bugShot(id),
    /* Only what they added: Claude's own pictures of a fix are its, not evidence. */
    media: await mediaFor(id, "reporter").catch(() => []),
    previousNote: b.bot_note,
    sameReporterRecent: recent.map((r) => ({ id: r.id, at: new Date(r.created_at).toISOString(), state: r.state, body: r.body })),
  };
}

/* ── Who may send, and what is sent ────────────────────────────────────── */

/**
 * Only the person whose plan it runs on. The same list as the bug bot's
 * approvers (lib/bug-bot): approving a fix is a developer's job, and Susan,
 * also an owner, would be spending James's plan on a press she cannot follow
 * up. CLAUDE_TICKETS_SENDERS widens it without a deploy.
 */
export function maySendToClaude(email: string | null | undefined): boolean {
  const e = (email ?? "").trim().toLowerCase();
  if (!e) return false;
  const configured = (process.env.CLAUDE_TICKETS_SENDERS ?? process.env.BUG_BOT_APPROVERS ?? "")
    .split(",")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
  return (configured.length ? configured : ["james@therecruitmentexperts.co.uk"]).includes(e);
}

/**
 * Whether the routine is wired up on this deploy: its fire address and the
 * token claude.ai showed once when its API trigger was made, both Railway
 * variables. The address must be Anthropic's, so a typo cannot post a ticket
 * and its token anywhere else.
 */
function routineUrl(): string {
  const u = (process.env.CLAUDE_TICKETS_ROUTINE_URL ?? "").trim();
  if (/^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9_-]+\/fire$/.test(u)) return u;
  /* A stand-in on this machine, for trying the press locally without starting a real session. */
  if (process.env.NODE_ENV !== "production" && /^http:\/\/(127\.0\.0\.1|localhost):\d+\//.test(u)) return u;
  return "";
}

export function claudeConfigured(): boolean {
  return Boolean(routineUrl() && (process.env.CLAUDE_TICKETS_ROUTINE_TOKEN ?? "").trim());
}

/**
 * The words the routine's session starts from. Its standing instructions are
 * the routine's own prompt, which points at docs/CLAUDE-TICKETS.md in the
 * repository, so how a ticket is worked can change with a commit; this is only
 * the ticket.
 */
export function briefFor(t: { id: string; body: string; path: string; reporter: string; kind: string }, origin: string): string {
  const said = t.body.length > 1500 ? `${t.body.slice(0, 1500)}…` : t.body;
  return [
    `TLE OS ticket ${t.id}. Work it by following docs/CLAUDE-TICKETS.md in this repository.`,
    "",
    `OS=${origin}`,
    `ID=${t.id}`,
    `TOKEN=${ticketToken(t.id)}`,
    "",
    `Raised by ${t.reporter || "the OS itself"}${t.path ? ` on ${t.path}` : ""} (${t.kind}):`,
    said,
  ].join("\n");
}

/* ── Pressing it ───────────────────────────────────────────────────────── */

export class ClaudeRefused extends Error {}

/**
 * Fires the routine and hands the ticket over. The ticket leaves James's open
 * list at once (with_claude) and comes back only if Claude needs him. The
 * link to watch the session, when the routine gives one, is kept beside it.
 */
export async function sendToClaude(id: string, by: string, origin: string): Promise<{ url: string }> {
  if (!hasDb()) throw new ClaudeRefused("No database here.");
  if (!claudeConfigured()) throw new ClaudeRefused("Claude isn't connected yet: the routine's address and key aren't set on Railway.");
  const rows = await q<{ id: string; body: string; path: string; reporter_email: string; kind: string; state: string; bot_state: string; bot_at: Date | null }>(
    `SELECT id, body, path, reporter_email, kind, state, bot_state, bot_at FROM os_bugs WHERE id = $1`,
    [id]
  );
  const t = rows[0];
  if (!t) throw new ClaudeRefused("No such ticket.");
  if (t.state === "fixed" || t.state === "wontfix") throw new ClaudeRefused("That ticket is already closed.");
  /* A second press while a session is still on it would start a second
     session on the same ticket. After a day it is fair to try again. */
  if (t.bot_state === "with_claude" && t.bot_at && Date.now() - new Date(t.bot_at).getTime() < 86_400_000) {
    throw new ClaudeRefused("Claude is already on this one.");
  }

  const text = briefFor({ id: t.id, body: t.body, path: t.path, reporter: t.kind === "auto" ? "" : t.reporter_email, kind: t.kind }, origin);
  /* POST .../routines/trig_.../fire (claude.ai routines, research preview,
     checked 4 Nov 2026). It answers once the session exists, with its link;
     there is no idempotency key, so a press is never retried from here: a
     second call would start a second session on the same ticket. */
  const res = await fetch(routineUrl(), {
    method: "POST",
    headers: {
      authorization: `Bearer ${(process.env.CLAUDE_TICKETS_ROUTINE_TOKEN ?? "").trim()}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(30_000),
  }).catch(() => null);
  if (!res) throw new ClaudeRefused("Claude didn't answer. Look under With Claude in a minute before pressing it again.");
  const out = (await res.json().catch(() => ({}))) as { claude_code_session_url?: string };
  if (!res.ok) {
    throw new ClaudeRefused(
      res.status === 429
        ? "Claude has taken as many tickets as it can this hour. Try again in a few minutes."
        : res.status === 401 || res.status === 403 || res.status === 404
          ? "Claude turned the key down: the routine's token on Railway may have been replaced. Make a new one and update it."
          : res.status === 400
            ? "Claude refused the ticket: the routine may be paused."
            : "Claude couldn't take it just now. Try again in a minute."
    );
  }
  const url = typeof out.claude_code_session_url === "string" && out.claude_code_session_url.startsWith("https://") ? out.claude_code_session_url : "";
  await q(
    `UPDATE os_bugs SET bot_state = 'with_claude', bot_at = NOW(), bot_pr = '', bot_branch = '',
            bot_note = $2, claude_url = $3
      WHERE id = $1`,
    [id, `Sent to Claude by ${by}.`, url]
  );
  return { url };
}

/**
 * Claude's answer to somebody who asked how to do something, sent when James
 * presses Send Claude's Answer on Tickets: from the OS, to the person who
 * asked, once, and the ticket is closed. Staff only (lib/email-policy).
 */
export async function sendClaudeReply(id: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ reporter_email: string; body: string; path: string; kind: string; context: Record<string, unknown> | null }>(
    `SELECT reporter_email, body, path, kind, context FROM os_bugs WHERE id = $1`,
    [id]
  );
  const b = rows[0];
  const reply = typeof b?.context?.claudeReply === "string" ? (b.context.claudeReply as string).trim() : "";
  if (!b || !reply || b.kind === "auto" || b.context?.replySentAt) return false;
  const { isInternalAddress } = await import("@/lib/email-policy");
  if (!b.reporter_email.includes("@") || !isInternalAddress(b.reporter_email)) return false;
  const { sendEmail } = await import("@/lib/resend");
  const { renderPlain } = await import("@/lib/campaign-mail");
  const said = b.body.length > 400 ? `${b.body.slice(0, 400)}…` : b.body;
  const subject = "About what you reported in TLE OS";
  const text = [reply, "", "You said:", said, "", "Still not right? Tell Steve in the bottom-right corner and it comes straight back."].join("\n");
  await sendEmail({ to: b.reporter_email, subject, html: renderPlain(subject, text).html, text });
  await q(
    `UPDATE os_bugs SET state = 'wontfix', context = coalesce(context, '{}'::jsonb) || jsonb_build_object('replySentAt', NOW()) WHERE id = $1`,
    [id]
  );
  return true;
}

/* ── Pushing a fix ────────────────────────────────────────────────────────── */

/**
 * Push It Live (James, 4 Nov 2026: "an option to push or to open it, so it
 * almost kind of bypasses the need to go into Claude"). Merges the pull
 * request Claude opened for this ticket; Railway deploys main, and when it
 * boots the shipped file in the change closes the ticket and tells whoever
 * reported it (lib/ticket-sweep).
 *
 * Only that ticket's own fix: the branch Claude named for it,
 * claude/ticket-<first 8 of the id>, into main, in this repository. A second
 * press finds it already pushed, and a fix merged on GitHub by hand is
 * recorded as pushed without merging anything.
 */
export async function pushClaudeFix(id: string, by: string): Promise<{ sha: string }> {
  if (!hasDb()) throw new ClaudeRefused("No database here.");
  if (!githubConfigured()) throw new ClaudeRefused("Push isn't connected yet: GitHub's key goes on Railway. See the Change opens it on GitHub meanwhile.");
  const rows = await q<{ state: string; bot_state: string; bot_pr: string; bot_branch: string; context: Record<string, unknown> | null }>(
    `SELECT state, bot_state, bot_pr, bot_branch, context FROM os_bugs WHERE id = $1`,
    [id]
  );
  const t = rows[0];
  if (!t) throw new ClaudeRefused("No such ticket.");
  if (t.context?.pushedAt) throw new ClaudeRefused("Already pushed. It closes itself when the deploy is live.");
  if (t.state === "fixed" || t.state === "wontfix") throw new ClaudeRefused("That ticket is already closed.");
  if (t.bot_state !== "fix_ready") throw new ClaudeRefused("There's no fix from Claude on this one to push.");
  const n = prNumberFrom(t.bot_pr);
  if (!n) throw new ClaudeRefused("Claude left a link to the change rather than a pull request, so it can't be pushed from here. See the Change opens it on GitHub.");
  if (!t.bot_branch.startsWith(`claude/ticket-${id.slice(0, 8)}`)) {
    throw new ClaudeRefused("That fix isn't on this ticket's own branch, so it isn't pushed from here. See the Change opens it on GitHub.");
  }
  try {
    const pr = await getPr(n);
    if (!pr) throw new ClaudeRefused("GitHub has no such change any more. Send it to Claude again.");
    let sha = "";
    if (!pr.merged) {
      if (pr.state !== "open") throw new ClaudeRefused("That change was closed on GitHub without going in. Send it to Claude again.");
      if (pr.base !== "main" || pr.head !== t.bot_branch) throw new ClaudeRefused("That change isn't this ticket's fix into main, so it isn't pushed from here.");
      if (pr.mergeable === false) throw new ClaudeRefused("It clashes with a newer change. Open it in Claude to bring it up to date.");
      if (pr.draft) await markReady(pr);
      sha = await mergePr(pr);
    }
    await q(
      `UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || jsonb_build_object('pushedAt', NOW(), 'pushedBy', $2::text, 'pushedSha', $3::text) WHERE id = $1`,
      [id, by, sha]
    );
    return { sha };
  } catch (e) {
    if (e instanceof GithubRefused) throw new ClaudeRefused(e.message);
    throw e;
  }
}
