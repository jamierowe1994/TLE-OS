import { NextRequest, NextResponse } from "next/server";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { timingSafeEqual } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { SESSION_COOKIE, uid, verifySessionToken } from "@/lib/auth";
import { CAMPAIGNS, type Campaign } from "@/lib/campaigns";
import { dispositionOf, nextDue, type StepPlan } from "@/lib/scheduler";
import { renderStep, type StepCopy } from "@/lib/campaign-mail";
import { rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { sendMerge } from "@/lib/rex-mailmerge";
import { switchOn } from "@/lib/switches";

/**
 * The scheduler — the thing that makes a campaign a campaign rather than a list.
 *
 * GET is a DRY RUN and writes nothing: it answers "what is due right now", so
 * the Marketing screen can show the queue and anyone can look before the
 * machine is trusted with it. POST is the real one, and is what a cron calls.
 *
 * Sending is OFF unless CAMPAIGN_SENDING=on, on top of REX's own write lock.
 * Two locks rather than one because these emails go to real landlords with no
 * agent in the loop: the write lock protects REX from us, and this one
 * protects landlords from a scheduler that has never run in anger. With it
 * off, a due email is HELD — reported, not sent, not skipped, and it comes up
 * again on the next run.
 *
 * The cron (Railway, daily):
 *   curl -X POST -H "x-cron-key: $CRON_SECRET" https://<host>/api/campaigns/run
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Every campaign, built-in and written here, by id.
 *
 * Loaded per run rather than held in a module constant: a campaign marketing
 * created this morning has to be schedulable this afternoon, and a constant
 * built at import time would only see it after the next deploy.
 */
async function campaignsById(): Promise<Map<string, Campaign>> {
  const m = new Map<string, Campaign>(CAMPAIGNS.map((c) => [c.id, c]));
  const rows = await q<{
    id: string;
    name: string;
    audience: string;
    reasons: string[];
    aim: string;
    status: string;
    steps: Campaign["steps"];
  }>(`SELECT id, name, audience, reasons, aim, status, steps FROM os_campaigns`).catch(() => []);
  for (const r of rows) {
    m.set(r.id, {
      id: r.id,
      name: r.name,
      audience: r.audience === "lost" ? "lost" : "nurture",
      reasons: Array.isArray(r.reasons) ? r.reasons : [],
      aim: r.aim,
      status: r.status === "live" ? "live" : "draft",
      steps: Array.isArray(r.steps) ? r.steps : [],
    });
  }
  return m;
}

type Row = {
  id: string;
  campaign_id: string;
  record_id: string;
  name: string;
  email: string;
  last_step_sent: number;
  enrolled_at: string;
};

type Verdict = {
  enrolmentId: string;
  campaignId: string;
  who: string;
  step: number;
  day: number;
  channel: string;
  subject: string;
  /** sent | held | for_human | unwritten | failed | no_email */
  outcome: string;
  detail?: string;
  overdue?: number;
  overtaken?: number;
};

/* Armed from Admin -> Switches now rather than CAMPAIGN_SENDING. Async
   because the answer lives in the database; until somebody touches the toggle
   the old variable still decides, so nothing changed state on deploy.

   Read ONCE per run and passed down, not called six times: a switch that could
   answer differently halfway through a run is a run that half sent. */
async function sendingOn(): Promise<boolean> {
  return switchOn("campaign_sending");
}

/** A cron key, or a signed-in person. Constant-time so the key can't be
 *  guessed a character at a time. */
function authorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  return Boolean(verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value));
}

/**
 * The copy written in the editor, keyed campaign:step. Loaded once per run
 * rather than per enrolment — fifty landlords on one campaign is one query,
 * not fifty.
 */
async function storedCopy(): Promise<Map<string, StepCopy>> {
  const rows = await q<{ campaign_id: string; step_index: number; subject: string; blocks: Record<string, unknown>[] }>(
    `SELECT campaign_id, step_index, subject, blocks FROM os_email_templates`
  );
  const m = new Map<string, StepCopy>();
  for (const r of rows) {
    m.set(`${r.campaign_id}:${r.step_index}`, {
      subject: r.subject,
      blocks: Array.isArray(r.blocks) ? r.blocks : [],
    });
  }
  return m;
}

