import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { lookFor } from "@/lib/new-look-store";
import { can } from "@/lib/roles";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { MakerError } from "@/lib/merch-makers";
import {
  checkOrder,
  cleanDelivery,
  cleanLines,
  ORDER_STATUSES,
  ordersFor,
  placeOrder,
  retryOrder,
  sendCheck,
  sendOrder,
  setOrderStatus,
  tellJames,
  type OrderStatus,
} from "@/lib/merch";

/**
 * GET   /api/merch/orders                    your own orders; ?all=1 every order (owners), each with whether it can be sent
 * POST  /api/merch/orders {lines, notes, delivery}   place an order; James is emailed
 * PATCH /api/merch/orders {id, status}               move an order along by hand (owners)
 * PATCH /api/merch/orders {id, action: "send"|"retry"|"check"}   Send to Maker, send again, ask the makers now (owners)
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
    const out = all ? orders.map((o) => ({ ...o, send: sendCheck(o) })) : orders;
    /* The address on their last order fills the basket's delivery box. */
    const lastDelivery = all ? null : (orders.find((o) => o.delivery)?.delivery ?? null);
    return NextResponse.json({ ok: true, orders: out, owner: g.owner, lastDelivery }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  if (g.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as someone else to order." }, { status: 409 });
  const body = (await req.json().catch(() => ({}))) as { lines?: unknown; notes?: unknown; delivery?: unknown };
  const lines = cleanLines(body.lines);
  if (typeof lines === "string") return NextResponse.json({ ok: false, error: lines }, { status: 400 });
  const delivery = cleanDelivery(body.delivery);
  if (typeof delivery === "string") return NextResponse.json({ ok: false, error: delivery }, { status: 400 });
  try {
    const order = await placeOrder(g.me, lines, String(body.notes ?? "").trim(), delivery);
    await tellJames(order, publicOrigin(req));
    return NextResponse.json({ ok: true, order });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const g = await gate(req);
  if ("error" in g) return g.error;
  if (!g.owner || g.viewingAs) return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown; action?: unknown };
  const id = String(body.id ?? "");
  try {
    if (body.action === "send" || body.action === "retry") {
      const r = body.action === "send" ? await sendOrder(id, g.me, publicOrigin(req)) : await retryOrder(id, g.me, publicOrigin(req));
      return NextResponse.json({ ok: !r.error, error: r.error ?? undefined, order: { ...r.order, send: sendCheck(r.order) } });
    }
    if (body.action === "check") {
      const r = await checkOrder(id);
      return NextResponse.json({ ok: r.errors.length === 0, error: r.errors.join(" ") || undefined, order: { ...r.order, send: sendCheck(r.order) } });
    }
    const status = String(body.status ?? "") as OrderStatus;
    if (!ORDER_STATUSES.includes(status)) return NextResponse.json({ ok: false, error: "Unknown status." }, { status: 400 });
    const done = await setOrderStatus(id, status);
    return done ? NextResponse.json({ ok: true }) : NextResponse.json({ ok: false, error: "No such order." }, { status: 404 });
  } catch (e) {
    const msg = e instanceof MakerError ? e.message : publicError(e);
    return NextResponse.json({ ok: false, error: msg }, { status: e instanceof MakerError ? 400 : 500 });
  }
}
