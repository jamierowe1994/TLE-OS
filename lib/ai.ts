import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hasDb, q } from "@/lib/db";

/**
 * Every call the OS makes to Claude goes through here.
 *
 * ── Why one place ──────────────────────────────────────────────────────────
 *
 * Until 20 Oct 2026 each feature named its own model, so the OS ran Opus 4.8,
 * Opus 5, Opus 5.5, Sonnet 5.5 and Haiku 4.5 side by side - whatever was
 * current the week each one was built. The bill ran out that afternoon and
 * nobody could say which feature had spent it.
 *
 * So the model for each feature is chosen here, from a head-to-head on that
 * feature's real work (docs/AI-MODELS.md has the results), and can be changed
 * on Railway without a deploy:
 *
 *   AI_MODEL_<FEATURE>   e.g. AI_MODEL_PLC_SCAN=claude-opus-5-5
 *   AI_EFFORT_<FEATURE>  e.g. AI_EFFORT_STEVE=high
 *
 * And every call is written to os_ai_usage, so Admin > AI costs can show what
 * each feature spent this month from live figures rather than a guess.
 *
 * ── What the newer models changed (the reason for aiCreate) ───────────────
 *
 *   - Thinking is always on for Opus 5.5 and on by default for Haiku 5.5 and
 *     Sonnet 5.5. Effort is the control, so it is set explicitly per feature,
 *     and max_tokens has to leave room for the thinking as well as the answer.
 *   - Opus 5.5 and Sonnet 5.5 refuse a forced tool_choice with a 400. A
 *     forced call becomes "auto" plus an instruction, and if the model still
 *     answers in prose it is asked once more.
 *   - Opus 5.5 and Sonnet 5.5 can decline on a safety classifier with
 *     stop_reason "refusal". Those calls carry the server-side fallback, so a
 *     false positive is answered by another model rather than not at all.
 *     Haiku 5.5 has no server-side fallback; its refusals reach the caller,
 *     which already treats "no answer" as "a person reads it".
 */

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";

export type AiFeature =
  | "steve"
  | "steve-brief"
  | "knowledge-links"
  | "library-reader"
  | "plc-scan"
  | "plc-sorter"
  | "cert-reader"
  | "cert-register"
  | "epc-reader"
  | "advert"
  | "listing-autofill"
  | "bond-ask"
  | "planning-reader"
  | "translate";

type Spec = {
  label: string;
  /** Suffix for AI_MODEL_ / AI_EFFORT_. */
  key: string;
  model: string;
  effort: Effort;
  /** An env var that named this feature's model before 20 Oct 2026, still honoured. */
  legacy?: string;
};

/**
 * The chosen model per feature, and why, is in docs/AI-MODELS.md. Change a
 * default here only with a comparison behind it; for a quick switch back, set
 * the env var instead.
 */
export const AI_FEATURES: Record<AiFeature, Spec> = {
  steve: { label: "Steve (chat)", key: "STEVE", model: "claude-opus-5-5", effort: "medium" },
  "steve-brief": { label: "Steve's morning brief", key: "STEVE_BRIEF", model: "claude-haiku-5-5", effort: "low" },
  "knowledge-links": { label: "Steve reading links", key: "KNOWLEDGE_LINKS", model: "claude-haiku-5-5", effort: "low" },
  "library-reader": { label: "Marketing library reader", key: "LIBRARY_READER", model: "claude-sonnet-5-5", effort: "high" },
  "plc-scan": { label: "PLC document check", key: "PLC_SCAN", model: "claude-sonnet-5-5", effort: "medium" },
  "plc-sorter": { label: "PLC file sorter", key: "PLC_SORTER", model: "claude-sonnet-5-5", effort: "low", legacy: "PLC_SORTER_MODEL" },
  "cert-reader": { label: "Certificate reader", key: "CERT_READER", model: "claude-haiku-5-5", effort: "low", legacy: "CERT_READER_MODEL" },
  "cert-register": { label: "Engineer register reader", key: "CERT_REGISTER", model: "claude-haiku-5-5", effort: "low", legacy: "CERT_READER_MODEL" },
  "epc-reader": { label: "EPC reader", key: "EPC_READER", model: "claude-haiku-5-5", effort: "low", legacy: "CERT_READER_MODEL" },
  advert: { label: "Advert writer", key: "ADVERT", model: "claude-opus-5-5", effort: "medium", legacy: "ADVERT_WRITER_MODEL" },
  "listing-autofill": { label: "Listing auto-fill", key: "LISTING_AUTOFILL", model: "claude-opus-5-5", effort: "medium", legacy: "ADVERT_WRITER_MODEL" },
  "bond-ask": { label: "Ask Bond", key: "BOND_ASK", model: "claude-opus-5-5", effort: "medium" },
  "planning-reader": { label: "Planning reader", key: "PLANNING_READER", model: "claude-sonnet-5-5", effort: "low" },
  translate: { label: "Translation", key: "TRANSLATE", model: "claude-opus-5-5", effort: "low", legacy: "TRANSLATE_MODEL" },
};

