import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import type { Application } from "@/lib/applications";
import type { AgentApplication } from "@/lib/business/rex-stats";
import { LET_FIELDS, letNumber, stillNewest, type LetEditEvent, type LetEditNow, type LetField } from "@/lib/let-edit-fields";

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
 *             reads the change too (the board's card, Kirstie's board). Empty
 *             when the let had none yet: the deal the OS later pushes the let
 *             into reads it all the same (withPushedLets, 4 Nov 2026)
 *   field     lib/let-edit-fields LET_FIELDS; also "tenant:<key>:<part>" for
 *             a tenant's details changed on the let (kept by lib/let-landlords,
 *             logged here so the let has one history)
 *   value     null: put back to what the let was read from
 *   was       what the let showed before the change
 *   seen      what Propoly and the application held at the time ({propoly,
 *             app}), so a source changed AFTER the OS wins back: the newest
 *             figure always wins (James, 2 Nov 2026)
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
    .then(() => q(`ALTER TABLE os_let_edits ADD COLUMN IF NOT EXISTS seen JSONB`))
    .then(() => undefined)
    .catch((e) => {
      ready = null;
      throw e;
    });
  await ready;
  return q<T>(text, params);
}

type Row = { id: string; let_ref: string; deal_id: string | null; field: string; value: string | null; was: string | null; by_name: string; by_email: string; at: Date; seen?: LetEditNow["seen"] | null };

const now = (r: Row): LetEditNow => ({ value: r.value, by: r.by_name || r.by_email, at: new Date(r.at).toISOString(), ...(r.seen ? { seen: r.seen } : {}) });

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

/*
 * Every deal's figures at once, for the Propoly book itself (lib/business/
 * propoly-deals): read on every look at the book, so held for a few seconds
 * in this process and dropped on a save. A small table - one row per change.
 */
let dealCache: { at: number; map: Map<string, LetEditsNow> } | null = null;
const DEAL_CACHE_MS = 15_000;
async function allDealEdits(): Promise<Map<string, LetEditsNow>> {
  if (!hasDb()) return new Map();
  if (dealCache && Date.now() - dealCache.at < DEAL_CACHE_MS) return dealCache.map;
  const rows = await tq<Row>(`SELECT * FROM os_let_edits WHERE field = ANY($1::text[])`, [[...LET_FIELDS]]);
  /* Keyed both ways: by the deal it was saved against, and by the let's own id
     (a let opened as its deal has the deal's id as its page id). */
  const byDeal = latest(rows.filter((r) => r.deal_id), (r) => r.deal_id as string);
  const byRef = latest(rows.filter((r) => !r.deal_id), (r) => r.let_ref);
  const map = new Map<string, LetEditsNow>(byRef);
  for (const [k, e] of byDeal) {
    const other = map.get(k) ?? {};
    const out: LetEditsNow = { ...other };
    for (const f of LET_FIELDS) if (e[f] && (!other[f] || other[f]!.at <= e[f]!.at)) out[f] = e[f];
    map.set(k, out);
  }
  await withPushedLets(map, rows).catch(() => undefined);
  dealCache = { at: Date.now(), map };
  return map;
}

/*
 * Lianna Denholm, 4 Nov 2026 (12 South Chesters Lane, application 40658): a
 * move-in or deposit put right on a let before the let was matched to its
 * Propoly deal is kept under the application alone (deal_id empty), so the
 * deal, keyed by its own id, never read it - while the let page did. A deal
 * the OS pushed for a let (os_handovers, lib/let-deal pushedDeals) now reads
 * the let's own figures too, as the let page does: field by field, the newer
 * of the let's and the deal's own wins, and Propoly's still wins where
 * Propoly changed it after (withLetEdits). Only a deal the OS's own push put
 * the let into: one found by address or listing alone is never given a let's
 * figures in the book, which every screen reads; dealForLet gives it them
 * for that let's own reading (its page, its PLC check).
 */
