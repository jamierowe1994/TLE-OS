import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { aiCreate } from "@/lib/ai";
import { q } from "@/lib/db";
import type { OsUser } from "@/lib/users";
import { listTemplates } from "@/lib/message-templates";
import {
  ACTIONS, AUTOMATION_STARTERS, CONDITIONS, TRIGGERS, MAX_WAIT_HOURS,
  clean, describe, problems, titleCase, type AutomationDef,
} from "@/lib/automations/catalogue";

/**
 * THE CHAT BUILDER. "When a new tenant enquiry comes in on my listings and
 * they haven't booked a viewing in two days, email them my other homes
 * nearby" in; a draft automation out, for the agent to check in the editor.
 *
 * It can only pick from the menu in lib/automations/catalogue - the tool's
 * schema is built from it - and what comes back is cleaned and checked by the
 * same rules as the editor. It NEVER switches anything on: the route saves
 * nothing, it hands the draft to the screen.
 *
 * Through lib/ai.ts as "automation-builder", so its model is chosen there and
 * its spend shows on Admin, AI costs.
 */

export type ChatTurn = { role: "user" | "assistant"; text: string };

export interface BuildResult {
  reply: string;
  draft: AutomationDef | null;
  name: string;
  sentence: string | null;
  problems: string[];
  /** What they asked for that the OS can't do yet - for the screen, and for James. */
  cant: string[];
}

function menu(templates: { id: string; name: string }[], rooms: string[], people: { id: string; name: string }[]): string {
  const f = (fields: { key: string; label: string; kind: string; options?: { value: string }[]; default?: unknown }[]) =>
    fields.length ? ` params: ${fields.map((x) => `${x.key} (${x.label}${x.options ? `: ${x.options.map((o) => o.value).join("|")}` : ""}${x.default !== undefined ? `, default ${x.default}` : ""})`).join("; ")}` : "";
  return [
    "TRIGGERS (exactly one):",
    ...TRIGGERS.map((t) => `- ${t.key}: ${t.label}. ${t.help} Person handed to actions: ${t.person}.${f(t.fields)}`),
    "",
    "CONDITIONS (any number, all must hold; checked after the wait, at the moment of acting):",
    ...CONDITIONS.map((c) => `- ${c.key}: ${c.label}. Works with: ${c.on.join(", ")}.${f(c.fields)}`),
    "",
    "ACTIONS (one or more, in order):",
    ...ACTIONS.map((a) => `- ${a.key}: ${a.label}.${a.needsPerson ? " Needs a trigger with a person." : ""}${f(a.fields)}`),
    "",
    "EMAIL params.template is one of:",
    `- custom (write subject and body yourself)`,
    `- homes-nearby (the agent's other live homes within five miles, as photo cards; tenants only; no subject/body needed)`,
    ...AUTOMATION_STARTERS.map((s) => `- ${s.id}: ${s.name} (for ${s.person})`),
    ...templates.map((t) => `- msg:${t.id}: ${t.name} (their own template)`),
    "",
    `Huddles they can post in: ${rooms.length ? rooms.join(", ") : "none"}.`,
    `People for notify.who: "me" or one of ${people.map((p) => `${p.id} (${p.name})`).join(", ")}.`,
    `waitHours: 0 to ${MAX_WAIT_HOURS}. "In 2 days" or "after 2 days" is 48.`,
  ].join("\n");
}

const STEP = {
  type: "object",
  properties: { key: { type: "string" }, params: { type: "object", additionalProperties: { type: ["string", "number"] } } },
  required: ["key", "params"],
};

const TOOL: Anthropic.Tool = {
  name: "draft_automation",
  description: "Draft the automation for the agent to check. Nothing is switched on by this.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "What you say back: one or two short sentences, plain UK English, no long dashes, no emoji. Say what it will do and anything you assumed. If it can't be built, say why kindly." },
      name: { type: "string", description: "A short Title Case name, 2-5 words, e.g. Chase Quiet Enquirers." },
      buildable: { type: "boolean", description: "False when nothing sensible can be built from the menu." },
      trigger: STEP,
      conditions: { type: "array", items: STEP },
      waitHours: { type: "number" },
      actions: { type: "array", items: STEP },
      cant: { type: "array", items: { type: "string" }, description: "Anything they asked for that is not on the menu, in a few words each (e.g. 'write to REX', 'WhatsApp')." },
    },
    required: ["reply", "name", "buildable", "trigger", "conditions", "waitHours", "actions", "cant"],
  },
};

