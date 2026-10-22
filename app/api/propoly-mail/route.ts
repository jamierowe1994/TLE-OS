import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { publicError } from "@/lib/public-error";
import { homeContext, isRefusal } from "@/lib/home-send";
import { addrOf } from "@/lib/address-parse";
import { mailFor } from "@/lib/propoly-mail";
import { getAllPropolyDeals } from "@/lib/business/propoly-deals";

/**
 * Propoly's emails on a let or a home (lib/propoly-mail, 22 Oct 2026): the
 * move-in pack above all, as the proof it went.
 *
 *   GET ?deal=<propoly uuid>&address=<the let's home>   the let's page
 *   GET ?listing=<id>&listings=<id,id>                   the home's page (the home must be in your book)
 *
 * A let's emails are for the office (pre-tenancy, compliance, owners) and the
 * agent the deal is managed by.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const list = (v: string | null) => String(v ?? "").split(",").map((x) => x.trim()).filter(Boolean);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const deal = (sp.get("deal") ?? "").trim();
    const address = (sp.get("address") ?? "").trim();
    if (deal || address) {
      const me = (await whoIs(req).catch(() => null))?.actor ?? null;
      if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
      if (!can(me.role, "see:pretenancy") && !can(me.role, "work:plc")) {
        const d = deal ? (await getAllPropolyDeals().catch(() => null))?.find((x) => x.app.id === deal) : null;
        if (!d || (d.managerEmail ?? "").toLowerCase() !== me.email.toLowerCase()) {
          return NextResponse.json({ ok: true, mail: [] });
        }
      }
      return NextResponse.json({ ok: true, mail: await mailFor({ dealIds: deal ? [deal] : [], addresses: address ? [address] : [] }) });
    }
    const ctx = await homeContext(req, (sp.get("listing") ?? "").trim(), list(sp.get("listings")));
    if (isRefusal(ctx)) return NextResponse.json({ ok: false, error: ctx.error }, { status: ctx.status });
    const addresses = [...new Set([...ctx.lets, ...ctx.all, ctx.home].map((p) => addrOf(p)).filter(Boolean))];
    return NextResponse.json({ ok: true, mail: await mailFor({ addresses }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Propoly's emails couldn't be read just now.") }, { status: 500 });
  }
}
