import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/**
 * Translation for agents (Amrit Bhogal, 14 Oct 2026: "Please can we add
 * translation function").
 *
 * Two jobs, both one call to Claude through the same SDK Steve uses
 * (lib/assistant-brain), and neither ever sends anything:
 *
 *   in   a customer's message in English, with the language it was written
 *        in named, so the agent can read it and knows what to reply in
 *   out  the agent's English reply put into the customer's language, shown
 *        to the agent to check and use - they press Send themselves
 *
 * Opus 5.5 at low effort: translation is not hard thinking, and a lettings
 * reply has to read like a person wrote it. TRANSLATE_MODEL overrides.
 */

const MODEL = process.env.TRANSLATE_MODEL ?? "claude-opus-5-5";
const MAX_CHARS = 8000;

export class TranslateError extends Error {}

const SYSTEM = `You translate messages for a UK lettings agency, The Letting Experts. The messages are between letting agents and tenants or landlords: enquiries about homes to rent, viewings, referencing, rent, repairs.

Rules:
- Translate faithfully and naturally. Keep the tone: polite stays polite, short stays short.
- Keep names, addresses, postcodes, prices, dates, phone numbers, email addresses and links exactly as written.
- Keep anything in double curly braces, like {{firstName}}, exactly as it is, untranslated.
- Keep line breaks where they are.
- Never add anything of your own: no notes, greetings or explanations that are not in the original.
- Name languages in English, e.g. "Polish", "Romanian", "Portuguese (Brazil)".`;

function client(): Anthropic {
  if (!process.env.ANTHROPIC_API_KEY) throw new TranslateError("Translation isn't connected here.");
  return new Anthropic();
}

function textOf(res: Anthropic.Message): string {
  if (res.stop_reason === "refusal") throw new TranslateError("That message couldn't be translated.");
  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

function clean(text: string): string {
  const t = text.replace(/\r\n/g, "\n").trim();
  if (!t) throw new TranslateError("There's nothing to translate.");
  if (t.length > MAX_CHARS) throw new TranslateError("That's too long to translate in one go. Try a shorter piece.");
  return t;
}

/** Their message, into English. `english` is true when it already was. */
export async function toEnglish(text: string): Promise<{ language: string; english: boolean; translation: string }> {
  const t = clean(text);
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 6000,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            language: { type: "string", description: "The language the message is written in, named in English." },
            english: { type: "boolean", description: "True when the message is already in English." },
            translation: { type: "string", description: "The message in UK English. Empty when it is already in English." },
          },
          required: ["language", "english", "translation"],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: `Say what language this message is in and translate it into UK English.\n\n<message>\n${t}\n</message>` }],
  });
  let out: { language?: unknown; english?: unknown; translation?: unknown };
  try {
    out = JSON.parse(textOf(res));
  } catch {
    throw new TranslateError("That message couldn't be translated just now. Try again.");
  }
  return {
    language: String(out.language ?? "").trim() || "Unknown",
    english: out.english === true,
    translation: String(out.translation ?? "").trim(),
  };
}

/** The agent's English, into the customer's language. */
export async function fromEnglish(text: string, language: string): Promise<string> {
  const t = clean(text);
  const lang = language.trim().slice(0, 60);
  if (!lang) throw new TranslateError("Say which language to translate into.");
  if (/^(uk |british |american )?english$/i.test(lang)) throw new TranslateError("That's already English.");
  const res = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    output_config: { effort: "low" },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `Translate this reply from a letting agent into ${lang}. Answer with the translation only.\n\n<reply>\n${t}\n</reply>`,
      },
    ],
  });
  const out = textOf(res).replace(/^<reply>\s*|\s*<\/reply>$/g, "").trim();
  if (!out) throw new TranslateError("That reply couldn't be translated just now. Try again.");
  return out;
}
