import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";
import { remindersFor } from "@/lib/reminders";
import { runsFor } from "@/lib/steve-jobs";
import { londonParts } from "@/lib/london-time";
import { noDashes } from "@/lib/no-dashes";

/**
 * THE MORNING BRIEF (James, 2 Oct 2026: "build ... the morning brief").
 *
 * The first time somebody opens the OS each day (from 5am London), Steve pops
 * up with their day: what is in their diary, what is overdue or due today,
 * what the system has flagged for them, and what their standing jobs found
 * overnight - and the ONE thing to do first. Once a day, stored, so a second
 * tab or a reload does not ask the model again. They can turn it off by
 * telling him to.
 *
 * The diary comes from their own browser: the dashboard has already read it
 * (REX, Outlook and our own bookings, scoped to them, lib/diary-store), and
 * rebuilding that here would be a second copy of the most fiddly route in the
 * system. It is capped and coerced before it goes anywhere near a prompt.
 */

const MODEL = "claude-opus-4-8";
const BRIEF_KEY = "steve.brief";
const OFF_KEY = "steve.brief.off";

export type DiaryLine = { start: string; mins: number; kind: string; what: string; where: string; who: string };

const london = (d: Date | string) =>
  new Date(d).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });

export function todayKey(now = new Date()): string {
  const p = londonParts(now);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

async function pref<T>(userId: string, key: string): Promise<T | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: T }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, key]).catch(() => []);
  return rows[0]?.value ?? null;
}
async function setPref(userId: string, key: string, value: unknown): Promise<void> {
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, key, JSON.stringify(value)]
  );
}

export async function setBriefOff(userId: string, off: boolean): Promise<void> {
  if (!hasDb()) return;
  await setPref(userId, OFF_KEY, { off });
}

/** Is a brief owed now: on, after 5am London, and none given yet today. */
export async function briefDue(userId: string): Promise<boolean> {
  if (!hasDb()) return false;
  if (londonParts(new Date()).hour < 5) return false;
  const [off, last] = await Promise.all([pref<{ off: boolean }>(userId, OFF_KEY), pref<{ date: string }>(userId, BRIEF_KEY)]);
  if (off?.off) return false;
  return last?.date !== todayKey();
}

/** What is waiting for them, as facts. Shared with Steve's my_day tool. */
export async function dayFacts(userId: string) {
  const [tasks, reminders, runs] = await Promise.all([
    hasDb()
      ? q<{ title: string; detail: string; due_at: Date | null; kind: string; created_by: string }>(
          `SELECT title, detail, due_at, kind, created_by FROM os_tasks
            WHERE user_id = $1 AND done_at IS NULL
              AND (due_at IS NULL OR due_at < date_trunc('day', NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London' + INTERVAL '1 day')
            ORDER BY due_at NULLS LAST LIMIT 25`,
          [userId]
        ).catch(() => [])
      : [],
    remindersFor(userId, 12).catch(() => []),
    runsFor(userId, 1).catch(() => []),
  ]);
  const now = Date.now();
  const overdue = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() < now);
  const dueToday = tasks.filter((t) => t.due_at && new Date(t.due_at).getTime() >= now);
  const undated = tasks.filter((t) => !t.due_at);
  const line = (t: (typeof tasks)[number]) => ({
    task: t.title,
    ...(t.detail ? { detail: t.detail.slice(0, 160) } : {}),
    ...(t.due_at ? { due: london(t.due_at) } : {}),
    ...(t.kind === "follow-up" ? { followUp: true } : {}),
    ...(t.created_by ? { from: t.created_by } : {}),
  });
  return {
    overdue: overdue.map(line),
    dueToday: dueToday.map(line),
    onTheirList: undated.slice(0, 8).map(line),
    flagged: reminders.map((r) => ({ what: r.title, detail: r.body.slice(0, 200) })),
    jobsReported: runs.map((r) => ({ job: r.title, at: london(r.at), said: r.text.slice(0, 600) })),
  };
}

/** Written without the model: when it is off, out of budget or failing. */
/** "Morning", "Afternoon" or "Evening", by the London clock: the brief comes
    the first time they open the OS, which is not always first thing. */
export function greeting(now = new Date()): string {
  const h = londonParts(now).hour;
  return h < 12 ? "Morning" : h < 17 ? "Afternoon" : "Evening";
}

