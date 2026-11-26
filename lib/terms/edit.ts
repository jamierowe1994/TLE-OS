import type { Block, Section, TermsDoc } from "@/lib/terms/types";

/**
 * EDITING THE TERMS OF BUSINESS (James, 26 Nov 2026).
 *
 * "A contract section of which she can edit the contracts for England and
 * Scotland to adjust any terms ... a LLM on the right and the contract on the
 * left ... she has to click a little tick to confirm she is happy with the
 * changes and when saved will automatically update the contract for the
 * agents."
 *
 * The rules here are shared by the server (which enforces them) and the
 * screen (which shows them), so the two cannot disagree:
 *
 *   - Only the WORDS can change: paragraphs, lists, small headings, the
 *     waiver wording and section titles, and clauses can be added or taken
 *     out. The front-page facts, the boxes landlords fill in, the fees, the
 *     service table and the signature blocks are locked.
 *   - No change may alter a figure in pounds or per cent: pricing is James's
 *     decision, not something an edit can move.
 *   - {{placeholders}} must be ones the contract can fill.
 *   - Text carries <strong> and <em> and nothing else.
 *
 * A working copy is the published sections with an id on every section and
 * block, so a change can be pointed at, ticked, or put back.
 */

export type EBlock = Block & { id: string };
export interface ESection {
  id: string;
  n?: string;
  title: string;
  blocks: EBlock[];
}

/** The kinds of block whose words can be changed, added or removed. */
const WORDS: Block["kind"][] = ["p", "list", "h", "waiver"];
/** The kinds that can be added new. */
const ADDABLE = ["p", "list", "h"] as const;
export type AddKind = (typeof ADDABLE)[number];

export const isWords = (b: Block): boolean => WORDS.includes(b.kind);

/** What a locked block is, in words, for the screen. */
export const LOCKED_SAYS: Record<string, string> = {
  facts: "The agreement's details, filled in for each home",
  landlords: "The boxes each landlord fills in",
  fees: "The service and fees chosen for the home",
  table: "The table of what each service includes",
  signatures: "Where everybody signs",
};

/** The placeholders a contract can fill (lib/terms/types TermsValues). */
export const PLACEHOLDERS = ["agentName", "agentLarn", "propertyAddress", "serviceLevel", "setUpFee", "managementFee", "additionalFees", "dateIssued"];

export function withIds(sections: Section[]): ESection[] {
  return sections.map((s, i) => ({ ...s, id: `s${i}`, blocks: s.blocks.map((b, j) => ({ ...b, id: `s${i}b${j}` })) }));
}

export function stripIds(sections: ESection[]): Section[] {
  return sections.map((s) => {
    const out: Section = { title: s.title, blocks: s.blocks.map(({ id: _id, ...b }) => b as Block) };
    if (s.n) out.n = s.n;
    return out;
  });
}

/** The words of a block as one string, for comparing and for the model. */
export function wordsOf(b: Block): string {
  if (b.kind === "p" || b.kind === "h" || b.kind === "waiver") return b.text;
  if (b.kind === "list") return b.items.join("\n");
  return "";
}

/* ------------------------------- the rules ------------------------------- */

