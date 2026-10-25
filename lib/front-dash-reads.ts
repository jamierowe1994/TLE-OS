import "server-only";
import type { NextRequest } from "next/server";
import { whoIs, type Who } from "@/lib/admin";
import { stagedAppraisals } from "@/lib/appraisal-stage";
import { contactsAsLeads } from "@/lib/contact-leads";
import { NUDGE_DAYS } from "@/lib/contract-nudge";
import { hasDb, q } from "@/lib/db";
import { internalDomains } from "@/lib/email-policy";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import { NOT_SALES } from "@/lib/lead-ledger";
import { leadHeldBySql } from "@/lib/lead-owner";
import type { Lead } from "@/lib/leads-sample";
import { allCancellations } from "@/lib/let-cancel";
import { MA_STAGES, type MarketAppraisal } from "@/lib/market-appraisal";
import { donePassports } from "@/lib/passports-done";
import { rexCall, rexConfigured, rexSearch, rexSearchAll } from "@/lib/rex";
import { tleTemplateIds } from "@/lib/rex-esign";
import { can } from "@/lib/roles";
import { leadScope, scopeForWho, type Scope } from "@/lib/scope";
import { shapeApplication, type Application } from "@/lib/applications";
import {
  FRONT_DAYS,
  SOURCE_BUCKETS,
  bucketOf,
  lastDays,
  londonDay,
  type FrontAppraisals,
  type FrontLeads,
  type FrontLets,
  type FrontRecord,
  type FrontTerm,
  type FrontTerms,
  type Part,
  type SourceBucket,
} from "@/lib/front-dash";

/**
 * The front dashboard's reads (new look, 24-25 Oct 2026), shared by the figures
 * (GET /api/dashboard/front) and the lists behind them
 * (GET /api/dashboard/front/records).
 *
 * ONE READ, TWO SHAPES. Every part is read here once, as its records, and the
 * figure is those records counted by London day - so a drawer's list and the
 * figure it was opened from cannot disagree: they are the same rows. Leads are
 * the exception only in how they are asked: the figure counts the ledger with
 * a GROUP BY (180 days of the whole business is ~12,000 rows), the list reads
 * the same WHERE row by row for the days asked, and the hand-added people are
 * one shared function for both.
 *
 * SCOPED EXACTLY AS THE SCREENS THESE FIGURES OPEN:
 *   leads, passports, viewings   lib/scope leadScope (the Leads board's)
 *   lets and applications        scopeForWho (the Applications board's)
 *   terms                        the Terms to sign rule (/api/esign/outstanding)
 *   appraisals                   the whole office, as /api/appraisals lists them
 *
 * A list never carries a phone number or an email: name, home, source, when,
 * where it has got to, and the page that opens it.
 *
 * Each part answers on its own. One that can't be read says why and carries
 * no figure - never a held or invented one. Nothing is written anywhere.
 */

/** E-sign requests in REX older than this are abandoned, not out for signature. */
const ESIGN_STALE_MS = 60 * 86_400_000;

/** A reason worded for the page. Anything else thrown (a database or REX
    error) is replaced by the part's own plain sentence: agent screens never
    show a system's error text, nor name the system. */
export class Say extends Error {}
export const fail = <T,>(e: unknown, fallback: string): Part<T> => ({ ok: false, error: e instanceof Say ? e.message : fallback });
export const settle = <T,>(p: Promise<T>, fallback: string): Promise<Part<T>> =>
  p.then((data) => ({ ok: true as const, data }), (e) => fail<T>(e, fallback));

/** Index of a London day in `days`, or -1 when outside the window. */
const indexer = (days: string[]) => {
  const at = new Map(days.map((d, i) => [d, i]));
  return (day: string | null | undefined) => (day ? (at.get(day) ?? -1) : -1);
};
const zeros = (n: number) => Array.from({ length: n }, () => 0);
const enc = encodeURIComponent;
const dayOfIso = (iso: string | Date | null | undefined) => (iso ? londonDay(new Date(iso)) : null);

/* ── Who is asking ─────────────────────────────────────────────────────── */

export interface FrontCtx {
  req: NextRequest;
  who: Who;
  /** The 180 London days, oldest first, the last today. */
  days: string[];
  lScope: Scope;
  aScope: Scope;
  /** The person's own name (the subject's, while a view-as is open). */
  name: string | null;
  actorEmail: string | null;
}

export async function frontCtx(req: NextRequest): Promise<FrontCtx | null> {
  const who = await whoIs(req);
  if (!who.actor) return null;
  const [lScope, aScope] = await Promise.all([leadScope(req), scopeForWho(req, who)]);
  return {
    req,
    who,
    days: lastDays(FRONT_DAYS),
    lScope,
    aScope,
    name: ((who.subject ?? who.actor)?.name ?? "").trim() || null,
    actorEmail: who.actor.email ?? null,
  };
}

/* ── Held answers ──────────────────────────────────────────────────────── */

