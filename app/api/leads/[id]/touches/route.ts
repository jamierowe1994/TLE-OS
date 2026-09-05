import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { addTouch, spineFor } from "@/lib/lead-touches";
import { campaignOn, enrolLead, stopLeadCampaigns } from "@/lib/campaign-store";
import {
  ATTEMPT_KINDS,
  NURTURE_REASONS,
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

const KINDS: TouchKind[] = ["call", "text", "email", "visit", "note", "nurture", "rejoin"];

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, touches: [], spine: null, campaign: null });
  const [{ touches, spine }, campaign] = await Promise.all([spineFor(id), campaignOn(id)]);
  return NextResponse.json({ ok: true, stored: true, touches, spine, campaign });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
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
  };
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
    reason = NURTURE_REASONS.includes(body.reason ?? "") ? (body.reason as string) : null;
    if (!reason) return NextResponse.json({ ok: false, error: "Say why they are going to nurture." }, { status: 400 });
    /* The row reads "Not answering - try again after the 20th": the reason
       first, so the spine can show it, then whatever was added. */
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

  /* ── The campaigns ─────────────────────────────────────────────────────── */
  let enrolled: Awaited<ReturnType<typeof enrolLead>> = null;
  let stopped = 0;
  if (kind === "nurture" && reason) {
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
  });
}
