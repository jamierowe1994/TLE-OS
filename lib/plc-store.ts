import "server-only";
import crypto from "crypto";
import fs from "fs/promises";
import path from "path";
import { hasDb, q } from "@/lib/db";
import { DATA_DIR } from "@/lib/business/data-dir";
import {
  canMove,
  checkById,
  gateFor,
  type CheckId,
  type Finding,
  type PlcCase,
  type PlcDocument,
  type PlcState,
  type PropolyPush,
  type RexPush,
  type Waiver,
} from "@/lib/plc";

/**
 * Where PLC cases live.
 *
 * Dual backend, the same as the appraisal store: Postgres when DATABASE_URL is
 * set, a JSON file under DATA_DIR when it is not, so the pilot laptops and
 * `next build` both work without one.
 *
 * ── Every state change goes through move() ─────────────────────────────────
 *
 * Not because it is tidy, but because the ordering rules in PLC_TRANSITIONS
 * are only worth writing down if there is exactly one door they guard. If a
 * route could set `state` directly then the table would be documentation
 * rather than enforcement, and the mistake it exists to stop -- a pack
 * approved before anybody read it -- is precisely the kind that gets made by
 * a well-meaning second implementation six months from now.
 *
 * The refusals carry sentences, not codes. An agent who tries to add a
 * document after submitting should be told that compliance already has it,
 * because that is the actual situation and it tells them what to do next.
 */

const FILE = path.join(DATA_DIR, "plc-cases.json");

/* ─────────────────────────────── shapes ─────────────────────────────────── */

interface Row extends Record<string, unknown> {
  id: string;
  application_ref: string;
  address: string;
  agent_name: string;
  agent_email: string;
  state: string;
  move_in_date: string | Date | null;
  agent_note: string;
  documents: PlcDocument[] | null;
  findings: Finding[] | null;
  waivers: Waiver[] | null;
  propoly_push: PropolyPush | null;
  rex_push: RexPush | null;
  submitted_at: string | Date | null;
  scanned_at: string | Date | null;
  decided_at: string | Date | null;
  decided_by: string | null;
  decision_note: string;
  created_at: string | Date;
}

const iso = (v: string | Date | null | undefined) => (v ? new Date(v).toISOString() : null);

/** A DATE column, kept as a plain YYYY-MM-DD. A move-in has no time of day,
 *  and putting one on it is how a tenancy starting on the 1st reads as the
 *  31st in a timezone west of here. */
function ymd(v: string | Date | null | undefined): string | null {
  if (!v) return null;
  if (typeof v === "string") return v.slice(0, 10);
  /* A DATE column comes back as a Date at LOCAL midnight. toISOString would
     render that in UTC, which on a BST machine is the evening before - and
     every save would move the move-in date back a day. Read the local parts. */
  const m = String(v.getMonth() + 1).padStart(2, "0");
  const d = String(v.getDate()).padStart(2, "0");
  return `${v.getFullYear()}-${m}-${d}`;
}

function rowTo(r: Row): PlcCase {
  return {
    id: r.id,
    applicationRef: r.application_ref,
    address: r.address,
    agentName: r.agent_name,
    agentEmail: r.agent_email ?? "",
    state: r.state as PlcState,
    moveInDate: ymd(r.move_in_date),
    agentNote: r.agent_note ?? "",
    documents: Array.isArray(r.documents) ? r.documents : [],
    findings: Array.isArray(r.findings) ? r.findings : [],
    waivers: Array.isArray(r.waivers) ? r.waivers : [],
    propolyPush: r.propoly_push ?? null,
    rexPush: r.rex_push ?? null,
    submittedAt: iso(r.submitted_at),
    scannedAt: iso(r.scanned_at),
    decidedAt: iso(r.decided_at),
    decidedBy: r.decided_by ?? null,
    decisionNote: r.decision_note ?? "",
    createdAt: new Date(r.created_at).toISOString(),
  };
}

const COLS = `id, application_ref, address, agent_name, agent_email, state,
              move_in_date, agent_note, documents, findings, waivers, propoly_push, rex_push, submitted_at,
              scanned_at, decided_at, decided_by, decision_note, created_at`;

/* ──────────────────────────── the file backend ──────────────────────────── */

async function readFile(): Promise<PlcCase[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as PlcCase[]) : [];
  } catch {
    /* No file yet is the normal state before the first handover. */
    return [];
  }
}

async function writeFile(rows: PlcCase[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(rows, null, 2), "utf8");
}

/**
 * Read one, change it in memory, write it back.
 *
 * Every mutation below is expressed as one of these so that the two backends
 * cannot drift apart in behaviour -- the rules live in the callback, which
 * runs identically whichever store is underneath.
 */
