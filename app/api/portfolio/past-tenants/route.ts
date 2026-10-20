import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { homeContext, isRefusal, pastTenants } from "@/lib/home-send";

/**
 * GET ?listing=<id>&listings=<id,id>
 *
 * Who lived at the home before, with their email and mobile (Josel Banagua,
 * 20 Oct 2026: "sometimes I need to search the referencing form just to get
 * their email addresses"). PayProp's tenant records and the OS's tenancy
 * archive, read only. One home at a time, in the person's own book.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const listings = (sp.get("listings") ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const ctx = await homeContext(req, (sp.get("listing") ?? "").trim(), listings);
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const { people, payPropRead } = await pastTenants(ctx);
    return NextResponse.json({ ok: true, people, payPropRead });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Past tenants couldn't be read just now. Try again in a minute.") }, { status: 500 });
  }
}
