import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import type { NextRequest } from "next/server";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { record } from "@/lib/audit";
import { aiCreate } from "@/lib/ai";
import { lookFor } from "@/lib/new-look-store";
import type { OsUser } from "@/lib/users";
import { EDITIONS, editionFor, sendingEditionId } from "@/lib/terms/catalogue";
import { applyOps, changesBetween, isWords, LOCKED_SAYS, PLACEHOLDERS, revert, stripIds, withIds, wordsOf, type Change, type ESection, type Op } from "@/lib/terms/edit";
import { dropDraft, ensureRevisions, getDraft, listRevisions, publishRevision, revisionSections, saveDraft, type ChatLine, type Revision } from "@/lib/terms/revisions";
import type { Country } from "@/lib/terms/types";

/**
 * My Business > Contracts (James, 26 Nov 2026): the desk where the Terms of
 * Business are changed. The contract on the left, an assistant on the right;
 * every change is shown against the published wording and has to be ticked
 * before the contract can be saved. A save makes a new version that agents'
 * next sends use. Rules for what may change: lib/terms/edit.
 *
 * WHO: named people, not a role, for the reason the deposit register is
 * (lib/deposit-access). James's answer at intake was "Susan and you only";
 * the owners' role is four people. Everyone who can open Admin counts, plus
 * the addresses in os_settings "contract_editors", which an admin sets on the
 * screen itself. Decided on the ACTOR, never a view-as subject.
 */

const KEY = "contract_editors";

const emails = (list: unknown): string[] =>
  Array.isArray(list) ? [...new Set(list.map((e) => String(e ?? "").trim().toLowerCase()).filter((e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)))] : [];

export async function contractEditors(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ value: { emails?: unknown } | null }>(`SELECT value FROM os_settings WHERE key = $1`, [KEY]).catch(() => []);
  return emails(rows[0]?.value?.emails);
}

export async function setContractEditors(list: string[], by: string): Promise<string[]> {
  const clean = emails(list).slice(0, 20);
  await q(
    `INSERT INTO os_settings (key, value, updated_at, updated_by) VALUES ($1, $2::jsonb, NOW(), $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = EXCLUDED.updated_by`,
    [KEY, JSON.stringify({ emails: clean }), by]
  );
  return clean;
}

export const isContractAdmin = (u: Pick<OsUser, "role">): boolean => can(u.role, "admin:open");

/** The signed-in person, if the contracts desk is theirs: the switch on for them, and named or an admin. */
export async function contractActor(req: NextRequest): Promise<OsUser | null> {
  const { actor } = await whoIs(req);
  if (!actor) return null;
  const look = await lookFor(actor).catch(() => null);
  if (!look?.contracts) return null;
  if (isContractAdmin(actor)) return actor;
  const e = (actor.email ?? "").trim().toLowerCase();
  return e && (await contractEditors()).includes(e) ? actor : null;
}

/* ------------------------------- the state ------------------------------- */

export interface DeskState {
  country: Country;
  /** The edition agents send for this country, and the version of it that is live. */
  editionId: string;
  publishedId: string;
  title: string;
  subtitle: string;
  editionLabel: string;
  /** The published contract, with ids. */
  base: ESection[];
  /** The working copy, or the published contract when nothing is being changed. */
  sections: ESection[];
  changes: Change[];
  ticks: string[];
  chat: ChatLine[];
  /** A save elsewhere replaced the contract this working copy started from. */
  stale: boolean;
  draftBy: string | null;
  draftAt: string | null;
  history: Revision[];
}

async function published(country: Country) {
  await ensureRevisions(true);
  const editionId = sendingEditionId(country);
  /* `true`: the edition agents send, the November wording where there is one. */
  const doc = editionFor(country, true);
  if (!editionId || !doc) throw new Error("There are no terms for that country yet.");
  return { editionId, doc, base: withIds(doc.sections) };
}

export async function deskState(country: Country): Promise<DeskState> {
  const { editionId, doc, base } = await published(country);
  const [draft, history] = await Promise.all([getDraft(country), listRevisions(country)]);
  const stale = Boolean(draft && draft.fromId !== doc.id);
  const live = draft && !stale ? draft : null;
  const sections = live ? live.sections : base;
  const changes = live ? changesBetween(base, sections) : [];
  const keys = new Set(changes.map((c) => c.key));
  return {
    country,
    editionId,
    publishedId: doc.id,
    title: doc.title,
    subtitle: doc.subtitle,
    editionLabel: doc.edition,
    base,
    sections,
    changes,
    ticks: live ? live.ticks.filter((k) => keys.has(k)) : [],
    chat: draft?.chat ?? [],
    stale,
    draftBy: draft?.by ?? null,
    draftAt: draft?.at ?? null,
    history: history.filter((h) => h.edition === editionId),
  };
}

/** The working copy to change: the saved one if it still fits the published contract, else a fresh one. */
async function working(country: Country) {
  const { doc, base } = await published(country);
  const draft = await getDraft(country);
  if (draft && draft.fromId !== doc.id) throw new DeskRefused("The contract was saved by someone else since you started. Discard your working copy to carry on from the new wording.");
  return { doc, base, sections: draft?.sections ?? base, ticks: draft?.ticks ?? [], chat: draft?.chat ?? [] };
}

