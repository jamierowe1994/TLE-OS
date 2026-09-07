import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { moveOrder, logEvent, markAccountsTold, contractorsFor, stepOf, type Move } from "@/lib/works-orders";
import { emailsForMove, outcomeLine, tellAccounts } from "@/lib/works-emails";
import { invoiceSettings } from "@/lib/invoices";
import {
  REHEARSAL_FAULTS, currentRehearsal, endRehearsal, ensureTrades, rehearsalAgent, rehearsalById,
  rehearsalEmails, rehearsalTokenValid, startRehearsal,
} from "@/lib/rehearsal";

/**
 * The maintenance rehearsal, driven from one route.
 *
 * ── Why the moves do not go through /api/works-orders/[id] ────────────────
 *
 * That route requires a session, and the whole point of this one is that
 * James can send the link to somebody who has no account. So the walkthrough
 * has its own door, and the door is narrow: every path reads the job first
 * and refuses anything that is not flagged `rehearsal`. A real works order id
 * typed into this URL opens nothing, even with a valid token.
 *
 * The moves themselves are the real ones - the same moveOrder, the same step
 * model, the same emails - because a rehearsal that ran on its own code would
 * drift from the product within a fortnight and start lying.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function state(orderId: string | null, forUserId: string) {
  if (!orderId) return { ok: true, order: null, events: [], emails: [], ranked: [], step: null as string | null };
  const found = await rehearsalById(orderId);
  if (!found) return { ok: true, order: null, events: [], emails: [], ranked: [], step: null as string | null };
  const [emails, ranked] = await Promise.all([
    rehearsalEmails(found.order.id),
    contractorsFor(found.order, forUserId).catch(() => []),
  ]);
  return { ok: true, order: found.order, events: found.events, emails, ranked, step: stepOf(found.order) };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!rehearsalTokenValid(token)) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  const me = rehearsalAgent(actor ?? null);

  const asked = req.nextUrl.searchParams.get("order");
  const order = asked ? asked : (await currentRehearsal())?.id ?? null;
  await ensureTrades();
  return NextResponse.json({ ...(await state(order, me.id)), faults: REHEARSAL_FAULTS, agent: { name: me.name, email: me.email } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  if (!rehearsalTokenValid(token)) return NextResponse.json({ ok: false, error: "That link isn't one of ours." }, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  const me = rehearsalAgent(actor ?? null);
  const by = me.name || "The agent";

  const body = (await req.json().catch(() => null)) as
    | { do: "start"; fault?: string }
    | { do: "end"; orderId: string }
    | { do: "move"; orderId: string; move: Move }
    | null;
  if (!body) return NextResponse.json({ ok: false, error: "Nothing to do." }, { status: 400 });

  if (body.do === "start") {
    /* One walkthrough at a time. Starting a new one clears the last, so the
       link never opens onto somebody else's half-finished demonstration. */
    const running = await currentRehearsal();
    if (running) await endRehearsal(running.id);
    const order = await startRehearsal(body.fault ?? "leak", by);
    const emails = await emailsForMove(order, "raised", me).catch(() => []);
    for (const e of emails) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
    return NextResponse.json(await state(order.id, me.id));
  }

  if (body.do === "end") {
    await endRehearsal(body.orderId);
    return NextResponse.json({ ok: true, order: null, events: [], emails: [], ranked: [], step: null });
  }

  if (body.do === "move") {
    const found = await rehearsalById(body.orderId);
    if (!found) return NextResponse.json({ ok: false, error: "That walkthrough has finished." }, { status: 404 });
    const next = await moveOrder(found.order.id, body.move, by);
    const emails = await emailsForMove(next, body.move.action, me, { how: "how" in body.move ? body.move.how : undefined }).catch(() => []);
    for (const e of emails) await logEvent(next.id, "TLE OS", "email", outcomeLine(e));
    if (body.move.action === "invoice") {
      const told = await tellAccounts(next, (await invoiceSettings()).accountsEmail ?? "");
      if (told.sent) await markAccountsTold(next.id);
      await logEvent(next.id, "TLE OS", "email", outcomeLine(told));
    }
    return NextResponse.json(await state(next.id, me.id));
  }

  return NextResponse.json({ ok: false, error: "Nothing to do." }, { status: 400 });
}