async function withPushedLets(map: Map<string, LetEditsNow>, rows: Row[]): Promise<void> {
  const refs = [...new Set(rows.map((r) => r.let_ref))];
  if (!refs.length) return;
  const { pushedDeals } = await import("@/lib/let-deal");
  const pushed = await pushedDeals(refs);
  if (!pushed.size) return;
  for (const [ref, e] of latest(rows.filter((r) => pushed.has(r.let_ref)), (r) => r.let_ref)) {
    const deal = pushed.get(ref)!;
    const held = map.get(deal) ?? {};
    const out: LetEditsNow = { ...held };
    for (const f of LET_FIELDS) if (e[f] && (!held[f] || held[f]!.at < e[f]!.at)) out[f] = e[f];
    map.set(deal, out);
  }
}

/**
 * The Propoly book as every screen reads it (lib/business/propoly-deals):
 * each deal with the OS's newer figures over Propoly's - the tenant and
 * landlord portals, the boards, Steve, the move-in counts, the emails - and
 * a mark on each changed field saying what Propoly itself still has. Copies
 * only of the deals that changed; the held book is never touched.
 */
export async function overlayDealBook<T extends DealLike & { letEdits?: Partial<Record<LetField, DealEditMark>> | null }>(deals: T[]): Promise<T[]> {
  const edits = await allDealEdits().catch(() => null);
  if (!edits?.size) return deals;
  return deals.map((d) => {
    const { deal, marks } = withLetEdits(d, edits.get(d.app.id));
    return marks ? { ...deal, letEdits: marks } : d;
  });
}

