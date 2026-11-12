import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument } from "pdf-lib";
import { aiCreate } from "@/lib/ai";
import { CHECKS, READINGS, type CheckAnswer } from "@/lib/inspection-checks";
import { realDayOrNull } from "@/lib/real-day";
import { emptyRead, type ReadAction, type ReadCondition, type ReadRoom, type ReportRead } from "@/lib/visit-report";

/**
 * READING A VISIT REPORT MADE SOMEWHERE ELSE (James, 12 Nov 2026).
 *
 * An Inventory Base report (or any other: a PDF, or a photo of a page) is read
 * for the things our own visit record holds - the day, who went, the overall
 * condition, the checks, the meter readings, what the tenant raised and each
 * room - so the agent checks them beside the report instead of typing the
 * report out again.
 *
 * Facts only, as the certificate reader (lib/cert-read): what is printed is
 * reported, what is not printed is left empty for a person to fill in. The
 * screen marks every empty box.
 *
 * These reports are long - a photo on most pages, sixty pages is ordinary -
 * so a PDF is read a few pages at a time, side by side, and the pieces are
 * put together. The first piece carries the front page (date, clerk, address,
 * the report's own summary); every piece carries rooms.
 */

/** Pages in one piece, pieces read at once, and where reading stops. */
const PIECE_PAGES = 20;
const AT_ONCE = 3;
/** A report this short is read whole rather than in pieces. */
const WHOLE_PAGES = 30;
export const MAX_PAGES = 150;
/** A piece bigger than this is halved: the API takes 32MB a request, and base64 adds a third. */
const PIECE_BYTES = 18 * 1024 * 1024;

const CHECK_LINES = CHECKS.map((c) => `  ${c.id}: "${c.label}"`).join("\n");

const SYSTEM = `You are reading a report of a visit to a rented home in the UK: a property visit
(interim inspection), an inventory and check-in, a check-out, or an HMO check. It was usually
made in an app such as Inventory Base. It has a front page (address, the day it was carried
out, who inspected), then numbered sections. Some sections are about the visit as a whole
(property information, a summary of the report, health and safety, alarms, pets, smoking,
actions, a declaration); the rest are one per room or area, each a description or a list of
questions with answers, comments and photographs.

Report only what the pages in front of you say. Anything not written on these pages is left
empty, never guessed.

READING QUESTIONS. Many reports ask a question and answer Yes, No or N/A. Read each answer in
the sense of its question: "Are there any obvious water leaks? No" is good news; "Is the
standard of house-keeping acceptable? Yes" is good news; "Are any fences in need of attention?
Yes" is a problem. A coloured label such as "Needs Maintenance" or "Investigate" is a flag.

ROOMS. One entry for each room or area these pages cover, in the order they appear. Name it in
plain words in sentence case ("Lounge", "Dining room", "Kitchen", "Stairs and landing",
"Bedroom 1", "Bathroom", "Garden", "Roof and gutters", "Outside"). Sections about the visit as
a whole are not rooms. For each room:
  condition - good when nothing in it is flagged and its answers are all good news; fair when
    something is flagged for attention or would benefit from work; poor when there is damage,
    damp, mould, dirt, or several things flagged. If the report states a condition itself, use
    that. Leave it empty only when the pages say nothing at all about how the room is.
  note - what the report says about the room in a sentence or two, using its comments where it
    has them. When nothing is flagged, say so plainly ("Nothing flagged. Housekeeping
    acceptable.").
  items - only the specific things flagged as needing something (a repair, cleaning, watching,
    investigating). The item is the thing itself in a few words ("Chimney breast", "Extractor
    fan"); its note is what the report says about it. Not every fitting it describes.
  action, for the room and for each item - none; monitor (watch it next time, or investigate);
    works_order (a repair or a contractor is needed and it is not said who pays); tenant (the
    tenant is to put it right); landlord (the landlord is to put it right).

OVERALL. overall_condition is the report's own verdict where it gives one in its summary or
general comments ("immaculately clean and well maintained" is good); empty if it gives none.
summary is the report's summary and general comments, tidied into two to four plain sentences
a landlord could read, including any areas it says to note.

CHECKS. Answer only the ones these pages give evidence for. "ok" means the statement below is
true, "issue" means the report says otherwise, "na" means the report says it was not checked or
does not apply. Leave out any the report does not mention. Put where and what in the note.
${CHECK_LINES}

Meter readings: the number as printed, with its unit if one is printed. tenant_says: only what
the tenant themselves raised or commented, not whether they were present.
Dates as YYYY-MM-DD. Write in UK English, plainly, with no dashes used as punctuation.`;

