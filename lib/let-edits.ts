import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { Application } from "@/lib/applications";
import type { AgentApplication } from "@/lib/business/rex-stats";
import { LET_FIELDS, letNumber, type LetEditEvent, type LetEditNow, type LetField } from "@/lib/let-edit-fields";

/**
 * THE OS'S OWN FIGURES ON A LET (James, 1 Nov 2026).
 *
 * An agent presses Edit on the let and puts the move-in date, the deposit,
 * the rent, the holding fee or the tenancy length right. Each change is a row
 * here - who, what it was, what it is now, when - and the newest row for a
 * field is the let's value from then on, over whatever the application or the
 * Propoly deal says. Never written back to either (lib/let-edit-fields).
 *
 *   let_ref   the let's page id: the application's, or the deal's for a home
 *             let through Propoly alone
 *   deal_id   the let's Propoly deal when it had one at the time, so the deal
 *             reads the change too (the board's card, Kirstie's board)
 *   field     lib/let-edit-fields LET_FIELDS; also "tenant:<key>:<part>" for
 *             a tenant's details changed on the let (kept by lib/let-landlords,
 *             logged here so the let has one history)
 *   value     null: put back to what the let was read from
 *   was       what the let showed before the change
 *
 * Rows are never updated or deleted: they are the audit trail.
 */

/** A field as the OS holds it, with what the deal itself says, for "Propoly still has". */
export type DealEditMark = LetEditNow & { propoly: string | null };
/** A field as the OS holds it on an application, with what the application itself said. */
export type AppEditMark = LetEditNow & { source: string | null };
export type LetEditsNow = Partial<Record<LetField, LetEditNow>>;

let ready: Promise<void> | null = null;
async function tq<T extends Record<string, unknown>>(text: string, params: unknown[] = []): Promise<T[]> {
  ready ??= q(`CREATE TABLE IF NOT EXISTS os_let_edits (
      id        TEXT PRIMARY KEY,
      let_ref   TEXT NOT NULL,
      deal_id   TEXT,
      field     TEXT NOT NULL,
      value     TEXT,
      was       TEXT,
      by_id     TEXT,
      by_name   TEXT NOT NULL DEFAULT '',
      by_email  TEXT NOT NULL DEFAULT '',
      at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`)
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_let_edits_ref ON os_let_edits (let_ref, field, at)`))
    .then(() => q(`CREATE INDEX IF NOT EXISTS os_let_edits_deal ON os_let_edits (deal_id, field, at)`))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q<T>(text, params);
}

type Row = { id: string; let_ref: string; deal_id: string | null; field: string; value: string | null; was: string | null; by_name: string; by_email: string; at: Date };

const now = (r: Row): LetEditNow => ({ value: r.value, by: r.by_name || r.by_email, at: new Date(r.at).toISOString() });

/** Newest row per key and field, the key being what `keyOf` says the row belongs to. */
function latest(rows: Row[], keyOf: (r: Row) => string): Map<string, LetEditsNow> {
  const out = new Map<string, LetEditsNow>();
  for (const r of rows) {
    if (!(LET_FIELDS as readonly string[]).includes(r.field)) continue;
    const k = keyOf(r);
    const held = out.get(k) ?? {};
    const f = r.field as LetField;
    if (!held[f] || held[f]!.at < new Date(r.at).toISOString()) held[f] = now(r);
    out.set(k, held);
  }
  /* A field put back to what the let was read from is no edit at all. */
  for (const [k, e] of out) {
    for (const f of LET_FIELDS) if (e[f] && e[f]!.value === null) delete e[f];
    if (!Object.keys(e).length) out.delete(k);
  }
  return out;
}

/** The OS's values for these lets, by page id. */
export async function letEditsFor(refs: string[]): Promise<Map<string, LetEditsNow>> {
  const want = [...new Set(refs.filter(Boolean))];
  if (!hasDb() || !want.length) return new Map();
  const rows = await tq<Row>(`SELECT * FROM os_let_edits WHERE let_ref = ANY($1::text[]) AND field = ANY($2::text[])`, [want, [...LET_FIELDS]]);
  return latest(rows, (r) => r.let_ref);
}

/** The OS's values for these Propoly deals: saved against the deal, or on a let opened as the deal. */
export async function letEditsForDeals(dealIds: string[]): Promise<Map<string, LetEditsNow>> {
  const want = [...new Set(dealIds.filter(Boolean))];
  if (!hasDb() || !want.length) return new Map();
  const set = new Set(want);
  const rows = await tq<Row>(
    `SELECT * FROM os_let_edits WHERE (deal_id = ANY($1::text[]) OR let_ref = ANY($1::text[])) AND field = ANY($2::text[])`,
    [want, [...LET_FIELDS]]
  );
  return latest(rows, (r) => (r.deal_id && set.has(r.deal_id) ? r.deal_id : r.let_ref));
}

/** Everything changed on one let, newest first: its own rows and its deal's. */
export async function letEditHistory(ref: string, dealId: string | null): Promise<LetEditEvent[]> {
  if (!hasDb() || !ref) return [];
  const rows = await tq<Row>(
    `SELECT * FROM os_let_edits WHERE let_ref = $1 OR ($2::text IS NOT NULL AND (deal_id = $2 OR let_ref = $2)) ORDER BY at DESC LIMIT 200`,
    [ref, dealId]
  );
  return rows.map((r) => ({ id: r.id, field: r.field, value: r.value, was: r.was, by: r.by_name || r.by_email, at: new Date(r.at).toISOString() }));
}

/** The current OS values on one let, its own and its deal's, newest winning. */
export async function letEditsNow(ref: string, dealId: string | null): Promise<LetEditsNow> {
  const [own, deal] = await Promise.all([letEditsFor([ref]), dealId ? letEditsForDeals([dealId]) : Promise.resolve(new Map<string, LetEditsNow>())]);
  const a = own.get(ref) ?? {};
  const b = (dealId ? deal.get(dealId) : null) ?? {};
  const out: LetEditsNow = {};
  for (const f of LET_FIELDS) {
    const x = a[f];
    const y = b[f];
    const pick = x && y ? (x.at >= y.at ? x : y) : x ?? y;
    if (pick) out[f] = pick;
  }
  return out;
}

export type LetChange = { field: string; value: string | null; was: string | null };

/** One Save: every field that changed, in one go. */
export async function saveLetEdits(ref: string, dealId: string | null, changes: LetChange[], by: { id: string | null; name: string; email: string }): Promise<void> {
  if (!changes.length) return;
  const values: unknown[] = [];
  const rows = changes.map((c, i) => {
    values.push(randomUUID(), ref, dealId, c.field.slice(0, 300), c.value, c.was === null ? null : c.was.slice(0, 300), by.id, by.name.slice(0, 120), by.email.slice(0, 200));
    const o = i * 9;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9})`;
  });
  await tq(`INSERT INTO os_let_edits (id, let_ref, deal_id, field, value, was, by_id, by_name, by_email) VALUES ${rows.join(",")}`, values);
}

