import "server-only";
import { hasDb, q } from "@/lib/db";
import { skyListShell } from "@/lib/email/shell-sky";
import type { ShellRow } from "@/lib/email/shell";
import { logLine } from "@/lib/assistant-log";
import { sendEmail } from "@/lib/resend";
import { renderPlain } from "@/lib/campaign-mail";
import { isInternalAddress } from "@/lib/email-policy";

/**
 * WHEN A TICKET IS FIXED, THE PERSON IS TOLD HOW (James, 9 Nov 2026):
 * "Great news, we've managed to fix your ticket ... Here's how we've done
 * it ... a really dumbed-down version", in a restyled email AND from Steve,
 * who pops up the next time they are in the OS (or straight away if they
 * are). If it is still not right they answer Steve, and the ticket comes
 * back with what they said.
 *
 * The plain-English "how" is written where the fix is made - by the Claude
 * session that worked the ticket, on James's own subscription (PUT
 * /api/bugs/claude `told`), or by James in the Fixed, Tell Them box - and
 * kept on the ticket as context.fixStory. Nothing here calls a model.
 *
 * Steve's side is a NOTICE on the ticket (context.notice): "pending" until
 * they have seen it, then "seen", "sorted" or "reopened". The words also go
 * into Steve's chat (os_assistant_log, thread "fixed"), so the message is
 * still there when they open him later.
 */

const SITE = (process.env.OS_PUBLIC_URL || process.env.OS_ORIGIN || "https://tle-os.co.uk").replace(/\/+$/, "");

export type Ctx = Record<string, unknown> | null | undefined;

/** The plain-English "how we fixed it", or "" when nobody wrote one. */
export function fixStoryOf(ctx: Ctx): string {
  const v = ctx && typeof ctx === "object" ? (ctx as Record<string, unknown>).fixStory : null;
  return typeof v === "string" ? v.trim() : "";
}

/** No dashes in what an agent reads (house rule): an em or en dash becomes " - ". */
export function plain(s: string): string {
  return s.replace(/\s*[—–]\s*/g, " - ").replace(/[ \t]+\n/g, "\n").trim();
}

export async function saveFixStory(id: string, story: string): Promise<void> {
  if (!hasDb()) return;
  const s = plain(story).slice(0, 1500);
  await q(
    `UPDATE os_bugs SET context = CASE WHEN $2 = '' THEN coalesce(context, '{}'::jsonb) - 'fixStory'
       ELSE coalesce(context, '{}'::jsonb) || jsonb_build_object('fixStory', $2::text) END WHERE id = $1`,
    [id, s]
  );
}

const firstOf = (name: string | null | undefined, email: string) =>
  (name ?? "").trim().split(/\s+/)[0] || email.split("@")[0].split(/[._-]/)[0].replace(/^./, (c) => c.toUpperCase());

/* ── The email ────────────────────────────────────────────────────────── */

export function fixedEmail(input: { firstName: string; said: string; story: string; link: string }): { subject: string; html: string; text: string } {
  const subject = "Great news - your ticket is fixed";
  const said = input.said.length > 400 ? `${input.said.slice(0, 400)}…` : input.said;
  const intro = "Thank you for reporting it. We've fixed it and it's live in TLE OS now.";
  const rows: ShellRow[] = [
    { title: "What you told us", detail: said, tone: "neutral", icon: "mark-doc.png" },
    ...(input.story ? [{ title: "How we fixed it", detail: input.story, tone: "good" as const, icon: "disc-good.png" }] : []),
  ];
  const footnote = "Still not right? Answer Steve's message in TLE OS, or tell Steve, and it comes straight back to us with what you said.";
  return {
    subject,
    html: skyListShell({
      heading: `Great news, ${input.firstName}`,
      intro,
      rows,
      rowsLead: "Your ticket",
      rowStyle: "bare",
      button: "Try it again",
      link: input.link,
      hero: "hero-job.png",
      tip: footnote,
      tipQuiet: true,
    }),
    text: [
      `Great news, ${input.firstName}`,
      "",
      intro,
      "",
      "What you told us:",
      said,
      ...(input.story ? ["", "How we fixed it:", input.story] : []),
      "",
      `Try it again: ${input.link}`,
      "",
      footnote,
    ].join("\n"),
  };
}

/* ── Steve's message ──────────────────────────────────────────────────── */

/** What Steve says, in his chat and on the pop-up. */
export function steveFixedWords(firstName: string, said: string, story: string): string {
  const short = said.length > 220 ? `${said.slice(0, 220)}…` : said;
  return [
    `Great news, ${firstName} - we've fixed the problem you reported.`,
    "",
    `You told us: "${short}"`,
    ...(story ? ["", `How we fixed it: ${story}`] : []),
    "",
    "If it's still happening, answer me here and it goes straight back to the team with what you've said.",
  ].join("\n");
}

/**
 * The fix is live: put Steve's message in their chat and leave a notice for
 * the pop-up. Once per ticket. Called beside the email (lib/bug-bot
 * tellReporter), whether or not the email itself was sent.
 */
