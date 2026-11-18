import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { lookFor } from "@/lib/new-look-store";
import { presentAgentFor } from "@/lib/rex-agents";
import { buildQuickReport, QuickReportRefused, type QuickReportAsk } from "@/lib/quick-report";
import { quickReportFilename, quickReportPdf } from "@/lib/quick-report-pdf";

/**
 * POST /api/quick-report - make the free landlord report (lib/quick-report) and
 * hand back the PDF for the Write an Email window to show and attach. Nothing
 * is saved and nothing is sent here; the agent attaches it and presses Send.
 * Behind the "quickreport" switch.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const money = (v: unknown) => {
  const n = Math.round(Number(String(v ?? "").replace(/[£,\s]/g, "")));
  return Number.isFinite(n) && n >= 100 && n <= 50_000 ? n : null;
};

export async function POST(req: NextRequest) {
  const actorId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!actorId) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const me = await findUserById(actorId);
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!(await lookFor(me).catch(() => null))?.quickreport) {
    return NextResponse.json({ ok: false, error: "Reports are not switched on for you yet." }, { status: 403 });
  }

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const kind = b.kind === "market" ? "market" : "rental";
  const beds = Number(b.beds);
  const low = money((b.view as { low?: unknown } | null)?.low);
  const high = money((b.view as { high?: unknown } | null)?.high);
  const ask: QuickReportAsk = {
    kind,
    address: String(b.address ?? "").slice(0, 200).trim(),
    postcode: String(b.postcode ?? "").slice(0, 12).trim(),
    beds: Number.isInteger(beds) && beds >= 1 && beds <= 10 ? beds : null,
    type: b.type === "house" || b.type === "flat" ? b.type : null,
    landlordName: String(b.landlordName ?? "").slice(0, 80).trim() || null,
    view: kind === "rental" && (low || high) ? { low: Math.min(low ?? high!, high ?? low!), high: Math.max(low ?? high!, high ?? low!) } : null,
    note: String(b.note ?? "").slice(0, 400).trim() || null,
  };
  if (kind === "rental" && !ask.beds) {
    return NextResponse.json({ ok: false, error: "Say how many bedrooms it has." }, { status: 400 });
  }

  try {
    const pa = await presentAgentFor(me.email, { name: me.name, email: me.email }, "", null).catch(() => null);
    const agent = {
      name: pa?.name || me.name,
      title: pa?.title || "",
      email: pa?.email || me.email,
      phone: pa?.phone || "",
    };
    const report = await buildQuickReport(ask, agent);
    const bytes = await quickReportPdf(report);
    return NextResponse.json({
      ok: true,
      filename: quickReportFilename(report),
      contentType: "application/pdf",
      content: Buffer.from(bytes).toString("base64"),
      size: bytes.length,
      postcode: report.ask.postcode,
      area: report.scope.area,
      thin: report.sized ? report.sized.rent.n < 4 : false,
      noPhone: !agent.phone,
    });
  } catch (e) {
    if (e instanceof QuickReportRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 422 });
    /* An error, never a stale or zero figure: the feed could not be read. */
    console.error("[quick-report]", publicError(e));
    return NextResponse.json({ ok: false, error: "The live adverts couldn't be read for that postcode just now, so no report was made. Check the postcode, or try again in a minute." }, { status: 502 });
  }
}
