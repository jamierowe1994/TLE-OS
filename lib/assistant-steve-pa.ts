import "server-only";
import type { AssistantTool } from "@/lib/assistant-tools";
import { upsertKnowledge, listKnowledge } from "@/lib/business/knowledge-store";
import { searchEverything } from "@/lib/search";
import { hasDb, q } from "@/lib/db";
import { noDashes } from "@/lib/no-dashes";
import { neverPress, type ScreenPlan, type ScreenStep } from "@/lib/steve-never";

/**
 * STEVE AS A PERSONAL ASSISTANT (James, 2 Oct 2026): "a literal personal
 * assistant ... every single ability to help them if we can do it on the page
 * ... apart from pushing properties live ... asks questions and learns from
 * them itself ... I don't want it to be reliant on us to feed it the info.
 * I want it to be self-aware and be able to learn on the spot."
 *
 *  - do_on_screen: anything a person can do on the screen in front of them,
 *    he can plan, and their one press does it with their own hands (lib/
 *    screen-controls). Never the push live, never Admin (lib/steve-never).
 *  - learn_this: what somebody teaches him about how the office works goes
 *    into the knowledge base for everybody, at once, with their name on it.
 *  - note_a_gap: what he was asked and could not do is kept for James, so
 *    what to build next is decided by what people actually asked for.
 *  - search_everything: the search bar's own search - leads, people,
 *    applications, deals - so a name finds a person as well as a property.
 */

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

export const LEARNED_SECTION = "Learned from the team";

/* ── do it on their screen ─────────────────────────────────────────────── */

