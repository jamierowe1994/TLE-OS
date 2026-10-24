import { NextRequest, NextResponse } from "next/server";
import { whoIs, type Who } from "@/lib/admin";
import { contactsAsLeads } from "@/lib/contact-leads";
import { NUDGE_DAYS } from "@/lib/contract-nudge";
import { hasDb, q } from "@/lib/db";
import { internalDomains } from "@/lib/email-policy";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import { NOT_SALES } from "@/lib/lead-ledger";
import { leadHeldBySql } from "@/lib/lead-owner";
import { allCancellations } from "@/lib/let-cancel";
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
  type FrontAnswer,
  type FrontLeads,
  type FrontLets,
  type FrontTerm,
  type FrontTerms,
  type Part,
  type SourceBucket,
} from "@/lib/front-dash";

/** E-sign requests in REX older than this are abandoned, not out for signature. */
const ESIGN_STALE_MS = 60 * 86_400_000;

/**
 * GET /api/dashboard/front - the front dashboard's figures, chart and
 * pipeline (new look, 24 Oct 2026), over the last 180 London days, so the page
 * can show 7, 30 or 90 days and the change against the same length before
 * without asking again.
 *
 * Why its own route rather than the shared reads: the lead board carries the
 * newest 500 leads, which is about ten days of the whole business (Rig P-010),
 * and the applications board drops a let once its move-in has passed. Neither
 * can count 90 days, let alone the 90 before. So the leads are counted from
 * the ledger (os_leads, every lead on file) and lets from REX by the date they
 * were accepted - the definition Susan's June finals were checked against
 * (lib/business/rex-stats).
 *
 * SCOPED EXACTLY AS THE SCREENS THESE FIGURES OPEN:
 *   leads, passports, viewings   lib/scope leadScope (the Leads board's)
 *   lets and applications        scopeFor (the Applications board's)
 *   terms                        the Terms to sign rule (/api/esign/outstanding)
 * Appraisals are not here: the page counts them from /api/appraisals, the
 * read the Market Appraisals screen and the old figure already share.
 *
 * Each part answers on its own. One that can't be read says why and carries
 * no figure - never a held or invented one. Nothing is written anywhere.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A reason worded for the page. Anything else thrown (a database or REX
    error) is replaced by the part's own plain sentence: agent screens never
    show a system's error text, nor name the system. */
class Say extends Error {}
const fail = <T,>(e: unknown, fallback: string): Part<T> => ({ ok: false, error: e instanceof Say ? e.message : fallback });

/** Index of a London day in `days`, or -1 when outside the window. */
const indexer = (days: string[]) => {
  const at = new Map(days.map((d, i) => [d, i]));
  return (day: string | null | undefined) => (day ? (at.get(day) ?? -1) : -1);
};
const zeros = (n: number) => Array.from({ length: n }, () => 0);

/* ── Leads ─────────────────────────────────────────────────────────────── */

async function readLeads(days: string[], scope: Scope, actorEmail: string | null): Promise<FrontLeads> {
  if (!hasDb()) throw new Say("The lead ledger isn't on this environment.");
  if (scope.unlinked) throw new Say("Your account isn't linked yet - ask James.");
  const idx = indexer(days);
  const hidden = await hiddenLeadIds();
  const agent = scope.everything ? null : scope.rexUserId;
  /* Every lettings lead on file in the window: the same rows the Leads board
     reads (ledgerBoard), sales set aside, hand-removed ones left out. */
  const rows = await q<{ day: string; source: string; tenant: boolean; n: number; fresh: number }>(
    `SELECT to_char(received_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day,
            COALESCE(source, '') AS source,
            (COALESCE(enquiry, '') = 'Letting') AS tenant,
            COUNT(*)::int AS n,
            COUNT(*) FILTER (WHERE stage = 'New')::int AS fresh
       FROM os_leads
      WHERE received_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
        AND ${NOT_SALES}
        AND NOT (id = ANY($2::text[]))
        ${agent ? `AND ${leadHeldBySql("os_leads", "$3")}` : ""}
      GROUP BY 1, 2, 3`,
    agent ? [days[0], [...hidden], agent] : [days[0], [...hidden]]
  );
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

  /* People added by hand are leads on the board too (/api/leads adds them the
     same way), unless REX has since sent the same person back as a lead. */
  const mine = await contactsAsLeads(scope.everything ? null : actorEmail, 500, actorEmail);
  const recent = mine.filter((l) => l.receivedAt && !hidden.has(l.id) && idx(londonDay(new Date(l.receivedAt))) >= 0);
  const contactIds = recent.map((l) => (l as { contactId?: string }).contactId).filter((c): c is string => Boolean(c));
  const backFromRex = contactIds.length
    ? new Set((await q<{ contact_id: string }>(`SELECT DISTINCT contact_id FROM os_leads WHERE contact_id = ANY($1::text[])`, [contactIds])).map((r) => r.contact_id))
    : new Set<string>();
  for (const l of recent) {
    const cid = (l as { contactId?: string }).contactId;
    if (cid && backFromRex.has(cid)) continue;
    add(londonDay(new Date(l.receivedAt!)), l.source, l.enquiry === "Letting", 1, l.stage === "New" ? 1 : 0);
  }
  return out;
}