async function activeRows(): Promise<Row[]> {
  return q<Row>(
    `SELECT id, campaign_id, record_id, name, email, last_step_sent, enrolled_at
       FROM os_campaign_enrolments
      WHERE status = 'active'
      ORDER BY enrolled_at`
  );
}

/** What is due for one enrolment, before anything is done about it. */
function planFor(
  row: Row,
  now: Date,
  byId: Map<string, Campaign>
): { campaign: Campaign; plan: StepPlan } | null {
  const campaign = byId.get(row.campaign_id);
  if (!campaign) return null; // A campaign that was retired. Nothing to fire.
  const plan = nextDue(campaign, row.enrolled_at, row.last_step_sent, now);
  return plan ? { campaign, plan } : null;
}

/* ─────────────────────────── the dry run ─────────────────────────── */

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  if (!hasDb()) {
    return NextResponse.json({ ran: false, sending: await sendingOn(), due: [], reason: "No database on this environment." });
  }
  const now = new Date();
  /* Read ONCE per run. A switch consulted six times could answer differently
     halfway through, and a run that half sent is worse than one that did not. */
  const armed = await sendingOn();
  const [rows, copy, byId] = await Promise.all([activeRows(), storedCopy(), campaignsById()]);
  const due: Verdict[] = [];

  for (const row of rows) {
    const found = planFor(row, now, byId);
    if (!found) continue;
    const { campaign, plan } = found;
    const disp = dispositionOf(plan.step, copy.has(`${campaign.id}:${plan.index}`));
    due.push({
      enrolmentId: row.id,
      campaignId: campaign.id,
      who: row.name || row.record_id,
      step: plan.index + 1,
      day: plan.step.day,
      channel: plan.step.channel,
      subject: plan.step.subject,
      overdue: plan.overdue,
      overtaken: plan.overtaken.length || undefined,
      outcome:
        disp === "human"
          ? "for_human"
          : disp === "unwritten"
            ? "unwritten"
            : !row.email
              ? "no_email"
              : armed
                ? "sent"
                : "held",
    });
  }

  return NextResponse.json({ ran: false, dry: true, sending: armed, checked: rows.length, due });
}

/* ─────────────────────────── the real run ─────────────────────────── */