const doOnScreen: AssistantTool = {
  name: "do_on_screen",
  description:
    "Do something on the screen in front of them, with their say-so: type into fields, choose from dropdowns, tick boxes, open tabs and press buttons, in order. Use the refs (s1, s2 ...) from 'On their screen' in the context - nothing else exists. Use it whenever they ask you to fill something in, change something, add something or press something that is on their screen ('put the rent at 1,250', 'mark it as furnished', 'add the viewing', 'fill this in for me'). A card lists the steps and NOTHING happens until they press it, so say what it will do, never that it is done. Controls marked never (going live, publishing to the portals, invites, anything in Admin) are theirs alone: get everything else ready and tell them that button is theirs. If the boxes you need only appear after a press (a tab, a form, a 'Tenant' or 'Landlord' choice), plan that press with then_look_again and you will be shown the new screen to finish the job. If what they want is on another screen, open that file first (open_file) and tell them to ask again once it is open. Never mention refs (s1, s12) to the person - call controls by their words.",
  input_schema: {
    type: "object",
    properties: {
      summary: { type: "string", description: "One line for the card: what this does, e.g. 'Fill in the rent and furnishing, then save.'" },
      steps: {
        type: "array",
        description: "In order. Usually ends with the save button if the screen has one.",
        items: {
          type: "object",
          properties: {
            ref: { type: "string", description: "The control's ref from the screen list, e.g. s12." },
            do: { type: "string", enum: ["type", "choose", "tick", "untick", "press"] },
            value: { type: "string", description: "What to type, or the option to choose. Not needed to press, tick or untick." },
          },
          required: ["ref", "do"],
        },
      },
      then_look_again: {
        type: "boolean",
        description:
          "True when these steps only OPEN what the rest of the job needs (a tab, a form, a drawer, a 'Tenant' choice that reveals the boxes). After they run you are shown the new screen and asked to carry on, so do the opening now and the filling in next.",
      },
    },
    required: ["summary", "steps"],
  },
  label: () => "Getting that ready on your screen…",
  async run(input, ctx) {
    const screen = ctx.screen;
    if (!screen?.controls.length) return { error: "I can't see their screen on this message. Tell them where to click instead." };
    const raw = Array.isArray(input.steps) ? (input.steps as Record<string, unknown>[]) : [];
    if (!raw.length) return { error: "A plan needs at least one step." };
    if (raw.length > 25) return { error: "That is too many steps for one go - do the first part and offer the rest." };
    const byRef = new Map(screen.controls.map((c) => [c.ref, c]));
    const steps: ScreenStep[] = [];
    for (const r of raw) {
      const ref = str(r.ref);
      const act = str(r.do) as ScreenStep["do"];
      const value = noDashes(str(r.value)).slice(0, 4000);
      const c = byRef.get(ref);
      if (!c) return { error: `There is no ${ref || "control"} on their screen. Use only the refs listed.` };
      const name = c.label.slice(0, 50);
      if (act === "press" || act === "tick" || act === "untick") {
        if (c.never || neverPress(c.label, ctx.path)) {
          return {
            error: `"${name}" is never yours to press - going live, publishing, invites and Admin are theirs alone. Plan everything up to it, and tell them that last button is theirs.`,
          };
        }
      }
      if (act === "type") {
        if (!["text", "number", "date", "textarea"].includes(c.kind)) return { error: `${name} is not a box you can type into.` };
        steps.push({ ref, do: act, value, says: value ? `Type "${value.length > 60 ? `${value.slice(0, 57)}...` : value}" into ${name}` : `Clear ${name}` });
      } else if (act === "choose") {
        if (c.kind !== "select") return { error: `${name} is not a dropdown. If it is a button that opens a list, press it, then ask again.` };
        const opt = c.options?.find((o) => o.toLowerCase() === value.toLowerCase()) ?? c.options?.find((o) => o.toLowerCase().includes(value.toLowerCase()));
        if (c.options?.length && !opt) return { error: `${name} has no "${value}". Its choices are: ${c.options.join(", ")}.` };
        steps.push({ ref, do: act, value: opt ?? value, says: `Choose ${opt ?? value} in ${name}` });
      } else if (act === "tick" || act === "untick") {
        steps.push({ ref, do: act, says: `${act === "tick" ? "Tick" : "Untick"} ${name}` });
      } else if (act === "press") {
        steps.push({ ref, do: act, says: `Press ${name}` });
      } else return { error: `"${act}" is not something you can do. Use type, choose, tick, untick or press.` };
    }
    const plan: ScreenPlan = {
      summary: noDashes(str(input.summary)).slice(0, 200) || "Do this on your screen",
      steps,
      ...(input.then_look_again === true ? { carryOn: true } : {}),
    };
    return {
      __screen: plan,
      note: "A card with these steps is on their screen. Nothing has happened yet - it runs when they press Do it, and they watch each step. Say in one line what it will do. Never say it is done.",
    };
  },
};

export function screenPlanIn(result: unknown): ScreenPlan | null {
  const p = (result as { __screen?: unknown } | null)?.__screen as ScreenPlan | undefined;
  return p && Array.isArray(p.steps) && p.steps.length ? p : null;
}

/* ── learn it for everybody ────────────────────────────────────────────── */

const learnThis: AssistantTool = {
  name: "learn_this",
  description:
    "Save something you have just been taught about how The Letting Experts works, so you know it for EVERYBODY from the next question on: a process ('we always ring the landlord before sending the deck'), who does what ('Kirstie handles all referencing'), a rule, a local fact about the patch, a correction to something you got wrong. Call it as soon as somebody tells you how the office does a thing, answers a question you asked them, or corrects you - do not wait to be asked. Pass the same title to replace an earlier lesson. NOT for a fact about one property, tenant or landlord (that belongs on the record), never anything personal or sensitive, and never figures you have not been given. For how one person likes to work, use remember_about_them instead.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "A short plain heading, e.g. 'Who does referencing'." },
      lesson: { type: "string", description: "What you learned, in a few plain sentences, as a rule you can follow." },
    },
    required: ["title", "lesson"],
  },
  label: () => "Learning that for everyone…",
  async run(input, ctx) {
    const title = noDashes(str(input.title)).slice(0, 120);
    const lesson = noDashes(str(input.lesson)).slice(0, 2000);
    if (!title || !lesson) return { error: "Nothing to learn." };
    const who = ctx.me?.name || ctx.me?.email || "a member of the team";
    const when = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" });
    const existing = (await listKnowledge().catch(() => [])).find((e) => e.section === LEARNED_SECTION && e.title.toLowerCase() === title.toLowerCase());
    await upsertKnowledge({
      id: existing?.id ?? null,
      title,
      content: `${lesson}\n\nTaught by ${who} on ${when}.`,
      section: LEARNED_SECTION,
      updatedBy: ctx.me?.email ?? "steve",
    });
    return {
      ok: existing ? "Updated what you knew." : "Learned, for everybody.",
      note: "Thank them in a few words and say you will know it from now on. It is on the Knowledge page under Learned from the team, where it can be changed.",
    };
  },
};

