import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";
import { listKnowledge } from "@/lib/business/knowledge-store";
import { getBrief } from "@/lib/assistant-brief";
import { systemMap } from "@/lib/system-map";
import { labelFor, runTool, TOOL_SCHEMAS } from "@/lib/assistant-tools";
import type { Scope } from "@/lib/scope";

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
  /* A failed read and an empty table are different facts and he is told which.
     Swallowing the error into [] made a broken database indistinguishable from
     a business that had written nothing down. */
  let knowledgeFailed = false;
  const [entries, brief] = await Promise.all([
    listKnowledge().catch(() => {
      knowledgeFailed = true;
      return [];
    }),
    getBrief().catch(() => ({ body: "", updatedBy: "", updatedAt: null })),
  ]);
  const knowledge = entries
    .map((e) => `## ${e.title}\n\n${e.content}`)
    .join("\n\n---\n\n");

  const persona = `Your name is Steve. You are the assistant inside TLE OS, the
operating system used by The Lettings Experts' partner agents. You appear as a
small character in the corner of every screen and people ask you short,
practical questions while they are in the middle of something else.

If somebody asks who or what you are, you are Steve. Say it plainly and get on
with helping — do not make a performance of the name.

You are given TWO different kinds of material and they must not be confused:

1. THE SYSTEM MAP — how the OS itself works. Generated from the system on every
   boot, so it is always present and always current. How to do a thing, which
   screen does it, what order things happen in, what is wired and what is not:
   you know all of that properly. Answer it fully and confidently.
2. THE KNOWLEDGE BASE — TLE's own written guidance on fees, policies and how
   this office prefers to work. Curated by hand, so it may be thin or empty.

An empty knowledge base does NOT mean you know nothing. It means you cannot
speak to policy. You can always explain the platform.

How to answer:
- Answer from the material below. It is the only thing you actually know about
  how this business works.
- The system map deliberately contains NO figures — if somebody wants a number,
  tell them which screen shows it rather than guessing at it.
- If the material does not cover it, say so in one sentence and say the question
  has been passed to James. Do not guess at a process, a figure, or a policy —
  a confident wrong answer about a landlord or a deal is worse than no answer.
- Never refuse a tour of the system, and never call your own description of it
  guesswork. Showing somebody round is the thing you are best at.
- Be brief. Two or three sentences is usually right. These are people mid-task,
  not readers.
- Plain English, UK spelling, no em dashes. Never invent a figure.
- SHOW, don't just tell. Whenever you name a screen, write it as a markdown
  link on the exact path the system map gives — [Leads](/leads) — and it
  becomes a button that takes them there. The person asking is stuck and the
  rail is what they were already failing to navigate, so pointing at it by name
  and leaving them to find it is half an answer. Only ever use paths from the
  map; anything else is dropped, and an invented one would be a dead button.

YOU CAN LOOK THINGS UP. You have tools that read the live system — properties,
bedrooms and rents, landlords and their phone numbers, compliance, portal
adverts, somebody's whole book. Use them.

- If a question has a factual answer in the business, GO AND GET IT. Do not say
  you cannot look something up, and do not answer a property question from
  memory or from the general guidance. Reach for a tool first and answer from
  what comes back.
- When somebody names a property, call find_property before anything else. You
  need its id, and the address they say out loud is rarely the address REX
  holds — "Kenneth Close" is Kenneth Bradshaw Close, Coventry. If more than one
  candidate comes back, ask which they meant. If none does, say so plainly and
  say where else it might be.
- CHAIN THE TOOLS. "How many bedrooms is X" is find_property then
  property_detail, in one go, without asking permission in between. Somebody
  mid-task does not want to be asked whether you may look.
- A tool that returns "not recorded in REX" has given you a real answer: the
  business does not hold that fact. Say that. It is genuinely useful and it is
  the opposite of a guess. Never fill the gap yourself — bedrooms are missing
  from most of the book, and an invented bedroom count on a live advert is far
  worse than an honest blank.
- A tool that returns an error, or a note, is telling you something the person
  needs to hear. Pass it on in your own words rather than swallowing it.

WHAT YOU STILL CANNOT DO. You cannot change a record, send an email, or write
anything back to REX. That is not squeamishness, it is that those have no undo
and you are one misheard address away from mailing the wrong landlord. If
somebody asks you to send or change something, say plainly that you can't do it
yet, tell them the screen where they can, and link it.`;

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

  /* ── The two kinds of material are NOT interchangeable ──────────────────
   *
   * This block used to say, whenever the knowledge base was empty, "nothing has
   * been written down yet, say plainly you do not have material on this". That
   * was true when the knowledge base was the only thing he had. It stopped
   * being true the moment the system map went in above it, and because it is
   * the LAST thing he reads it quietly cancelled the map: asked for a tour of
   * the platform he said any tour would be "pure fiction", while holding a full
   * description of every screen.
   *
   * So the absence is now scoped to what is actually absent. An empty knowledge
   * base means nobody has written up TLE's own guidance — fees, policies, how
   * this office does a thing. It says nothing about the platform, which is
   * generated from the code on every boot and is always there.
   *
   * A read FAILURE is called out separately. Under the old catch it looked
   * identical to an empty table, so a broken database read would have had him
   * confidently telling agents the business had written nothing down. */
  if (knowledge) {
    blocks.push({
      type: "text",
      text: `TLE's own written guidance, from the knowledge base:\n\n${knowledge}`,
    });
  } else {
    blocks.push({
      type: "text",
      text: knowledgeFailed
        ? `The knowledge base could not be read just now, so TLE's own written
guidance is missing from this conversation. The system map above is still
correct and complete — answer platform questions from it as normal. For a
question about fees, policy or how this office does something, say the
guidance is temporarily unavailable rather than guessing, and that it has
gone to James.`
        : `Nobody has written TLE's own guidance into the knowledge base yet — so
you have no material on fees, policies, or how this office prefers to do a
thing. Say so plainly when you are asked one of those, and that the question
goes to James.

This does NOT apply to the platform. The system map above is generated from the
system itself and is current, so how the OS works, what each screen does, what
is wired and what is not are all things you know properly. Answer those fully
and link the screens. Never tell somebody you cannot show them round.`,
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

/**
 * Exactly what he is told, as one readable document, for the admin console.
 *
 * This exists because of a bug it would have made obvious in seconds. The
 * console showed the system map and nothing else, so it looked complete — while
 * the block AFTER the map, the one covering an empty knowledge base, was
 * telling him he had no material and to say so. He then refused to describe a
 * platform he had a full description of, and the screen meant for diagnosing
 * exactly that was showing the wrong half of the prompt.
 *
 * So the whole assembly is returned, in order, with the blocks labelled. If he
 * says something strange again, the reason is on this page.
 */
export async function systemPromptPreview(): Promise<{
  text: string;
  blocks: number;
  chars: number;
}> {
  const blocks = await systemBlocks();
  const text = blocks
    .map((b, i) => `───── block ${i + 1} of ${blocks.length} ─────\n\n${b.text}`)
    .join("\n\n");
  return { text, blocks: blocks.length, chars: text.length };
}

export type Turn = { role: "user" | "assistant"; text: string };

export interface Answer {
  text: string;
  inTokens: number;
  outTokens: number;
  /** True when the cap or the missing key answered instead of Claude. */
  canned: boolean;
  /** What he actually went and read, in order, for the widget and the log. */
  steps: string[];
}

/**
 * How many times round the tool loop before we stop him.
 *
 * Six is enough for find → detail → contacts → compliance with room to spare,
 * and it is a backstop rather than a budget: the token cap below is the real
 * ceiling. It exists because a model that misreads a tool error can otherwise
 * retry the same call until the cap notices, and the cap is counted in output
 * tokens, which a tight loop of small calls burns slowly.
 */
const MAX_TOOL_ROUNDS = 6;

/** Where the caller is and what they have open, so "this property" resolves. */
export interface AskContext {
  scope: Scope;
  path: string | null;
  openListingId: string | null;
}

/**
 * The screen context, as a message rather than a system block.
 *
 * It CANNOT go in the system prompt. That prompt is one cached prefix and this
 * changes on every message — interpolating it would invalidate the cache on
 * every single request and quietly multiply the bill, which is the exact trap
 * the header of this file warns about. As a leading user-turn note it sits
 * after the breakpoint, changes freely, and costs nothing.
 */
function contextNote(ctx: AskContext): string | null {
  const bits: string[] = [];
  if (ctx.path) bits.push(`They are on the ${ctx.path} screen.`);
  if (ctx.openListingId) {
    bits.push(
      `They have listing ${ctx.openListingId} open in front of them. If they say "this property", "it", or "here", that is the one — use that id directly and do not ask them which property they mean.`
    );
  }
  bits.push(
    ctx.scope.everything
      ? "They can see the whole business."
      : `You are answering as ${ctx.scope.label || "them"}, and may only use their own properties.`
  );
  return bits.length ? `[Context, not from them: ${bits.join(" ")}]` : null;
}

/**
 * Ask, with tools.
 *
 * ── Why this is a hand-written loop ──────────────────────────────────────
 *
 * The SDK ships a tool runner that would drive this for us. Three things kept
 * it hand-written, and if any of them stops being true, switch:
 *
 *   • The daily cap has to be re-checked BETWEEN rounds. A tool loop makes N
 *     model calls per question, and the old code checked the ceiling once,
 *     before the first. Left alone, one question could spend several replies'
 *     worth of tokens past a cap that thinks it is holding.
 *   • Every round's usage has to be ACCUMULATED. The route logs one number per
 *     turn; reporting only the last call's usage would under-report the spend
 *     the cap is counted from, so the meter would drift low forever.
 *   • The widget shows what he is doing. The steps come out of this loop.
 *
 * Streaming is still not worth it: the visible reply is two or three sentences
 * and the wait is the lookups, which the step labels already narrate.
 */
export async function ask(
  history: Turn[],
  question: string,
  ctx: AskContext
): Promise<Answer> {
  if (!assistantConfigured()) {
    return {
      text: "I can't answer on my own yet — your question has gone to James, and the answers become the help centre.",
      inTokens: 0,
      outTokens: 0,
      canned: true,
      steps: [],
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
      steps: [],
    };
  }

  const client = new Anthropic();
  const note = contextNote(ctx);
  const messages: Anthropic.MessageParam[] = [
    ...history.slice(-10).map((t) => ({ role: t.role, content: t.text })),
    { role: "user" as const, content: note ? `${note}\n\n${question}` : question },
  ];

  const system = await systemBlocks();
  const steps: string[] = [];
  let inTokens = 0;
  let outTokens = 0;
  let spent = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    /* The ceiling, re-read every round against what THIS turn has already
       spent. Without the running subtraction a single question could walk
       straight past a cap that was true when it started. */
    const left = b.left - spent;
    if (left <= 0) {
      steps.push("Stopped — daily budget reached");
      break;
    }

    const res = await client.messages.create({
      model: MODEL,
      max_tokens: Math.min(1200, Math.max(200, left)),
      /* Medium, not low. Low is explicitly "fewer and more consolidated tool
         calls" — the right setting when there was nothing to call and the
         wrong one now: it produced an assistant that would rather answer from
         memory than go and look. */
      output_config: { effort: "medium" },
      system,
      tools: TOOL_SCHEMAS,
      messages,
    });

    inTokens += res.usage.input_tokens + (res.usage.cache_read_input_tokens ?? 0);
    outTokens += res.usage.output_tokens;
    spent += res.usage.output_tokens;

    const calls = res.content.filter(
      (c): c is Anthropic.ToolUseBlock => c.type === "tool_use"
    );
    if (!calls.length || res.stop_reason !== "tool_use") {
      const text = houseStyle(
        res.content
          .filter((c): c is Anthropic.TextBlock => c.type === "text")
          .map((c) => c.text)
          .join("\n")
          .trim()
      );
      return {
        text: text || "I couldn't put an answer together for that one — it's gone to James.",
        inTokens,
        outTokens,
        canned: false,
        steps,
      };
    }

    /* The whole assistant turn goes back, tool_use blocks included — dropping
       them breaks the pairing and the next request is rejected. */
    messages.push({ role: "assistant", content: res.content });

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      const input = (call.input ?? {}) as Record<string, unknown>;
      steps.push(labelFor(call.name, input));
      const out = await runTool(call.name, input, {
        scope: ctx.scope,
        path: ctx.path,
        openListingId: ctx.openListingId,
      });
      results.push({
        type: "tool_result",
        tool_use_id: call.id,
        content: JSON.stringify(out),
      });
    }
    /* Every result in ONE user message. Splitting them across several teaches
       him not to ask for things in parallel again. */
    messages.push({ role: "user", content: results });
  }

  /* Ran out of rounds with tools still pending. Say so rather than returning
     an empty bubble that reads as a crash. */
  return {
    text: "I went round in circles on that one and stopped rather than keep going. Ask me again, or a bit more specifically.",
    inTokens,
    outTokens,
    canned: false,
    steps,
  };
}
