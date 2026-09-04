import "server-only";
import { hasDb, q } from "@/lib/db";
import { getAllPropolyDeals, type BusinessDeal } from "@/lib/business/propoly-deals";
import { getPropolyDeal, propolyConfigured } from "@/lib/business/propoly";
import { logSystemEvent } from "@/lib/business/deal-store";
import { loadMoneyContext, moneyForDeal } from "@/lib/business/deal-money";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";
import {
  eventSentence,
  kindFor,
  STATUS_WORDS,
  TELL_AGENT,
  type DealEvent,
  type DealEventKind,
} from "@/lib/business/deal-events";

/**
 * The thing that notices Propoly moving a deal.
 *
 * ── Why it is a poll ──────────────────────────────────────────────────────
 *
 * Propoly has no webhooks and no events feed (probed 4 Sep 2026: every such
 * path is a gateway 403, meaning it does not exist). So the only way to know a
 * deal moved is to look, remember what we saw, and look again. This does that:
 * the current book against os_deal_states, one event per change, and the
 * states overwritten for next time.
 *
 * ── The first run says nothing ────────────────────────────────────────────
 *
 * An empty state table means the watcher has never looked. Six hundred
 * completed deals and a hundred live ones are not six hundred events; they are
 * the starting position. So the first run seeds and stays silent, and only
 * from the second run is a difference a move.
 *
 * ── Gone from the active book is not the same as gone ─────────────────────
 *
 * The cached book is the active statuses plus one page of cancelled. A deal
 * that leaves it has usually completed, sometimes been cancelled, and very
 * rarely been deleted. Rather than guess, the watcher asks Propoly for that
 * one deal by id and records what it actually says. If Propoly still says an
 * active status the cache was lagging and nothing is recorded.
 *
 * ── The feed is the record; the email is optional ─────────────────────────
 *
 * Events are written whether or not anyone is emailed. The "Tell agents"
 * switch decides the email, and every attempt is stamped on the row so the
 * feed can say "told Sam at 10:14" or "not told - sending is off". Kirstie
 * reads the feed; she asked for fewer pings, not more.
 */

const AUTHOR = { id: "propoly-watch", name: "Propoly", role: "pretenancy" as const };
const COLD_CACHE_WAIT_MS = 12_000;

interface StateRow extends Record<string, unknown> {
  deal_id: string;
  status_key: string;
  property: string;
  agent_email: string | null;
  agent_name: string | null;
  money_checked_at: string | Date | null;
  holding_seen_at: string | Date | null;
  deposit_seen_at: string | Date | null;
  rent_seen_at: string | Date | null;
}

interface EventRow extends Record<string, unknown> {
  id: number | string;
  deal_id: string;
  property: string;
  agent_email: string | null;
  agent_name: string | null;
  event: string;
  from_status: string | null;
  to_status: string | null;
  amount: string | number | null;
  at: string | Date;
  told_to: string | null;
  told_at: string | Date | null;
  told_note: string | null;
}

function rowToEvent(r: EventRow): DealEvent {
  return {
    id: Number(r.id),
    dealId: r.deal_id,
    property: r.property,
    agentEmail: r.agent_email,
    agentName: r.agent_name,
    event: r.event as DealEventKind,
    fromStatus: r.from_status,
    toStatus: r.to_status,
    amount: r.amount == null ? null : Number(r.amount),
    at: new Date(r.at).toISOString(),
    toldTo: r.told_to,
    toldAt: r.told_at ? new Date(r.told_at).toISOString() : null,
    toldNote: r.told_note,
  };
}

export interface WatchResult {
  ok: boolean;
  reason?: string;
  seeded?: number;
  deals: number;
  events: DealEvent[];
  told: number;
}

/** The book, waiting once for a cold cache rather than reporting nothing. */
async function book(): Promise<BusinessDeal[] | null> {
  let deals = await getAllPropolyDeals().catch(() => null);
  if (deals) return deals;
  await new Promise((r) => setTimeout(r, COLD_CACHE_WAIT_MS));
  deals = await getAllPropolyDeals().catch(() => null);
  return deals;
}

function propertyOf(d: BusinessDeal): string {
  return [d.app.propertyName, d.app.locality].filter(Boolean).join(", ");
}

