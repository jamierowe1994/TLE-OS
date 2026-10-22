import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import {
  clean, describe, problems, reachesCustomer,
  DEFAULT_DAILY_CAP, MAX_AUTOMATIONS_EACH, MAX_DAILY_CAP,
  type AutomationDef,
} from "@/lib/automations/catalogue";

/**
 * Where automations and their runs are kept.
 *
 * Two tables, made here on first use like Steve's jobs (lib/steve-jobs), so
 * this does not touch lib/db.ts, the schema file every session edits.
 *
 * ── An automation's life ──────────────────────────────────────────────────
 *
 *   draft     saved, off. Where every chat-built one starts: the AI never
 *             switches anything on (James, 22 Oct 2026).
 *   preview   switched on, and the first time it would write to a customer
 *             it stops and shows the agent exactly what would go. Nothing is
 *             sent until they press Send it.
 *   live      they approved a first one. From here it sends on its own,
 *             within its caps.
 *
 * One that writes to nobody but the agent or the team (a task, the bell, a
 * Huddle) skips preview: there is nothing to check before it goes.
 *
 * Changing what a live automation does puts it back to preview - an approval
 * was for those words, not for whatever they become.
 *
 * ── A run ─────────────────────────────────────────────────────────────────
 *
 * One per automation per customer, by a unique key: a customer gets a given
 * automation ONCE (James's rule). The anniversary and the certificate carry
 * the year and the certificate in their key, so next year's is a new run.
 */

export type AutoState = "draft" | "preview" | "live";

export interface Automation {
  id: string;
  userId: string;
  userName: string;
  name: string;
  def: AutomationDef;
  sentence: string;
  enabled: boolean;
  state: AutoState;
  dailyCap: number;
  /** What they typed to the builder, if it came from there. */
  askedFor: string | null;
  /** The newest moment already looked at for its trigger. */
  cursor: string | null;
  /** For a schedule: the next time it is due. */
  nextAt: string | null;
  /** An owner switched it off (name and when), so the agent is told why. */
  offBy: string | null;
  offAt: string | null;
  createdAt: string;
  updatedAt: string;
  /* Read with the list, never stored. */
  lastRunAt?: string | null;
  runsThisMonth?: number;
  waiting?: number;
}

export type RunState = "waiting" | "preview" | "done" | "skipped" | "held" | "failed" | "cancelled";

/** Who the run is about, as the trigger found them. */
export interface Subject {
  /** Unique within the automation: the "once per customer" key. */
  key: string;
  /** When the thing happened. */
  at: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string;
  postcode: string | null;
  listingId: string | null;
  leadId: string | null;
  propertyId: string | null;
  /** A line for the log: "Enquiry on 8 Recreation Terrace from Rightmove". */
  what: string;
  /** Anything a condition needs that the trigger already knew. */
  facts: Record<string, string | null>;
}

export interface ActionOutcome {
  action: string;
  state: "sent" | "queued" | "done" | "skipped" | "held" | "failed";
  /** Who it went to: an address, a number, "you", a Huddle. */
  to: string;
  /** For a line in somebody's bell: their OS user id. */
  toId?: string;
  detail: string;
  /** For an email: what it said, so the log can show it. */
  subject?: string;
  /** os_scheduled_sends id for a queued email: its fate is read from there. */
  sendId?: string;
}

export interface Run {
  id: string;
  automationId: string;
  userId: string;
  subject: Subject;
  state: RunState;
  dueAt: string;
  outcomes: ActionOutcome[];
  detail: string;
  /** The rendered first send, while it waits for the agent. */
  preview: PreviewItem[] | null;
  createdAt: string;
  finishedAt: string | null;
  /* Joined for the log. */
  automationName?: string;
  userName?: string;
}

export interface PreviewItem {
  action: string;
  to: string;
  subject?: string;
  html?: string;
  text?: string;
  note?: string;
}