async function mutate(id: string, fn: (c: PlcCase) => PlcCase): Promise<PlcCase> {
  if (hasDb()) {
    const rows = await q<Row>(`SELECT ${COLS} FROM os_plc_cases WHERE id = $1`, [id]);
    if (!rows[0]) throw new PlcRefused("That handover no longer exists.");
    const next = fn(rowTo(rows[0]));
    const saved = await q<Row>(
      `UPDATE os_plc_cases
          SET state = $2, move_in_date = $3, agent_note = $4,
              documents = $5::jsonb, findings = $6::jsonb,
              submitted_at = $7, scanned_at = $8,
              decided_at = $9, decided_by = $10, decision_note = $11,
              waivers = $12::jsonb, propoly_push = $13::jsonb, rex_push = $14::jsonb,
              updated_at = NOW()
        WHERE id = $1
        RETURNING ${COLS}`,
      [
        id,
        next.state,
        next.moveInDate,
        next.agentNote,
        JSON.stringify(next.documents),
        JSON.stringify(next.findings),
        next.submittedAt,
        next.scannedAt,
        next.decidedAt,
        next.decidedBy,
        next.decisionNote,
        JSON.stringify(next.waivers ?? []),
        next.propolyPush ? JSON.stringify(next.propolyPush) : null,
        next.rexPush ? JSON.stringify(next.rexPush) : null,
      ]
    );
    return rowTo(saved[0]);
  }

  const rows = await readFile();
  const idx = rows.findIndex((r) => r.id === id);
  if (idx < 0) throw new PlcRefused("That handover no longer exists.");
  rows[idx] = fn(rows[idx]);
  await writeFile(rows);
  return rows[idx];
}

/* ──────────────────────────────── refusals ──────────────────────────────── */

/**
 * Something the rules do not allow, with a sentence saying why.
 *
 * A separate class so routes can answer 409 for "you cannot do that from here"
 * and keep 500 meaning "we broke". Those look the same to a user and are
 * completely different to whoever is asked to fix it.
 */
export class PlcRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlcRefused";
  }
}

/* ──────────────────────────────── reading ───────────────────────────────── */

/** Everything, newest first. */
export async function listCases(): Promise<PlcCase[]> {
  if (hasDb()) {
    const rows = await q<Row>(`SELECT ${COLS} FROM os_plc_cases ORDER BY created_at DESC`);
    return rows.map(rowTo);
  }
  return (await readFile()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getCase(id: string): Promise<PlcCase | null> {
  if (hasDb()) {
    const rows = await q<Row>(`SELECT ${COLS} FROM os_plc_cases WHERE id = $1`, [id]);
    return rows[0] ? rowTo(rows[0]) : null;
  }
  return (await readFile()).find((r) => r.id === id) ?? null;
}

/**
 * Kirstie's queue: what is with compliance, longest wait first.
 *
 * Oldest first rather than newest, which is the opposite of every other list
 * in the OS and is the point -- a queue sorted newest-first starves the case
 * that has been waiting longest, and that case is somebody's move-in date.
 */
export async function reviewQueue(): Promise<PlcCase[]> {
  const open: PlcState[] = ["submitted", "scanning", "reviewing"];
  const all = await listCases();
  return all
    .filter((c) => open.includes(c.state))
    .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
}

/* ──────────────────────────────── writing ───────────────────────────────── */

export interface NewCase {
  applicationRef: string;
  address: string;
  agentName: string;
  agentEmail: string;
  moveInDate?: string | null;
}

/**
 * Start a handover.
 *
 * Idempotent on the application: the id is derived from `applicationRef`, so
 * an agent who opens the handover twice gets the pack they already started
 * rather than a second empty one beside it. Nothing on an existing case is
 * overwritten -- a re-open must never wipe attached documents.
 */
export async function createCase(input: NewCase): Promise<PlcCase> {
  const applicationRef = input.applicationRef.trim();
  const address = input.address.trim();
  if (!applicationRef) throw new PlcRefused("A handover has to come from an application.");
  if (!address) throw new PlcRefused("A handover needs the property address.");

  const id = `plc-${applicationRef.replace(/[^\w-]+/g, "-")}`;
  const existing = await getCase(id);
  if (existing) return existing;

  const now = new Date().toISOString();
  const fresh: PlcCase = {
    id,
    applicationRef,
    address,
    agentName: input.agentName.trim() || "Unassigned",
    agentEmail: input.agentEmail.trim().toLowerCase(),
    state: "assembling",
    moveInDate: input.moveInDate ? input.moveInDate.slice(0, 10) : null,
    agentNote: "",
    documents: [],
    findings: [],
    waivers: [],
    propolyPush: null,
    submittedAt: null,
    scannedAt: null,
    decidedAt: null,
    decidedBy: null,
    decisionNote: "",
    createdAt: now,
  };

  if (hasDb()) {
    const rows = await q<Row>(
      `INSERT INTO os_plc_cases
         (id, application_ref, address, agent_name, agent_email, state, move_in_date)
       VALUES ($1, $2, $3, $4, $5, 'assembling', $6)
       ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
       RETURNING ${COLS}`,
      [id, applicationRef, address, fresh.agentName, fresh.agentEmail, fresh.moveInDate]
    );
    return rowTo(rows[0]);
  }

  const rows = await readFile();
  rows.push(fresh);
  await writeFile(rows);
  return fresh;
}

/** The move-in date and the agent's note, while the pack is still theirs. */
export async function updateDetails(
  id: string,
  patch: { moveInDate?: string | null; agentNote?: string }
): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (c.state !== "assembling") {
      throw new PlcRefused(
        "This pack is with compliance, so it can't be changed here. Ask them to defer it back to you."
      );
    }
    return {
      ...c,
      moveInDate:
        patch.moveInDate === undefined ? c.moveInDate : patch.moveInDate?.slice(0, 10) || null,
      agentNote: patch.agentNote === undefined ? c.agentNote : patch.agentNote,
    };
  });
}

