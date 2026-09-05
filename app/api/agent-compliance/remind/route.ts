import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { plannedReminders, recordReminded } from "@/lib/agent-compliance";
import { renderAgentComplianceChase } from "@/lib/email/tle-emails";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";

/**
 * The agent's own 30/14/7, and Michael's list.
 *
 * GET  → a dry run: who would be written to and why. Anyone with the
 *        capability can look.
 * POST → the real run, from the daily cron (x-cron-key) or that person.
 *        Behind the "Agent compliance reminders" switch: off, it reports
 *        and sends nothing, and the same people come up tomorrow.
 *
 * Each agent gets ONE email listing everything short, and each band is
 * recorded so it goes once. Everyone with the compliance role gets the
 * roll-up: who is short, on what.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function michaels(): Promise<{ email: string; name: string }[]> {
  return q<{ email: string; name: string }>(`SELECT email, name FROM os_users WHERE role = 'compliance' AND email <> ''`).catch(
    () => []
  );
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:agent-compliance"))) {
    return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  }
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", planned: [] });
  const planned = await plannedReminders();
  return NextResponse.json({ ok: true, dry: true, armed: await switchOn("agent_compliance_chases"), planned, rollUpTo: await michaels() });
}

export async function POST(req: NextRequest) {
  const byPerson = await requireCapability(req, "see:agent-compliance");
  if (!byPerson && !cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Not authorised." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, ran: false, reason: "No database on this environment." });

  const armed = await switchOn("agent_compliance_chases");
  const planned = await plannedReminders();
  if (!armed) {
    return NextResponse.json({ ok: true, ran: true, sent: false, reason: "Agent compliance reminders are switched off.", planned: planned.length });
  }

  const results: { to: string; ok: boolean; detail?: string }[] = [];
  for (const r of planned) {
    const mail = renderAgentComplianceChase({ firstName: (r.name || r.email).split(" ")[0], lines: r.lines });
    try {
      await sendEmail({ to: r.email, subject: mail.subject, html: mail.html });
      await recordReminded(r);
      results.push({ to: r.email, ok: true });
    } catch (e) {
      results.push({ to: r.email, ok: false, detail: e instanceof Error ? e.message : "send failed" });
    }
  }

  /* The roll-up: only when somebody was short today, and only to the
     compliance role. An empty daily email teaches people to ignore it. */
  const roll = await michaels();
  if (planned.length && roll.length) {
    const lines = planned.map((r) => `${r.name || r.email}: ${r.lines.join("; ")}`);
    const mail = renderAgentComplianceChase({ firstName: "there", lines });
    for (const m of roll) {
      try {
        await sendEmail({ to: m.email, subject: `${planned.length} agent${planned.length === 1 ? "" : "s"} short on their own compliance`, html: mail.html });
        results.push({ to: m.email, ok: true, detail: "roll-up" });
      } catch (e) {
        results.push({ to: m.email, ok: false, detail: e instanceof Error ? e.message : "send failed" });
      }
    }
  }
  return NextResponse.json({ ok: true, ran: true, sent: results.some((x) => x.ok), results });
}