let ready: Promise<void> | null = null;
export function ensure(): Promise<void> {
  ready ??= q(`
    CREATE TABLE IF NOT EXISTS os_automations (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      user_name   TEXT NOT NULL DEFAULT '',
      name        TEXT NOT NULL,
      def         JSONB NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT FALSE,
      state       TEXT NOT NULL DEFAULT 'draft',
      daily_cap   INTEGER NOT NULL DEFAULT ${DEFAULT_DAILY_CAP},
      asked_for   TEXT,
      cursor_at   TIMESTAMPTZ,
      next_at     TIMESTAMPTZ,
      off_by      TEXT,
      off_at      TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS os_automations_user ON os_automations (user_id);
    CREATE TABLE IF NOT EXISTS os_automation_runs (
      id             TEXT PRIMARY KEY,
      automation_id  TEXT NOT NULL,
      user_id        TEXT NOT NULL,
      subject_key    TEXT NOT NULL,
      subject        JSONB NOT NULL,
      state          TEXT NOT NULL DEFAULT 'waiting',
      due_at         TIMESTAMPTZ NOT NULL,
      outcomes       JSONB NOT NULL DEFAULT '[]'::jsonb,
      detail         TEXT NOT NULL DEFAULT '',
      preview        JSONB,
      customer       TEXT,
      reached        BOOLEAN NOT NULL DEFAULT FALSE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      finished_at    TIMESTAMPTZ,
      UNIQUE (automation_id, subject_key)
    );
    CREATE INDEX IF NOT EXISTS os_automation_runs_due ON os_automation_runs (due_at) WHERE state = 'waiting';
    CREATE INDEX IF NOT EXISTS os_automation_runs_user ON os_automation_runs (user_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS os_automation_runs_customer ON os_automation_runs (customer, finished_at) WHERE reached;
  `).then(() => undefined).catch((e) => {
    ready = null;
    throw e;
  });
  return ready;
}

type ARow = {
  id: string; user_id: string; user_name: string; name: string; def: AutomationDef; enabled: boolean; state: AutoState;
  daily_cap: number; asked_for: string | null; cursor_at: Date | null; next_at: Date | null; off_by: string | null; off_at: Date | null;
  created_at: Date; updated_at: Date; last_run_at?: Date | null; runs_month?: string | number; waiting?: string | number;
};

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

function toAuto(r: ARow): Automation {
  const def = clean(r.def);
  return {
    id: r.id,
    userId: r.user_id,
    userName: r.user_name,
    name: r.name,
    def,
    sentence: describe(def),
    enabled: r.enabled,
    state: r.state,
    dailyCap: r.daily_cap,
    askedFor: r.asked_for,
    cursor: iso(r.cursor_at),
    nextAt: iso(r.next_at),
    offBy: r.off_by,
    offAt: iso(r.off_at),
    createdAt: iso(r.created_at)!,
    updatedAt: iso(r.updated_at)!,
    lastRunAt: r.last_run_at === undefined ? undefined : iso(r.last_run_at),
    runsThisMonth: r.runs_month === undefined ? undefined : Number(r.runs_month),
    waiting: r.waiting === undefined ? undefined : Number(r.waiting),
  };
}

/* Runs this month: from the first of the month on the London clock, so the
   figure rolls over by itself (no month literal anywhere). */
const WITH_STATS = `
  SELECT a.*,
    (SELECT MAX(COALESCE(r.finished_at, r.created_at)) FROM os_automation_runs r WHERE r.automation_id = a.id AND r.state <> 'waiting') AS last_run_at,
    (SELECT COUNT(*) FROM os_automation_runs r WHERE r.automation_id = a.id AND r.state IN ('done', 'failed')
        AND r.finished_at >= (date_trunc('month', NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')) AS runs_month,
    (SELECT COUNT(*) FROM os_automation_runs r WHERE r.automation_id = a.id AND r.state IN ('waiting', 'preview')) AS waiting
  FROM os_automations a`;

/** Theirs, or with `everyone` (owners) the whole business's. */
export async function listAutomations(p: { userId: string; everyone: boolean }): Promise<Automation[]> {
  if (!hasDb()) return [];
  await ensure();
  const rows = p.everyone
    ? await q<ARow>(`${WITH_STATS} ORDER BY a.user_name, a.created_at`)
    : await q<ARow>(`${WITH_STATS} WHERE a.user_id = $1 ORDER BY a.created_at`, [p.userId]);
  return rows.map(toAuto);
}

export async function getAutomation(id: string): Promise<Automation | null> {
  if (!hasDb()) return null;
  await ensure();
  const rows = await q<ARow>(`${WITH_STATS} WHERE a.id = $1`, [id]);
  return rows[0] ? toAuto(rows[0]) : null;
}

