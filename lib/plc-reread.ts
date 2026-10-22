import "server-only";
import { aiResting } from "@/lib/ai-outage";
import { softenWaived, type PlcCase, type PlcState } from "@/lib/plc";
import { readDroppedFile, sorterConfigured, UNREAD } from "@/lib/plc-read-file";
import { failedRead, scanConfigured, scanDocument } from "@/lib/plc-scan";
import {
  claimReread,
  getCase,
  packsWaitingToRead,
  putRereadFile,
  putRereadFindings,
  releaseReread,
  touchReread,
} from "@/lib/plc-store";

/**
 * WAITING TO READ (22 Oct 2026).
 *
 * When Claude refuses (lib/ai-outage: out of credit, a bad key, busy) a PLC
 * file is marked waiting rather than failed, and this reads it again once the
 * API answers: when the pack is opened (GET /api/plc/<id>) and on the five-
 * minute scheduled-sends tick. Two kinds of waiting:
 *
 *   - a dropped file's own read (PlcDocument.read.waiting): what it is, its
 *     dates. Read again in any open state. The file stays in the slot it was
 *     filed in; the agent moves it if the read says otherwise.
 *   - the scan's lines on a pack with compliance (Finding.waiting): the file
 *     is read against its check and the waiting line replaced. Not while the
 *     agent still has the pack: their next Send reads every file anyway, and
 *     reading it here as well would pay for it twice.
 *
 * Never twice for one file, never in a loop:
 *   - one run per pack at a time, claimed in one UPDATE (claimReread);
 *   - the pack is read fresh before each file, and only a line still marked
 *     waiting is read, so a file done by one run is not touched by the next;
 *   - each answer is saved before the next file is asked for;
 *   - the first refusal stops the run, and nothing is asked again until the
 *     API has rested (REST_MS in lib/ai-outage: a minute when busy, five when
 *     offline). A refusal is not charged for, so a retry costs nothing;
 *   - a file that meets a busy reader MAX_BUSY_TRIES times is handed to a
 *     person ("check it by hand") rather than tried for ever;
 *   - every run is bounded by the number of files on the pack.
 */

/** The claim lapses after this, in case a run dies mid-read. Longer than any one file takes (the route allows 300s). */
const HOLD_SECONDS = 300;
/** A busy reader this many times over and the file goes to a person. */
const MAX_BUSY_TRIES = 6;
/** Packs read again per scheduled tick, oldest first. */
const PER_TICK = 5;

/** Any open state: a dropped file's read is worth having until the pack is decided. */
const FILE_STATES: PlcState[] = ["assembling", "submitted", "reviewing", "checked"];
/** With compliance, where the scan's lines are what they read. */
const SCAN_STATES: PlcState[] = ["submitted", "reviewing", "checked"];

const waitingFile = (c: PlcCase) => FILE_STATES.includes(c.state) && c.documents.some((d) => d.read?.waiting && !d.placeholder);
const waitingLine = (c: PlcCase) => SCAN_STATES.includes(c.state) && c.findings.some((f) => f.waiting && f.documentName);

/** Something on this pack is waiting that a re-read would do. */
export const hasWaiting = (c: PlcCase) => waitingFile(c) || waitingLine(c);

export type Reread = { read: number; stillWaiting: boolean };

/** Read this pack's waiting files again, if the API is likely to answer and nobody else is. */
export async function rereadWaiting(id: string): Promise<Reread | null> {
  if (!scanConfigured() || !sorterConfigured()) return null;
  const first = await getCase(id);
  if (!first || !hasWaiting(first)) return null;
  if (await aiResting()) return null;
  if (!(await claimReread(id, HOLD_SECONDS))) return null;

  let read = 0;
  let refused = false;
  try {
    for (let n = 0; n <= first.documents.length && !refused; n++) {
      const c = await getCase(id);
      if (!c || !waitingFile(c)) break;
      const doc = c.documents.find((d) => d.read?.waiting && !d.placeholder)!;
      await touchReread(id);
      let got = await readDroppedFile(doc, { address: c.address, label: doc.label ?? null }, doc.read?.tries ?? 0);
      if (got.waiting && (got.tries ?? 0) >= MAX_BUSY_TRIES) {
        got = { ...got, waiting: undefined, note: UNREAD };
      }
      await putRereadFile(id, doc.key, got);
      if (got.waiting) refused = true;
      else read++;
    }

    for (let n = 0; n <= first.documents.length && !refused; n++) {
      const c = await getCase(id);
      if (!c || !waitingLine(c)) break;
      const line = c.findings.find((f) => f.waiting && f.documentName)!;
      const doc = c.documents.find((d) => d.name === line.documentName);
      if (!doc) {
        /* The file has gone from the pack since: so has its line. */
        await putRereadFindings(id, line.documentName!, []);
        continue;
      }
      await touchReread(id);
      let out;
      try {
        out = await scanDocument(doc, c);
      } catch (e) {
        out = failedRead(doc, e, line.tries ?? 0);
        const again = out.findings[0];
        if (again?.waiting && (again.tries ?? 0) >= MAX_BUSY_TRIES) {
          out = failedRead(doc, new Error("busy every time it was tried"));
        }
      }
      await putRereadFindings(id, doc.name, softenWaived(c, out.findings));
      if (out.findings.some((f) => f.waiting)) refused = true;
      else read++;
    }
  } finally {
    await releaseReread(id);
  }
  const after = await getCase(id);
  return { read, stillWaiting: Boolean(after && hasWaiting(after)) };
}

/** The scheduled tick: a few packs with files waiting, oldest first, one at a time. */
export async function rereadAllWaiting(): Promise<{ packs: number; read: number }> {
  if (!scanConfigured() || (await aiResting())) return { packs: 0, read: 0 };
  const ids = await packsWaitingToRead(FILE_STATES, SCAN_STATES, PER_TICK);
  let packs = 0;
  let read = 0;
  for (const id of ids) {
    const r = await rereadWaiting(id).catch((e) => {
      console.error("[plc-reread]", id, e instanceof Error ? e.message : e);
      return null;
    });
    if (!r) continue;
    packs++;
    read += r.read;
    /* Still refused: the rest would be too. */
    if (r.stillWaiting && (await aiResting())) break;
  }
  return { packs, read };
}