/** Text as the contract may carry it: <strong> and <em> only, no em dashes, tidy spaces. */
export function clean(text: string): string {
  return text
    .replace(/<(?!\/?(strong|em)>)[^>]*>/gi, "")
    .replace(/\s*[—–]\s*/g, " - ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

const figures = (text: string): string[] =>
  (text.replace(/<[^>]+>/g, "").match(/£\s?\d[\d,]*(?:\.\d+)?|\d+(?:\.\d+)?\s?(?:%|per\s?cent)/gi) ?? []).map((f) => f.replace(/\s+/g, "").toLowerCase()).sort();

/** Why this wording cannot stand, or null. `before` is the published wording it replaces, if any. */
export function wordingProblem(after: string, before: string | null): string | null {
  if (!after.trim()) return "It has no words in it.";
  if (after.length > 8000) return "That is too long for one clause. Split it into two.";
  const unknown = [...after.matchAll(/\{\{\s*([^}]*)\s*\}\}/g)].map((m) => m[1].trim()).filter((k) => !PLACEHOLDERS.includes(k));
  if (unknown.length) return `It uses a blank the contract cannot fill ({{${unknown[0]}}}).`;
  const a = figures(after).join("|");
  const b = figures(before ?? "").join("|");
  if (a !== b) return before == null ? "It sets a figure in pounds or per cent. Fees are locked here: ask James." : "It changes a figure in pounds or per cent. Fees are locked here: ask James.";
  return null;
}

/* ------------------------------- the changes ------------------------------- */

export type Change =
  | { key: string; kind: "changed"; sectionId: string; blockId: string; before: string; after: string }
  | { key: string; kind: "added"; sectionId: string; blockId: string; after: string }
  | { key: string; kind: "removed"; sectionId: string; blockId: string; before: string }
  | { key: string; kind: "title"; sectionId: string; before: string; after: string }
  | { key: string; kind: "section-added"; sectionId: string; after: string }
  | { key: string; kind: "section-removed"; sectionId: string; before: string };

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Every difference between the published contract and the working copy. A change's key moves when its words do, so a tick never covers words it did not see. */
export function changesBetween(base: ESection[], draft: ESection[]): Change[] {
  const out: Change[] = [];
  const baseSec = new Map(base.map((s) => [s.id, s]));
  const draftSec = new Map(draft.map((s) => [s.id, s]));
  for (const s of draft) {
    const was = baseSec.get(s.id);
    if (!was) {
      const words = [s.title, ...s.blocks.map(wordsOf)].join("\n");
      out.push({ key: `sa:${s.id}:${hash(words)}`, kind: "section-added", sectionId: s.id, after: words });
      continue;
    }
    if (was.title !== s.title) out.push({ key: `t:${s.id}:${hash(s.title)}`, kind: "title", sectionId: s.id, before: was.title, after: s.title });
    const wasBlock = new Map(was.blocks.map((b) => [b.id, b]));
    const nowBlock = new Set(s.blocks.map((b) => b.id));
    for (const b of s.blocks) {
      const old = wasBlock.get(b.id);
      if (!old) out.push({ key: `a:${b.id}:${hash(b.kind + wordsOf(b))}`, kind: "added", sectionId: s.id, blockId: b.id, after: wordsOf(b) });
      else if (wordsOf(old) !== wordsOf(b)) out.push({ key: `c:${b.id}:${hash(wordsOf(b))}`, kind: "changed", sectionId: s.id, blockId: b.id, before: wordsOf(old), after: wordsOf(b) });
    }
    for (const b of was.blocks) if (!nowBlock.has(b.id)) out.push({ key: `r:${b.id}`, kind: "removed", sectionId: s.id, blockId: b.id, before: wordsOf(b) });
  }
  for (const s of base) if (!draftSec.has(s.id)) out.push({ key: `sr:${s.id}`, kind: "section-removed", sectionId: s.id, before: [s.title, ...s.blocks.map(wordsOf)].join("\n") });
  return out;
}

/* ------------------------------- the edits ------------------------------- */

export type Op =
  | { op: "replace"; id: string; text?: string; items?: string[] }
  | { op: "insert_after"; id: string; kind: AddKind; text?: string; items?: string[] }
  | { op: "remove"; id: string }
  | { op: "retitle"; id: string; title: string }
  | { op: "add_section"; after: string; title: string; blocks: Array<{ kind: AddKind; text?: string; items?: string[] }> }
  | { op: "remove_section"; id: string };

let made = 0;
const newId = (p: string) => `${p}n${Date.now().toString(36)}${(made++).toString(36)}`;

function build(kind: AddKind, text: string | undefined, items: string[] | undefined, id: string): EBlock | string {
  if (kind === "list") {
    const list = (items ?? (text ?? "").split("\n")).map(clean).filter(Boolean);
    if (!list.length) return "A list needs at least one line.";
    return { kind: "list", items: list, id };
  }
  const t = clean(text ?? (items ?? []).join(" "));
  return kind === "h" ? { kind: "h", text: t, id } : { kind: "p", text: t, id };
}

/**
 * Apply edits to a working copy. Each edit is checked against the rules and
 * against the PUBLISHED wording of the block it touches; one that breaks a
 * rule is left out and said why. Never throws.
 */
export function applyOps(base: ESection[], draft: ESection[], ops: Op[]): { sections: ESection[]; problems: string[]; applied: number } {
  const sections: ESection[] = draft.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b })) }));
  const problems: string[] = [];
  let applied = 0;
  const baseWords = new Map<string, string>();
  for (const s of base) for (const b of s.blocks) baseWords.set(b.id, wordsOf(b));
  const find = (id: string) => {
    for (const s of sections) {
      const i = s.blocks.findIndex((b) => b.id === id);
      if (i >= 0) return { s, i, b: s.blocks[i] };
    }
    return null;
  };
  for (const op of ops.slice(0, 40)) {
    if (op.op === "replace") {
      const at = find(op.id);
      if (!at) { problems.push("One change pointed at a clause that is not there."); continue; }
      if (!isWords(at.b)) { problems.push(`${LOCKED_SAYS[at.b.kind] ?? "That part"} is locked and was left as it is.`); continue; }
      const next = at.b.kind === "list" ? build("list", op.text, op.items, at.b.id) : at.b.kind === "waiver" ? ({ kind: "waiver", text: clean(op.text ?? ""), id: at.b.id } as EBlock) : build(at.b.kind as AddKind, op.text, op.items, at.b.id);
      if (typeof next === "string") { problems.push(next); continue; }
      const why = wordingProblem(wordsOf(next), baseWords.get(at.b.id) ?? null);
      if (why) { problems.push(why); continue; }
      at.s.blocks[at.i] = next;
      applied++;
    } else if (op.op === "insert_after") {
      const sec = sections.find((s) => s.id === op.id);
      const at = sec ? null : find(op.id);
      if (!sec && !at) { problems.push("One new clause pointed at a place that is not there."); continue; }
      if (!(ADDABLE as readonly string[]).includes(op.kind)) { problems.push("Only paragraphs, lists and small headings can be added."); continue; }
      const next = build(op.kind, op.text, op.items, newId(sec ? `${sec.id}b` : `${at!.s.id}b`));
      if (typeof next === "string") { problems.push(next); continue; }
      const why = wordingProblem(wordsOf(next), null);
      if (why) { problems.push(why); continue; }
      if (sec) sec.blocks.unshift(next);
      else at!.s.blocks.splice(at!.i + 1, 0, next);
      applied++;
    } else if (op.op === "remove") {
      const at = find(op.id);
      if (!at) { problems.push("One removal pointed at a clause that is not there."); continue; }
      if (!isWords(at.b)) { problems.push(`${LOCKED_SAYS[at.b.kind] ?? "That part"} is locked and cannot be removed.`); continue; }
      if (figures(baseWords.get(at.b.id) ?? wordsOf(at.b)).length) { problems.push("That clause carries a figure in pounds or per cent, so it cannot be removed here. Fees are locked: ask James."); continue; }
      at.s.blocks.splice(at.i, 1);
      applied++;
    } else if (op.op === "retitle") {
      const sec = sections.find((s) => s.id === op.id);
      const title = clean(op.title ?? "").replace(/<[^>]+>/g, "");
      if (!sec || !title) { problems.push("One new title had no section or no words."); continue; }
      sec.title = title.slice(0, 160);
      applied++;
    } else if (op.op === "add_section") {
      const i = sections.findIndex((s) => s.id === op.after);
      const title = clean(op.title ?? "").replace(/<[^>]+>/g, "");
      if (i < 0 || !title) { problems.push("One new section had no place or no title."); continue; }
      const id = newId("s");
      const blocks: EBlock[] = [];
      let bad: string | null = null;
      for (const b of (op.blocks ?? []).slice(0, 30)) {
        const next = (ADDABLE as readonly string[]).includes(b.kind) ? build(b.kind, b.text, b.items, newId(`${id}b`)) : "Only paragraphs, lists and small headings can be added.";
        if (typeof next === "string") { bad = next; break; }
        const why = wordingProblem(wordsOf(next), null);
        if (why) { bad = why; break; }
        blocks.push(next);
      }
      if (bad || !blocks.length) { problems.push(bad ?? "A new section needs at least one clause."); continue; }
      sections.splice(i + 1, 0, { id, title: title.slice(0, 160), blocks });
      applied++;
    } else if (op.op === "remove_section") {
      const i = sections.findIndex((s) => s.id === op.id);
      if (i < 0) { problems.push("One removal pointed at a section that is not there."); continue; }
      if (sections[i].blocks.some((b) => !isWords(b))) { problems.push("That section holds a locked part (details, fees or signatures), so it cannot be removed."); continue; }
      if (sections[i].blocks.some((b) => figures(wordsOf(b)).length)) { problems.push("That section carries a figure in pounds or per cent, so it cannot be removed here. Fees are locked: ask James."); continue; }
      sections.splice(i, 1);
      applied++;
    }
  }
  return { sections, problems, applied };
}

