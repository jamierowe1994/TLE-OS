import "server-only";
import { uid } from "@/lib/auth";
import { hasDb, q } from "@/lib/db";
import {
  SPECS, agentCanEdit, asAnswers, dayLabel, missingFor, todayIso,
  type Answers, type Decision, type HistoryStep, type Notice, type NoticeFile, type NoticeKind, type NoticeStatus,
  type PostService, type Review,
} from "@/lib/section-notices-spec";

export type { HistoryStep, Notice, NoticeFile };

/**
 * SECTION 13 AND SECTION 8 NOTICES (James and Michael, 7 Oct 2026).
 *
 * "One of the things that Susan's panicking about is sections." The agent
 * fills Michael's pre-approval checklist in on the home's file (Portfolio),
 * submits it, and it lands on his Sections tab. He ticks his own checks and
 * decides: approved to serve, returned for more, referred for legal review,
 * or declined. Approved, he serves it through PayProp by hand and records it
 * here. James: "we don't want to automate that process. Just to be on the
 * safe side for now" - so nothing in this file sends a notice, to anybody.
 *
 * ── The rules the screens lean on ────────────────────────────────────────
 *
 *   - One open notice of each kind per home. Opening the button again opens
 *     that one; a fresh one can start once it is served, declined or
 *     withdrawn.
 *   - The agent changes it only as a draft or once it has been returned.
 *     With Michael, or decided, it is fixed.
 *   - Submit is refused by the same `missingFor` the form shows, worked out
 *     again here from the stored answers and files, never from the client.
 *   - Whoever submits signs. A colleague finishing a draft is the agent on it.
 *   - Every step is kept in `history`, so the file says who did what, when.
 */

type Row = {
  id: string; kind: string; status: string; listing_id: string; property_id: string | null; property_label: string;
  answers: unknown; review: unknown; post_service: unknown; history: unknown;
  agent_id: string; agent_name: string; agent_email: string; is_test: boolean;
  created_at: Date; updated_at: Date; submitted_at: Date | null; decided_at: Date | null; decided_by: string; served_at: Date | null;
};

type FileRow = { id: string; notice_id: string; line_id: string; side: string; name: string; r2_key: string; mime: string; size_bytes: string | number; by_name: string; at: Date };

const iso = (d: Date | null) => (d ? new Date(d).toISOString() : null);

function asReview(v: unknown): Review {
  const o = (v && typeof v === "object" ? v : {}) as Partial<Review>;
  const checks: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(o.checks ?? {})) if (x === true) checks[k] = true;
  const d = o.decision;
  return {
    checks,
    decision: d === "approved" || d === "returned" || d === "legal" || d === "declined" ? d : null,
    comments: typeof o.comments === "string" ? o.comments.slice(0, 4000) : "",
  };
}

function asPost(v: unknown): PostService {
  const o = (v && typeof v === "object" ? v : {}) as Partial<PostService>;
  const checks: Record<string, boolean> = {};
  for (const [k, x] of Object.entries(o.checks ?? {})) if (x === true) checks[k] = true;
  return {
    checks,
    servedOn: typeof o.servedOn === "string" ? o.servedOn.slice(0, 10) : "",
    method: typeof o.method === "string" ? o.method.slice(0, 200) : "",
  };
}

const shapeFile = (r: FileRow): NoticeFile => ({
  id: r.id,
  lineId: r.line_id,
  side: r.side === "compliance" ? "compliance" : "agent",
  name: r.name,
  mime: r.mime,
  sizeBytes: Number(r.size_bytes) || 0,
  byName: r.by_name,
  at: new Date(r.at).toISOString(),
  url: `/api/r2/file?key=${encodeURIComponent(r.r2_key)}`,
  key: r.r2_key,
});

function shape(r: Row, files: FileRow[]): Notice {
  return {
    id: r.id,
    kind: r.kind === "s8" ? "s8" : "s13",
    status: r.status as NoticeStatus,
    listingId: r.listing_id,
    propertyId: r.property_id,
    propertyLabel: r.property_label,
    answers: asAnswers(r.answers),
    review: asReview(r.review),
    postService: asPost(r.post_service),
    history: Array.isArray(r.history) ? (r.history as HistoryStep[]) : [],
    agentId: r.agent_id,
    agentName: r.agent_name,
    agentEmail: r.agent_email,
    test: r.is_test,
    createdAt: new Date(r.created_at).toISOString(),
    updatedAt: new Date(r.updated_at).toISOString(),
    submittedAt: iso(r.submitted_at),
    decidedAt: iso(r.decided_at),
    decidedBy: r.decided_by,
    servedAt: iso(r.served_at),
    files: files.filter((f) => f.notice_id === r.id).map(shapeFile),
  };
}