/* ── Passports and viewings ───────────────────────────────────────────── */

async function readPassports(days: string[], scope: Scope): Promise<number[]> {
  if (!hasDb()) throw new Say("No database on this environment.");
  if (scope.unlinked) throw new Say("Your account isn't linked yet - ask James.");
  const idx = indexer(days);
  const LIMIT = 500;
  const rows = await donePassports({ rexUserId: scope.everything ? null : scope.rexUserId, limit: LIMIT });
  /* A full page whose oldest is still inside the window means some were not
     read: the count would be short, so it is not given at all. */
  if (rows.length >= LIMIT && idx(londonDay(new Date(rows[rows.length - 1].submittedAt))) >= 0) {
    throw new Say("More passports than one read holds.");
  }
  const out = zeros(days.length);
  for (const p of rows) {
    const i = idx(londonDay(new Date(p.submittedAt)));
    if (i >= 0) out[i]++;
  }
  return out;
}

async function readViewings(days: string[], scope: Scope, name: string | null): Promise<number[]> {
  if (!hasDb()) throw new Say("No database on this environment.");
  if (scope.unlinked) throw new Say("Your account isn't linked yet - ask James.");
  /* The diary carries the agent's name, not an id (lib/rex-viewings
     newBookingsFor scopes the same way). */
  if (!scope.everything && !name) throw new Say("We can't tell whose viewings are yours.");
  const idx = indexer(days);
  const rows = await q<{ day: string; n: number }>(
    `SELECT to_char(starts_at AT TIME ZONE 'Europe/London', 'YYYY-MM-DD') AS day, COUNT(*)::int AS n
       FROM os_viewings
      WHERE kind = 'viewing' AND NOT cancelled
        AND starts_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
        AND starts_at <= NOW()
        ${scope.everything ? "" : "AND LOWER(TRIM(COALESCE(agent, ''))) = LOWER(TRIM($2))"}
      GROUP BY 1`,
    scope.everything ? [days[0]] : [days[0], name]
  );
  const out = zeros(days.length);
  for (const r of rows) {
    const i = idx(r.day);
    if (i >= 0) out[i] += Number(r.n);
  }
  return out;
}

/* ── Lets and applications ─────────────────────────────────────────────── */

/** REX is asked at most every five minutes per book: these move slowly and
    every page of applications is a round trip. Only good answers are held. */
const G = globalThis as unknown as { __frontDash?: Map<string, { at: number; value: unknown }> };
const held = (G.__frontDash ??= new Map());
async function cached<T>(key: string, ms: number, read: () => Promise<T>): Promise<T> {
  const hit = held.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.value as T;
  const value = await read();
  held.set(key, { at: Date.now(), value });
  return value;
}

const perMonth = (a: Application): number | null => {
  if (a.offerAmount == null || !(a.offerAmount > 0)) return null;
  return /week/i.test(a.offerPeriod) ? (a.offerAmount * 52) / 12 : a.offerAmount;
};