/**
 * Attach a document against a check.
 *
 * More than one per check is allowed and normal -- two owners means two sets
 * of ID, and an EICR often arrives with a separate remedial certificate.
 */
export async function attachDocument(
  id: string,
  doc: {
    checkId: CheckId;
    name: string;
    key: string;
    url: string;
    addedBy: string;
    placeholder?: boolean;
  }
): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (c.state !== "assembling") {
      throw new PlcRefused(
        "This pack has already gone to compliance. Anything else has to go with a deferral."
      );
    }
    const next: PlcDocument = {
      checkId: doc.checkId,
      name: doc.name,
      key: doc.key,
      url: doc.url,
      addedAt: new Date().toISOString(),
      addedBy: doc.addedBy,
      ...(doc.placeholder ? { placeholder: true as const } : {}),
    };
    return { ...c, documents: [...c.documents, next] };
  });
}

export async function removeDocument(id: string, key: string): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (c.state !== "assembling") {
      throw new PlcRefused("This pack is with compliance. Documents can't be taken back out of it.");
    }
    return { ...c, documents: c.documents.filter((d) => d.key !== key) };
  });
}

/**
 * Hand it over.
 *
 * Refuses a short pack, because a submission that is obviously incomplete
 * costs a round trip through a person -- and that person is the bottleneck the
 * whole screen exists to unblock. `force` exists for the genuine case where a
 * document legitimately lives elsewhere; it does not skip the check, it
 * records that the agent overrode it.
 */
export async function submitCase(id: string): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (!canMove(c.state, "submitted")) {
      throw new PlcRefused(
        c.state === "deferred"
          ? "This came back to you — reopen it before submitting again."
          : "This has already been submitted."
      );
    }
    if (!c.moveInDate) {
      /* Not pedantry: every date check is "in date ON the move-in date", so
         without one the scan cannot answer the only question it is good at. */
      throw new PlcRefused("Add the move-in date first — the date checks are measured against it.");
    }
    /* THE GATE. There is no force any more. A required slot cannot be talked
       past, and a conditional one needs its reason recorded first (see
       waiveCheck). The wizard shows both lists before it ever gets here; this
       is the same rule applied where it cannot be skipped. */
    const gate = gateFor(c);
    if (gate.blocked.length) {
      throw new PlcRefused(`Can't send without: ${gate.blocked.map((k) => k.label).join(", ")}.`);
    }
    if (gate.askWhy.length) {
      throw new PlcRefused(
        `Say why these aren't needed, or attach them: ${gate.askWhy.map((k) => k.label).join(", ")}.`
      );
    }
    return {
      ...c,
      state: "submitted",
      submittedAt: new Date().toISOString(),
      agentNote: c.waivers.length
        ? `${c.agentNote}${c.agentNote ? "\n\n" : ""}Not needed: ${c.waivers
            .map((w) => `${checkById(w.checkId)?.label ?? w.checkId} (${w.reason})`)
            .join("; ")}.`.trim()
        : c.agentNote,
    };
  });
}

/**
 * "This one isn't needed, and here is why."
 *
 * Only a conditional check can be waived, only while the pack is the
 * agent's, and only with a reason. A reason that is one word is not a reason;
 * Kirstie will read it next to an empty slot and has to be able to agree or
 * disagree with it. Attaching a file later removes the waiver's purpose but
 * not its record.
 */