const EFFORTS: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function aiModel(feature: AiFeature): string {
  const s = AI_FEATURES[feature];
  return (process.env[`AI_MODEL_${s.key}`] || (s.legacy && process.env[s.legacy]) || s.model).trim();
}

export function aiEffort(feature: AiFeature): Effort {
  const v = process.env[`AI_EFFORT_${AI_FEATURES[feature].key}`]?.trim() as Effort | undefined;
  return v && EFFORTS.includes(v) ? v : AI_FEATURES[feature].effort;
}

/* ── What each model accepts ──────────────────────────────────────────────── */

/** Haiku 4.5 and older take no effort parameter and a manual thinking budget. */
const LEGACY = /haiku-4|sonnet-4-5|opus-4-[015]|claude-3/;
/** Models that think by default. A forced tool call stops them thinking first
 *  (and Opus 5.5 / Sonnet 5.5 refuse one with a 400), so for these it is lifted. */
const THINKS = /opus-5|sonnet-5|haiku-5|fable-5|mythos-5/;
/** Models the server-side refusal fallback ("default" form) is offered for. */
const HAS_FALLBACK = /opus-5|sonnet-5-5|fable-5/;

/**
 * Per million tokens, US dollars, from Anthropic's price list on 20 Oct 2026.
 * Used only to turn the token counts in os_ai_usage into a monthly figure on
 * Admin > AI costs; the tokens are what is recorded. Haiku 5.5 is the rate
 * for prompts up to 100K tokens (every OS prompt is well under).
 */
export const PRICES: Record<string, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  "claude-fable-5-1": { in: 10, out: 50, cacheRead: 0.25, cacheWrite: 12.5 },
  "claude-opus-5-5": { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-opus-5": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { in: 5, out: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-sonnet-5-5": { in: 2, out: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1, cacheWrite: 1.25 },
};

/** The price row for a model id as the API reports it (dated ids included). */
export function priceFor(model: string) {
  const id = Object.keys(PRICES)
    .sort((a, b) => b.length - a.length)
    .find((k) => model.startsWith(k));
  return id ? PRICES[id] : null;
}

export type Usage = { in: number; out: number; cacheRead: number; cacheWrite: number };

export function costOf(model: string, u: Usage): number | null {
  const p = priceFor(model);
  if (!p) return null;
  return (u.in * p.in + u.out * p.out + u.cacheRead * p.cacheRead + u.cacheWrite * p.cacheWrite) / 1_000_000;
}

/* ── The call ─────────────────────────────────────────────────────────────── */

export type AiParams = Omit<Anthropic.MessageCreateParamsNonStreaming, "model">;

let shared: Anthropic | null = null;
const defaultClient = () => (shared ??= new Anthropic());

