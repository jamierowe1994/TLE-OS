import "server-only";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { hasDb, q } from "@/lib/db";
import { publicError } from "@/lib/public-error";
import { R2_BUCKET, keyIsOurs, r2Configured, withR2 } from "@/lib/r2";
import { READ_GIVES_UP_MS, canRead, type ReadState } from "@/lib/visit-report";
import { readVisitReport } from "@/lib/visit-report-read";

/**
 * Where a read of a visit's uploaded report is kept (lib/visit-report), and
 * the reading itself: started by the agent, run after the answer has gone
 * back (a long report takes a minute or two), and looked up by the screen
 * until it is done. One per visit; reading again replaces it.
 */

/** The biggest report fetched to read. Inventory Base reports with photos run to tens of MB. */
const MAX_BYTES = 120 * 1024 * 1024;

export async function getRead(inspectionId: string): Promise<ReadState | null> {
  if (!hasDb()) return null;
  const [r] = await q<{ state: ReadState }>(`SELECT state FROM os_inspection_reads WHERE inspection_id = $1`, [inspectionId]).catch(() => []);
  const st = r?.state ?? null;
  if (!st) return null;
  /* The server restarted mid-read, or the reader never answered: say so, so it can be tried again. */
  if (st.status === "reading" && Date.now() - Date.parse(st.startedAt) > READ_GIVES_UP_MS) {
    return { ...st, status: "failed", error: "The reader stopped before it finished. Read it again, or fill the boxes in beside the report." };
  }
  return st;
}

async function putRead(inspectionId: string, state: ReadState): Promise<void> {
  await q(
    `INSERT INTO os_inspection_reads (inspection_id, state, updated_at) VALUES ($1, $2::jsonb, NOW())
     ON CONFLICT (inspection_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [inspectionId, JSON.stringify(state)]
  );
}

/** Mark the read as saved onto the visit. */
export async function markApplied(inspectionId: string, by: string): Promise<ReadState | null> {
  const st = await getRead(inspectionId);
  if (!st || st.status !== "done") return st;
  const next = { ...st, appliedAt: new Date().toISOString(), appliedBy: by };
  await putRead(inspectionId, next);
  return next;
}

/**
 * Begin a read: the state goes in as "reading" and is returned at once;
 * `run` is the work, for the route to hand to after().
 */
export async function beginRead(
  inspectionId: string,
  file: { key: string; name: string; type: string },
  by: string
): Promise<{ state: ReadState; run: () => Promise<void> }> {
  if (!hasDb()) throw new Error("No database on this environment.");
  if (!r2Configured) throw new Error("Storage isn't configured.");
  if (!keyIsOurs(file.key)) throw new Error("Not a valid file reference.");
  if (!canRead(file.type, file.name)) throw new Error("Only a PDF or a photo (JPG, PNG) can be read. Fill the boxes in beside it instead.");
  const state: ReadState = { status: "reading", key: file.key, name: file.name, by, startedAt: new Date().toISOString() };
  await putRead(inspectionId, state);

  const run = async () => {
    try {
      const obj = await withR2((client) => client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.key })));
      if ((obj.ContentLength ?? 0) > MAX_BYTES) throw new Error("That file is too big to read. Fill the boxes in beside it instead.");
      const body = await obj.Body?.transformToByteArray();
      if (!body) throw new Error("The file could not be opened.");
      const media = /pdf/i.test(file.type) || /\.pdf$/i.test(file.name) ? "application/pdf" : /png/i.test(file.type) || /\.png$/i.test(file.name) ? "image/png" : /webp/i.test(file.type) || /\.webp$/i.test(file.name) ? "image/webp" : "image/jpeg";
      const got = await readVisitReport(Buffer.from(body), media);
      await putRead(inspectionId, { ...state, status: "done", finishedAt: new Date().toISOString(), pages: got.pages, pagesRead: got.pagesRead, read: got.read });
    } catch (e) {
      console.error("[visit-report] read failed", inspectionId, e);
      await putRead(inspectionId, {
        ...state,
        status: "failed",
        finishedAt: new Date().toISOString(),
        error: publicError(e, "The report could not be read. Try again, or fill the boxes in beside it."),
      }).catch(() => undefined);
    }
  };
  return { state, run };
}