export async function buildFromChat(p: { me: OsUser; turns: ChatTurn[]; current: AutomationDef | null }): Promise<BuildResult> {
  const templates = (await listTemplates().catch(() => [])).map((t) => ({ id: t.id, name: t.name }));
  const rooms = await q<{ name: string }>(
    `SELECT r.name FROM os_team_rooms r WHERE r.kind = 'general' OR EXISTS (SELECT 1 FROM os_team_members m WHERE m.room_id = r.id AND m.user_id = $1) ORDER BY r.name LIMIT 30`,
    [p.me.id]
  ).catch(() => []);
  const people = await q<{ id: string; name: string }>(`SELECT id, name FROM os_users WHERE locked_at IS NULL ORDER BY name LIMIT 60`).catch(() => []);

  const system = [
    `You are Steve, the assistant inside TLE OS, the system The Letting Experts' agents run their lettings on. You build automations for ${p.me.name || "an agent"}, a letting agent working their own book.`,
    "Turn what they ask into ONE automation by calling draft_automation, using only the menu below. Pick the closest trigger, add conditions for anything like 'if they haven't', 'still', 'only when', and a wait for 'after N days'. Prefer the agent's own words for custom messages, written warmly and briefly in UK English, signed off with {{agent}} and The Letting Experts, never with long dashes. Use {{firstName}}, {{address}}, {{agent}} merge fields only.",
    "An automation only ever acts on the agent's own book. It never writes to REX, PayProp or Propoly, and it never switches itself on - the agent checks it and switches it on.",
    "If something they ask for is not on the menu, build the nearest useful version and list the missing part in cant. If a current draft is given, change it as asked rather than starting again.",
    `Today is ${new Date().toLocaleDateString("en-GB", { timeZone: "Europe/London", weekday: "long", day: "numeric", month: "long", year: "numeric" })}.`,
    "",
    menu(templates, rooms.map((r) => r.name), people),
  ].join("\n");

  const turns = p.turns.slice(-10).filter((t) => t.text.trim());
  const messages: Anthropic.MessageParam[] = turns.map((t) => ({ role: t.role, content: t.text.slice(0, 2000) }));
  if (p.current) {
    const last = messages[messages.length - 1];
    if (last?.role === "user") last.content = `${last.content}\n\n[The draft on screen now: ${JSON.stringify(p.current)}]`;
  }
  if (!messages.length || messages[0].role !== "user") messages.unshift({ role: "user", content: "Help me build an automation." });

  const res = await aiCreate("automation-builder", {
    max_tokens: 6000,
    system,
    tools: [TOOL],
    tool_choice: { type: "tool", name: TOOL.name },
    messages,
  });
  const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL.name);
  if (!call) {
    const text = res.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text ?? "";
    return { reply: text.trim() || "I couldn't put that together. Try saying what should start it and what it should do.", draft: null, name: "", sentence: null, problems: [], cant: [] };
  }
  const input = call.input as { reply?: string; name?: string; buildable?: boolean; trigger?: unknown; conditions?: unknown; waitHours?: unknown; actions?: unknown; cant?: string[] };
  const cant = Array.isArray(input.cant) ? input.cant.map(String).slice(0, 6) : [];
  const reply = String(input.reply ?? "").replace(/—/g, "-").trim();
  if (input.buildable === false) return { reply: reply || "That isn't something an automation can do yet.", draft: null, name: "", sentence: null, problems: [], cant };
  const draft = clean({ trigger: input.trigger, conditions: input.conditions, waitHours: input.waitHours, actions: input.actions });
  /* No long dashes in anything a customer reads, whatever the model wrote. */
  for (const a of draft.actions) for (const k of Object.keys(a.params)) if (typeof a.params[k] === "string") a.params[k] = String(a.params[k]).replace(/—/g, "-");
  return {
    reply,
    draft,
    name: titleCase(String(input.name ?? "").replace(/—/g, "-")).slice(0, 80),
    sentence: describe(draft),
    problems: problems(draft),
    cant,
  };
}