/* ── what he could not do ──────────────────────────────────────────────── */

const GAPS_USER = "__steve";
const GAPS_KEY = "steve.gaps";
export type Gap = { at: string; who: string; asked: string; why: string };

export async function listGaps(): Promise<Gap[]> {
  if (!hasDb()) return [];
  const rows = await q<{ value: { gaps?: Gap[] } }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [GAPS_USER, GAPS_KEY]).catch(() => []);
  return rows[0]?.value?.gaps ?? [];
}

const noteAGap: AssistantTool = {
  name: "note_a_gap",
  description:
    "Tell James about something you were asked to DO or find and could not, because you have no tool or screen for it (not because a fact was missing). It goes on his list of what to teach you next. Call it whenever you have to say 'I can't do that yet', then tell them the closest thing you CAN do.",
  input_schema: {
    type: "object",
    properties: {
      asked: { type: "string", description: "What they wanted, in their words, short." },
      why: { type: "string", description: "What you would need to do it." },
    },
    required: ["asked"],
  },
  label: () => "Passing that to James…",
  async run(input, ctx) {
    if (!hasDb()) return { ok: "Noted." };
    const gap: Gap = {
      at: new Date().toISOString(),
      who: ctx.me?.name || ctx.me?.email || "someone",
      asked: noDashes(str(input.asked)).slice(0, 300),
      why: noDashes(str(input.why)).slice(0, 300),
    };
    if (!gap.asked) return { error: "Say what they asked for." };
    const gaps = [...(await listGaps()), gap].slice(-200);
    await q(
      `INSERT INTO os_user_prefs (user_id, key, value, updated_at) VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [GAPS_USER, GAPS_KEY, JSON.stringify({ gaps })]
    );
    return { ok: "On James's list." };
  },
};

/* ── search everything ─────────────────────────────────────────────────── */

const searchAll: AssistantTool = {
  name: "search_everything",
  description:
    "The search bar's own search across their book: properties, leads, applications, deals, certificates and people, by address, name, email or phone. Call it when they name a PERSON ('find Mrs Patel', 'who is 07700 900123', 'the lead from Rightmove yesterday called Tom') or anything that is not plainly a property address. Each hit has a link that opens it - write it as a markdown link so it becomes a button.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "A name, address, email or phone number." } },
    required: ["query"],
  },
  label: (i) => `Searching for ${str(i.query) || "that"}…`,
  async run(input, ctx) {
    const needle = str(input.query);
    if (needle.length < 2) return { error: "Give me at least two letters." };
    if (ctx.scope.unlinked && !ctx.scope.everything) return { error: "Their account isn't linked to their agent record, so there is nothing of theirs to search. James can link it." };
    const hits = await searchEverything(needle, ctx.scope.everything ? null : ctx.scope.rexUserId);
    return hits.length
      ? { found: hits.length, hits: hits.slice(0, 12).map((h) => ({ what: h.kind, name: h.title, detail: h.sub, opens: h.href })) }
      : { found: 0, note: "Nothing on their book matches. Say so, and ask for another detail (an email or phone number finds people best)." };
  },
};

export const PA_TOOLS: AssistantTool[] = [doOnScreen, learnThis, noteAGap, searchAll];