/** REX is asked at most every few minutes per book: these move slowly and
    every page of applications is a round trip. Only good answers are held,
    and two callers arriving together share the one read in flight (the
    figures and a drawer opened straight away, or two tabs). */
const G = globalThis as unknown as { __frontDash?: Map<string, { at: number; value: unknown }>; __frontDashFlying?: Map<string, Promise<unknown>> };
const held = (G.__frontDash ??= new Map());
const flying = (G.__frontDashFlying ??= new Map());
async function cached<T>(key: string, ms: number, read: () => Promise<T>): Promise<T> {
  const hit = held.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value as T;
  const going = flying.get(key);
  if (going) return going as Promise<T>;
  const p = read().then(
    (value) => {
      held.set(key, { at: Date.now(), value });
      flying.delete(key);
      return value;
    },
    (e) => {
      flying.delete(key);
      throw e;
    }
  );
  flying.set(key, p);
  return p;
}

/* ── Leads ─────────────────────────────────────────────────────────────── */

function leadGate(scope: Scope) {
  if (!hasDb()) throw new Say("The lead ledger isn't on this environment.");
  if (scope.unlinked) throw new Say("Your account isn't linked yet - ask James.");
}

/**
 * The people added by hand inside the window (the Leads board adds them the
 * same way), unless the ledger has since had the same person back as a lead.
 * The figure and the list both count exactly these.
 */
async function handAdded(days: string[], scope: Scope, actorEmail: string | null, hidden: Set<string>): Promise<Lead[]> {
  const idx = indexer(days);
  const mine = await contactsAsLeads(scope.everything ? null : actorEmail, 500, actorEmail);
  const recent = mine.filter((l) => l.receivedAt && !hidden.has(l.id) && idx(londonDay(new Date(l.receivedAt))) >= 0);
  const contactIds = recent.map((l) => l.contactId).filter((c): c is string => Boolean(c));
  const backFromRex = contactIds.length
    ? new Set((await q<{ contact_id: string }>(`SELECT DISTINCT contact_id FROM os_leads WHERE contact_id = ANY($1::text[])`, [contactIds])).map((r) => r.contact_id))
    : new Set<string>();
  return recent.filter((l) => !(l.contactId && backFromRex.has(l.contactId)));
}

/** The ledger's WHERE for one person's leads or everybody's, with its params from $1. */
function leadWhere(scope: Scope, hidden: Set<string>, from: string) {
  const agent = scope.everything ? null : scope.rexUserId;
  const params: unknown[] = [from, [...hidden]];
  if (agent) params.push(agent);
  const sql = `received_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
        AND ${NOT_SALES}
        AND NOT (id = ANY($2::text[]))
        ${agent ? `AND ${leadHeldBySql("os_leads", "$3")}` : ""}`;
  return { sql, params };
}

export async function readLeads(ctx: FrontCtx): Promise<FrontLeads> {
  const { days, lScope: scope } = ctx;
  leadGate(scope);
  const idx = indexer(days);
  const hidden = await hiddenLeadIds();
  const w = leadWhere(scope, hidden, days[0]);
  /* Every lettings lead on file in the window: the same rows the Leads board
     reads (ledgerBoard), sales set aside, hand-removed ones left out. Asked
     at the same time as the hand-added people. */
  const [rows, added] = await Promise.all([
    q<{ day: string; source: string; tenant: boolean; n: number; fresh: number }>(
      `SELECT to_char(received_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day,
              COALESCE(source, '') AS source,
              (COALESCE(enquiry, '') = 'Letting') AS tenant,
              COUNT(*)::int AS n,
              COUNT(*) FILTER (WHERE stage = 'New')::int AS fresh
         FROM os_leads
        WHERE ${w.sql}
        GROUP BY 1, 2, 3`,
      w.params
    ),
    handAdded(days, scope, ctx.actorEmail, hidden),
  ]);
  const out: FrontLeads = {
    bySource: Object.fromEntries(SOURCE_BUCKETS.map((b) => [b.id, zeros(days.length)])) as Record<SourceBucket, number[]>,
    tenant: zeros(days.length),
    fresh: zeros(days.length),
  };
  const add = (day: string, source: string, tenant: boolean, n: number, fresh: number) => {
    const i = idx(day);
    if (i < 0) return;
    out.bySource[bucketOf(source)][i] += n;
    if (tenant) out.tenant[i] += n;
    out.fresh[i] += fresh;
  };
  for (const r of rows) add(r.day, r.source, Boolean(r.tenant), Number(r.n), Number(r.fresh));
  for (const l of added) add(londonDay(new Date(l.receivedAt!)), l.source, l.enquiry === "Letting", 1, l.stage === "New" ? 1 : 0);
  return out;
}