export async function waiveCheck(
  id: string,
  checkId: CheckId,
  reason: string,
  by: string
): Promise<PlcCase> {
  const check = checkById(checkId);
  if (!check) throw new PlcRefused("That isn't one of the checks.");
  if (check.gate !== "conditional") {
    throw new PlcRefused(
      check.gate === "required"
        ? `${check.label} is needed on every let - it can't be marked not needed.`
        : `${check.label} isn't part of the pre-let gate.`
    );
  }
  const why = reason.trim();
  if (why.length < 8) throw new PlcRefused("Say why in a sentence - Kirstie reads this next to the empty slot.");
  return mutate(id, (c) => {
    if (c.state !== "assembling") throw new PlcRefused("The pack has left you - reopen it first.");
    const waiver: Waiver = { checkId, reason: why, by, at: new Date().toISOString() };
    return { ...c, waivers: [...c.waivers.filter((w) => w.checkId !== checkId), waiver] };
  });
}

export async function unwaiveCheck(id: string, checkId: CheckId): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (c.state !== "assembling") throw new PlcRefused("The pack has left you - reopen it first.");
    return { ...c, waivers: c.waivers.filter((w) => w.checkId !== checkId) };
  });
}

/**
 * What the reader found BEFORE the pack was allowed to leave.
 *
 * Written on a case that is still assembling, because the scan refused to
 * let it go: a certificate that expires before move-in is a failed PLC check
 * waiting to be charged for. The findings sit on the case so the agent sees
 * the exact line, fixes the document, and tries again.
 */
/** What happened when the pack was pushed into Propoly. Any state: a push
 *  can be re-run on an approved case as often as it needs. */
export async function recordPropolyPush(id: string, push: PropolyPush): Promise<PlcCase> {
  return mutate(id, (c) => ({ ...c, propolyPush: push }));
}

export async function recordRexPush(id: string, push: RexPush): Promise<PlcCase> {
  return mutate(id, (c) => ({ ...c, rexPush: push }));
}

export async function recordPreflight(id: string, findings: Finding[]): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (c.state !== "assembling") throw new PlcRefused("That pack isn't with the agent.");
    return { ...c, findings, scannedAt: new Date().toISOString() };
  });
}

/** Deferred back to the agent, and they have picked it up again. */
export async function reopenCase(id: string): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (!canMove(c.state, "assembling")) {
      throw new PlcRefused("Only a deferred pack can be reopened.");
    }
    /* Findings are cleared on reopen. They describe documents that are about
       to change, and a stale blocker against a certificate that has since been
       replaced is worse than no finding at all. */
    return { ...c, state: "assembling", findings: [], scannedAt: null };
  });
}

export async function markScanning(id: string): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (!canMove(c.state, "scanning")) {
      throw new PlcRefused("There's nothing to scan from here.");
    }
    return { ...c, state: "scanning" };
  });
}

/**
 * The scan came back.
 *
 * Lands the case in `reviewing` whatever it found -- including when it found
 * nothing, and including when the scan itself failed. The scan does not
 * decide, so there is no result it can produce that removes the need for
 * Kirstie to look, and a failure that quietly parked the case would hide it
 * from the queue entirely.
 */
export async function recordScan(id: string, findings: Finding[]): Promise<PlcCase> {
  return mutate(id, (c) => {
    if (c.state !== "scanning" && c.state !== "submitted") {
      throw new PlcRefused("That pack isn't waiting on a scan.");
    }
    return {
      ...c,
      state: "reviewing",
      findings,
      scannedAt: new Date().toISOString(),
    };
  });
}

/**
 * Kirstie's decision.
 *
 * A note is required on anything other than an approval, because "deferred"
 * with no reason sends the agent back to a pack of nine documents with no idea
 * which one is wrong -- which is the email thread this was built to end.
 */
export async function decideCase(
  id: string,
  decision: "approved" | "deferred" | "declined",
  by: string,
  note: string
): Promise<PlcCase> {
  const trimmed = note.trim();
  if (decision !== "approved" && !trimmed) {
    throw new PlcRefused(
      decision === "deferred"
        ? "Say what's missing — the agent only sees this note."
        : "A decline needs a reason on the record."
    );
  }
  return mutate(id, (c) => {
    if (!canMove(c.state, decision)) {
      throw new PlcRefused(
        c.state === "approved" || c.state === "declined" || c.state === "deferred"
          ? "This has already been decided."
          : "This pack hasn't been reviewed yet."
      );
    }
    return {
      ...c,
      state: decision,
      decidedAt: new Date().toISOString(),
      decidedBy: by,
      decisionNote: trimmed,
    };
  });
}

/** For a fresh case created outside an application, in a demo or a test. */
export const newCaseId = () => `plc-${crypto.randomUUID().slice(0, 8)}`;
