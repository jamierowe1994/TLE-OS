import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * REX PM's task lists, brought across by reading its screens (1 Oct 2026).
 *
 * REX would not give us API access to REX PM, and REX PM is where the team
 * still books and closes inspections and tenancy reviews. James wants the OS
 * boards to say exactly what REX PM's dashboard says until the team stops
 * using it, and then to carry on from the OS's own records. So:
 *
 *   1. In James's browser, REX PM's own list screens are read page by page
 *      (Open and Closed tabs) - every column, plus each task's id from its
 *      link. Nothing is ever written to REX PM.
 *   2. The rows are posted to /api/admin/rexpm-tasks, which lands them here
 *      and ties each one to its home by address. REX PM prints the address
 *      exactly as os_properties holds it (both come from REX PM), so the
 *      match is nearly always exact.
 *   3. While the board's source is "rex-pm", the open tasks ARE the due list,
 *      one row per task (REX PM counts a room let separately as its own
 *      task), and the overdue figure is theirs to the number.
 *   4. A visit raised here from a task carries the task's id, takes the task
 *      off the due list and keeps its due date, so the count does not move
 *      when work changes hands.
 *   5. The closed tasks give each home its last visit, which is what the
 *      OS's own cadence counts from once the source is switched to "os".
 *
 * A full read replaces the picture: a task that was open last time and is in
 * neither list now is marked "gone" rather than deleted, so nothing quietly
 * disappears from the history.
 */

export type TaskKind = "inspection" | "tenancy_review" | "maintenance";
export const TASK_KINDS: TaskKind[] = ["inspection", "tenancy_review", "maintenance"];
export type TaskState = "open" | "closed" | "gone";

export interface RexpmTask {
  id: string;
  kind: TaskKind;
  state: TaskState;
  taskType: string;
  title: string;
  address: string;
  osPropertyId: string | null;
  rexPropertyId: string | null;
  matchHow: string | null;
  tenancy: string;
  /** Tenancy reviews only: "Fixed Term | expires 1 Jun 2026", "Periodic". */
  agreement: string;
  /** Tenancy reviews only: the rent as REX PM prints it, "£1,250.00 | Monthly". */
  currentRent: string;
  /** Maintenance only: what was reported, by whom, when, and REX PM's type ("GAS SAFETY"). */
  description: string;
  reportedBy: string;
  reportedOn: string | null;
  category: string;
  ownership: string;
  service: string;
  followUpOn: string | null;
  dueOn: string | null;
  inspectionOn: string | null;
  closedOn: string | null;
  progress: string;
  managedBy: string;
  priority: string;
  lastSeenAt: string;
}

/** One row as read off the screen: the task's id and the cell text, column by column. */
export interface ScreenRow { id: string; c: string[] }
/** One tab of one list: its column headings and its rows. */
export interface ScreenTab { columns: string[]; rows: ScreenRow[] }

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));
/* A DATE column comes back from pg as midnight on the server's own clock, so
   reading it through toISOString() moves it a day back anywhere east of UTC
   (London in summer). Take the calendar day it was built from instead. */
const day = (v: unknown): string | null => {
  if (!v) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  return String(v).slice(0, 10);
};

function toTask(r: Row): RexpmTask {
  return {
    id: s(r.id),
    kind: s(r.kind) as TaskKind,
    state: s(r.state) as TaskState,
    taskType: s(r.task_type),
    title: s(r.title),
    address: s(r.address),
    osPropertyId: r.os_property_id ? s(r.os_property_id) : null,
    rexPropertyId: r.rex_property_id ? s(r.rex_property_id) : null,
    matchHow: r.match_how ? s(r.match_how) : null,
    tenancy: s(r.tenancy),
    agreement: s(r.agreement),
    currentRent: s(r.current_rent),
    description: s(r.description),
    reportedBy: s(r.reported_by),
    reportedOn: day(r.reported_on),
    category: s(r.task_category),
    ownership: s(r.ownership),
    service: s(r.service),
    followUpOn: day(r.follow_up_on),
    dueOn: day(r.due_on),
    inspectionOn: day(r.inspection_on),
    closedOn: day(r.closed_on),
    progress: s(r.progress),
    managedBy: s(r.managed_by),
    priority: s(r.priority),
    lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at as string).toISOString() : "",
  };
}