export async function leaveSteveNotice(id: string): Promise<boolean> {
  if (!hasDb()) return false;
  const rows = await q<{ reporter_id: string | null; reporter_email: string; body: string; kind: string; context: Ctx }>(
    `SELECT reporter_id, reporter_email, body, kind, context FROM os_bugs WHERE id = $1`,
    [id]
  ).catch(() => []);
  const b = rows[0];
  if (!b || b.kind === "auto" || !b.reporter_email.includes("@")) return false;
  const ctx = (b.context ?? {}) as Record<string, unknown>;
  if (ctx.notice) return false;
  const users = await q<{ id: string; name: string | null; email: string }>(
    `SELECT id, name, email FROM os_users WHERE ${b.reporter_id ? "id = $1" : "lower(email) = lower($1)"} LIMIT 1`,
    [b.reporter_id ?? b.reporter_email]
  ).catch(() => []);
  const u = users[0];
  if (!u) return false;
  const words = steveFixedWords(firstOf(u.name, u.email), b.body, fixStoryOf(b.context));
  await logLine({ userId: u.id, userEmail: u.email, thread: "fixed", role: "assistant", text: words, kind: "ask" });
  await q(
    `UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || jsonb_build_object('notice', 'pending', 'noticeAt', now()::text) WHERE id = $1`,
    [id]
  );
  return true;
}

export interface FixedNotice {
  id: string;
  said: string;
  story: string;
  path: string;
  fixedAt: string;
  firstName: string;
}

/** Their fixed tickets that Steve hasn't shown them yet. */
export async function pendingNotices(user: { id: string; email: string; name?: string | null }): Promise<FixedNotice[]> {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; body: string; path: string; context: Ctx; at: string }>(
    `SELECT id, body, path, context, coalesce(told_at, created_at)::text AS at FROM os_bugs
      WHERE state = 'fixed' AND context->>'notice' = 'pending'
        AND (reporter_id = $1 OR lower(reporter_email) = lower($2))
      ORDER BY coalesce(told_at, created_at) DESC LIMIT 5`,
    [user.id, user.email]
  ).catch(() => []);
  return rows.map((r) => ({ id: r.id, said: r.body, story: fixStoryOf(r.context), path: r.path, fixedAt: r.at, firstName: firstOf(user.name, user.email) }));
}

async function mine(id: string, user: { id: string; email: string }): Promise<{ body: string; path: string; context: Ctx } | null> {
  const rows = await q<{ body: string; path: string; context: Ctx }>(
    `SELECT body, path, context FROM os_bugs WHERE id = $1 AND (reporter_id = $2 OR lower(reporter_email) = lower($3))`,
    [id, user.id, user.email]
  ).catch(() => []);
  return rows[0] ?? null;
}

/** Seen, or "sorted, thanks". */
export async function markNotice(id: string, user: { id: string; email: string }, as: "seen" | "sorted"): Promise<boolean> {
  if (!hasDb() || !(await mine(id, user))) return false;
  await q(`UPDATE os_bugs SET context = coalesce(context, '{}'::jsonb) || jsonb_build_object('notice', $2::text, 'noticeDoneAt', now()::text) WHERE id = $1`, [id, as]);
  return true;
}

/**
 * "It's still happening": the ticket comes back open with what they said on
 * the end, the bot's verdict cleared so it can go to Claude again, and James
 * is told it came back.
 */
export async function reopenFromSteve(id: string, user: { id: string; email: string; name?: string | null }, said: string, origin = SITE): Promise<boolean> {
  if (!hasDb()) return false;
  const t = await mine(id, user);
  if (!t) return false;
  const words = plain(said).slice(0, 2000);
  if (!words) return false;
  const day = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });
  await q(
    `UPDATE os_bugs SET state = 'open', told_at = NULL, bot_state = '',
            body = body || $2,
            context = coalesce(context, '{}'::jsonb)
              || jsonb_build_object('notice', 'reopened', 'noticeDoneAt', now()::text)
              || jsonb_build_object('cameBack', coalesce(context->'cameBack', '[]'::jsonb) || jsonb_build_array(jsonb_build_object('at', now()::text, 'said', $3::text, 'story', coalesce(context->>'fixStory', ''))))
      WHERE id = $1`,
    [id, `\n\nCame back ${day} - still happening: ${words}`, words]
  );
  await logLine({ userId: user.id, userEmail: user.email, thread: "fixed", role: "agent", text: words, kind: "ask" });
  await logLine({
    userId: user.id,
    userEmail: user.email,
    thread: "fixed",
    role: "assistant",
    text: "Thanks - I've sent that straight back to the team with what you've said. You'll hear from me again when it's sorted.",
    kind: "ask",
  });
  /* James hears it came back, with their words. */
  const approvers = (process.env.BUG_BOT_APPROVERS ?? "james@therecruitmentexperts.co.uk").split(",").map((e) => e.trim()).filter((e) => e.includes("@") && isInternalAddress(e));
  const subject = `A fixed ticket came back: ${t.body.slice(0, 60)}`;
  const text = [
    `${user.name || user.email} says it's still happening.`,
    "",
    "What they said now:",
    words,
    "",
    "What they first reported:",
    t.body.length > 400 ? `${t.body.slice(0, 400)}…` : t.body,
    ...(fixStoryOf(t.context) ? ["", "What we told them was fixed:", fixStoryOf(t.context)] : []),
    "",
    `The ticket, open again: ${origin}/admin/tickets?open=${encodeURIComponent(id)}`,
  ].join("\n");
  for (const to of approvers) {
    await sendEmail({ to, subject, html: renderPlain(subject, text).html, text }).catch(() => null);
  }
  return true;
}
