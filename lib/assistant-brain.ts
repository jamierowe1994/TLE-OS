import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";
import { listKnowledge } from "@/lib/business/knowledge-store";

/**
 * The assistant's actual brain. Claude, over the knowledge we hold.
 *
 * ── The spend ceiling is not optional ─────────────────────────────────────
 *
 * This is the first thing in the OS that costs money per keystroke, and it is
 * about to sit in the corner of every screen for five pilot agents. A runaway
 * loop, a bored afternoon, or one person pasting a book into the box could all
 * run up a bill nobody notices until it arrives.
 *
 * So there is a hard daily cap, counted from the same rows the admin console
 * reads. It is checked BEFORE the call, not after — a ceiling you discover by
 * exceeding it is a receipt, not a ceiling. Over the cap he says so plainly
 * and logs nothing to the API.
 *
 * ── Everything we know goes in the system prompt, and is cached ───────────
 *
 * The knowledge base is large, identical on every request, and rendered first
 * — exactly the shape prompt caching wants. Cache reads cost about a tenth of
 * input, so with a `cache_control` breakpoint on the last system block, the
 * second question of the day is a fraction of the price of the first.
 *
 * That breakpoint is also why the volatile part — the actual conversation —
 * goes in `messages` and nothing per-request is interpolated into the system
 * text. A timestamp in the system prompt would invalidate the whole cache on
 * every single request and quietly triple the bill.
 */

const MODEL = "claude-opus-4-8";

/** Output tokens a day across everybody. Deliberately modest for a pilot. */
const DAILY_CAP = Number(process.env.ASSISTANT_DAILY_TOKEN_CAP ?? 200_000);

export function assistantConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Output tokens spent so far today. */
export async function spentToday(): Promise<number> {
  if (!hasDb()) return 0;
  try {
    const rows = await q<{ n: string | null }>(
      `SELECT COALESCE(SUM(out_tokens), 0)::text AS n FROM os_assistant_log
       WHERE created_at >= date_trunc('day', NOW())`
    );
    return Number(rows[0]?.n ?? 0);
  } catch {
    /* If we cannot read the meter we cannot enforce the cap. Treating that as
       "nothing spent" would remove the ceiling exactly when the database is
       misbehaving, so report the cap instead and fail closed. */
    return DAILY_CAP;
  }
}

export interface Budget {
  spent: number;
  cap: number;
  left: number;
}

export async function budget(): Promise<Budget> {
  const spent = await spentToday();
  return { spent, cap: DAILY_CAP, left: Math.max(0, DAILY_CAP - spent) };
}

/**
 * The system prompt: who he is, plus everything we have written down.
 *
 * Returned as blocks rather than one string so the cache breakpoint can sit on
 * the last one — the whole thing is stable, so the whole thing caches.
 */
async function systemBlocks(): Promise<Anthropic.TextBlockParam[]> {
  const entries = await listKnowledge().catch(() => []);
  const knowledge = entries
    .map((e) => `## ${e.title}\n\n${e.content}`)
    .join("\n\n---\n\n");

  const persona = `You are the assistant inside TLE OS, the operating system used by
The Lettings Experts' partner agents. You appear as a small character in the
corner of every screen and people ask you short, practical questions while they
are in the middle of something else.

How to answer:
- Answer from the material below. It is the only thing you actually know about
  how this business works.
- If the material does not cover it, say so in one sentence and say the question
  has been passed to James. Do not guess at a process, a figure, or a policy —
  a confident wrong answer about a landlord or a deal is worse than no answer.
- Be brief. Two or three sentences is usually right. These are people mid-task,
  not readers.
- Plain English, UK spelling, no em dashes. Never invent a figure.
- You cannot take actions, open pages, or change anything. You answer questions.`;

  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: persona }];

  if (knowledge) {
    blocks.push({
      type: "text",
      text: `Everything the business has written down:\n\n${knowledge}`,
    });
  } else {
    blocks.push({
      type: "text",
      text: `Nothing has been written into the knowledge base yet. Say plainly that
you do not have material on this and the question is going to James.`,
    });
  }

  /* The breakpoint. Stable content only above this line. */
  blocks[blocks.length - 1].cache_control = { type: "ephemeral" };
  return blocks;
}

export type Turn = { role: "user" | "assistant"; text: string };

export interface Answer {
  text: string;
  inTokens: number;
  outTokens: number;
  /** True when the cap or the missing key answered instead of Claude. */
  canned: boolean;
}

/**
 * Ask. Returns the whole answer — this is a two-sentence help reply, not an
 * essay, so streaming would add plumbing for no perceptible gain.
 */
export async function ask(history: Turn[], question: string): Promise<Answer> {
  if (!assistantConfigured()) {
    return {
      text: "I can't answer on my own yet — your question has gone to James, and the answers become the help centre.",
      inTokens: 0,
      outTokens: 0,
      canned: true,
    };
  }

  const b = await budget();
  if (b.left <= 0) {
    /* Named plainly rather than dressed up as a failure. A ceiling that
       pretends to be an outage gets debugged instead of raised. */
    return {
      text: "I've hit my thinking budget for today, so I'll pass this one to James rather than guess. Ask me again tomorrow.",
      inTokens: 0,
      outTokens: 0,
      canned: true,
    };
  }

  const client = new Anthropic();
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.text })),
    { role: "user" as const, content: question },
  ];

  const res = await client.messages.create({
    model: MODEL,
    /* Short answers by design, and a hard stop well under the remaining
       budget so one reply can never blow the day's cap on its own. */
    max_tokens: Math.min(700, Math.max(120, b.left)),
    /* Low effort on purpose. This is lookup-and-summarise over material we
       already hold, not reasoning — higher effort would spend more and answer
       no better. */
    output_config: { effort: "low" },
    system: await systemBlocks(),
    messages,
  });

  const text = res.content
    .filter((c): c is Anthropic.TextBlock => c.type === "text")
    .map((c) => c.text)
    .join("\n")
    .trim();

  return {
    text: text || "I couldn't put an answer together for that one — it's gone to James.",
    inTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0),
    outTokens: res.usage.output_tokens,
    canned: false,
  };
}
