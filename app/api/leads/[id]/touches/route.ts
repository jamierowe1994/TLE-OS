import { NextRequest, NextResponse } from "next/server";
import { leadAccess } from "@/lib/lead-access";
import { hasDb, q } from "@/lib/db";
import { createTask } from "@/lib/tasks";
import { londonParts, londonTime } from "@/lib/london-time";
import { addTouch, setRexNoteId, spineFor } from "@/lib/lead-touches";
import { noteToRex, type RexNoteResult } from "@/lib/rex-notes";
import { campaignOn, enrolLead, stopLeadCampaigns } from "@/lib/campaign-store";
import {
  ATTEMPT_KINDS,
  NURTURE_REASONS,
  TENANT_NURTURE_REASONS,
  LOST_REASONS,
  TENANT_LOST_REASONS,
  OUTCOMES,
  type TouchKind,
  type TouchOutcome,
} from "@/lib/lead-spine";

/**
 * GET  /api/leads/[id]/touches → the log, the spine folded from it, and the
 *      campaign the lead is on (if any).
 * POST /api/leads/[id]/touches → log one thing: a call, a text, a visit, an
 *      email, a note, or the lead going to nurture / coming back.
 *
 * Nurture is where the campaigns join on. Going to nurture puts the lead on
 * the live campaign written for the reason (lib/campaign-store picks, and
 * balances between two if marketing is testing). A reply, a call they
 * answered, or Back on the spine takes them off it, with the reason kept -
 * that is the number the Marketing screen reads as "replied".
 *
 * Anyone signed in can log against any lead - a colleague covering a call
 * writes it down under their own name, which is the point of a log.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS: TouchKind[] = ["call", "text", "whatsapp", "email", "visit", "note", "nurture", "rejoin", "lost"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { denied } = await leadAccess(req, id);
  if (denied) return denied;
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, touches: [], spine: null, campaign: null });
  const [{ touches, spine }, campaign] = await Promise.all([spineFor(id), campaignOn(id)]);
  return NextResponse.json({ ok: true, stored: true, touches, spine, campaign });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  /* Only a lead on your own board (Rig P-006): see lib/lead-access. */
  const { who: access, denied } = await leadAccess(req, id);
  if (denied) return denied;
  const { actor, subject } = access;
  if (!hasDb()) {
    return NextResponse.json({ ok: false, error: "No database on this environment, so nothing can be logged." }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    outcome?: string | null;
    body?: string;
    /** Nurture only: why, from NURTURE_REASONS. */
    reason?: string;
    /** Who the lead is, for the campaign enrolment. The drawer holds this. */
    lead?: { name?: string; email?: string; contactId?: string | null };
    /** A tenant's nurture is recorded but never enrols: every campaign is a landlord's. */
    side?: "tenant" | "landlord";
    /** Nurture only: the day to get back in touch, YYYY-MM-DD (Howard, 1 Oct 2026). */
    followUpOn?: string | null;
  };
  const tenant = body.side === "tenant";
  const kind = body.kind as TouchKind;
  if (!KINDS.includes(kind)) {
    return NextResponse.json({ ok: false, error: "Say what it was: a call, a text, a visit, an email or a note." }, { status: 400 });
  }
  let outcome: TouchOutcome | null = null;
  if (ATTEMPT_KINDS.includes(kind) || kind === "email") {
    const o = OUTCOMES.find((x) => x.id === body.outcome && x.for.includes(kind));
    if (!o) {
      return NextResponse.json({ ok: false, error: "Say how it went." }, { status: 400 });
    }
    outcome = o.id;
  }
  let text = (body.body ?? "").toString().slice(0, 2000);
  if (kind === "note" && !text.trim()) {
    return NextResponse.json({ ok: false, error: "An empty note is not a note." }, { status: 400 });
  }
  let reason: string | null = null;
  if (kind === "nurture") {
    reason = (tenant ? TENANT_NURTURE_REASONS : NURTURE_REASONS).includes(body.reason ?? "") ? (body.reason as string) : null;
    if (!reason) return NextResponse.json({ ok: false, error: "Say why they are going to nurture." }, { status: 400 });
    /* The row reads "Not answering - try again after the 20th": the reason
       first, so the spine can show it, then whatever was added. */
    text = text.trim() ? `${reason} - ${text.trim()}` : reason;
  }
  /* BANKED FOR LATER (Howard, 1 Oct 2026: "bank leads for follow up, by
     entering a date for when they will get back in touch ... and then
     resurfacing them on that date. Landlord leads can take months.")
     A day after today and within two years; 9am London that day. */
  let followUpAt: Date | null = null;
  if (kind === "nurture" && body.followUpOn) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(body.followUpOn));
    const today = londonParts(new Date());
    const todayKey = Date.UTC(today.year, today.month - 1, today.day);
    const dayKey = m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : NaN;
    if (!m || !(dayKey > todayKey) || dayKey - todayKey > 731 * 86400000) {
      return NextResponse.json({ ok: false, error: "Pick a day from tomorrow onwards, within two years." }, { status: 400 });
    }
    followUpAt = londonTime(+m[1], +m[2], +m[3], 9);
    const said = followUpAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
    text = `${text} - get back in touch on ${said}`;
  }
  if (kind === "lost") {
    reason = (tenant ? TENANT_LOST_REASONS : LOST_REASONS).includes(body.reason ?? "") ? (body.reason as string) : null;
    if (!reason) return NextResponse.json({ ok: false, error: "Say why the lead is lost." }, { status: 400 });
    text = text.trim() ? `${reason} - ${text.trim()}` : reason;
  }

  const who = subject ?? actor;
  const touch = await addTouch({
    leadId: id,
    kind,
    outcome,
    body: text,
    byId: who.id,
    byName: who.name || who.email,
  });

  /* ── The follow-up, as a task with a due date ─────────────────────────────
     One open follow-up per lead: a new date replaces the old. Talking to
     them, a reply, bringing them back or losing them closes it; any other
     try closes one that has already come due. The board reads the open one
     (lib/lead-touches allSpines) to bank the lead and bring it back. */
  const closeFollowUps = (dueOnly: boolean) =>
    q(
      `UPDATE os_tasks SET done_at = NOW() WHERE lead_id = $1 AND kind = 'follow-up' AND done_at IS NULL${dueOnly ? " AND due_at <= NOW()" : ""}`,
      [id]
    ).catch(() => null);
  if (followUpAt) {
    await closeFollowUps(false);
    const name = (body.lead?.name ?? "").toString().trim() || "this lead";
    await createTask({
      userId: who.id,
      title: `Get back in touch with ${name}`,
      detail: text,
      dueAt: followUpAt.toISOString(),
      leadId: id,
      kind: "follow-up",
      createdBy: who.name || who.email,
    });
  } else if (kind === "lost" || kind === "rejoin" || outcome === "spoke" || outcome === "replied") {
    await closeFollowUps(false);
  } else if (ATTEMPT_KINDS.includes(kind) || kind === "email") {
    await closeFollowUps(true);
  }

  /* ── A note goes to REX as well (Howard, 24 Sep 2026) ──────────────────────
     Written by the person actually signed in. Viewing as somebody else, it
     stays in the OS: REX would put the note under the wrong name. */
  let rex: RexNoteResult | null = null;
  if (kind === "note") {
    rex = subject && subject.id !== actor.id
      ? { ok: false, why: "Not sent to REX while you are viewing as somebody else." }
      : await noteToRex({
          leadId: id,
          contactId: body.lead?.contactId ? String(body.lead.contactId) : null,
          text,
          byUserId: actor.id,
        });
    if (rex.ok) await setRexNoteId(touch.id, rex.id);
  }

  /* ── The campaigns ─────────────────────────────────────────────────────── */
  let enrolled: Awaited<ReturnType<typeof enrolLead>> = null;
  let stopped = 0;
  /* Never a tenant: "Gone quiet - never spoken to" is written to a landlord
     about letting their property (Howard's tenant nurture, 24 Sep 2026). */
  if (kind === "nurture" && reason && !tenant) {
    enrolled = await enrolLead(
      {
        leadId: id,
        name: (body.lead?.name ?? "").toString().slice(0, 120),
        email: (body.lead?.email ?? "").toString().slice(0, 200),
        rexContactId: body.lead?.contactId ? String(body.lead.contactId) : null,
      },
      reason,
      "nurture",
      "lead-spine"
    ).catch(() => null);
  } else if (kind === "lost") {
    /* A lost lead gets no more nurture emails. */
    stopped = await stopLeadCampaigns(id, "marked as lost").catch(() => 0);
  } else if (kind === "rejoin" || outcome === "spoke" || outcome === "replied") {
    stopped = await stopLeadCampaigns(id, kind === "rejoin" ? "back on the spine" : "replied").catch(() => 0);
  }

  const [{ touches, spine }, campaign] = await Promise.all([spineFor(id), campaignOn(id)]);
  return NextResponse.json({
    ok: true,
    touch,
    touches,
    spine,
    campaign,
    enrolled: enrolled
      ? { id: enrolled.campaign.id, name: enrolled.campaign.name, already: enrolled.already, testedAgainst: enrolled.alternatives.map((c) => c.name) }
      : null,
    /* Said out loud when nurture found nothing to put them on, so the agent
       is not left thinking a campaign is running. */
    noCampaign: kind === "nurture" && !enrolled,
    stopped,
    /* A note only: whether it reached REX, and in words if it did not. */
    rex: rex ? (rex.ok ? { ok: true, id: rex.id } : { ok: false, why: rex.why }) : null,
  });
}
