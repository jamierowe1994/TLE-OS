import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { createOrder, listOrders, listContractors, worksSummary, logEvent, KINDS, type Kind, type NewOrder } from "@/lib/works-orders";
import { emailsForMove, outcomeLine } from "@/lib/works-emails";

/**
 * Works orders: the list, the figures, and raising one.
 *
 * GET  ?kind=repair|planned  ?open=1  ?property=<rex id>  → the jobs, the
 *      summary counts, and the contractors book (one call, one screen).
 * POST → raise a job. Any signed-in member of staff; the job records who.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", orders: [], contractors: [], summary: null });
  const kindRaw = req.nextUrl.searchParams.get("kind");
  const kind = KINDS.includes(kindRaw as Kind) ? (kindRaw as Kind) : null;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const propertyId = req.nextUrl.searchParams.get("property");
  const me = subject ?? actor;
  const [orders, contractors, summary] = await Promise.all([listOrders({ kind, open, propertyId }), listContractors(me.id), worksSummary()]);
  return NextResponse.json({ ok: true, live: true, orders, contractors, summary, canCorporate: can(actor.role, "see:business") });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Partial<NewOrder> | null;
  if (!b || !b.propertyName?.trim() || !b.title?.trim() || !b.category) {
    return NextResponse.json({ ok: false, error: "A job needs a property, a title and a category." }, { status: 400 });
  }
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const order = await createOrder({ ...b, kind: b.kind ?? "repair", propertyName: b.propertyName, title: b.title, category: b.category }, by);
    /* The step emails, after the job is safe. Each outcome goes on the
       timeline so the sheet says who was told. */
    const emails = await emailsForMove(order, "raised", subject ?? actor).catch(() => []);
    for (const e of emails) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
    return NextResponse.json({ ok: true, order, emails });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not raise the job." }, { status: 400 });
  }
}