/** The leads behind the figure, the chart's bar or the Enquiries step: newest first. */
export async function leadRecords(ctx: FrontCtx, from: string, to: string, opts: { tenant?: boolean; source?: SourceBucket | null }): Promise<FrontRecord[]> {
  const { days, lScope: scope } = ctx;
  leadGate(scope);
  const hidden = await hiddenLeadIds();
  const w = leadWhere(scope, hidden, days[0]);
  const fromAt = w.params.length + 1;
  const [rows, added] = await Promise.all([
    q<{ id: string; day: string; at: Date | string | null; source: string; enquiry: string; stage: string; name: string; address: string }>(
      `SELECT id, to_char(received_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day, received_at AS at,
              COALESCE(source, '') AS source, COALESCE(enquiry, '') AS enquiry, COALESCE(stage, '') AS stage,
              COALESCE(name, '') AS name, COALESCE(address, '') AS address
         FROM os_leads
        WHERE ${w.sql}
          AND to_char(received_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') BETWEEN $${fromAt} AND $${fromAt + 1}
        ORDER BY received_at DESC`,
      [...w.params, from, to]
    ),
    handAdded(days, scope, ctx.actorEmail, hidden),
  ]);
  const keep = (day: string, source: string, enquiry: string) =>
    day >= from && day <= to && (!opts.tenant || enquiry === "Letting") && (!opts.source || bucketOf(source) === opts.source);
  const out: FrontRecord[] = [];
  for (const r of rows) {
    if (!keep(r.day, r.source, r.enquiry)) continue;
    out.push({
      id: r.id,
      name: r.name.trim() || "No name given",
      property: r.address.trim(),
      source: r.source.trim() || null,
      at: r.at ? new Date(r.at).toISOString() : null,
      status: r.stage === "New" ? "Not contacted yet" : r.stage || "On the board",
      fresh: r.stage === "New",
      href: `/leads?open=${enc(r.id)}`,
    });
  }
  for (const l of added) {
    if (!keep(londonDay(new Date(l.receivedAt!)), l.source, l.enquiry)) continue;
    out.push({
      id: l.id,
      name: l.name.trim() || "No name given",
      property: (l.address ?? l.area ?? "").trim(),
      source: (l.source ?? "").trim() || "Added by hand",
      at: l.receivedAt ?? null,
      status: l.stage === "New" ? "Not contacted yet" : l.stage,
      fresh: l.stage === "New",
      href: `/leads?open=${enc(l.id)}`,
    });
  }
  return out.sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""));
}

/* ── Appraisals ────────────────────────────────────────────────────────── */

const live = (a: MarketAppraisal) => !a.cancelledAt && !a.archivedAt;
const stageOf = (a: MarketAppraisal) => a.liveStage ?? a.stage;

/** The Market Appraisals screen's own list (/api/appraisals), less other testers' test files. */
async function officeAppraisals(ctx: FrontCtx): Promise<MarketAppraisal[]> {
  const [rows, othersTests] = await Promise.all([
    stagedAppraisals(),
    hasDb()
      ? q<{ lead: string }>(`SELECT 'os-' || id AS lead FROM os_contacts WHERE is_test AND lower(created_by) <> lower($1)`, [ctx.actorEmail ?? ""]).then(
          (r) => new Set(r.map((x) => x.lead))
        )
      : Promise.resolve(new Set<string>()),
  ]);
  return rows.filter((a) => live(a) && a.createdAt && !(a.leadId && othersTests.has(a.leadId)));
}

export async function readAppraisals(ctx: FrontCtx): Promise<FrontAppraisals> {
  const { days } = ctx;
  const idx = indexer(days);
  const today = days[days.length - 1];
  const list = await officeAppraisals(ctx);
  const out: FrontAppraisals = { created: zeros(days.length), won: zeros(days.length), today: 0 };
  for (const a of list) {
    const i = idx(dayOfIso(a.createdAt));
    if (i >= 0) {
      out.created[i]++;
      if (stageOf(a) === "won") out.won[i]++;
    }
    if (a.appointmentAt && dayOfIso(a.appointmentAt) === today) out.today++;
  }
  return out;
}