export class DeskRefused extends Error {}

const prune = (base: ESection[], sections: ESection[], ticks: string[]): string[] => {
  const keys = new Set(changesBetween(base, sections).map((c) => c.key));
  return ticks.filter((k) => keys.has(k));
};

/** Edits typed straight into the contract, or the assistant's. */
export async function applyEdits(country: Country, ops: Op[], by: string, said?: ChatLine[]): Promise<{ problems: string[]; applied: number }> {
  const w = await working(country);
  const out = applyOps(w.base, w.sections, ops);
  await saveDraft({ country, fromId: w.doc.id, sections: out.sections, ticks: prune(w.base, out.sections, w.ticks), chat: [...w.chat, ...(said ?? [])], by });
  return { problems: out.problems, applied: out.applied };
}

export async function setTick(country: Country, key: string, on: boolean, by: string): Promise<void> {
  const w = await working(country);
  const keys = new Set(changesBetween(w.base, w.sections).map((c) => c.key));
  if (!keys.has(key)) throw new DeskRefused("That change has moved on. Look at it again before you tick it.");
  const ticks = on ? [...new Set([...w.ticks, key])] : w.ticks.filter((k) => k !== key);
  await saveDraft({ country, fromId: w.doc.id, sections: w.sections, ticks, chat: w.chat, by });
}

export async function revertChange(country: Country, key: string, by: string): Promise<void> {
  const w = await working(country);
  const change = changesBetween(w.base, w.sections).find((c) => c.key === key);
  if (!change) return;
  const sections = revert(w.base, w.sections, change);
  await saveDraft({ country, fromId: w.doc.id, sections, ticks: prune(w.base, sections, w.ticks), chat: w.chat, by });
}

export async function discard(country: Country): Promise<void> {
  await dropDraft(country);
}

/** Save the working copy as the contract agents send from now on. Every change must be ticked. */
export async function saveContract(country: Country, me: OsUser, note: string): Promise<string> {
  const w = await working(country);
  const changes = changesBetween(w.base, w.sections);
  if (!changes.length) throw new DeskRefused("Nothing has been changed.");
  const ticked = new Set(w.ticks);
  const waiting = changes.filter((c) => !ticked.has(c.key)).length;
  if (waiting) throw new DeskRefused(`${waiting} ${waiting === 1 ? "change still needs" : "changes still need"} your tick.`);
  const id = await publishRevision(country, stripIds(w.sections), changes, note, me.email);
  await dropDraft(country);
  await record({ kind: "switch_changed", actorId: me.id, actorEmail: me.email, detail: `Terms of Business (${country}) saved as ${id}: ${changes.length} ${changes.length === 1 ? "change" : "changes"}` }).catch(() => {});
  return id;
}

/** Go back to a version saved earlier: its wording becomes a new version, so the history stays whole. */
export async function restoreVersion(country: Country, revisionId: string | "original", me: OsUser): Promise<string> {
  const editionId = sendingEditionId(country);
  if (!editionId || !EDITIONS[editionId]) throw new DeskRefused("There are no terms for that country yet.");
  const sections = revisionId === "original" ? EDITIONS[editionId].sections : await revisionSections(revisionId);
  if (!sections || (revisionId !== "original" && !revisionId.startsWith(`${editionId}~r`))) throw new DeskRefused("That version could not be found.");
  const id = await publishRevision(country, sections, [], revisionId === "original" ? "Went back to the original wording" : `Went back to ${revisionId}`, me.email);
  await dropDraft(country);
  await record({ kind: "switch_changed", actorId: me.id, actorEmail: me.email, detail: `Terms of Business (${country}) put back to ${revisionId} as ${id}` }).catch(() => {});
  return id;
}

/* ------------------------------- the assistant ------------------------------- */

const TOOL: Anthropic.Tool = {
  name: "propose_changes",
  description:
    "Propose changes to the contract. Every change is shown to the person beside the published wording and does nothing until they tick it. Always call this when they ask for a change; `reply` is what you say to them. With no changes to make (a question, or something you cannot do), call it with an empty `ops` list.",
  input_schema: {
    type: "object",
    properties: {
      reply: { type: "string", description: "Two or three plain sentences to the person: what you changed and where, or the answer to their question. UK English. No legal advice." },
      ops: {
        type: "array",
        items: {
          type: "object",
          properties: {
            op: { type: "string", enum: ["replace", "insert_after", "remove", "retitle", "add_section", "remove_section"] },
            id: { type: "string", description: "replace/remove: the block id. insert_after: the block id to put it after, or a section id to put it first in that section. retitle/remove_section: the section id." },
            after: { type: "string", description: "add_section: the section id the new section follows." },
            kind: { type: "string", enum: ["p", "list", "h"], description: "insert_after: paragraph, list or small heading." },
            text: { type: "string", description: "The whole new wording of a paragraph or heading. Only <strong> and <em> as markup." },
            items: { type: "array", items: { type: "string" }, description: "The whole new list, one string per line of it." },
            title: { type: "string", description: "retitle/add_section: the section's title." },
            blocks: {
              type: "array",
              description: "add_section: its clauses, in order.",
              items: { type: "object", properties: { kind: { type: "string", enum: ["p", "list", "h"] }, text: { type: "string" }, items: { type: "array", items: { type: "string" } } }, required: ["kind"] },
            },
          },
          required: ["op"],
        },
      },
    },
    required: ["reply", "ops"],
  },
};