const cond = { type: "string", enum: ["good", "fair", "poor", ""] } as const;
const action = { type: "string", enum: ["none", "monitor", "works_order", "tenant", "landlord"] } as const;

const TOOL: Anthropic.Tool = {
  name: "report_visit",
  description: "What these pages of the visit report say.",
  input_schema: {
    type: "object",
    properties: {
      title: { type: "string", description: "What the report calls itself, or empty" },
      visit_date: { type: "string", description: "The day of the visit, YYYY-MM-DD, or empty" },
      inspector: { type: "string", description: "Who carried out the visit (clerk, inspector, agent), or empty" },
      address: { type: "string", description: "The property address printed on the report, or empty" },
      overall_condition: { ...cond, description: "The report's own overall condition or verdict, or empty if it gives none" },
      summary: { type: "string", description: "The report's own overall summary or general comments, tidied into two to four sentences. Empty if these pages have none." },
      checks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: CHECKS.map((c) => c.id) },
            answer: { type: "string", enum: ["ok", "issue", "na"] },
            note: { type: "string", description: "What the report says, briefly. Empty if nothing to add." },
          },
          required: ["id", "answer"],
        },
      },
      readings: {
        type: "object",
        properties: Object.fromEntries(READINGS.map((r) => [r.id, { type: "string", description: `${r.label} reading, or empty` }])),
      },
      tenant_says: { type: "string", description: "Anything the tenant raised or commented, or empty" },
      rooms: {
        type: "array",
        items: {
          type: "object",
          properties: {
            room: { type: "string" },
            condition: cond,
            note: { type: "string" },
            action,
            items: {
              type: "array",
              items: {
                type: "object",
                properties: { item: { type: "string" }, condition: cond, note: { type: "string" }, action },
                required: ["item"],
              },
            },
          },
          required: ["room"],
        },
      },
      notes: { type: "string", description: "One sentence, only if something needs saying (pages unreadable, not a visit report at all)" },
    },
    required: ["rooms"],
  },
};