/** Propoly's finished deals, with a move-in or rent changed in the OS over Propoly's. */
export async function overlayCompletes<T extends { uuid: string | null; date: string | null; rentPcm: number | null }>(rows: T[]): Promise<T[]> {
  const edits = await allDealEdits().catch(() => null);
  if (!edits?.size) return rows;
  return rows.map((c) => {
    const e = c.uuid ? edits.get(c.uuid) : undefined;
    if (!e) return c;
    const out = { ...c };
    if (e.moveIn && stillNewest("moveIn", e.moveIn, "propoly", c.date ? c.date.slice(0, 10) : null)) out.date = e.moveIn.value;
    if (e.rent && stillNewest("rent", e.rent, "propoly", c.rentPcm)) out.rentPcm = letNumber(e.rent.value);
    return out;
  });
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

/**
 * The current OS values on one let, its own and its deal's, newest winning.
 * With what each source holds now (`raw`), a figure a source has changed
 * since is left out: that source's figure is the newer one.
 */
export async function letEditsNow(ref: string, dealId: string | null, raw?: { propoly?: (f: LetField) => string | null; app?: (f: LetField) => string | null }): Promise<LetEditsNow> {
  const [own, deal] = await Promise.all([letEditsFor([ref]), dealId ? letEditsForDeals([dealId]) : Promise.resolve(new Map<string, LetEditsNow>())]);
  const a = own.get(ref) ?? {};
  const b = (dealId ? deal.get(dealId) : null) ?? {};
  const out: LetEditsNow = {};
  for (const f of LET_FIELDS) {
    const x = a[f];
    const y = b[f];
    const pick = x && y ? (x.at >= y.at ? x : y) : x ?? y;
    if (!pick) continue;
    if (raw?.propoly && !stillNewest(f, pick, "propoly", raw.propoly(f))) continue;
    if (raw?.app && !stillNewest(f, pick, "app", raw.app(f))) continue;
    out[f] = pick;
  }
  return out;
}

export type LetChange = { field: string; value: string | null; was: string | null; seen?: LetEditNow["seen"] };

/** One Save: every field that changed, in one go. */
export async function saveLetEdits(ref: string, dealId: string | null, changes: LetChange[], by: { id: string | null; name: string; email: string }): Promise<void> {
  if (!changes.length) return;
  const values: unknown[] = [];
  const rows = changes.map((c, i) => {
    values.push(randomUUID(), ref, dealId, c.field.slice(0, 300), c.value, c.was === null ? null : c.was.slice(0, 300), by.id, by.name.slice(0, 120), by.email.slice(0, 200), c.seen ? JSON.stringify(c.seen) : null);
    const o = i * 10;
    return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10}::jsonb)`;
  });
  await tq(`INSERT INTO os_let_edits (id, let_ref, deal_id, field, value, was, by_id, by_name, by_email, seen) VALUES ${rows.join(",")}`, values);
  /* The Propoly book reads the change at once, not in a few seconds. */
  dealCache = null;
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
    const found = edits.get(String(a.id));
    if (!found) { a.letEdits = null; continue; }
    /* A figure the application has changed since is the newer one: it stands. */
    const e: LetEditsNow = {};
    const appNow: Record<LetField, string | number | null> = { moveIn: a.startDate ? a.startDate.slice(0, 10) : null, rent: a.offerAmount, holdingFee: a.holdingDepositAmount, termMonths: a.agreementMonths, deposit: null };
    for (const f of LET_FIELDS) if (found[f] && stillNewest(f, found[f]!, "app", appNow[f])) e[f] = found[f];
    const marks: Partial<Record<LetField, AppEditMark>> = {};
    if (e.moveIn) { marks.moveIn = { ...e.moveIn, source: a.startDate ? a.startDate.slice(0, 10) : null }; a.startDate = e.moveIn.value; }
    if (e.rent) { marks.rent = { ...e.rent, source: s(a.offerAmount) }; a.offerAmount = letNumber(e.rent.value); }
    if (e.holdingFee) { marks.holdingFee = { ...e.holdingFee, source: s(a.holdingDepositAmount) }; a.holdingDepositAmount = letNumber(e.holdingFee.value); }
    if (e.termMonths) { marks.termMonths = { ...e.termMonths, source: s(a.agreementMonths) }; a.agreementMonths = letNumber(e.termMonths.value); }
    if (e.deposit) marks.deposit = { ...e.deposit, source: null };
    a.letEdits = Object.keys(marks).length ? marks : null;
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
    /* Propoly changed it after the OS did: Propoly's is the newer figure. */
    if (!stillNewest(f, x, "propoly", dealValue(d.app, f))) continue;
    marks[f] = { ...x, propoly: dealValue(d.app, f) };
    put(app, f, x.value);
  }
  if (!Object.keys(marks).length) return { deal: d, marks: null };
  return { deal: { ...d, app }, marks };
}

/** One figure onto a deal's copy, as dealValue reads it back. */
function put(app: AgentApplication, f: LetField, v: string | null): void {
  const n = letNumber(v);
  if (f === "moveIn") app.startDate = v;
  if (f === "rent") app.offer = n;
  if (f === "termMonths") app.agreementMonths = n;
  if (f === "deposit" && app.propoly) app.propoly.deposit = n;
  if (f === "holdingFee" && app.propoly) app.propoly.holdingFee = n;
}

/**
 * A deal from the book with one let's own figures over it as well (4 Nov
 * 2026, lib/let-deal dealForLet): the same rule the let page reads them by
 * (letEditsNow) - for each field the newer of the let's own and what the deal
 * already carries, and Propoly's own where Propoly changed it after. A copy:
 * the book's deal is put back to Propoly's figures and everything laid over
 * it again. Untouched when the let has nothing newer.
 */
export function withOwnLetEdits<T extends DealLike & { letEdits?: Partial<Record<LetField, DealEditMark>> | null }>(d: T, own: LetEditsNow | undefined): T {
  const held = d.letEdits ?? {};
  if (!own || !LET_FIELDS.some((f) => own[f] && (!held[f] || held[f]!.at < own[f]!.at))) return d;
  const app: AgentApplication = { ...d.app, propoly: d.app.propoly ? { ...d.app.propoly } : d.app.propoly };
  const all: LetEditsNow = {};
  for (const f of LET_FIELDS) {
    const y = held[f];
    if (y) put(app, f, y.propoly);
    const x = own[f];
    if (x && (!y || y.at < x.at)) all[f] = x;
    else if (y) all[f] = { value: y.value, by: y.by, at: y.at, ...(y.seen ? { seen: y.seen } : {}) };
  }
  const { deal, marks } = withLetEdits({ ...d, app }, all);
  return { ...deal, letEdits: marks };
}
