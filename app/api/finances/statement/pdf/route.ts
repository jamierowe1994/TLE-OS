import { NextRequest, NextResponse } from "next/server";
import { statementFor } from "@/lib/commission-statement";
import { commissionStatementPdf } from "@/lib/commission-statement-pdf";

/**
 * The commission statement as a TLE PDF. Same question as the screen's
 * route, answered by the same code, so the PDF is what was on the screen.
 *
 * Refuses rather than drawing half a statement: if PayProp could not answer
 * for every agency, there is no file.
 *
 * Every download is in the read log: middleware writes each signed-in call
 * down with its query, and this path names the agent and the period.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const a = await statementFor(req, { read: true });
  if (!a.ok) return NextResponse.json({ ok: false, error: a.error }, { status: a.status });
  if (!a.agent) return NextResponse.json({ ok: false, error: "Pick an agent first." }, { status: 400 });
  const s = a.statement;
  if (!s || !s.ok) {
    return NextResponse.json({ ok: false, error: s?.problem ?? "The statement could not be read." }, { status: 409 });
  }
  const bytes = await commissionStatementPdf({
    agentName: a.agent.name,
    period: a.period,
    lines: s.lines,
    other: s.other,
    total: s.total,
    totalNet: s.totalNet,
    otherTotal: s.otherTotal,
    readAt: s.readAt,
  });
  const name = `TLE Commission Statement - ${a.agent.name} - ${a.period.title}`.replace(/[^A-Za-z0-9 .,'()-]/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `attachment; filename="${name}.pdf"`,
      "cache-control": "no-store",
    },
  });
}