function asText(sections: ESection[]): string {
  const out: string[] = [];
  for (const s of sections) {
    out.push(`\n## [${s.id}] ${s.n ? `${s.n}. ` : ""}${s.title}`);
    for (const b of s.blocks) {
      if (!isWords(b)) out.push(`[${b.id}] (LOCKED: ${LOCKED_SAYS[b.kind] ?? b.kind})`);
      else if (b.kind === "list") out.push(`[${b.id}] (list)\n${b.items.map((i) => `  - ${i}`).join("\n")}`);
      else out.push(`[${b.id}] (${b.kind === "h" ? "small heading" : b.kind === "waiver" ? "waiver wording" : "paragraph"}) ${wordsOf(b)}`);
    }
  }
  return out.join("\n");
}

const SYSTEM = (country: Country, title: string) => `You help the managing director of a UK letting agency change the wording of the agency's own contract with landlords: "${title}" (${country === "scotland" ? "Scotland" : "England and Wales"}).

She tells you in plain English what she wants. You make the change by calling propose_changes. Every change is then shown to her against the published wording, and nothing reaches the contract until she ticks it and saves.

Rules you cannot break:
- Change only what she asks for. Do not tidy, reword or "improve" anything else.
- Keep the contract's voice: plain, formal UK English, the same defined terms and capitalisation the contract already uses. No em dashes.
- A replace gives the WHOLE new wording of that block, not a fragment.
- Never change, add or remove a figure in pounds or per cent: fees are locked and such a change is thrown away. If she asks for one, say fees are changed by James and make no change.
- Blocks marked LOCKED cannot be changed or removed.
- Blanks written {{likeThis}} are filled in for each home. Keep the ones there; the only ones you may use are: ${PLACEHOLDERS.map((p) => `{{${p}}}`).join(", ")}.
- Markup: <strong> and <em> only.
- You are a drafting assistant, not her solicitor. Do not give legal advice or say a clause is lawful or enforceable. If a change looks likely to clash with letting law or a regulator's code, make it as asked and say in your reply, in one sentence, that it is worth a legal check.
- If what she asks is unclear, or could mean two different changes, ask one short question and make no change.

Refer to places by section title and number in your reply, never by the bracketed ids.`;

/** One turn with the assistant: her message in, its reply and any changes applied to the working copy. */
export async function converse(country: Country, message: string, me: OsUser): Promise<{ reply: string; problems: string[]; applied: number }> {
  const text = message.trim().slice(0, 4000);
  if (!text) throw new DeskRefused("Say what you would like changed.");
  const w = await working(country);
  const earlier = w.chat.slice(-8).map((c) => `${c.who === "you" ? "Her" : "You"}: ${c.text}`).join("\n");
  let res: Anthropic.Message;
  try {
    res = await aiCreate("contract-editor", {
      max_tokens: 12000,
      system: SYSTEM(country, w.doc.title),
      tools: [TOOL],
      messages: [
        {
          role: "user",
          content: `THE CONTRACT AS IT STANDS (her working copy; ids in brackets):\n${asText(w.sections)}\n\n${earlier ? `EARLIER IN THIS CONVERSATION:\n${earlier}\n\n` : ""}HER MESSAGE NOW:\n${text}`,
        },
      ],
    });
  } catch (e) {
    throw new DeskRefused(e instanceof Error && e.message ? e.message : "The assistant could not be reached. Try again in a minute.");
  }
  if (res.stop_reason === "refusal") throw new DeskRefused("The assistant declined that one. Change the wording by hand, or ask another way.");
  const call = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "propose_changes");
  const prose = res.content.find((c): c is Anthropic.TextBlock => c.type === "text")?.text?.trim() ?? "";
  const input = (call?.input ?? {}) as { reply?: unknown; ops?: unknown };
  const ops = Array.isArray(input.ops) ? (input.ops as Op[]) : [];
  let reply = (typeof input.reply === "string" && input.reply.trim()) || prose || "Nothing came back. Try asking again.";
  const now = new Date().toISOString();
  const out = applyOps(w.base, w.sections, ops);
  if (out.problems.length) reply += ` (${out.problems.length === 1 ? "One change was" : `${out.problems.length} changes were`} left out: ${out.problems.join(" ")})`;
  await saveDraft({
    country,
    fromId: w.doc.id,
    sections: out.sections,
    ticks: prune(w.base, out.sections, w.ticks),
    chat: [...w.chat, { who: "you", text, at: now }, { who: "assistant", text: reply.replace(/\s*[—–]\s*/g, " - "), at: now }],
    by: me.email,
  });
  return { reply, problems: out.problems, applied: out.applied };
}