async function readLets(days: string[], scope: Scope, name: string | null): Promise<FrontLets> {
  if (!rexConfigured()) throw new Say("Applications aren't connected here.");
  if (scope.unlinked || (!scope.everything && !scope.rexUserId)) throw new Say("Your account isn't linked yet - ask James.");
  const idx = indexer(days);
  const appliedFrom = days[days.length - 90];
  const agent = scope.rexUserId && !scope.everything ? [{ name: "application.agent_id", type: "=", value: scope.rexUserId }] : [];
  const search = (criteria: Record<string, unknown>[]) =>
    rexSearchAll("TenancyApplications", { criteria: [...agent, ...criteria], order_by: { system_ctime: "desc" } }, { max: 2000 }).then((rows) => {
      const seen = new Set<string>();
      return rows.map(shapeApplication).filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)));
    });
  const [accepted, received] = await cached(`apps:${scope.everything ? "all" : scope.rexUserId}:${days[0]}`, 5 * 60_000, () =>
    Promise.all([
      search([{ name: "application.date_accepted", type: ">=", value: days[0] }]),
      search([{ name: "application.date_received", type: ">=", value: appliedFrom }]),
    ])
  );
  /* Lets cancelled from their own page (lib/let-cancel) are not lets. */
  const cancelled = new Set((await allCancellations()).flatMap((c) => [c.ref, c.dealId ?? ""]).filter(Boolean));

  const out: FrontLets = { agreed: zeros(days.length), rentSum: zeros(days.length), rentN: zeros(days.length), applied: zeros(days.length) };
  const agree = (day: string | null, rent: number | null) => {
    const i = idx(day);
    if (i < 0) return;
    out.agreed[i]++;
    if (rent != null) {
      out.rentSum[i] += rent;
      out.rentN[i]++;
    }
  };
  for (const a of accepted) {
    /* Accepted and since fallen through is not a let agreed. */
    if (a.status === "unsuccessful" || cancelled.has(String(a.id))) continue;
    agree(a.dateAccepted?.slice(0, 10) ?? null, perMonth(a));
  }
  for (const a of received) {
    const i = idx(a.dateReceived?.slice(0, 10) ?? null);
    if (i >= days.length - 90) out.applied[i]++;
  }

  /* Offers accepted in the OS are lets too (lib/applications, 12 Oct 2026):
     REX does not know about them until somebody keys them in, and when they
     do, that REX application is the let and this one steps aside. */
  if (hasDb()) {
    const offers = await q<{ id: string; email: string; listing_id: string; amount: string | null; made: Date; decided_at: Date; by_name: string | null }>(
      `SELECT r.id, LOWER(r.email) AS email, r.listing_id, r.payload->>'amount' AS amount, r.created_at AS made, d.decided_at, d.by_name
         FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
        WHERE d.decision = 'accepted' AND r.listing_id IS NOT NULL
          AND d.decided_at >= ($1::date)::timestamp AT TIME ZONE 'Europe/London'
          AND split_part(LOWER(TRIM(r.email)), '@', 2) <> ALL($2::text[])
          AND NOT EXISTS (SELECT 1 FROM os_contacts c WHERE c.is_test AND LOWER(c.email) = LOWER(r.email))`,
      [days[0], internalDomains()]
    );
    for (const o of offers) {
      if (cancelled.has(`os:${o.id}`)) continue;
      /* An agent's own: the one who accepted it. */
      if (!scope.everything && (!name || (o.by_name ?? "").trim().toLowerCase() !== name.trim().toLowerCase())) continue;
      const twin = accepted.some((a) => String(a.listingId ?? "") === String(o.listing_id) && a.applicants.some((p) => (p.email ?? "").toLowerCase() === o.email));
      if (twin) continue;
      const amount = Number(o.amount);
      agree(londonDay(new Date(o.decided_at)), Number.isFinite(amount) && amount > 0 ? amount : null);
      const i = idx(londonDay(new Date(o.made)));
      if (i >= days.length - 90) out.applied[i]++;
    }
  }
  return out;
}

/* ── Terms out ─────────────────────────────────────────────────────────── */

type Esign = { sentAt: string | null; sentById: string | null };
type EsignRaw = { id?: number | string; esign_template_id?: number; esign_template?: { id?: number }; system_sent_time?: number; system_sent_user?: { id?: string | number } };

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
     full, as the list does for every row. */
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
      sentAt: r.system_sent_time ? new Date(r.system_sent_time * 1000).toISOString() : null,
      sentById: r.system_sent_user?.id != null ? String(r.system_sent_user.id) : null,
    }));
}

