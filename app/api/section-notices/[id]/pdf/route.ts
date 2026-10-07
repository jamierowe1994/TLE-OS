import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { noticePdf } from "@/lib/section-notice-pdf";
import { getNotice } from "@/lib/section-notices";
import { SPECS } from "@/lib/section-notices-spec";

/**
 * The notice as Michael's document, filled in, to download and keep beside
 * PayProp while he serves it (lib/section-notice-pdf). Anyone who can open
 * the home's file can download it; ?view=1 opens it in the browser instead.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const n = await getNotice(id);
  if (!n) return NextResponse.json({ ok: false, error: "That notice is not there any more." }, { status: 404 });
  const bytes = await noticePdf(n);
  const name = `${SPECS[n.kind].short} - ${n.propertyLabel}`.replace(/[^\w\- ,.]+/g, "").slice(0, 120);
  const view = req.nextUrl.searchParams.get("view") === "1";
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${view ? "inline" : "attachment"}; filename="${name}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
