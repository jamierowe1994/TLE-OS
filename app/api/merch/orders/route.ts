import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { lookFor } from "@/lib/new-look-store";
import { can } from "@/lib/roles";
import { publicError } from "@/lib/public-error";
import { cleanLines, ORDER_STATUSES, ordersFor, placeOrder, setOrderStatus, tellJames, type OrderStatus } from "@/lib/merch";

/**
 * GET   /api/merch/orders          - your own orders; ?all=1 every order (owners)
 * POST  /api/merch/orders {lines, notes} - place an order; James is emailed
 * PATCH /api/merch/orders {id, status}   - move an order along (owners)
 *
 * All of it only while the "merch" switch covers the signed-in person, the
 * same lock as the page (app/(os)/tools/merch/layout.tsx).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) } as const;
  const on = await lookFor(actor).catch(() => null);
  if (!on?.merch) return { error: NextResponse.json({ ok: false, error: "The merch shop is not open yet." }, { status: 403 }) } as const;
  return { me: actor, viewingAs, owner: can(actor.role, "admin:open") } as const;
}

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (all && !g.owner) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  try {
    const orders = await ordersFor(all ? null : g.me.id);
    return NextResponse.json({ ok: true, orders, owner: g.owner }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  if (g.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as someone else to order." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { lines?: unknown; notes?: unknown };
  const lines = cleanLines(body.lines);
  if (typeof lines === "string") return NextResponse.json({ ok: false, error: lines }, { status: 400 });
  try {
    const order = await placeOrder(g.me, lines, String(body.notes ?? "").trim());
    await tellJames(order, req.nextUrl.origin);
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  if (!g.owner || g.viewingAs) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
  const status = String(body.status ?? "") as OrderStatus;
  if (!ORDER_STATUSES.includes(status)) return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
  try {
    const done = await setOrderStatus(String(body.id ?? ""), status);
    return done ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "No such order." }, { status: 404 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}
