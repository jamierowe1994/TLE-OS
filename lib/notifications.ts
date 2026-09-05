import "server-only";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";
import { listDealEvents } from "@/lib/business/deal-watch";
import { eventSentence, eventTone, hrefFor, type DealEventKind } from "@/lib/business/deal-events";
import type { Notice } from "@/lib/notices";

/**
 * What the bell shows, gathered from the tables where things already happen.
 *
 * ── No notifications table ────────────────────────────────────────────────
 *
 * Every event worth telling somebody about is already a row somewhere: the
 * watcher writes deal moves and money, the PLC route writes decisions into
 * the same table, the scheduler writes the steps that need a person, the
 * handover writes its runs, the chaser writes what it sent. A second table
 * of "notifications" would be a copy that could disagree with its source.
 * So this reads the sources, scoped to the person, and sorts by time.
 *
 * ── Who sees what ─────────────────────────────────────────────────────────
 *
 *   deal moves, money, PLC   the deal's agent (matched on email, as the
 *                            feed does), or the whole book for anyone with
 *                            see:pretenancy or see:everything
 *   campaign steps for a     see:marketing or an owner - a call step is a job
 *   person                   for the office, not for a lead's agent
 *   handover runs, chases    owners and pre-tenancy, who own those processes
 *
 * ── Read state ────────────────────────────────────────────────────────────
 *
 * One timestamp per person in os_user_prefs ("notifications.seen_at").
 * Unread = newer than that. Marking read is one write, and nothing about a
 * notice itself changes.
 */

const MONEY: DealEventKind[] = ["holding_in", "holding_reconciled", "deposit_in", "deposit_reconciled", "deposit_registered", "rent_in"];
const PLC: DealEventKind[] = ["plc_submitted", "plc_decided", "plc_opened", "move_in_ready"];

function kindOf(e: DealEventKind): Notice["kind"] {
  if (MONEY.includes(e)) return "money";
  if (PLC.includes(e)) return "plc";
  return "deal";
}

export async function noticesFor(me: OsUser, limit = 40): Promise<Notice[]> {
  if (!hasDb()) return [];
  const whole = can(me.role, "see:pretenancy") || can(me.role, "see:everything");
  const office = can(me.role, "see:marketing") || me.role === "owner";
  const ops = me.role === "owner" || can(me.role, "see:pretenancy");

  const [deals, steps, handovers, chases] = await Promise.all([
    listDealEvents({ agentEmail: whole ? null : me.email, limit }).catch(() => []),
    office
      ? q<{ id: string; campaign_id: string; subject: string; detail: string; at: Date; name: string }>(
          `SELECT s.id, s.campaign_id, s.subject, s.detail, s.at, e.name
             FROM os_campaign_sends s
             LEFT JOIN os_campaign_enrolments e ON e.id = s.enrolment_id
            WHERE s.outcome = 'for_human'
            ORDER BY s.at DESC LIMIT $1`,
          [limit]
        ).catch(() => [])
      : [],
    ops
      ? q<{ id: string; application_id: string; status: string; mode: string; finished_at: Date; error: string | null }>(
          `SELECT id, application_id, status, mode, finished_at, error
             FROM os_handovers WHERE finished_at IS NOT NULL
            ORDER BY finished_at DESC LIMIT $1`,
          [limit]
        ).catch(() => [])
      : [],
    ops
      ? q<{ chase_key: string; property_id: string; cert: string; band: number; sent_to: string; sent_at: Date }>(
          `SELECT chase_key, property_id, cert, band, sent_to, sent_at
             FROM os_compliance_chases_sent ORDER BY sent_at DESC LIMIT $1`,
          [limit]
        ).catch(() => [])
      : [],
  ]);

  const out: Notice[] = [];

  for (const e of deals) {
    out.push({
      id: `deal:${e.id}`,
      kind: kindOf(e.event),
      at: e.at,
      title: e.property || "A deal",
      body: eventSentence(e),
      href: hrefFor(e),
      tone: eventTone(e.event),
    });
  }
  for (const s of steps) {
    out.push({
      id: `campaign:${s.id}`,
      kind: "campaign",
      at: new Date(s.at).toISOString(),
      title: s.name || "A landlord on a campaign",
      body: `Needs a person: ${s.subject}${s.detail ? ` - ${s.detail}` : ""}`,
      href: "/marketing",
      tone: "warn",
    });
  }
  for (const h of handovers) {
    out.push({
      id: `handover:${h.id}`,
      kind: "handover",
      at: new Date(h.finished_at).toISOString(),
      title: `Handover ${h.status}${h.mode === "shadow" ? " (rehearsal)" : ""}`,
      body: h.error ? h.error : `Application ${h.application_id}${h.status === "ok" ? " went through every step." : "."}`,
      href: `/applications?open=${encodeURIComponent(h.application_id)}`,
      tone: h.status === "ok" ? "ok" : "warn",
    });
  }
  for (const c of chases) {
    out.push({
      id: `chase:${c.chase_key}`,
      kind: "chase",
      at: new Date(c.sent_at).toISOString(),
      title: `${c.cert} chase sent`,
      body: `${c.band} days out${c.sent_to ? `, to ${c.sent_to}` : ""}.`,
      href: "/compliance",
      tone: "none",
    });
  }

  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out.slice(0, limit);
}

const SEEN_KEY = "notifications.seen_at";

export async function seenAt(userId: string): Promise<string | null> {
  if (!hasDb()) return null;
  const rows = await q<{ value: unknown }>(`SELECT value FROM os_user_prefs WHERE user_id = $1 AND key = $2`, [userId, SEEN_KEY]).catch(
    () => []
  );
  const v = rows[0]?.value;
  return typeof v === "string" ? v : null;
}

export async function markSeen(userId: string, at = new Date()): Promise<void> {
  if (!hasDb()) return;
  await q(
    `INSERT INTO os_user_prefs (user_id, key, value) VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
    [userId, SEEN_KEY, JSON.stringify(at.toISOString())]
  );
}