/**
 * messages.create for one feature: its model and effort, the fallback where
 * one exists, a forced tool call turned into one the newer models accept, and
 * the usage written down.
 *
 * `model` / `effort` override the feature's choice - the PLC bench uses them
 * to put three models side by side on the same document.
 */
export async function aiCreate(
  feature: AiFeature,
  params: AiParams,
  opts: { client?: Anthropic; model?: string; effort?: Effort } = {}
): Promise<Anthropic.Message> {
  const client = opts.client ?? defaultClient();
  const model = opts.model ?? aiModel(feature);
  const legacy = LEGACY.test(model);
  const body: Anthropic.MessageCreateParamsNonStreaming = { ...params, model };

  if (!legacy) {
    body.output_config = { ...params.output_config, effort: opts.effort ?? aiEffort(feature) };
  }

  /* A forced tool call. The newer models think first when the choice is left
     to them, which is what a careful read wants, so the force is lifted for
     all of them rather than only the ones that refuse it. */
  const forced = params.tool_choice?.type === "tool" ? params.tool_choice.name : null;
  if (forced && THINKS.test(model)) {
    body.tool_choice = { type: "auto" };
    body.system = withLine(params.system, `Answer by calling the ${forced} tool, once. Do not answer in prose.`);
  }

  let res = await send(client, body, feature);
  if (forced && body.tool_choice?.type === "auto" && !called(res, forced) && res.stop_reason === "end_turn") {
    /* Answered in prose. Asked once more, as a new user turn after its reply,
       which is the shape every model accepts. */
    res = await send(
      client,
      {
        ...body,
        messages: [
          ...body.messages,
          { role: "assistant", content: res.content as Anthropic.ContentBlockParam[] },
          { role: "user", content: `Now call the ${forced} tool with what you found.` },
        ],
      },
      feature
    );
  }
  return res;
}

async function send(client: Anthropic, body: Anthropic.MessageCreateParamsNonStreaming, feature: AiFeature): Promise<Anthropic.Message> {
  let res: Anthropic.Message;
  if (HAS_FALLBACK.test(body.model)) {
    res = (await client.beta.messages.create({
      ...(body as unknown as Anthropic.Beta.Messages.MessageCreateParamsNonStreaming),
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })) as unknown as Anthropic.Message;
  } else {
    res = await client.messages.create(body);
  }
  void logUsage(feature, res);
  for (const fn of listeners) fn(feature, res);
  return res;
}

const listeners: Array<(feature: AiFeature, res: Anthropic.Message) => void> = [];
/** Every response as it arrives - for scripts/ai-compare to count what a run cost. */
export function onAiResponse(fn: (feature: AiFeature, res: Anthropic.Message) => void) {
  listeners.push(fn);
}

function called(res: Anthropic.Message, name: string): boolean {
  return res.content.some((b) => b.type === "tool_use" && b.name === name);
}

function withLine(system: AiParams["system"], line: string): AiParams["system"] {
  if (!system) return line;
  if (typeof system === "string") return `${system}\n\n${line}`;
  return [...system, { type: "text", text: line }];
}

/* ── The meter ────────────────────────────────────────────────────────────── */

export function usageOf(res: Anthropic.Message): Usage {
  const u = res.usage;
  return {
    in: u.input_tokens ?? 0,
    out: u.output_tokens ?? 0,
    cacheRead: u.cache_read_input_tokens ?? 0,
    cacheWrite: u.cache_creation_input_tokens ?? 0,
  };
}

/** One row per call. Never throws: a meter that breaks a feature costs more than it saves. */
async function logUsage(feature: AiFeature, res: Anthropic.Message): Promise<void> {
  if (!hasDb()) return;
  try {
    const u = usageOf(res);
    await q(
      `INSERT INTO os_ai_usage (feature, model, in_tokens, out_tokens, cache_read, cache_write, stop_reason)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [feature, res.model, u.in, u.out, u.cacheRead, u.cacheWrite, res.stop_reason ?? null]
    );
  } catch (e) {
    console.error("[ai usage]", e instanceof Error ? e.message : e);
  }
}