/** Put one change back to the published wording. */
export function revert(base: ESection[], draft: ESection[], change: Change): ESection[] {
  const sections: ESection[] = draft.map((s) => ({ ...s, blocks: s.blocks.map((b) => ({ ...b })) }));
  const baseSec = base.find((s) => s.id === change.sectionId);
  const sec = sections.find((s) => s.id === change.sectionId);
  if (change.kind === "title" && sec && baseSec) sec.title = baseSec.title;
  else if (change.kind === "section-added") return sections.filter((s) => s.id !== change.sectionId);
  else if (change.kind === "section-removed" && baseSec) {
    /* Back where it was: after the nearest earlier section that is still there. */
    const order = base.map((s) => s.id);
    let at = 0;
    for (let i = order.indexOf(baseSec.id) - 1; i >= 0; i--) {
      const j = sections.findIndex((s) => s.id === order[i]);
      if (j >= 0) { at = j + 1; break; }
    }
    sections.splice(at, 0, { ...baseSec, blocks: baseSec.blocks.map((b) => ({ ...b })) });
  } else if ((change.kind === "changed" || change.kind === "added" || change.kind === "removed") && sec && (baseSec || change.kind === "added")) {
    const i = sec.blocks.findIndex((b) => b.id === change.blockId);
    if (change.kind === "added") {
      if (i >= 0) sec.blocks.splice(i, 1);
    } else {
      const was = baseSec!.blocks.find((b) => b.id === change.blockId);
      if (!was) return sections;
      if (change.kind === "changed" && i >= 0) sec.blocks[i] = { ...was };
      if (change.kind === "removed" && i < 0) {
        const order = baseSec!.blocks.map((b) => b.id);
        let at = 0;
        for (let k = order.indexOf(was.id) - 1; k >= 0; k--) {
          const j = sec.blocks.findIndex((b) => b.id === order[k]);
          if (j >= 0) { at = j + 1; break; }
        }
        sec.blocks.splice(at, 0, { ...was });
      }
    }
  }
  return sections;
}

/** A published revision of an edition, as a contract the rest of the OS can send. */
export function revisedDoc(base: TermsDoc, n: number, sections: Section[], when: string): TermsDoc {
  const day = new Date(when).toLocaleDateString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "long", year: "numeric" });
  return { ...base, id: `${base.id}~r${n}`, edition: `${base.edition}, revised ${day}`, sections };
}