const str = (v: unknown, max: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
/* No dashes as punctuation in anything a landlord may read (lib/no-dashes is for adverts; same rule). */
const plain = (v: unknown, max: number) => str(v, max).replace(/\s[–—]\s/g, " - ").replace(/[–—]/g, "-");
const asCond = (v: unknown): ReadCondition | null => (v === "good" || v === "fair" || v === "poor" ? v : null);
const asAction = (v: unknown): ReadAction => (v === "monitor" || v === "works_order" || v === "tenant" || v === "landlord" ? v : "none");
const WORST: Record<ReadCondition, number> = { good: 0, fair: 1, poor: 2 };

function fromTool(r: Record<string, unknown>): ReportRead {
  const out = emptyRead();
  out.title = str(r.title, 120);
  out.visitDate = realDayOrNull(r.visit_date) ?? "";
  out.inspector = str(r.inspector, 80);
  out.address = str(r.address, 200);
  out.condition = asCond(r.overall_condition);
  out.summary = plain(r.summary, 1500);
  for (const c of Array.isArray(r.checks) ? (r.checks as Record<string, unknown>[]) : []) {
    const id = String(c?.id ?? "");
    const answer = c?.answer as CheckAnswer;
    if (!CHECKS.some((d) => d.id === id) || !["ok", "issue", "na"].includes(answer)) continue;
    out.checks[id] = { answer, note: plain(c.note, 300) };
  }
  const readings = (r.readings && typeof r.readings === "object" ? r.readings : {}) as Record<string, unknown>;
  for (const d of READINGS) {
    const v = str(readings[d.id], 40);
    if (v) out.readings[d.id] = v;
  }
  out.tenantSays = plain(r.tenant_says, 1000);
  for (const room of Array.isArray(r.rooms) ? (r.rooms as Record<string, unknown>[]) : []) {
    const name = str(room?.room, 60);
    if (!name) continue;
    out.rooms.push({
      room: name,
      condition: asCond(room.condition),
      note: plain(room.note, 800),
      action: asAction(room.action),
      items: (Array.isArray(room.items) ? (room.items as Record<string, unknown>[]) : [])
        .map((it) => ({ item: str(it?.item, 80), condition: asCond(it?.condition) ?? "fair", note: plain(it?.note, 500), action: asAction(it?.action) }))
        .filter((it) => it.item),
    });
  }
  out.notes = plain(r.notes, 300);
  return out;
}

/** The pieces put together: the front page's facts from the first piece that has them, rooms from all. */
export function mergeReads(parts: ReportRead[]): ReportRead {
  const out = emptyRead();
  const rooms = new Map<string, ReadRoom>();
  for (const p of parts) {
    out.title ||= p.title;
    out.visitDate ||= p.visitDate;
    out.inspector ||= p.inspector;
    out.address ||= p.address;
    out.condition ??= p.condition;
    out.summary ||= p.summary;
    out.tenantSays ||= p.tenantSays;
    out.notes ||= p.notes;
    for (const [id, a] of Object.entries(p.checks)) {
      const was = out.checks[id];
      /* A problem on a later page beats a tick on an earlier one. */
      if (!was || (a.answer === "issue" && was.answer !== "issue")) out.checks[id] = a;
    }
    for (const [id, v] of Object.entries(p.readings)) out.readings[id] ||= v;
    for (const r of p.rooms) {
      const key = r.room.toLowerCase();
      const was = rooms.get(key);
      if (!was) {
        rooms.set(key, { ...r, items: [...r.items] });
        continue;
      }
      /* A room that runs over two pieces: one room, the worse condition, both notes. */
      was.condition = was.condition && r.condition ? (WORST[r.condition] > WORST[was.condition] ? r.condition : was.condition) : (was.condition ?? r.condition);
      if (r.note && !was.note.includes(r.note)) was.note = [was.note, r.note].filter(Boolean).join(" ").slice(0, 800);
      if (was.action === "none") was.action = r.action;
      for (const it of r.items) if (!was.items.some((x) => x.item.toLowerCase() === it.item.toLowerCase())) was.items.push(it);
    }
  }
  out.rooms = [...rooms.values()];
  return out;
}

type Piece = { bytes: Buffer; from: number; to: number };

/** A PDF in pieces of a few pages; a piece too heavy for one request is halved. */
async function pieces(bytes: Buffer): Promise<{ pieces: Piece[]; pages: number; pagesRead: number }> {
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const pages = src.getPageCount();
  const pagesRead = Math.min(pages, MAX_PAGES);
  const cut = async (from: number, to: number): Promise<Piece[]> => {
    const doc = await PDFDocument.create();
    const copied = await doc.copyPages(src, Array.from({ length: to - from }, (_, i) => from + i));
    for (const pg of copied) doc.addPage(pg);
    const made = Buffer.from(await doc.save());
    if (made.length > PIECE_BYTES && to - from > 1) {
      const mid = from + Math.ceil((to - from) / 2);
      return [...(await cut(from, mid)), ...(await cut(mid, to))];
    }
    return [{ bytes: made, from, to }];
  };
  /* Most property visit reports are a dozen pages: read whole, in one go. */
  if (pages <= WHOLE_PAGES && bytes.length <= PIECE_BYTES) return { pieces: [{ bytes, from: 0, to: pages }], pages, pagesRead };
  const out: Piece[] = [];
  for (let at = 0; at < pagesRead; at += PIECE_PAGES) out.push(...(await cut(at, Math.min(at + PIECE_PAGES, pagesRead))));
  return { pieces: out, pages, pagesRead };
}

async function readBlock(block: Anthropic.ContentBlockParam, say: string, signal?: AbortSignal): Promise<{ read: ReportRead; in: number; out: number }> {
  const res = await aiCreate(
    "visit-report",
    {
      max_tokens: 8000,
      system: SYSTEM,
      tools: [TOOL],
      tool_choice: { type: "tool", name: "report_visit" },
      messages: [{ role: "user", content: [block, { type: "text", text: say }] }],
    },
    { signal }
  );
  const call = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "report_visit");
  return { read: fromTool((call?.input ?? {}) as Record<string, unknown>), in: res.usage.input_tokens, out: res.usage.output_tokens };
}

