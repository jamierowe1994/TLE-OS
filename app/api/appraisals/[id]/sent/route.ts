import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { getAppraisal } from "@/lib/appraisal-store";

/**
 * GET → everything we have emailed the landlord about this appraisal, newest
 * first. GET ?email=<id> → one of them, as it went (James, 17 Sep 2026: "we
 * should only ever show the most recent thing on the appointment ... View
 * more sent items, and then they can see everything that's been sent").
 *
 * Read from os_sent_emails, the copy of every email that leaves the OS. Only
 * emails to the landlord's address, since the appraisal was made, that name
 * the property - so a tester whose own inbox stands in for a landlord sees
 * this appraisal's emails and not every test they have ever run. Agent-only
 * emails (the video reminder) are left out even when the address is the same.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const AGENT_ONLY = /^(\[Test\] )?(Record a quick video|Viewing booked:|Fix ready|Pre-tenancy:)/i;

function labelOf(subject: string): string {
  if (/^Moved - /i.test(subject)) return "New time sent";
  if (/^Confirmed - your market appraisal/i.test(subject)) return "Confirmation sent";
  if (/^Before your valuation/i.test(subject)) return "Pre-appraisal deck sent";
  if (/contract|sign/i.test(subject)) return "Contract sent";
  if (/presentation|post-appraisal|valuation/i.test(subject)) return "Presentation sent";
  return "Email sent";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, items: [] });
  const { id } = await params;
  const ma = await getAppraisal(id).catch(() => null);
  if (!ma) return NextResponse.json({ ok: false, error: "That appraisal isn't here any more." }, { status: 404 });
  const to = (ma.landlordEmail ?? "").trim().toLowerCase();
  if (!to) return NextResponse.json({ ok: true, items: [] });
  /* The street line, as the emails print it. */
  const street = (ma.address.split(",")[0] ?? "").trim();
  const since = new Date(new Date(ma.createdAt).getTime() - 60 * 60 * 1000).toISOString();

  const one = req.nextUrl.searchParams.get("email");
  if (one) {
    const rows = await q<{ id: string; subject: string; html: string; sent_at: Date; to_email: string }>(
      `SELECT id, subject, html, sent_at, to_email FROM os_sent_emails WHERE id = $1 AND lower(to_email) = $2`,
      [one, to]
    ).catch(() => []);
    const r = rows[0];
    if (!r) return NextResponse.json({ ok: false, error: "That email isn't on file." }, { status: 404 });
    return NextResponse.json({ ok: true, email: { id: r.id, subject: r.subject, html: r.html, to: r.to_email, sentAt: new Date(r.sent_at).toISOString(), label: labelOf(r.subject) } });
  }

  const rows = await q<{ id: string; subject: string; sent_at: Date }>(
    `SELECT id, subject, sent_at FROM os_sent_emails
      WHERE lower(to_email) = $1 AND sent_at >= $2
        AND ($3 = '' OR subject ILIKE '%' || $3 || '%' OR html ILIKE '%' || $3 || '%')
      ORDER BY sent_at DESC LIMIT 50`,
    [to, since, street]
  ).catch(() => []);
  const items = rows
    .filter((r) => !AGENT_ONLY.test(r.subject))
    .map((r) => ({ id: r.id, subject: r.subject, sentAt: new Date(r.sent_at).toISOString(), label: labelOf(r.subject) }));
  return NextResponse.json({ ok: true, to, items });
}