export async function appraisalRecords(ctx: FrontCtx, from: string, to: string): Promise<FrontRecord[]> {
  const list = (await officeAppraisals(ctx)).filter((a) => {
    const d = dayOfIso(a.createdAt);
    return d != null && d >= from && d <= to;
  });
  /* Where the landlord came from: the lead's own source, when it came from one. */
  const leadIds = [...new Set(list.map((a) => a.leadId).filter((x): x is string => Boolean(x)))];
  const sources = new Map<string, string>();
  if (leadIds.length && hasDb()) {
    const rows = await q<{ id: string; source: string | null }>(
      `SELECT id, source FROM os_leads WHERE id = ANY($1::text[])
       UNION ALL
       SELECT 'os-' || id, source FROM os_contacts WHERE 'os-' || id = ANY($1::text[])`,
      [leadIds]
    ).catch(() => []);
    for (const r of rows) if (r.source?.trim() && !sources.has(r.id)) sources.set(r.id, r.source.trim());
  }
  const label = (s: string) => MA_STAGES.find((m) => m.id === s)?.label ?? s;
  return list
    .map((a): FrontRecord => {
      const appt = a.appointmentAt
        ? new Date(a.appointmentAt).toLocaleString("en-GB", { timeZone: "Europe/London", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
        : null;
      return {
        id: a.id,
        name: a.landlord?.trim() || "Landlord not named",
        property: [a.address, a.postcode].filter((x) => x?.trim()).join(", "),
        source: a.leadId ? (sources.get(a.leadId) ?? "From a lead") : "Booked direct",
        at: a.createdAt,
        status: `${label(stageOf(a))}${appt ? ` · visit ${appt}` : " · no visit date"}${a.agent ? ` · ${a.agent}` : ""}`,
        href: `/market-appraisals/${enc(a.id)}`,
      };
    })
    .sort((x, y) => (y.at ?? "").localeCompare(x.at ?? ""));
}

/* ── Passports and viewings ───────────────────────────────────────────── */

const PASSPORT_LIMIT = 500;

async function passportRows(ctx: FrontCtx) {
  const { days, lScope: scope } = ctx;
  if (!hasDb()) throw new Say("No database on this environment.");
  if (scope.unlinked) throw new Say("Your account isn't linked yet - ask James.");
  const idx = indexer(days);
  const rows = await donePassports({ rexUserId: scope.everything ? null : scope.rexUserId, limit: PASSPORT_LIMIT });
  /* A full page whose oldest is still inside the window means some were not
     read: the count would be short, so it is not given at all. */
  if (rows.length >= PASSPORT_LIMIT && idx(londonDay(new Date(rows[rows.length - 1].submittedAt))) >= 0) {
    throw new Say("More passports than one read holds.");
  }
  return rows;
}

export async function readPassports(ctx: FrontCtx): Promise<number[]> {
  const idx = indexer(ctx.days);
  const out = zeros(ctx.days.length);
  for (const p of await passportRows(ctx)) {
    const i = idx(londonDay(new Date(p.submittedAt)));
    if (i >= 0) out[i]++;
  }
  return out;
}

export async function passportRecords(ctx: FrontCtx, from: string, to: string): Promise<FrontRecord[]> {
  return (await passportRows(ctx))
    .filter((p) => {
      const d = londonDay(new Date(p.submittedAt));
      return d >= from && d <= to;
    })
    .map((p) => ({
      id: p.id,
      name: p.name?.trim() || "No name given",
      property: p.homes[0] ?? "",
      source: p.homes.length > 1 ? `Asked about ${p.homes.length} homes` : null,
      at: p.submittedAt,
      status: `Passport finished${p.agent ? ` · ${p.agent}` : ""}`,
      href: p.leadId ? `/leads?open=${enc(p.leadId)}&passport=1` : "/leads?passports=done",
    }));
}

type ViewingRow = { id: string; day: string; starts_at: Date | string; title: string; listing_id: string | null; label: string | null; agent: string | null; contacts: { name?: string; leadId?: string | null }[] | null; feedback_id: string | null };

async function viewingRows(ctx: FrontCtx, from?: string, to?: string): Promise<ViewingRow[]> {
  const { days, lScope: scope, name } = ctx;
  if (!hasDb()) throw new Say("No database on this environment.");
  if (scope.unlinked) throw new Say("Your account isn't linked yet - ask James.");
  /* The diary carries the agent's name, not an id (lib/rex-viewings
     newBookingsFor scopes the same way). */
  if (!scope.everything && !name) throw new Say("We can't tell whose viewings are yours.");
  const params: unknown[] = [days[0]];
  if (!scope.everything) params.push(name);
  const win = from && to ? `AND to_char(starts_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') BETWEEN $${params.length + 1} AND $${params.length + 2}` : "";
  if (from && to) params.push(from, to);
  return q<ViewingRow>(
    `SELECT id, to_char(starts_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day, starts_at, title, listing_id,
            payload->>'listingLabel' AS label, agent, contacts, feedback_id
       FROM os_viewings
      WHERE kind = 'viewing' AND NOT cancelled
        AND starts_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
        AND starts_at <= NOW()
        ${scope.everything ? "" : "AND LOWER(TRIM(COALESCE(agent, ''))) = LOWER(TRIM($2))"}
        ${win}
      ORDER BY starts_at DESC`,
    params
  );
}

export async function readViewings(ctx: FrontCtx): Promise<number[]> {
  const idx = indexer(ctx.days);
  const out = zeros(ctx.days.length);
  for (const r of await viewingRows(ctx)) {
    const i = idx(r.day);
    if (i >= 0) out[i]++;
  }
  return out;
}

export async function viewingRecords(ctx: FrontCtx, from: string, to: string): Promise<FrontRecord[]> {
  return (await viewingRows(ctx, from, to)).map((r) => {
    const people = (Array.isArray(r.contacts) ? r.contacts : []).map((c) => (c.name ?? "").trim()).filter(Boolean);
    const lead = (Array.isArray(r.contacts) ? r.contacts : []).find((c) => c.leadId)?.leadId ?? null;
    return {
      id: r.id,
      name: people.join(" & ") || "Nobody named",
      property: (r.label ?? r.title ?? "").trim(),
      source: null,
      at: new Date(r.starts_at).toISOString(),
      status: `${r.feedback_id ? "Feedback in" : "No feedback yet"}${r.agent ? ` · ${r.agent}` : ""}`,
      href: r.listing_id ? `/listings/${enc(r.listing_id)}` : lead ? `/leads?open=${enc(lead)}` : "/viewings",
    };
  });
}

/* ── Lets and applications ─────────────────────────────────────────────── */

const perMonth = (a: Application): number | null => {
  if (a.offerAmount == null || !(a.offerAmount > 0)) return null;
  return /week/i.test(a.offerPeriod) ? (a.offerAmount * 52) / 12 : a.offerAmount;
};

type LetRec = FrontRecord & { day: string; rent: number | null };

/**
 * Every let agreed in the 180 days and every application received in the
 * last 90, as records. readLets counts these; the drawer lists them.
 */
async function letBook(ctx: FrontCtx): Promise<{ agreed: LetRec[]; applied: LetRec[] }> {
  const { days, aScope: scope, name } = ctx;
  if (!rexConfigured()) throw new Say("Applications aren't connected here.");
  if (scope.unlinked || (!scope.everything && !scope.rexUserId)) throw new Say("Your account isn't linked yet - ask James.");
  const idx = indexer(days);
  const appliedFrom = days[days.length - 90];
  const agent = scope.rexUserId && !scope.everything ? [{ name: "application.agent_id", type: "=", value: scope.rexUserId }] : [];
  /* REX hands applications back 100 at a time, one page after another, so one
     search over 180 days was several round trips in a row before a single let
     could be counted. Each search is now split into date windows asked at the
     same time (25 Oct 2026). Correct even if a window's upper bound were
     ignored: the windows are joined, every application kept once, and each is
     then placed by its own date, exactly as before. The last window has no
     upper bound, so nothing dated after it is missed. */
  const search = async (field: string, from: string, windows: number) => {
    const at = days.indexOf(from);
    const span = Math.ceil((days.length - at) / windows);
    const parts = Array.from({ length: windows }, (_, w) => {
      const lo = days[at + w * span];
      const hi = w < windows - 1 ? days[at + (w + 1) * span - 1] : null;
      return lo ? [{ name: field, type: ">=", value: lo }, ...(hi ? [{ name: field, type: "<=", value: hi }] : [])] : null;
    }).filter((c): c is { name: string; type: string; value: string }[] => Boolean(c));
    const pages = await Promise.all(
      parts.map((criteria) => rexSearchAll("TenancyApplications", { criteria: [...agent, ...criteria], order_by: { system_ctime: "desc" } }, { max: 2000 }))
    );
    const seen = new Set<string>();
    return pages.flat().map(shapeApplication).filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
  };
  /* The two searches, the cancellations and the OS's own accepted offers are
     all asked at once: only the searches touch REX, and they are held. */
  const [[accepted, received], cancelled, offers] = await Promise.all([
    cached(`apps:${scope.everything ? "all" : scope.rexUserId}:${days[0]}`, 5 * 60_000, () =>
      Promise.all([search("application.date_accepted", days[0], 3), search("application.date_received", appliedFrom, 3)])
    ),
    /* Lets cancelled from their own page (lib/let-cancel) are not lets. */
    allCancellations().then((all) => new Set(all.flatMap((c) => [c.ref, c.dealId ?? ""]).filter(Boolean))),
    hasDb()
      ? q<{ id: string; email: string; name: string; address: string; listing_id: string; amount: string | null; made: Date; decided_at: Date; by_name: string | null }>(
          `SELECT r.id, LOWER(r.email) AS email, r.name, r.address, r.listing_id, r.payload->>'amount' AS amount, r.created_at AS made, d.decided_at, d.by_name
             FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
            WHERE d.decision = 'accepted' AND r.listing_id IS NOT NULL
              AND d.decided_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
              AND split_part(LOWER(TRIM(r.email)), '@', 2) <> ALL($2::text[])
              AND NOT EXISTS (SELECT 1 FROM os_contacts c WHERE c.is_test AND LOWER(c.email) = LOWER(r.email))`,
          [days[0], internalDomains()]
        )
      : Promise.resolve([]),
  ]);

  const who = (a: Application) => a.applicants.map((p) => (p.name ?? "").trim()).filter(Boolean).join(" & ") || "No applicant named";
  const rentWords = (rent: number | null) => (rent != null ? ` · £${Math.round(rent).toLocaleString("en-GB")} pcm` : "");
  const agreed: LetRec[] = [];
  const applied: LetRec[] = [];
  for (const a of accepted) {
    /* Accepted and since fallen through is not a let agreed. */
    if (a.status === "unsuccessful" || cancelled.has(String(a.id))) continue;
    const day = a.dateAccepted?.slice(0, 10) ?? null;
    if (idx(day) < 0) continue;
    const rent = perMonth(a);
    agreed.push({
      id: a.id,
      day: day!,
      rent,
      name: who(a),
      property: [a.property, a.locality].filter((x) => x?.trim()).join(", "),
      source: null,
      at: a.dateAccepted,
      status: `${a.stageLabel ?? a.statusLabel}${rentWords(rent)}`,
      href: `/applications/${enc(a.id)}`,
    });
  }
  for (const a of received) {
    const day = a.dateReceived?.slice(0, 10) ?? null;
    if (idx(day) < days.length - 90) continue;
    applied.push({
      id: a.id,
      day: day!,
      rent: perMonth(a),
      name: who(a),
      property: [a.property, a.locality].filter((x) => x?.trim()).join(", "),
      source: null,
      at: a.dateReceived,
      status: `${a.stageLabel ?? a.statusLabel}${rentWords(perMonth(a))}`,
      href: `/applications/${enc(a.id)}`,
    });
  }

  /* Offers accepted in the OS are lets too (lib/applications, 12 Oct 2026):
     REX does not know about them until somebody keys them in, and when they
     do, that REX application is the let and this one steps aside. */
  for (const o of offers) {
    if (cancelled.has(`os:${o.id}`)) continue;
    /* An agent's own: the one who accepted it. */
    if (!scope.everything && (!name || (o.by_name ?? "").trim().toLowerCase() !== name.trim().toLowerCase())) continue;
    const twin = accepted.some((a) => String(a.listingId ?? "") === String(o.listing_id) && a.applicants.some((p) => (p.email ?? "").toLowerCase() === o.email));
    if (twin) continue;
    const amount = Number(o.amount);
    const rent = Number.isFinite(amount) && amount > 0 ? amount : null;
    const base = {
      id: `os:${o.id}`,
      rent,
      name: o.name?.trim() || "No applicant named",
      property: o.address?.trim() ?? "",
      source: "Offer on the listing",
      href: `/applications/${enc(`os:${o.id}`)}`,
    };
    const aDay = londonDay(new Date(o.decided_at));
    if (idx(aDay) >= 0) agreed.push({ ...base, day: aDay, at: new Date(o.decided_at).toISOString(), status: `Offer accepted${o.by_name ? ` by ${o.by_name}` : ""}${rentWords(rent)}` });
    const mDay = londonDay(new Date(o.made));
    if (idx(mDay) >= days.length - 90) applied.push({ ...base, day: mDay, at: new Date(o.made).toISOString(), status: `Offer made, since accepted${rentWords(rent)}` });
  }
  return { agreed, applied };
}

export async function readLets(ctx: FrontCtx): Promise<FrontLets> {
  const { days } = ctx;
  const idx = indexer(days);
  const { agreed, applied } = await letBook(ctx);
  const out: FrontLets = { agreed: zeros(days.length), rentSum: zeros(days.length), rentN: zeros(days.length), applied: zeros(days.length) };
  for (const r of agreed) {
    const i = idx(r.day);
    out.agreed[i]++;
    if (r.rent != null) {
      out.rentSum[i] += r.rent;
      out.rentN[i]++;
    }
  }
  for (const r of applied) out.applied[idx(r.day)]++;
  return out;
}

export async function letRecords(ctx: FrontCtx, which: "agreed" | "applied", from: string, to: string): Promise<FrontRecord[]> {
  const book = await letBook(ctx);
  return book[which]
    .filter((r) => r.day >= from && r.day <= to)
    .sort((a, b) => (b.at ?? "").localeCompare(a.at ?? ""))
    .map(({ day: _day, rent: _rent, ...r }) => r);
}

/* ── Terms out ─────────────────────────────────────────────────────────── */

type Esign = { id: number; sentAt: string | null; sentById: string | null };
type EsignRaw = {
  id?: number | string;
  esign_template_id?: number;
  esign_template?: { id?: number };
  system_sent_time?: number;
  system_sent_user?: { id?: string | number };
  content?: {
    listing?: { id?: number | string; property?: { system_search_key?: string } };
    email_subject?: string;
    roles?: { provider_role_id?: string; record?: { name?: string } }[];
  };
};

async function outstandingEsign(): Promise<Esign[]> {
  const ours = tleTemplateIds();
  const rows = (await rexSearch("EsignRequests", {
    limit: 100,
    criteria: [
      { name: "esign_template_id", type: "in", value: ours },
      { name: "status_id", type: "in", value: ["incomplete", "partially_signed"] },
    ],
    /* Only id and the two times sort; anything else returns no rows. */
    order_by: { system_sent_time: "desc" },
  })) as EsignRaw[];
  /* A full page may not be all of them: no count rather than a short one. */
  if (rows.length >= 100) throw new Say("More terms out than one read holds.");
  /* The search leaves some fields out: a row without its sender is read in
     full, as the list does for every row. All at once, never one by one. */
  const full = await Promise.all(
    rows.map(async (r) => {
      if (r.system_sent_user?.id != null && (r.esign_template_id ?? r.esign_template?.id) != null) return r;
      const one = await rexCall("EsignRequests", "read", { id: Number(r.id) });
      if (!one.ok) throw new Say("Terms couldn't be read just now.");
      return one.result as EsignRaw;
    })
  );
  return full
    .filter((r) => ours.includes(Number(r.esign_template_id ?? r.esign_template?.id)))
    .map((r) => ({
      id: Number(r.id),
      sentAt: r.system_sent_time ? new Date(r.system_sent_time * 1000).toISOString() : null,
      sentById: r.system_sent_user?.id != null ? String(r.system_sent_user.id) : null,
    }));
}

/** Who an e-sign request is for and which home: read in full, once, and held. */
async function esignDetail(id: number): Promise<{ name: string; property: string; listingId: string | null }> {
  return cached(`esign-one2:${id}`, 10 * 60_000, async () => {
    const one = await rexCall("EsignRequests", "read", { id });
    if (!one.ok) throw new Say("Terms couldn't be read just now.");
    const r = one.result as EsignRaw;
    /* The landlords only: the Agent role is one of ours, not who it waits on (as /api/esign/outstanding). */
    const names = (r.content?.roles ?? [])
      .filter((x) => (x.provider_role_id ?? "").toLowerCase() !== "agent")
      .map((x) => (x.record?.name ?? "").trim())
      .filter(Boolean);
    const fromSubject = (r.content?.email_subject ?? "").split(/\s+-\s+/).slice(1).join(" - ").trim();
    return {
      name: [...new Set(names)].join(" & "),
      property: r.content?.listing?.property?.system_search_key?.trim() || fromSubject,
      listingId: r.content?.listing?.id != null ? String(r.content.listing.id) : null,
    };
  });
}

type TermRec = FrontTerm & { id: string; name: string; property: string; href: string; status: string; opened: boolean | null; esignId?: number };

async function termBook(ctx: FrontCtx): Promise<{ rows: TermRec[]; lateAfterDays: number }> {
  const { req, who } = ctx;
  if (!hasDb()) throw new Say("No database on this environment.");
  /* WHOSE: the Terms to sign rule (/api/esign/outstanding). The office and the
     owners see the business; anybody else the ones they sent. */
  let everything = Boolean(who.actor && can(who.actor.role, "see:everything") && !who.viewingAs);
  let rexUserId: string | null = null;
  if (!everything) {
    const scope = ctx.aScope ?? (await scopeForWho(req, who));
    everything = scope.everything;
    if (!everything) {
      if (scope.unlinked || !scope.rexUserId) throw new Say("Your account isn't linked yet - ask James.");
      rexUserId = scope.rexUserId;
    }
  }
  const name = ((who.subject ?? who.actor)?.name ?? "").trim();
  const lateAfterDays = NUDGE_DAYS[NUDGE_DAYS.length - 1];
  const lateAt = Date.now() - lateAfterDays * 86_400_000;
  const notTest = (alias: string) => `NOT EXISTS (SELECT 1 FROM os_contacts c WHERE c.is_test AND 'os-' || c.id = ${alias}.lead_id)`;

  const [page, docuseal, esign] = await Promise.all([
    /* Our own terms page (lib/terms): with the landlord and not yet signed.
       The parties' names only - never their tokens or contact details. */
    q<{ id: string; sent_at: Date | null; appraisal_id: string | null; listing_id: string | null; address: string; landlord: string | null; parties: string | null; opened: boolean | null }>(
      `SELECT t.id, t.sent_at, t.appraisal_id, t.listing_id,
              COALESCE(NULLIF(t.property_address, ''), a.address, '') AS address,
              a.landlord,
              (SELECT string_agg(NULLIF(TRIM(p->>'name'), ''), ' & ') FROM jsonb_array_elements(t.parties) p) AS parties,
              (SELECT bool_or(p->>'openedAt' IS NOT NULL) FROM jsonb_array_elements(t.parties) p) AS opened
         FROM os_terms t LEFT JOIN os_market_appraisals a ON a.id = t.appraisal_id
        WHERE t.status = 'sent' AND t.completed_at IS NULL AND t.cancelled_at IS NULL
          AND (a.id IS NULL OR ${notTest("a")})
          ${rexUserId ? "AND t.agent_id IN (SELECT id FROM os_users WHERE rex_user_id = $1)" : ""}`,
      rexUserId ? [rexUserId] : []
    ),
    /* DocuSeal contracts sent from an appraisal (lib/contract-send), unsigned,
       on a file still working - the same test the automatic nudge makes -
       and not since redrawn on our own page. */
    !everything && !name
      ? Promise.resolve([] as { record_id: string; sent: string | null; landlord: string; address: string; views: string | null }[])
      : q<{ record_id: string; sent: string | null; landlord: string; address: string; views: string | null }>(
          `SELECT cs.record_id, cs.payload->>'firstSentAt' AS sent, a.landlord, a.address,
                  (SELECT v.payload->>'count' FROM os_case_state v WHERE v.kind = 'landlord-contract-views' AND v.record_id = cs.record_id LIMIT 1) AS views
             FROM os_case_state cs JOIN os_market_appraisals a ON a.id = cs.record_id
            WHERE cs.kind = 'contract-send'
              AND a.stage NOT IN ('won', 'lost') AND a.cancelled_at IS NULL AND a.archived_at IS NULL
              AND ${notTest("a")}
              AND NOT EXISTS (SELECT 1 FROM os_signed_documents d WHERE d.appraisal_id = cs.record_id AND d.completed_at IS NOT NULL)
              AND NOT EXISTS (SELECT 1 FROM os_terms t WHERE t.appraisal_id = cs.record_id AND t.status IN ('sent', 'signed'))
              ${everything ? "" : "AND LOWER(TRIM(COALESCE(a.agent, ''))) = LOWER($1)"}`,
          everything ? [] : [name]
        ),
    /* The e-sign requests the Terms to sign list reads (lib/rex-esign
       outstandingTerms): TLE's own templates, somebody still to sign. Asked
       here with a search that throws when refused - that list's own read
       answers a refusal with nobody outstanding, which would be a made-up 0. */
    rexConfigured() ? cached("esign", 10 * 60_000, outstandingEsign) : Promise.resolve([] as Esign[]),
  ]);
  const late = (sentAt: string | null) => sentAt != null && new Date(sentAt).getTime() < lateAt;
  const rows: TermRec[] = [
    ...page.map((r): TermRec => {
      const sentAt = r.sent_at ? new Date(r.sent_at).toISOString() : null;
      return {
        id: `page:${r.id}`,
        sentAt,
        late: late(sentAt),
        from: "page",
        name: r.parties?.trim() || r.landlord?.trim() || "Landlord not named",
        property: r.address.trim(),
        status: r.opened ? "Opened, not signed" : "Not opened yet",
        opened: Boolean(r.opened),
        href: r.appraisal_id ? `/market-appraisals/${enc(r.appraisal_id)}` : r.listing_id ? `/listings/${enc(r.listing_id)}` : "/market-appraisals",
      };
    }),
    ...docuseal.map((r): TermRec => ({
      id: `docuseal:${r.record_id}`,
      sentAt: r.sent,
      late: late(r.sent),
      from: "docuseal",
      name: r.landlord?.trim() || "Landlord not named",
      property: r.address?.trim() ?? "",
      status: Number(r.views ?? 0) > 0 ? "Opened, not signed" : "Contract sent, not opened",
      opened: Number(r.views ?? 0) > 0,
      href: `/market-appraisals/${enc(r.record_id)}`,
    })),
    /* An e-sign request older than 60 days is one nobody is chasing: REX still holds
       ones from 2023 as outstanding, and counting them read "44 out, 43 late". */
    ...esign
      .filter((r) => (everything || r.sentById === rexUserId) && Boolean(r.sentAt) && Date.now() - new Date(r.sentAt as string).getTime() <= ESIGN_STALE_MS)
      .map((r): TermRec => ({
        id: `esign:${r.id}`,
        esignId: r.id,
        sentAt: r.sentAt,
        late: late(r.sentAt),
        from: "esign",
        name: "",
        property: "",
        status: "E-signature requested, not signed",
        opened: null,
        href: "/market-appraisals",
      })),
  ];
  return { rows, lateAfterDays };
}

/** Whether a set of terms (by its list id) is in this person's own Terms out list: the gate on a nudge. */
export async function termInScope(ctx: FrontCtx, id: string): Promise<boolean> {
  const { rows } = await termBook(ctx);
  return rows.some((r) => r.id === id);
}

export async function readTerms(ctx: FrontCtx): Promise<FrontTerms> {
  const { rows, lateAfterDays } = await termBook(ctx);
  return { rows: rows.map((r) => ({ sentAt: r.sentAt, late: r.late, from: r.from })), lateAfterDays };
}

/** Every set out for signature now, longest waiting first, with where to chase it. */
export async function termRecords(ctx: FrontCtx): Promise<{ rows: FrontRecord[]; lateAfterDays: number }> {
  const { rows, lateAfterDays } = await termBook(ctx);
  const filled = await Promise.all(
    rows.map(async (r) => {
      if (r.esignId == null) return r;
      /* Who it is for, read in full only now somebody has asked to see them. */
      const d = await esignDetail(r.esignId).catch(() => null);
      return {
        ...r,
        name: d?.name || "Signer not named",
        property: d?.property ?? "",
        href: d?.listingId ? `/listings/${enc(d.listingId)}` : r.href,
      };
    })
  );
  const now = Date.now();
  return {
    lateAfterDays,
    rows: filled
      .map(({ esignId: _e, from: _f, sentAt, late, ...r }) => ({
        ...r,
        source: null,
        at: sentAt,
        late,
        waiting: sentAt ? Math.floor((now - new Date(sentAt).getTime()) / 86_400_000) : null,
      }))
      .sort((a, b) => (a.at ?? "9").localeCompare(b.at ?? "9")),
  };
}