function plainBrief(first: string, diary: DiaryLine[], f: Awaited<ReturnType<typeof dayFacts>>): string {
  const out: string[] = [`${greeting()} ${first}. Here's your day.`];
  out.push(diary.length ? `- ${diary.length} in your diary, first at ${diary[0].start}: ${diary[0].what}` : "- Nothing in your diary today");
  if (f.overdue.length) out.push(`- ${f.overdue.length} overdue: ${f.overdue.slice(0, 2).map((t) => t.task).join(", ")}`);
  if (f.dueToday.length) out.push(`- ${f.dueToday.length} due today: ${f.dueToday.slice(0, 2).map((t) => t.task).join(", ")}`);
  if (f.flagged.length) out.push(`- ${f.flagged.length} flagged: ${f.flagged[0].what}`);
  if (f.jobsReported.length) out.push(`- Your standing jobs reported back: ${f.jobsReported.map((r) => r.job).join(", ")}`);
  const firstThing = f.overdue[0]?.task ?? f.dueToday[0]?.task ?? f.flagged[0]?.what ?? null;
  if (firstThing) out.push(`\nStart with: ${firstThing}.`);
  return out.join("\n");
}

/**
 * Write today's brief, keep it, and return it. Logged into their Steve chat
 * with its spend, because the daily cap is counted from that table.
 */
export async function makeBrief(
  user: { id: string; name: string; email: string },
  diary: DiaryLine[],
  opts: { force?: boolean } = {}
): Promise<{ text: string; fresh: boolean }> {
  const today = todayKey();
  if (!opts.force) {
    const last = await pref<{ date: string; text: string }>(user.id, BRIEF_KEY);
    if (last?.date === today && last.text) return { text: last.text, fresh: false };
  }
  /* Claimed before the model is asked, so two tabs opening at once do not
     both write one. */
  if (hasDb()) await setPref(user.id, BRIEF_KEY, { date: today, text: "" });

  const first = user.name.split(" ")[0] || "there";
  const facts = await dayFacts(user.id);
  let text = plainBrief(first, diary, facts);
  let inTokens = 0;
  let outTokens = 0;

  const { budget, assistantConfigured, houseStyle } = await import("@/lib/assistant-brain");
  const b = await budget().catch(() => ({ left: 0 }));
  if (assistantConfigured() && b.left > 600) {
    try {
      const weekday = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
      const res = await new Anthropic().messages.create({
        model: MODEL,
        max_tokens: 500,
        system:
          "You are Steve, the assistant inside TLE OS for The Letting Experts, a UK lettings agency. Write a person's morning brief: warm, quick, practical, like a good PA. UK English, no em dashes, no emoji, no bold, no headings. Use ONLY the facts given - never invent an appointment, task, name or figure.",
        messages: [
          {
            role: "user",
            content:
              `It is ${weekday}, ${new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" })} London time - greet them with "${greeting()}", not another time of day. Write ${first}'s brief for today; if it is the afternoon or evening, say what is left of today and what is first tomorrow.\n\n` +
              `Their diary today (their own, already scoped):\n${diary.length ? diary.map((d) => `- ${d.start} (${d.mins} min) ${d.kind}: ${d.what}${d.where ? ` at ${d.where}` : ""}${d.who ? ` with ${d.who}` : ""}`).join("\n") : "- nothing booked"}\n\n` +
              `Everything else waiting for them (JSON):\n${JSON.stringify(facts)}\n\n` +
              `Shape: one short greeting line; then at most six short lines starting "- " covering the diary, what is overdue, what is due today, what is flagged and what their standing jobs reported (leave out anything empty); then a final line "Start with: ..." naming the ONE thing to do first and why in a few words. If the day is clear, say so and suggest one useful thing. Under 130 words.`,
          },
        ],
      });
      const out = res.content.filter((c): c is Anthropic.TextBlock => c.type === "text").map((c) => c.text).join("").trim();
      if (out) text = houseStyle(noDashes(out));
      inTokens = res.usage.input_tokens;
      outTokens = res.usage.output_tokens;
    } catch {
      /* The plain brief stands. */
    }
  }

  if (hasDb()) {
    await setPref(user.id, BRIEF_KEY, { date: today, text });
    const { logLine } = await import("@/lib/assistant-log");
    await logLine({ userId: user.id, userEmail: user.email, thread: "brief", role: "assistant", text, kind: "ask", inTokens, outTokens });
  }
  return { text, fresh: true };
}
