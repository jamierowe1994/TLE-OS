import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";
import { listKnowledge } from "@/lib/business/knowledge-store";
import { getBrief } from "@/lib/assistant-brief";
import { systemMap } from "@/lib/system-map";

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
  const [entries, brief] = await Promise.all([
    listKnowledge().catch(() => []),
    getBrief().catch(() => ({ body: "", updatedBy: "", updatedAt: null })),
  ]);
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
- The system map explains where things live and what order they happen in. It
  deliberately contains NO figures — if somebody wants a number, tell them which
  screen shows it rather than guessing at it.
- If the material does not cover it, say so in one sentence and say the question
  has been passed to James. Do not guess at a process, a figure, or a policy —
  a confident wrong answer about a landlord or a deal is worse than no answer.
- Be brief. Two or three sentences is usually right. These are people mid-task,
  not readers.
- Plain English, UK spelling, no em dashes. Never invent a figure.
- SHOW, don't just tell. Whenever you name a screen, write it as a markdown
  link on the exact path the system map gives — [Leads](/leads) — and it
  becomes a button that takes them there. The person asking is stuck and the
  rail is what they were already failing to navigate, so pointing at it by name
  and leaving them to find it is half an answer. Only ever use paths from the
  map; anything else is dropped, and an invented one would be a dead button.
- You cannot change a record, send anything, or look anything up. You answer
  questions and you can take somebody to the right screen.`;

  const blocks: Anthropic.TextBlockParam[] = [{ type: "text", text: persona }];

  /* James's brief goes BEFORE the facts. Instructions have to be read ahead of
     the material they apply to — and putting it here rather than after means it
     can override the built-in persona above, which is the point: the default is
     a starting position, not a policy. */
  if (brief.body.trim()) {
    blocks.push({
      type: "text",
      text: `Standing instructions from James, which take precedence over the general
guidance above:\n\n${brief.body.trim()}`,
    });
  }

  /* How the system works, generated from the system. Sits between the brief
     and the written knowledge: it is more stable than the facts and less
     authoritative than James's instructions. */
  blocks.push({ type: "text", text: systemMap() });

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

/**
 * The one house rule worth enforcing rather than requesting: no em dashes.
 *
 * The prompt already asks for it, but everything the model reads is written in
 * this codebase's voice and that voice is full of them — the system map alone
 * has dozens, because it is generated from comments and blurbs written for
 * developers. Style is contagious, and asking a model not to mirror the
 * document you just handed it is a losing position to argue from every single
 * request.
 *
 * So it is done afterwards, where it is certain. Spaced dashes become a hyphen
 * and unspaced ones close up, which is what the house style asks for in each
 * case. Deliberately nothing else: a rewrite pass over the model's words would
 * be a second author with no judgement, and this is a typographic rule, not a
 * writing one.
 */
export function houseStyle(text: string): string {
  return text.replace(/\s+[—–]\s+/g, " - ").replace(/[—–]/g, "-");
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

  const text = houseStyle(
    res.content
      .filter((c): c is Anthropic.TextBlock => c.type === "text")
      .map((c) => c.text)
      .join("\n")
      .trim()
  );

  return {
    text: text || "I couldn't put an answer together for that one — it's gone to James.",
    inTokens: res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0),
    outTokens: res.usage.output_tokens,
    canned: false,
  };
}