async function upsertState(d: {
  dealId: string;
  status: string;
  property: string;
  agentEmail: string | null;
  agentName: string | null;
  moveIn: string | null;
}): Promise<void> {
  await q(
    `INSERT INTO os_deal_states (deal_id, status_key, property, agent_email, agent_name, move_in, seen_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())
     ON CONFLICT (deal_id) DO UPDATE SET
       status_key = EXCLUDED.status_key,
       property = EXCLUDED.property,
       agent_email = COALESCE(EXCLUDED.agent_email, os_deal_states.agent_email),
       agent_name = COALESCE(EXCLUDED.agent_name, os_deal_states.agent_name),
       move_in = EXCLUDED.move_in,
       seen_at = NOW()`,
    [d.dealId, d.status, d.property, d.agentEmail, d.agentName, d.moveIn]
  );
}

async function record(e: {
  dealId: string;
  property: string;
  agentEmail: string | null;
  agentName: string | null;
  from: string | null;
  to: string | null;
  kind: DealEventKind;
  amount?: number | null;
}): Promise<DealEvent> {
  const rows = await q<EventRow>(
    `INSERT INTO os_deal_events (deal_id, property, agent_email, agent_name, event, from_status, to_status, amount)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [e.dealId, e.property, e.agentEmail, e.agentName, e.kind, e.from, e.to, e.amount ?? null]
  );
  const ev = rowToEvent(rows[0]);
  /* The deal's own thread on the board gets the same line, so opening the
     deal and reading the feed never disagree about when it moved. */
  try {
    await logSystemEvent(e.dealId, AUTHOR, `Propoly: ${eventSentence(ev)}`);
  } catch {
    /* the feed row is the record; the note is a courtesy */
  }
  return ev;
}

/**
 * Status straight from Propoly for one deal that left the cached book.
 * null = could not say (unreachable); "gone" = Propoly no longer has it.
 */
async function statusNow(dealId: string): Promise<string | null | "gone"> {
  try {
    const res = await getPropolyDeal(dealId);
    if (res.status === 404) return "gone";
    if (res.status !== 200) return null;
    const b = res.body as { tenancy_status?: unknown } | null;
    return typeof b?.tenancy_status === "string" ? b.tenancy_status : null;
  } catch {
    return null;
  }
}

/* ───────────────────────────── the run ─────────────────────────────────── */

export async function watchDeals(opts: { origin: string }): Promise<WatchResult> {
  if (!hasDb()) return { ok: false, reason: "No database.", deals: 0, events: [], told: 0 };
  if (!propolyConfigured()) return { ok: false, reason: "Propoly isn't connected.", deals: 0, events: [], told: 0 };

  const deals = await book();
  if (!deals) return { ok: false, reason: "Propoly did not answer in time.", deals: 0, events: [], told: 0 };

  const known = new Map<string, StateRow>();
  for (const r of await q<StateRow>(
    `SELECT deal_id, status_key, property, agent_email, agent_name,
            money_checked_at, holding_seen_at, deposit_seen_at, rent_seen_at
       FROM os_deal_states`
  )) {
    known.set(r.deal_id, r);
  }

  /* First look: remember everything, say nothing. */
  if (known.size === 0) {
    for (const d of deals) {
      await upsertState({
        dealId: d.app.id,
        status: d.statusKey,
        property: propertyOf(d),
        agentEmail: d.managerEmail,
        agentName: d.managerName,
        moveIn: d.app.startDate,
      });
    }
    return { ok: true, seeded: deals.length, deals: deals.length, events: [], told: 0 };
  }

  const events: DealEvent[] = [];
  const seen = new Set<string>();

  for (const d of deals) {
    seen.add(d.app.id);
    const was = known.get(d.app.id);
    const property = propertyOf(d);
    if (was && was.status_key === d.statusKey) continue;
    events.push(
      await record({
        dealId: d.app.id,
        property,
        agentEmail: d.managerEmail ?? was?.agent_email ?? null,
        agentName: d.managerName ?? was?.agent_name ?? null,
        from: was?.status_key ?? null,
        to: d.statusKey,
        kind: kindFor(was?.status_key ?? null, d.statusKey),
      })
    );
    await upsertState({
      dealId: d.app.id,
      status: d.statusKey,
      property,
      agentEmail: d.managerEmail,
      agentName: d.managerName,
      moveIn: d.app.startDate,
    });
  }

  /* Left the active book: ask Propoly what became of it. */
  for (const [dealId, was] of known) {
    if (seen.has(dealId)) continue;
    if (was.status_key === "complete" || was.status_key === "cancelled" || was.status_key === "gone") continue;
    const now = await statusNow(dealId);
    if (now == null || now === was.status_key) continue;
    const kind: DealEventKind = now === "gone" ? "gone" : kindFor(was.status_key, now);
    events.push(
      await record({
        dealId,
        property: was.property,
        agentEmail: was.agent_email,
        agentName: was.agent_name,
        from: was.status_key,
        to: now === "gone" ? null : now,
        kind,
      })
    );
    await q(`UPDATE os_deal_states SET status_key = $2, seen_at = NOW() WHERE deal_id = $1`, [dealId, now]);
  }

  /* Every deal we looked at is stamped, changed or not, so "last checked" on
     the feed means the last time the watcher ran and not the last time
     anything happened. A quiet fortnight must still read as watched. */
  await q(`UPDATE os_deal_states SET seen_at = NOW() WHERE deal_id = ANY($1::text[])`, [[...seen]]);

  events.push(...(await watchMoney(deals, known)));

  const told = await tellAgents(events, opts.origin);
  return { ok: true, deals: deals.length, events, told };
}

/* ───────────────────────────── the money ───────────────────────────────── */

/**
 * Money, seen rather than claimed.
 *
 * Kirstie (4 Sep): Propoly "sometimes recognises payment, and sometimes it
 * doesn't", so she confirms the holding fee and the first rent by looking in
 * PayProp herself. This looks for her. It reads the same join the board and
 * the digest read (deal-money), so the feed can never say rent is in while
 * the board says it is not.
 *
 * Three facts per deal, each announced once, the first time it is seen:
 * the holding fee invoiced, the deposit registered, the first rent received.
 * A row the money pass has never looked at is recorded silently - the book
 * is full of deals whose money arrived months ago, and those are history,
 * not news.
 *
 * Cancelled deals are skipped: money on a dead deal is the next tenant's.
 * A cold PayProp cache (loaded = false) skips the whole pass rather than
 * treating "not loaded" as "nothing there" - the same rule the digest keeps.
 */
async function watchMoney(deals: BusinessDeal[], known: Map<string, StateRow>): Promise<DealEvent[]> {
  const out: DealEvent[] = [];
  let ctx: Awaited<ReturnType<typeof loadMoneyContext>>;
  try {
    ctx = await loadMoneyContext();
  } catch {
    return out;
  }
  if (!ctx.loaded) return out;

  for (const d of deals) {
    if (d.statusKey === "cancelled") continue;
    const row = known.get(d.app.id);
    const money = moneyForDeal(ctx, d.app.propertyName, d.app.startDate);
    const holding = money.holdingInvoice;
    const deposit = money.tenancy?.depositId ? money.tenancy : null;
    const rent = money.rentReceived;

    const firstLook = !row || row.money_checked_at == null;
    const property = propertyOf(d);
    const who = { agentEmail: d.managerEmail ?? row?.agent_email ?? null, agentName: d.managerName ?? row?.agent_name ?? null };

    if (!firstLook) {
      if (holding && !row.holding_seen_at) {
        out.push(await record({ dealId: d.app.id, property, ...who, from: null, to: null, kind: "holding_in", amount: holding.amount }));
      }
      if (deposit && !row.deposit_seen_at) {
        out.push(await record({ dealId: d.app.id, property, ...who, from: null, to: null, kind: "deposit_registered" }));
      }
      if (rent && !row.rent_seen_at) {
        out.push(await record({ dealId: d.app.id, property, ...who, from: null, to: null, kind: "rent_in", amount: rent.amount }));
      }
    }

    await q(
      `UPDATE os_deal_states
          SET money_checked_at = NOW(),
              holding_seen_at = CASE WHEN $2 THEN COALESCE(holding_seen_at, NOW()) ELSE holding_seen_at END,
              deposit_seen_at = CASE WHEN $3 THEN COALESCE(deposit_seen_at, NOW()) ELSE deposit_seen_at END,
              rent_seen_at    = CASE WHEN $4 THEN COALESCE(rent_seen_at, NOW()) ELSE rent_seen_at END
        WHERE deal_id = $1`,
      [d.app.id, Boolean(holding), Boolean(deposit), Boolean(rent)]
    );
  }
  return out;
}

/* ─────────────────────────── telling people ────────────────────────────── */

function subjectFor(e: DealEvent): string {
  switch (e.event) {
    case "references_back":
      return `References back: ${e.property}`;
    case "agreement_out":
      return `Out for signing: ${e.property}`;
    case "complete":
      return `Complete: ${e.property}`;
    case "cancelled":
      return `Cancelled: ${e.property}`;
    case "rent_in":
      return `Rent in: ${e.property}`;
    default:
      return `${eventSentence(e)}: ${e.property}`;
  }
}

function bodyFor(e: DealEvent, origin: string): { text: string; html: string } {
  const next =
    e.event === "references_back"
      ? "Next: start the PLC check from the application. Every certificate and ID needs to be in the pack before it goes to Kirstie, or the check fails and costs another £60."
      : e.event === "agreement_out"
        ? "Next: nothing until both the landlord and the tenant have signed. Kirstie will mark it complete."
        : e.event === "complete"
          ? "Signed and monies in. Move-in is the last step."
          : e.event === "rent_in"
            ? "The first rent has landed in PayProp. Kirstie will close the deal off; you can plan the move-in."
            : "Propoly has cancelled this deal. If that is a surprise, speak to Kirstie.";
  const link = `${origin}/applications`;
  const text = `${e.property}\n${eventSentence(e)}.\n\n${next}\n\nOpen your applications: ${link}\n`;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const html = `<div style="font:15px/1.5 Unitext,Montserrat,system-ui,sans-serif;color:#1f1f1f;max-width:560px">
<p style="margin:0 0 4px;font-size:17px">${esc(e.property)}</p>
<p style="margin:0 0 18px;color:#555">${esc(eventSentence(e))}.</p>
<p style="margin:0 0 18px">${esc(next)}</p>
<p style="margin:0"><a href="${link}" style="display:inline-block;padding:10px 16px;border-radius:999px;background:#1f1f1f;color:#fff;text-decoration:none">Open my applications</a></p>
</div>`;
  return { text, html };
}

async function tellAgents(events: DealEvent[], origin: string): Promise<number> {
  const worth = events.filter((e) => TELL_AGENT.has(e.event));
  if (worth.length === 0) return 0;
  const armed = await switchOn("deal_watch_notify");
  let told = 0;
  for (const e of worth) {
    let note: string;
    let to: string | null = null;
    let at: Date | null = null;
    if (!e.agentEmail) {
      note = "Not told - no manager on the property in Propoly.";
    } else if (!armed) {
      note = "Not told - agent emails are off in Admin, Switches.";
    } else {
      try {
        const { text, html } = bodyFor(e, origin);
        await sendEmail({ to: e.agentEmail, subject: subjectFor(e), text, html });
        to = e.agentEmail;
        at = new Date();
        note = `Told ${e.agentName ?? e.agentEmail}.`;
        told += 1;
      } catch (err) {
        note = `Could not tell ${e.agentEmail}: ${err instanceof Error ? err.message : "send failed"}`;
      }
    }
    await q(`UPDATE os_deal_events SET told_to = $2, told_at = $3, told_note = $4 WHERE id = $1`, [e.id, to, at, note]);
    e.toldTo = to;
    e.toldAt = at ? at.toISOString() : null;
    e.toldNote = note;
  }
  return told;
}

/* ───────────────────────────── reading ─────────────────────────────────── */

export async function listDealEvents(opts: { agentEmail?: string | null; limit?: number } = {}): Promise<DealEvent[]> {
  if (!hasDb()) return [];
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 300);
  const rows = opts.agentEmail
    ? await q<EventRow>(`SELECT * FROM os_deal_events WHERE LOWER(agent_email) = LOWER($1) ORDER BY at DESC, id DESC LIMIT $2`, [
        opts.agentEmail,
        limit,
      ])
    : await q<EventRow>(`SELECT * FROM os_deal_events ORDER BY at DESC, id DESC LIMIT $1`, [limit]);
  return rows.map(rowToEvent);
}

export async function eventsForDeal(dealId: string): Promise<DealEvent[]> {
  if (!hasDb()) return [];
  const rows = await q<EventRow>(`SELECT * FROM os_deal_events WHERE deal_id = $1 ORDER BY at DESC, id DESC`, [dealId]);
  return rows.map(rowToEvent);
}

/** For the status line: when the watcher last looked, and how many it holds. */
export async function watchStatus(): Promise<{ lastSeenAt: string | null; deals: number; byStatus: Record<string, number> }> {
  if (!hasDb()) return { lastSeenAt: null, deals: 0, byStatus: {} };
  const rows = await q<{ status_key: string; n: string | number; last: string | Date | null }>(
    `SELECT status_key, COUNT(*) AS n, MAX(seen_at) AS last FROM os_deal_states GROUP BY status_key`
  );
  const byStatus: Record<string, number> = {};
  let deals = 0;
  let last: number = 0;
  for (const r of rows) {
    byStatus[STATUS_WORDS[r.status_key] ?? r.status_key] = Number(r.n);
    deals += Number(r.n);
    if (r.last) last = Math.max(last, new Date(r.last).getTime());
  }
  return { lastSeenAt: last ? new Date(last).toISOString() : null, deals, byStatus };
}
