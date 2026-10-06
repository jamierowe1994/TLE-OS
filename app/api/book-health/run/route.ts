import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { bookHealth, HEALTH_LABEL, lastReport, saveReport, type HealthKind } from "@/lib/book-health";
import { bookHealthEmail } from "@/lib/email/agent-emails";
import { sendEmail } from "@/lib/resend";
import { switchOn } from "@/lib/switches";

/**
 * The weekly book health check (James, 6 Oct 2026).
 *
 * GET  → the last saved report, for the Admin page. `?fresh=1` runs the check
 *        now (about a minute and a half) and saves it, without emailing.
 * POST → the Monday run. Cron key only. Runs, saves, and emails the owners if
 *        the "Weekly book health email" switch is on.
 *
 * Reads REX, REX PM's list and the certificate store. Writes only its own
 * report. Nothing in REX or the OS's records is ever changed by it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const ORDER: HealthKind[] = ["duplicate", "unlinked", "shared", "cert-dates", "no-rent"];

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Owners only: this is James's and Howard's list, not the office's. */
async function recipients(): Promise<string[]> {
  if (!hasDb()) return [];
  const rows = await q<{ email: string }>(`SELECT email FROM os_users WHERE role = 'owner' AND email <> ''`).catch(() => []);
  return rows.map((r) => r.email);
}

export async function GET(req: NextRequest) {
  if (!cronAuthorised(req) && !(await requireCapability(req, "see:reports"))) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const before = await lastReport();
  if (req.nextUrl.searchParams.get("fresh") === "1") {
    const report = await bookHealth();
    await saveReport(report);
    return NextResponse.json({ ok: true, report, previous: before?.at ?? null, labels: HEALTH_LABEL, order: ORDER });
  }
  return NextResponse.json({ ok: true, report: before, labels: HEALTH_LABEL, order: ORDER });
}

export async function POST(req: NextRequest) {
  if (!cronAuthorised(req)) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const before = await lastReport();
  const report = await bookHealth();
  await saveReport(report);
  const known = new Set((before?.findings ?? []).map((f) => f.key));
  /* The first run has no last week: nothing is "new", rather than everything. */
  const isNew = (key: string) => Boolean(before) && !known.has(key);

  if (!(await switchOn("book_health"))) {
    return NextResponse.json({ ok: true, sent: false, reason: "The weekly book health email is switched off.", findings: report.findings.length });
  }
  const to = await recipients();
  const mail = bookHealthEmail({ findings: report.findings, isNew, labels: HEALTH_LABEL, order: ORDER });
  /* A check that could not run is said in the mail, never read as all clear. */
  const text = report.failed.length ? `${mail.text}\n\nNot checked this week:\n${report.failed.map((f) => `- ${f}`).join("\n")}` : mail.text;
  const failures: string[] = [];
  for (const address of to) {
    try {
      await sendEmail({ to: address, subject: mail.subject, html: mail.html, text });
    } catch (e) {
      failures.push(`${address}: ${e instanceof Error ? e.message : "send failed"}`);
    }
  }
  return NextResponse.json({ ok: true, sent: failures.length < to.length, told: to.length - failures.length, findings: report.findings.length, failed: report.failed, failures });
}