const COLS = `id, kind, status, listing_id, property_id, property_label, answers, review, post_service, history,
  agent_id, agent_name, agent_email, is_test, created_at, updated_at, submitted_at, decided_at, decided_by, served_at`;

async function withFiles(rows: Row[]): Promise<Notice[]> {
  if (!rows.length) return [];
  const files = await q<FileRow>(
    `SELECT id, notice_id, line_id, side, name, r2_key, mime, size_bytes, by_name, at
       FROM os_section_notice_files WHERE notice_id = ANY($1::text[]) ORDER BY at`,
    [rows.map((r) => r.id)]
  );
  return rows.map((r) => shape(r, files));
}

export async function getNotice(id: string): Promise<Notice | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>(`SELECT ${COLS} FROM os_section_notices WHERE id = $1`, [id]);
  return (await withFiles(rows))[0] ?? null;
}

/** A home's notices, newest first. Withdrawn drafts are gone from view. */
export async function noticesForHome(listingId: string): Promise<Notice[]> {
  if (!hasDb() || !listingId) return [];
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_section_notices WHERE listing_id = $1 AND status <> 'withdrawn' ORDER BY created_at DESC LIMIT 50`,
    [listingId]
  );
  return withFiles(rows);
}

/** Still in play: a new one of the same kind would be a second copy of it. */
const OPEN: NoticeStatus[] = ["draft", "submitted", "returned", "legal", "approved"];

export interface Who {
  id: string;
  name: string;
  email: string;
}

const step = (by: string, what: string, note?: string): HistoryStep => ({ at: new Date().toISOString(), by, what, ...(note ? { note } : {}) });

/**
 * Start one, or hand back the one already open on this home. `answers` is
 * what the form filled in from the home's record before anything was typed.
 */
export async function startNotice(p: {
  kind: NoticeKind;
  listingId: string;
  propertyId: string | null;
  propertyLabel: string;
  answers: Answers;
  test: boolean;
  by: Who;
}): Promise<{ notice: Notice; existing: boolean }> {
  const open = await q<Row>(
    `SELECT ${COLS} FROM os_section_notices WHERE listing_id = $1 AND kind = $2 AND status = ANY($3::text[]) ORDER BY created_at DESC LIMIT 1`,
    [p.listingId, p.kind, OPEN]
  );
  if (open[0]) return { notice: (await withFiles(open))[0], existing: true };
  const id = uid();
  const rows = await q<Row>(
    `INSERT INTO os_section_notices (id, kind, listing_id, property_id, property_label, answers, history, agent_id, agent_name, agent_email, is_test)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLS}`,
    [id, p.kind, p.listingId, p.propertyId, p.propertyLabel.slice(0, 300), JSON.stringify(p.answers),
      JSON.stringify([step(p.by.name, "Started")]), p.by.id, p.by.name, p.by.email, p.test]
  );
  return { notice: (await withFiles(rows))[0], existing: false };
}

export type Refusal = { ok: false; error: string; status: number };
type Done = { ok: true; notice: Notice };

const refuse = (error: string, status = 409): Refusal => ({ ok: false, error, status });

/** The agent's answers, saved as they type. Refused once it is out of their hands. */
export async function saveAnswers(id: string, answers: Answers): Promise<Done | Refusal> {
  const rows = await q<Row>(
    `UPDATE os_section_notices SET answers = $2, updated_at = NOW()
      WHERE id = $1 AND status IN ('draft', 'returned') RETURNING ${COLS}`,
    [id, JSON.stringify(answers)]
  );
  if (rows[0]) return { ok: true, notice: (await withFiles(rows))[0] };
  const now = await getNotice(id);
  if (!now) return refuse("That notice is not there any more.", 404);
  return refuse("This one is with compliance now, so it can't be changed. Ask Michael to return it if something is wrong.");
}

function fileCounts(n: Notice, side: "agent" | "compliance" = "agent"): Record<string, number> {
  const out: Record<string, number> = {};
  for (const f of n.files) if (f.side === side) out[f.lineId] = (out[f.lineId] ?? 0) + 1;
  return out;
}

/** Off to Michael. Checked again here from what is stored, never from the screen. */
export async function submitNotice(id: string, by: Who): Promise<Done | Refusal> {
  const n = await getNotice(id);
  if (!n) return refuse("That notice is not there any more.", 404);
  if (!agentCanEdit(n.status)) return refuse("This one has already gone to compliance.");
  const answers = n.answers;
  /* "Date submitted" left as the form filled it in is the day it goes. */
  if (answers.auto.includes("submitted")) answers.fields.submitted = todayIso();
  const missing = missingFor(SPECS[n.kind], answers, fileCounts(n));
  if (missing.length) return refuse(`Not everything is done yet: ${missing.slice(0, 3).map((m) => m.label).join("; ")}${missing.length > 3 ? ` and ${missing.length - 3} more` : ""}.`, 400);
  /* Sent back after a return: Michael checks it afresh, so his old ticks go.
     What he wrote last time stays in the history. */
  const again = n.status === "returned";
  const rows = await q<Row>(
    `UPDATE os_section_notices
        SET status = 'submitted', answers = $2, submitted_at = NOW(), updated_at = NOW(), review = '{}',
            agent_id = $3, agent_name = $4, agent_email = $5,
            history = history || $6::jsonb
      WHERE id = $1 AND status IN ('draft', 'returned') RETURNING ${COLS}`,
    [id, JSON.stringify(answers), by.id, by.name, by.email, JSON.stringify([step(by.name, again ? "Sent back to compliance" : "Submitted to compliance")])]
  );
  if (!rows[0]) return refuse("This one has already gone to compliance.");
  return { ok: true, notice: (await withFiles(rows))[0] };
}

/** The agent takes it back: a draft they no longer want, or one Michael has not decided yet. */
export async function withdrawNotice(id: string, by: Who): Promise<Done | Refusal> {
  const rows = await q<Row>(
    `UPDATE os_section_notices SET status = 'withdrawn', updated_at = NOW(), history = history || $2::jsonb
      WHERE id = $1 AND status IN ('draft', 'submitted', 'returned') RETURNING ${COLS}`,
    [id, JSON.stringify([step(by.name, "Withdrawn")])]
  );
  if (rows[0]) return { ok: true, notice: (await withFiles(rows))[0] };
  return refuse("Once compliance has decided, it can't be withdrawn from here.");
}

/** Michael's ticks, saved as he goes, without deciding anything yet. */
export async function saveReview(id: string, review: Review): Promise<Done | Refusal> {
  const rows = await q<Row>(
    `UPDATE os_section_notices SET review = $2, updated_at = NOW()
      WHERE id = $1 AND status IN ('submitted', 'legal') RETURNING ${COLS}`,
    [id, JSON.stringify({ ...review, decision: null })]
  );
  if (rows[0]) return { ok: true, notice: (await withFiles(rows))[0] };
  return refuse("This one is not waiting for a decision.");
}

const STATUS_OF: Record<Decision, NoticeStatus> = { approved: "approved", returned: "returned", legal: "legal", declined: "declined" };

/** His decision. Approving needs every check of his ticked; anything else needs his words. */
export async function decideNotice(id: string, review: Review, by: Who): Promise<Done | Refusal> {
  const n = await getNotice(id);
  if (!n) return refuse("That notice is not there any more.", 404);
  if (n.status !== "submitted" && n.status !== "legal") return refuse("This one is not waiting for a decision.");
  const spec = SPECS[n.kind];
  const d = review.decision;
  if (!d || !spec.decisions.includes(d)) return refuse("Pick a decision.", 400);
  if (d === "approved") {
    const left = spec.compliance.filter((c) => !review.checks[c.id]);
    if (left.length) return refuse(`Tick every compliance check before approving: ${left.map((c) => c.label).join(", ")}.`, 400);
  } else if (!review.comments.trim()) {
    return refuse("Say what is needed, so the agent knows what to do next.", 400);
  }
  const rows = await q<Row>(
    `UPDATE os_section_notices
        SET status = $2, review = $3, decided_at = NOW(), decided_by = $4, updated_at = NOW(),
            history = history || $5::jsonb
      WHERE id = $1 AND status IN ('submitted', 'legal') RETURNING ${COLS}`,
    [id, STATUS_OF[d], JSON.stringify(review), by.name, JSON.stringify([step(by.name, labelOf(d), review.comments.trim() || undefined)])]
  );
  if (!rows[0]) return refuse("Somebody else decided it a moment ago. Reload to see it.");
  return { ok: true, notice: (await withFiles(rows))[0] };
}

function labelOf(d: Decision): string {
  return d === "approved" ? "Approved to serve" : d === "returned" ? "Returned for further information" : d === "legal" ? "Referred for legal review" : "Declined - do not serve";
}

/**
 * After it is approved: what Michael did with it. Saved as he goes; with
 * `served` it is marked served, which needs the date, the method and - on a
 * Section 8 - every post-service line ticked and both files attached.
 */
export async function recordService(id: string, post: PostService, served: boolean, by: Who): Promise<Done | Refusal> {
  const n = await getNotice(id);
  if (!n) return refuse("That notice is not there any more.", 404);
  if (n.status !== "approved" && n.status !== "served") return refuse("Only an approved notice can be served.");
  if (served) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(post.servedOn)) return refuse("When was it served?", 400);
    if (!post.method.trim()) return refuse("How was it served?", 400);
    const counts = fileCounts(n, "compliance");
    for (const l of SPECS[n.kind].postService) {
      if (!post.checks[l.id]) return refuse(`Tick "${l.label}" first.`, 400);
      if (l.evidence && !(counts[l.id] > 0)) return refuse(`Attach the file for "${l.label}" first.`, 400);
    }
  }
  const markServed = served && n.status === "approved";
  const rows = await q<Row>(
    `UPDATE os_section_notices
        SET post_service = $2, updated_at = NOW(),
            status = CASE WHEN $3 THEN 'served' ELSE status END,
            served_at = CASE WHEN $3 THEN NOW() ELSE served_at END,
            history = CASE WHEN $3 THEN history || $4::jsonb ELSE history END
      WHERE id = $1 RETURNING ${COLS}`,
    [id, JSON.stringify(post), markServed, JSON.stringify([step(by.name, "Marked as served", `${dayLabel(post.servedOn)}, ${post.method.trim().toLowerCase()}`)])]
  );
  return { ok: true, notice: (await withFiles(rows))[0] };
}

/* -------------------------------------------------------------- files -- */

export async function addFile(p: {
  noticeId: string; lineId: string; side: "agent" | "compliance"; name: string; r2Key: string; mime: string; sizeBytes: number; byName: string;
}): Promise<NoticeFile> {
  const rows = await q<FileRow>(
    `INSERT INTO os_section_notice_files (id, notice_id, line_id, side, name, r2_key, mime, size_bytes, by_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     RETURNING id, notice_id, line_id, side, name, r2_key, mime, size_bytes, by_name, at`,
    [uid(), p.noticeId, p.lineId.slice(0, 60), p.side, p.name.slice(0, 200), p.r2Key, p.mime, p.sizeBytes, p.byName]
  );
  await q(`UPDATE os_section_notices SET updated_at = NOW() WHERE id = $1`, [p.noticeId]);
  return shapeFile(rows[0]);
}

/** Off the notice. The object stays in storage: evidence is never destroyed from a screen. */
export async function removeFile(noticeId: string, fileId: string, side: "agent" | "compliance"): Promise<boolean> {
  const rows = await q<{ id: string }>(
    `DELETE FROM os_section_notice_files WHERE id = $1 AND notice_id = $2 AND side = $3 RETURNING id`,
    [fileId, noticeId, side]
  );
  return rows.length > 0;
}

/* -------------------------------------------------------------- desk --- */

/** Michael's list: everything that has been submitted, ever, of both kinds. */
export async function deskNotices(): Promise<Notice[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT ${COLS} FROM os_section_notices
      WHERE status NOT IN ('draft', 'withdrawn')
      ORDER BY COALESCE(submitted_at, created_at) DESC LIMIT 500`
  );
  return withFiles(rows);
}