export async function POST(req: NextRequest) {
  /* READ-ONLY WHILE VIEWING AS. A write made wearing somebody else's face
     would be recorded against their name in REX — see lib/view-as. */
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    }
    throw e;
  }
  if (!authorised(req)) return NextResponse.json({ error: "Not authorised." }, { status: 401 });
  if (!hasDb()) {
    return NextResponse.json({ ran: false, reason: "No database on this environment." });
  }

  const now = new Date();
  /* Read ONCE per run. A switch consulted six times could answer differently
     halfway through, and a run that half sent is worse than one that did not. */
  const armed = await sendingOn();
  const [rows, copy, byId] = await Promise.all([activeRows(), storedCopy(), campaignsById()]);
  const done: Verdict[] = [];

  for (const row of rows) {
    const found = planFor(row, now, byId);
    if (!found) continue;
    const { campaign, plan } = found;
    const base = {
      enrolmentId: row.id,
      campaignId: campaign.id,
      who: row.name || row.record_id,
      step: plan.index + 1,
      day: plan.step.day,
      channel: plan.step.channel,
      subject: plan.step.subject,
      overdue: plan.overdue,
    };

    const written = copy.get(`${campaign.id}:${plan.index}`) ?? null;
    const disp = dispositionOf(plan.step, Boolean(written));

    // Held: reported and left where it is. Nothing is logged and nothing
    // advances, so it comes up again next run — which is the whole point of
    // holding rather than skipping.
    if (disp === "unwritten") {
      done.push({ ...base, outcome: "unwritten", detail: "Marketing hasn't written this one yet." });
      continue;
    }
    if (disp === "send" && !armed) {
      done.push({ ...base, outcome: "held", detail: "CAMPAIGN_SENDING is off." });
      continue;
    }
    if (disp === "send" && !row.email) {
      done.push({ ...base, outcome: "no_email", detail: "No email address on the enrolment." });
      continue;
    }

    // The stale steps this one has overtaken. Logged first: if the send below
    // fails, they are still genuinely past and must never fire later.
    for (const o of plan.overtaken) {
      await logStep(row, campaign.id, o.index, o.step.day, o.step.channel, o.step.subject, "overtaken", `Overtaken by day ${plan.step.day}.`);
    }

    if (disp === "human") {
      await logStep(row, campaign.id, plan.index, plan.step.day, plan.step.channel, plan.step.subject, "for_human", plan.step.gist);
      await advance(row.id, plan.index, false);
      done.push({ ...base, outcome: "for_human", overtaken: plan.overtaken.length || undefined });
      continue;
    }

    // A real send.
    const mail = renderStep(plan.step, { name: row.name, email: row.email, address: "" }, written);
    if (!mail) {
      done.push({ ...base, outcome: "unwritten", detail: "The step rendered to nothing." });
      continue;
    }

    // Claim the step BEFORE sending. The unique index means a second run
    // can't claim it, so the worst case is a send that fails after claiming —
    // one missed email — rather than a landlord getting the same email twice.
    const claimed = await logStep(row, campaign.id, plan.index, plan.step.day, "email", mail.subject, "sent", "");
    if (!claimed) {
      done.push({ ...base, outcome: "skipped", detail: "Already accounted for." });
      continue;
    }

    try {
      if (!rexConfigured()) throw new Error("REX isn't connected on this environment.");
      // By record, so the send lands on the landlord's REX timeline and the
      // next person to open them can see it. record_id is the REX contact; no
      // record means no timeline, and an email nobody can later find.
      if (!/^\d+$/.test(row.record_id)) {
        throw new Error("No REX contact record for this enrolment, so the send would land nowhere.");
      }
      const sent = await sendMerge(
        { contactId: row.record_id },
        { subject: mail.subject, body: mail.html }
      );
      if (!sent.ok) throw new Error(sent.error);
      await advance(row.id, plan.index, true);
      done.push({ ...base, outcome: "sent", overtaken: plan.overtaken.length || undefined });
    } catch (e) {
      const detail =
        e instanceof RexWriteBlocked
          ? 'REX writes are locked — set REX_ALLOW_WRITES="MailMerge/queueMergeUsingObjects".'
          : e instanceof Error
            ? e.message
            : "Send failed.";
      // Turn the claim into a failure so it can be retried, and record why.
      await q(`UPDATE os_campaign_sends SET outcome = 'failed', detail = $2 WHERE id = $1`, [claimed, detail]);
      done.push({ ...base, outcome: "failed", detail });
    }
  }

  return NextResponse.json({
    ran: true,
    sending: armed,
    checked: rows.length,
    acted: done.length,
    results: done,
  });
}

/* ─────────────────────────── writes ─────────────────────────── */

/** Returns the new row's id, or "" if the step was already accounted for. */
async function logStep(
  row: Row,
  campaignId: string,
  index: number,
  day: number,
  channel: string,
  subject: string,
  outcome: string,
  detail: string
): Promise<string> {
  const id = uid();
  const out = await q<{ id: string }>(
    `INSERT INTO os_campaign_sends
       (id, enrolment_id, campaign_id, step_index, step_day, channel, subject, outcome, detail)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT DO NOTHING
     RETURNING id`,
    [id, row.id, campaignId, index, day, channel, subject, outcome, detail]
  );
  return out[0]?.id ?? "";
}

/** Move the enrolment on, but only from where we thought it was — so two runs
 *  racing can't push it two steps. */
async function advance(enrolmentId: string, index: number, sent: boolean) {
  await q(
    `UPDATE os_campaign_enrolments
        SET last_step_sent = $2 ${sent ? ", last_sent_at = NOW()" : ""}
      WHERE id = $1 AND last_step_sent < $2`,
    [enrolmentId, index]
  );
}