async function readTerms(req: NextRequest, who: Who): Promise<FrontTerms> {
  if (!hasDb()) throw new Say("No database on this environment.");
  /* WHOSE: the Terms to sign rule (/api/esign/outstanding). The office and the
     owners see the business; anybody else the ones they sent. */
  let everything = Boolean(who.actor && can(who.actor.role, "see:everything") && !who.viewingAs);
  let rexUserId: string | null = null;
  if (!everything) {
    const scope = await scopeForWho(req, who);
    everything = scope.everything;
    if (!everything) {
      if (scope.unlinked || !scope.rexUserId) throw new Say("Your account isn't linked yet - ask James.");
      rexUserId = scope.rexUserId;
    }
  }
  const name = ((who.subject ?? who.actor)?.name ?? "").trim();
  const lateAfterDays = NUDGE_DAYS[NUDGE_DAYS.length - 1];
  const lateAt = Date.now() - lateAfterDays * 86_400_000;
  const row = (sentAt: string | null, from: FrontTerm["from"]): FrontTerm => ({
    sentAt,
    late: sentAt != null && new Date(sentAt).getTime() < lateAt,
    from,
  });
  const notTest = (alias: string) => `NOT EXISTS (SELECT 1 FROM os_contacts c WHERE c.is_test AND 'os-' || c.id = ${alias}.lead_id)`;

  const [page, docuseal, esign] = await Promise.all([
    /* Our own terms page (lib/terms): with the landlord and not yet signed. */
    q<{ sent_at: Date | null }>(
      `SELECT t.sent_at FROM os_terms t LEFT JOIN os_market_appraisals a ON a.id = t.appraisal_id
        WHERE t.status = 'sent' AND t.completed_at IS NULL AND t.cancelled_at IS NULL
          AND (a.id IS NULL OR ${notTest("a")})
          ${rexUserId ? "AND t.agent_id IN (SELECT id FROM os_users WHERE rex_user_id = $1)" : ""}`,
      rexUserId ? [rexUserId] : []
    ),
    /* DocuSeal contracts sent from an appraisal (lib/contract-send), unsigned,
       on a file still working - the same test the automatic nudge makes -
       and not since redrawn on our own page. */
    !everything && !name ? Promise.resolve([] as { sent: string | null }[]) : q<{ sent: string | null }>(
      `SELECT cs.payload->>'firstSentAt' AS sent
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
  const rows: FrontTerm[] = [
    ...page.map((r) => row(r.sent_at ? new Date(r.sent_at).toISOString() : null, "page")),
    ...docuseal.map((r) => row(r.sent, "docuseal")),
    /* An e-sign request older than 60 days is one nobody is chasing: REX still holds
       ones from 2023 as outstanding, and counting them read "44 out, 43 late". */
    ...esign
      .filter((r) => (everything || r.sentById === rexUserId) && Boolean(r.sentAt) && Date.now() - new Date(r.sentAt as string).getTime() <= ESIGN_STALE_MS)
      .map((r) => row(r.sentAt, "esign")),
  ];
  return { rows, lateAfterDays };
}

/* ── The answer ────────────────────────────────────────────────────────── */

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  if (!who.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const days = lastDays(FRONT_DAYS);
  const [lScope, aScope] = await Promise.all([leadScope(req), scopeForWho(req, who)]);
  const name = ((who.subject ?? who.actor)?.name ?? "").trim() || null;
  const actorEmail = who.actor.email ?? null;

  const settle = <T,>(p: Promise<T>, fallback: string): Promise<Part<T>> =>
    p.then((data) => ({ ok: true as const, data }), (e) => fail<T>(e, fallback));

  const [leads, lets, terms, passports, viewings] = await Promise.all([
    settle(readLeads(days, lScope, actorEmail), "Leads couldn't be read just now."),
    settle(readLets(days, aScope, name), "Lets couldn't be read just now."),
    settle(readTerms(req, who), "Terms couldn't be read just now."),
    settle(readPassports(days, lScope), "Passports couldn't be read just now."),
    settle(readViewings(days, lScope, name), "Viewings couldn't be read just now."),
  ]);

  const body: FrontAnswer = {
    ok: true,
    days,
    everything: lScope.everything,
    scopeLabel: lScope.label,
    leads,
    lets,
    terms,
    passports,
    viewings,
  };
  return NextResponse.json(body);
}