/** Save a new one or change one of theirs. Always saved OFF when new. */
export async function saveAutomation(p: {
  id?: string | null;
  userId: string;
  userName: string;
  name: string;
  def: unknown;
  dailyCap?: number;
  askedFor?: string | null;
}): Promise<Automation> {
  await ensure();
  const def = clean(p.def);
  const wrong = problems(def);
  if (wrong.length) throw new Error(wrong[0]);
  const name = (p.name || "").trim().slice(0, 120) || describe(def).slice(0, 80);
  const cap = Math.max(1, Math.min(MAX_DAILY_CAP, Math.round(Number(p.dailyCap) || DEFAULT_DAILY_CAP)));

  if (p.id) {
    const before = await getAutomation(p.id);
    if (!before || before.userId !== p.userId) throw new Error("No such automation.");
    /* A change to what a live one DOES goes back through preview: the
       approval was for those words. The name and the cap are not that. */
    const changed = JSON.stringify(before.def) !== JSON.stringify(def);
    const state: AutoState = !before.enabled ? "draft" : changed && reachesCustomer(def) ? "preview" : before.state;
    const rows = await q<ARow>(
      `UPDATE os_automations SET name = $2, def = $3::jsonb, daily_cap = $4, state = $5, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [p.id, name, JSON.stringify(def), cap, state]
    );
    if (changed) {
      /* Runs still waiting were made for the old version: they go. */
      await q(
        `UPDATE os_automation_runs SET state = 'cancelled', detail = 'The automation was changed before this was due.', finished_at = NOW()
          WHERE automation_id = $1 AND state IN ('waiting', 'preview')`,
        [p.id]
      );
    }
    return toAuto(rows[0]);
  }

  const mine = await q<{ n: string }>(`SELECT COUNT(*) AS n FROM os_automations WHERE user_id = $1`, [p.userId]);
  if (Number(mine[0]?.n ?? 0) >= MAX_AUTOMATIONS_EACH) throw new Error(`You already have ${MAX_AUTOMATIONS_EACH} automations. Delete one first.`);
  const rows = await q<ARow>(
    `INSERT INTO os_automations (id, user_id, user_name, name, def, daily_cap, asked_for) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *`,
    [`auto_${randomUUID()}`, p.userId, p.userName, name, JSON.stringify(def), cap, p.askedFor ?? null]
  );
  return toAuto(rows[0]);
}

/**
 * On or off. On starts watching from NOW - never a backlog of yesterday's
 * enquirers suddenly emailed - and goes to preview if it writes to customers.
 * Off cancels everything still waiting.
 */
export async function setEnabled(p: { id: string; on: boolean; by: { id: string; name: string; owner: boolean } }): Promise<Automation> {
  await ensure();
  const a = await getAutomation(p.id);
  if (!a) throw new Error("No such automation.");
  if (a.userId !== p.by.id && !(p.by.owner && !p.on)) throw new Error("Only the person it belongs to can switch it on.");
  if (p.on) {
    const wrong = problems(a.def);
    if (wrong.length) throw new Error(wrong[0]);
    const { nextScheduled } = await import("@/lib/automations/schedule");
    const next = a.def.trigger.key === "schedule" ? nextScheduled(a.def.trigger.params) : null;
    const state: AutoState = a.state === "live" || !reachesCustomer(a.def) ? "live" : "preview";
    const rows = await q<ARow>(
      `UPDATE os_automations SET enabled = TRUE, state = $2, cursor_at = NOW(), next_at = $3, off_by = NULL, off_at = NULL, updated_at = NOW()
        WHERE id = $1 RETURNING *`,
      [p.id, state, next]
    );
    return toAuto(rows[0]);
  }
  const ownerOff = p.by.id !== a.userId;
  const rows = await q<ARow>(
    `UPDATE os_automations SET enabled = FALSE, off_by = $2, off_at = CASE WHEN $2::text IS NULL THEN NULL ELSE NOW() END, updated_at = NOW()
      WHERE id = $1 RETURNING *`,
    [p.id, ownerOff ? p.by.name : null]
  );
  await q(
    `UPDATE os_automation_runs SET state = 'cancelled', detail = $2, finished_at = NOW()
      WHERE automation_id = $1 AND state IN ('waiting', 'preview')`,
    [p.id, ownerOff ? `${p.by.name} switched the automation off before this was due.` : "The automation was switched off before this was due."]
  );
  return toAuto(rows[0]);
}

export async function deleteAutomation(id: string, userId: string): Promise<boolean> {
  await ensure();
  const r = await q<{ id: string }>(`DELETE FROM os_automations WHERE id = $1 AND user_id = $2 RETURNING id`, [id, userId]);
  if (r.length) await q(`UPDATE os_automation_runs SET state = 'cancelled', detail = 'The automation was deleted.', finished_at = NOW() WHERE automation_id = $1 AND state IN ('waiting','preview')`, [id]);
  return r.length > 0;
}

/* ── Runs ─────────────────────────────────────────────────────────────────── */

type RRow = {
  id: string; automation_id: string; user_id: string; subject: Subject; state: RunState; due_at: Date; outcomes: ActionOutcome[];
  detail: string; preview: PreviewItem[] | null; created_at: Date; finished_at: Date | null; automation_name?: string; user_name?: string;
};

const toRun = (r: RRow): Run => ({
  id: r.id,
  automationId: r.automation_id,
  userId: r.user_id,
  subject: r.subject,
  state: r.state,
  dueAt: iso(r.due_at)!,
  outcomes: r.outcomes ?? [],
  detail: r.detail,
  preview: r.preview,
  createdAt: iso(r.created_at)!,
  finishedAt: iso(r.finished_at),
  automationName: r.automation_name,
  userName: r.user_name,
});

/** A new run, unless this customer already had one from this automation. True when it was new. */
export async function addRun(a: Automation, s: Subject, dueAt: Date): Promise<boolean> {
  const customer = (s.email || s.phone || "").trim().toLowerCase() || null;
  const rows = await q<{ id: string }>(
    `INSERT INTO os_automation_runs (id, automation_id, user_id, subject_key, subject, due_at, customer)
     VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7) ON CONFLICT (automation_id, subject_key) DO NOTHING RETURNING id`,
    [`run_${randomUUID()}`, a.id, a.userId, s.key, JSON.stringify(s), dueAt, customer]
  );
  return rows.length > 0;
}

export async function finishRun(id: string, p: { state: RunState; detail: string; outcomes?: ActionOutcome[]; reached?: boolean; preview?: PreviewItem[] | null }) {
  await q(
    `UPDATE os_automation_runs SET state = $2, detail = $3, outcomes = COALESCE($4::jsonb, outcomes), reached = reached OR $5,
            preview = $6::jsonb, finished_at = CASE WHEN $2 IN ('waiting','preview') THEN NULL ELSE NOW() END
      WHERE id = $1`,
    [id, p.state, p.detail, p.outcomes ? JSON.stringify(p.outcomes) : null, p.reached === true, p.preview ? JSON.stringify(p.preview) : null]
  );
}

export async function getRun(id: string): Promise<Run | null> {
  await ensure();
  const rows = await q<RRow>(`SELECT * FROM os_automation_runs WHERE id = $1`, [id]);
  return rows[0] ? toRun(rows[0]) : null;
}

/**
 * The log: newest first. Queued emails are read through to os_scheduled_sends,
 * so the log says "sent" only once the runner has actually sent it.
 */
export async function listRuns(p: { userId: string; everyone: boolean; automationId?: string | null; limit?: number }): Promise<Run[]> {
  if (!hasDb()) return [];
  await ensure();
  const where: string[] = [];
  const args: unknown[] = [];
  if (!p.everyone) {
    args.push(p.userId);
    where.push(`r.user_id = $${args.length}`);
  }
  if (p.automationId) {
    args.push(p.automationId);
    where.push(`r.automation_id = $${args.length}`);
  }
  args.push(Math.min(200, p.limit ?? 60));
  const rows = await q<RRow>(
    `SELECT r.*, a.name AS automation_name, a.user_name FROM os_automation_runs r
       LEFT JOIN os_automations a ON a.id = r.automation_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY COALESCE(r.finished_at, r.created_at) DESC LIMIT $${args.length}`,
    args
  );
  const runs = rows.map(toRun);
  const sendIds = runs.flatMap((r) => r.outcomes.map((o) => o.sendId).filter(Boolean)) as string[];
  if (sendIds.length) {
    const sends = await q<{ id: string; state: string; error: string | null; sent_at: Date | null }>(
      `SELECT id, state, error, sent_at FROM os_scheduled_sends WHERE id = ANY($1)`,
      [sendIds]
    ).catch(() => []);
    const by = new Map(sends.map((s) => [s.id, s]));
    for (const r of runs) {
      for (const o of r.outcomes) {
        const s = o.sendId ? by.get(o.sendId) : null;
        if (!s) continue;
        if (s.state === "sent") {
          o.state = "sent";
          o.detail = `Sent ${new Date(s.sent_at ?? Date.now()).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}.`;
        } else if (s.state === "cancelled" || s.state === "failed") {
          o.state = s.state === "failed" ? "failed" : "skipped";
          o.detail = s.error || "Not sent.";
        } else if (s.error) {
          o.detail = `Waiting to send: ${s.error}`;
        }
      }
    }
  }
  return runs;
}

/* ── Caps ─────────────────────────────────────────────────────────────────── */

/** Customers reached today (London day) by one automation, by one agent, and one customer by anybody. */
export async function reachedToday(p: { automationId: string; userId: string; customer: string | null }) {
  const day = `(date_trunc('day', NOW() AT TIME ZONE 'Europe/London') AT TIME ZONE 'Europe/London')`;
  const rows = await q<{ auto: string; person: string; customer: string }>(
    `SELECT
       COUNT(*) FILTER (WHERE automation_id = $1) AS auto,
       COUNT(*) FILTER (WHERE user_id = $2) AS person,
       COUNT(*) FILTER (WHERE $3::text IS NOT NULL AND customer = $3) AS customer
     FROM os_automation_runs WHERE reached AND finished_at >= ${day}`,
    [p.automationId, p.userId, p.customer]
  );
  const r = rows[0];
  return { auto: Number(r?.auto ?? 0), person: Number(r?.person ?? 0), customer: Number(r?.customer ?? 0) };
}
