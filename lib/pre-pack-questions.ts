import { noDashes } from "@/lib/no-dashes";

/**
 * EACH AGENT'S OWN PRE-APPRAISAL QUESTIONS (26 Oct 2026 team call).
 *
 * The pack's quick-questions slide (lib/pre-pack, lib/decks/pre-appraisal-
 * pack.html) asked the same four things of every landlord. On the call
 * Stuart asked for a mortgage question, and James: "everyone will have
 * different types of questions ... I'll make them customisable in your
 * sections", with a way to drop the slide for agents who ask on the phone.
 *
 * So each agent keeps their own list in os_user_prefs (Profile > Pre-appraisal),
 * and a pack draws the list of the agent it belongs to, read when the landlord
 * opens it. Nobody who has never touched it has a row: they get DEFAULTS, so
 * a change to the defaults reaches them too.
 *
 * Shared by the settings screen and the server, so nothing here is server-only.
 */

export type PackQuestion = { q: string; options: string[] };

/** What an agent has chosen. `custom` is false while they're on the defaults. */
export type PackQuestionsSetting = { show: boolean; questions: PackQuestion[]; custom: boolean };

export const PRE_PACK_QUESTIONS_PREF = "pre_pack_questions";

/* Six fits the slide on a laptop and a phone without crowding (checked 26 Oct
   with 3, 5 and 6); four answers is all one row of buttons holds. The lengths
   are what still fit one line on the slide. */
export const PACK_Q_LIMITS = { maxQuestions: 6, minOptions: 2, maxOptions: 4, questionChars: 60, optionChars: 22 } as const;

export const DEFAULT_PACK_QUESTIONS: PackQuestion[] = [
  { q: "When would you like it let?", options: ["As soon as possible", "Next month", "I’m flexible"] },
  { q: "Will it be furnished?", options: ["Furnished", "Part furnished", "Unfurnished"] },
  /* In place of "Would you consider pets?" (James, 23 Oct 2026): under the new
     rules a landlord can't simply say no to a pet, so it isn't a real choice. */
  { q: "Is anyone living there now?", options: ["It’s empty", "Tenants are in", "I live there"] },
  { q: "Have you let a home before?", options: ["Yes, myself", "Yes, with an agent", "This is my first"] },
  /* Stuart Roper on the 26 Oct call: "Can you put one on there asking if it's mortgaged or not?" */
  { q: "Is there a mortgage on it?", options: ["Yes", "No", "I’d rather discuss it"] },
];

const clean = (v: unknown, n: number) => noDashes(String(v ?? "").replace(/\s+/g, " ").trim()).slice(0, n).trim();

/** Whatever was sent, made into questions: trimmed, no dashes, blanks dropped, within the limits. */
export function tidyQuestions(raw: unknown): PackQuestion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => {
      const o = (x ?? {}) as { q?: unknown; options?: unknown };
      const options = (Array.isArray(o.options) ? o.options : []).map((v) => clean(v, PACK_Q_LIMITS.optionChars)).filter(Boolean);
      return { q: clean(o.q, PACK_Q_LIMITS.questionChars), options: [...new Set(options)].slice(0, PACK_Q_LIMITS.maxOptions) };
    })
    .filter((x) => x.q || x.options.length)
    .slice(0, PACK_Q_LIMITS.maxQuestions);
}

/** Problems a person can fix, in words. Empty = fine to save. */
export function checkQuestions(qs: PackQuestion[]): string[] {
  const out: string[] = [];
  if (!qs.length) out.push("Add at least one question, or switch the slide off.");
  qs.forEach((x, i) => {
    const n = `Question ${i + 1}`;
    if (!x.q) out.push(`${n} has no words.`);
    if (x.options.length < PACK_Q_LIMITS.minOptions) out.push(`${x.q ? `"${x.q}"` : n} needs at least ${PACK_Q_LIMITS.minOptions} answers to choose from.`);
  });
  return out;
}

const same = (a: PackQuestion[], b: PackQuestion[]) => JSON.stringify(a) === JSON.stringify(b);
export const isDefaultQuestions = (qs: PackQuestion[]) => same(qs, DEFAULT_PACK_QUESTIONS);

/** A stored value read back. Anything broken falls back to the defaults rather than an empty slide. */
export function readSetting(value: unknown): PackQuestionsSetting {
  const v = (value ?? {}) as { show?: unknown; questions?: unknown };
  const qs = tidyQuestions(v.questions);
  const usable = qs.length > 0 && checkQuestions(qs).length === 0;
  return { show: v.show !== false, questions: usable ? qs : DEFAULT_PACK_QUESTIONS, custom: usable && !isDefaultQuestions(qs) };
}