/* ── laid over what the let was read from ─────────────────────────────── */

/**
 * The applications as every screen reads them, with the OS's figures over
 * REX's (lib/applications, after the agreed rent). Once only: a held copy
 * that already carries them is left alone, and a save clears the held copies.
 */
export async function applyLetEdits(apps: Application[]): Promise<void> {
  const fresh = apps.filter((a) => a.letEdits === undefined);
  if (!fresh.length || !hasDb()) return;
  const edits = await letEditsFor(fresh.map((a) => String(a.id)));
  const s = (n: number | null | undefined) => (n == null ? null : String(n));
  for (const a of fresh) {
    const e = edits.get(String(a.id));
    if (!e) { a.letEdits = null; continue; }
    const marks: Partial<Record<LetField, AppEditMark>> = {};
    if (e.moveIn) { marks.moveIn = { ...e.moveIn, source: a.startDate ? a.startDate.slice(0, 10) : null }; a.startDate = e.moveIn.value; }
    if (e.rent) { marks.rent = { ...e.rent, source: s(a.offerAmount) }; a.offerAmount = letNumber(e.rent.value); }
    if (e.holdingFee) { marks.holdingFee = { ...e.holdingFee, source: s(a.holdingDepositAmount) }; a.holdingDepositAmount = letNumber(e.holdingFee.value); }
    if (e.termMonths) { marks.termMonths = { ...e.termMonths, source: s(a.agreementMonths) }; a.agreementMonths = letNumber(e.termMonths.value); }
    if (e.deposit) marks.deposit = { ...e.deposit, source: null };
    a.letEdits = marks;
  }
}

type DealLike = { app: AgentApplication };

/** What the deal itself holds for a field, before anything is laid over it. */
export function dealValue(app: AgentApplication, f: LetField): string | null {
  const s = (n: number | null | undefined) => (n == null ? null : String(n));
  switch (f) {
    case "moveIn": return app.startDate ? app.startDate.slice(0, 10) : null;
    case "rent": return s(app.offer);
    case "deposit": return s(app.propoly?.deposit);
    case "holdingFee": return s(app.propoly?.holdingFee);
    case "termMonths": return s(app.agreementMonths);
  }
}

/**
 * A deal with the OS's figures over Propoly's, as a copy (the deals are a
 * shared held copy and must not be changed in place), and each changed
 * field's mark saying what Propoly still has.
 */
export function withLetEdits<T extends DealLike>(d: T, e: LetEditsNow | undefined): { deal: T; marks: Partial<Record<LetField, DealEditMark>> | null } {
  if (!e || !Object.keys(e).length) return { deal: d, marks: null };
  const marks: Partial<Record<LetField, DealEditMark>> = {};
  const app: AgentApplication = { ...d.app, propoly: d.app.propoly ? { ...d.app.propoly } : d.app.propoly };
  for (const f of LET_FIELDS) {
    const x = e[f];
    if (!x) continue;
    marks[f] = { ...x, propoly: dealValue(d.app, f) };
    const n = letNumber(x.value);
    if (f === "moveIn") app.startDate = x.value;
    if (f === "rent") app.offer = n;
    if (f === "termMonths") app.agreementMonths = n;
    if (f === "deposit" && app.propoly) app.propoly.deposit = n;
    if (f === "holdingFee" && app.propoly) app.propoly.holdingFee = n;
  }
  return { deal: { ...d, app }, marks };
}