/* ── reading a screen row ────────────────────────────────────────────────── */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

/** "19 Jul 2026" → "2026-07-19". A dash, a blank or anything else → null. */
export function screenDate(v: string | undefined): string | null {
  const m = (v ?? "").trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${String(mo).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

const blank = (v: string | undefined) => {
  const t = (v ?? "").trim();
  return t === "-" || t === "--" ? "" : t;
};

/**
 * One screen row into its fields, by column heading - the Open and Closed
 * tabs carry different columns, and the tenancy reviews list will differ
 * again, so nothing here counts positions.
 *
 * The Summary cell is two lines, joined with " | " when read: the task's own
 * title ("General Inspection: 9 Stanshaws Close, Bradley Stoke") and the
 * home's full address as REX PM holds it.
 */
export function readRow(columns: string[], row: ScreenRow) {
  const at = (name: string) => {
    const i = columns.findIndex((c) => c.trim().toLowerCase() === name);
    return i < 0 ? "" : s(row.c[i]);
  };
  const [title = "", ...rest] = at("summary").split(" | ").map((x) => x.trim());
  const address = rest.join(", ").trim() || title.replace(/^[^:]*:\s*/, "");
  /* The tenancy reviews list titles its tasks differently (1 Oct 2026):
     "Tenancy Review 9 Stanshaws Close + Gagandeep Singh & Manpreet Kaur",
     the tenants after the plus and no colon - and a few older ones are just
     the tenants' names. Its tenancy column is the agreement, not the people. */
  const review = columns.some((c) => c.trim().toLowerCase() === "tenancy agreement");
  let taskType = title.includes(":") ? title.slice(0, title.indexOf(":")).trim() : "";
  let tenants = "";
  if (review) {
    taskType = "Tenancy review";
    const m = title.match(/^tenancy review\b\s*(.*?)(?:\s\+\s(.*))?$/i);
    tenants = m ? (m[2] ?? "").trim() : title;
  }
  return {
    title,
    address,
    taskType,
    tenancy: review ? tenants : blank(at("tenancy")),
    agreement: blank(at("tenancy agreement")),
    currentRent: blank(at("current rent")),
    ownership: blank(at("ownership")),
    service: blank(at("service package")),
    followUpOn: screenDate(at("follow up date")),
    /* Maintenance has no due date; it is late once its expected completion
       date passes, which is how REX PM's Overdue tile counts (1 Oct 2026). */
    dueOn: screenDate(at("task due date") || at("due date") || at("expected completion date")),
    description: blank(at("description")),
    reportedBy: blank(at("reported by")),
    reportedOn: screenDate(at("reported date")),
    category: blank(at("maintenance type")),
    inspectionOn: screenDate(at("inspection date")),
    closedOn: screenDate(at("closed date")),
    progress: blank(at("task progress") || at("progress")),
    managedBy: blank(at("managed by")),
    priority: blank(at("priority")),
  };
}

/* ── tying a task to its home ────────────────────────────────────────────── */

const norm = (a: string) => a.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const postcodeOf = (a: string) => (a.toUpperCase().match(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/g) ?? []).pop()?.replace(/\s+/g, "") ?? null;
const houseNo = (a: string) => a.match(/\b\d+[a-z]?\b/i)?.[0]?.toLowerCase() ?? null;

type Home = { id: string; address: string; postcode: string | null; rex_property_id: string | null; active: boolean };

/**
 * The OS home for an address. Exact first (REX PM prints the address as
 * os_properties stores it), then the same words ignoring punctuation, then
 * one home at the postcode with the same house number. Anything looser is
 * left unmatched and says so - a guess here would put a visit on the wrong
 * house.
 */
export function matcher(homes: Home[]) {
  const exact = new Map<string, Home[]>();
  const loose = new Map<string, Home[]>();
  const byPc = new Map<string, Home[]>();
  const put = (m: Map<string, Home[]>, k: string | null, h: Home) => { if (k) m.set(k, [...(m.get(k) ?? []), h]); };
  for (const h of homes) {
    put(exact, h.address.trim().toLowerCase(), h);
    put(loose, norm(h.address), h);
    put(byPc, (h.postcode ?? postcodeOf(h.address) ?? "").replace(/\s+/g, "").toUpperCase() || null, h);
  }
  /* Several homes can share one address (a house REX PM also holds room by
     room, or an old record kept alongside a new one): prefer the live one
     that is tied to REX CRM, since that is the one the rest of the OS reads. */
  const best = (list: Home[] | undefined) => {
    if (!list?.length) return null;
    return [...list].sort((a, b) => Number(b.active) - Number(a.active) || Number(!!b.rex_property_id) - Number(!!a.rex_property_id))[0];
  };
  return (address: string): { home: Home | null; how: string } => {
    const e = best(exact.get(address.trim().toLowerCase()));
    if (e) return { home: e, how: "address" };
    const l = best(loose.get(norm(address)));
    if (l) return { home: l, how: "address, ignoring punctuation" };
    const pc = postcodeOf(address);
    const no = houseNo(address);
    if (pc && no) {
      const same = (byPc.get(pc) ?? []).filter((h) => houseNo(h.address) === no);
      const live = same.filter((h) => h.active);
      const pick = live.length === 1 ? live[0] : same.length === 1 ? same[0] : null;
      if (pick) return { home: pick, how: "postcode and house number" };
    }
    return { home: null, how: "no home at this address" };
  };
}

/* ── landing a read ──────────────────────────────────────────────────────── */

export interface ImportResult {
  kind: TaskKind;
  open: number;
  closed: number;
  gone: number;
  unmatched: { id: string; address: string }[];
}

/**
 * Land one full read of a list: every open task and every closed one.
 *
 * `complete` says the read covered the whole of both tabs. Only then is an
 * open task that is missing from it marked "gone" - a partial read (one
 * page, a retry) must never close tasks it simply did not look at.
 */
export async function importTasks(kind: TaskKind, tabs: { open?: ScreenTab; closed?: ScreenTab }, complete: boolean): Promise<ImportResult> {
  if (!hasDb()) throw new Error("No database on this environment.");
  const homes = await q<Home>(`SELECT id, address, postcode, rex_property_id, active FROM os_properties`);
  const find = matcher(homes);
  const unmatched: ImportResult["unmatched"] = [];
  const seen: string[] = [];
  let open = 0;
  let closed = 0;

  const land = async (state: "open" | "closed", tab: ScreenTab | undefined) => {
    if (!tab) return;
    for (const row of tab.rows) {
      if (!/^[0-9a-f-]{36}$/i.test(row.id)) continue;
      const f = readRow(tab.columns, row);
      const { home, how } = find(f.address);
      if (!home && state === "open") unmatched.push({ id: row.id, address: f.address });
      seen.push(row.id);
      if (state === "open") open += 1; else closed += 1;
      /* A task closed in REX PM stays closed, whatever an older read said;
         an open one re-reads every field, since agents edit due dates. */
      await q(
        `INSERT INTO os_rexpm_tasks
           (id, kind, state, task_type, title, address, os_property_id, rex_property_id, match_how, tenancy, ownership, service,
            follow_up_on, due_on, inspection_on, closed_on, progress, managed_by, priority, raw, agreement, current_rent,
            description, reported_by, reported_on, task_category, last_seen_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21,$22,$23,$24,$25,$26,NOW())
         ON CONFLICT (id) DO UPDATE SET
           kind = $2, state = $3, task_type = $4, title = $5, address = $6, os_property_id = $7, rex_property_id = $8,
           match_how = $9, tenancy = $10, ownership = $11, service = $12,
           follow_up_on = COALESCE($13, os_rexpm_tasks.follow_up_on), due_on = COALESCE($14, os_rexpm_tasks.due_on),
           inspection_on = COALESCE($15, os_rexpm_tasks.inspection_on), closed_on = $16,
           progress = CASE WHEN $3 = 'open' THEN $17 ELSE os_rexpm_tasks.progress END,
           managed_by = $18, priority = $19, raw = $20::jsonb,
           agreement = CASE WHEN $21 = '' THEN os_rexpm_tasks.agreement ELSE $21 END,
           current_rent = CASE WHEN $22 = '' THEN os_rexpm_tasks.current_rent ELSE $22 END,
           description = CASE WHEN $23 = '' THEN os_rexpm_tasks.description ELSE $23 END,
           reported_by = CASE WHEN $24 = '' THEN os_rexpm_tasks.reported_by ELSE $24 END,
           reported_on = COALESCE($25, os_rexpm_tasks.reported_on),
           task_category = CASE WHEN $26 = '' THEN os_rexpm_tasks.task_category ELSE $26 END,
           last_seen_at = NOW()`,
        [
          row.id, kind, state, f.taskType, f.title, f.address, home?.id ?? null, home?.rex_property_id ?? null, how,
          f.tenancy, f.ownership, f.service, f.followUpOn, f.dueOn, f.inspectionOn, f.closedOn, f.progress, f.managedBy, f.priority,
          JSON.stringify({ columns: tab.columns, cells: row.c }), f.agreement, f.currentRent,
          f.description, f.reportedBy, f.reportedOn, f.category,
        ]
      );
    }
  };
  await land("open", tabs.open);
  await land("closed", tabs.closed);

  let gone = 0;
  /* "complete" means the Open tab was read end to end, so an open task missing
     from it has left the list. The Closed tab is not needed to know that. */
  if (complete && tabs.open) {
    const rows = await q<{ id: string }>(
      `UPDATE os_rexpm_tasks SET state = 'gone' WHERE kind = $1 AND state = 'open' AND NOT (id = ANY($2)) RETURNING id`,
      [kind, seen]
    );
    gone = rows.length;
  }
  /* A read that carried one tab keeps the other tab's last count, so the
     note reads the whole picture rather than "0 open" after a closed-only top-up. */
  const before = await lastImport(kind);
  await q(
    `INSERT INTO os_settings (key, value, updated_by) VALUES ($1, $2::jsonb, 'rexpm-import')
     ON CONFLICT (key) DO UPDATE SET value = $2::jsonb, updated_at = NOW(), updated_by = 'rexpm-import'`,
    [`rexpm_tasks:${kind}`, JSON.stringify({
      at: new Date().toISOString(),
      open: tabs.open ? open : before?.open ?? 0,
      closed: tabs.closed ? closed : before?.closed ?? 0,
      gone, complete,
      unmatched: tabs.open ? unmatched.length : before?.unmatched ?? 0,
    })]
  );
  return { kind, open, closed, gone, unmatched };
}

/* ── reading it back ─────────────────────────────────────────────────────── */

export async function openTasks(kind: TaskKind): Promise<RexpmTask[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT * FROM os_rexpm_tasks WHERE kind = $1 AND state = 'open' ORDER BY due_on NULLS LAST, address`, [kind]);
  return rows.map(toTask);
}

/**
 * The last visit REX PM recorded per home: the newest closed task, dated by
 * its inspection date where one was entered and its closed date otherwise.
 * Keyed by REX CRM property id and by OS home id, the two keys the due list
 * looks a home up by.
 */
export async function lastClosedByHome(kind: TaskKind): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!hasDb()) return out;
  const rows = await q<{ rex_property_id: string | null; os_property_id: string | null; at: Date | string }>(
    `SELECT rex_property_id, os_property_id, MAX(COALESCE(inspection_on, closed_on)) AS at
       FROM os_rexpm_tasks WHERE kind = $1 AND state = 'closed' AND COALESCE(inspection_on, closed_on) IS NOT NULL
      GROUP BY rex_property_id, os_property_id`,
    [kind]
  );
  for (const r of rows) {
    const d = day(r.at);
    if (!d) continue;
    const at = `${d}T00:00:00.000Z`;
    for (const k of [r.rex_property_id, r.os_property_id]) {
      if (k && (!out.has(k) || at > out.get(k)!)) out.set(k, at);
    }
  }
  return out;
}

/** When the list was last read, and what it held. Null if it never has been. */
export async function lastImport(kind: TaskKind): Promise<{ at: string; open: number; closed: number; gone: number; complete: boolean; unmatched: number } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: { at: string; open: number; closed: number; gone: number; complete: boolean; unmatched: number } }>(
    `SELECT value FROM os_settings WHERE key = $1`,
    [`rexpm_tasks:${kind}`]
  ).catch(() => []);
  return rows[0]?.value ?? null;
}