/** For the bell: what is waiting on the office. */
export async function waitingOnDesk(): Promise<{ id: string; kind: NoticeKind; label: string; by: string; at: string; again: boolean }[]> {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; kind: string; property_label: string; agent_name: string; submitted_at: Date; history: unknown }>(
    `SELECT id, kind, property_label, agent_name, submitted_at, history FROM os_section_notices
      WHERE status = 'submitted' ORDER BY submitted_at DESC LIMIT 40`
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "s8" ? "s8" : "s13",
    label: r.property_label,
    by: r.agent_name,
    at: new Date(r.submitted_at).toISOString(),
    again: Array.isArray(r.history) && (r.history as HistoryStep[]).some((h) => h.what.startsWith("Returned")),
  }));
}

/** For the agent's bell: Michael's decisions on their notices, the last fortnight. */
export async function decisionsFor(email: string): Promise<{ id: string; kind: NoticeKind; listingId: string; label: string; status: NoticeStatus; by: string; at: string; note: string }[]> {
  if (!hasDb() || !email) return [];
  const rows = await q<{ id: string; kind: string; listing_id: string; property_label: string; status: string; decided_by: string; decided_at: Date; review: unknown }>(
    `SELECT id, kind, listing_id, property_label, status, decided_by, decided_at, review FROM os_section_notices
      WHERE LOWER(agent_email) = LOWER($1) AND decided_at > NOW() - INTERVAL '14 days'
        AND status IN ('approved', 'returned', 'legal', 'declined', 'served')
      ORDER BY decided_at DESC LIMIT 20`,
    [email]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind === "s8" ? "s8" : "s13",
    listingId: r.listing_id,
    label: r.property_label,
    status: r.status as NoticeStatus,
    by: r.decided_by,
    at: new Date(r.decided_at).toISOString(),
    note: asReview(r.review).comments,
  }));
}