export interface VisitReportRead {
  read: ReportRead;
  pages: number;
  pagesRead: number;
  tokens: { in: number; out: number };
}

/**
 * Read one report. `media` is the file's type; a PDF is read in pieces, a
 * photo as one page. Throws when nothing could be read at all; a piece that
 * fails on its own is left out and said in `notes`.
 */
export async function readVisitReport(bytes: Buffer, media: string, signal?: AbortSignal): Promise<VisitReportRead> {
  if (!/pdf/i.test(media)) {
    const r = await readBlock(
      { type: "image", source: { type: "base64", media_type: media as "image/jpeg" | "image/png" | "image/webp", data: bytes.toString("base64") } },
      "This is a photo of one page of the report. Read it and report.",
      signal
    );
    return { read: r.read, pages: 1, pagesRead: 1, tokens: { in: r.in, out: r.out } };
  }

  const cutUp = await pieces(bytes);
  const total = cutUp.pieces.length;
  const results: Array<{ read: ReportRead; in: number; out: number } | null> = new Array(total).fill(null);
  let next = 0;
  let lastError: unknown = null;
  const worker = async () => {
    for (;;) {
      const n = next++;
      if (n >= total) return;
      const p = cutUp.pieces[n]!;
      const say =
        total === 1
          ? "This is the whole report. Read it and report."
          : `These are pages ${p.from + 1} to ${p.to} of a ${cutUp.pages} page report, read a few pages at a time. Report what THESE pages say: ${n === 0 ? "the front page's details and summary if they are here, and every room these pages cover." : "every room these pages cover, and any checks, meter readings, summary or tenant comments that appear on them. Leave the front page details empty unless they are printed here."}`;
      try {
        results[n] = await readBlock({ type: "document", source: { type: "base64", media_type: "application/pdf", data: p.bytes.toString("base64") } }, say, signal);
      } catch (e) {
        lastError = e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(AT_ONCE, total) }, worker));

  const got = results.filter((r): r is NonNullable<typeof r> => Boolean(r));
  if (got.length === 0) throw lastError instanceof Error ? lastError : new Error("The report could not be read.");
  const read = mergeReads(got.map((g) => g.read));
  const missed = total - got.length;
  const said: string[] = [];
  if (missed > 0) said.push(`${missed} of its ${total} parts could not be read, so some rooms may be missing.`);
  if (cutUp.pages > cutUp.pagesRead) said.push(`Only the first ${cutUp.pagesRead} of its ${cutUp.pages} pages were read.`);
  if (said.length) read.notes = [...said, read.notes].filter(Boolean).join(" ").slice(0, 400);
  return {
    read,
    pages: cutUp.pages,
    pagesRead: cutUp.pagesRead,
    tokens: { in: got.reduce((n, g) => n + g.in, 0), out: got.reduce((n, g) => n + g.out, 0) },
  };
}
