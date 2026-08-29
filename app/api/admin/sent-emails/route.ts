import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";

/**
 * What actually went out, and what it looked like.
 *
 *   GET /api/admin/sent-emails        → the list, no bodies
 *   GET /api/admin/sent-emails?id=…   → one email's HTML
 *
 * Two shapes on purpose. Each stored email is several kilobytes of HTML, so
 * returning every body to draw a list of subjects would be most of a megabyte
 * nobody reads. The body comes back only when somebody opens one.
 *
 * Gated on see:reports rather than owner: this is the same question as "what
 * did the pilot report", and the copies carry no live links — the token is
 * redacted before the row is written. See archive() in lib/resend.ts.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:reports"))) {
    return new NextResponse(null, { status: 404 });
  }
  if (!hasDb()) return NextResponse.json({ emails: [] });

  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const rows = await q<{ id: string; to_email: string; subject: string; html: string; sent_at: Date }>(
      `SELECT id, to_email, subject, html, sent_at FROM os_sent_emails WHERE id = $1`,
      [id]
    ).catch(() => []);
    const r = rows[0];
    if (!r) return NextResponse.json({ error: "No such email." }, { status: 404 });
    return NextResponse.json({
      id: r.id,
      to: r.to_email,
      subject: r.subject,
      html: r.html,
      sentAt: new Date(r.sent_at).toISOString(),
    });
  }

  const rows = await q<{ id: string; to_email: string; subject: string; sent_at: Date }>(
    `SELECT id, to_email, subject, sent_at FROM os_sent_emails
     ORDER BY sent_at DESC LIMIT 200`
  ).catch(() => []);

  return NextResponse.json({
    emails: rows.map((r) => ({
      id: r.id,
      to: r.to_email,
      subject: r.subject,
      sentAt: new Date(r.sent_at).toISOString(),
    })),
  });
}
