import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder, moveOrder, type Move } from "@/lib/works-orders";

/**
 * One job: read it with its timeline, or move it along.
 *
 * PATCH takes a Move (lib/works-orders): quote, approve, assign, schedule,
 * done, invoice, paid, cancel, reopen, note, edit, file. Every move writes
 * a line on the job's timeline under the person's name.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const found = await getOrder(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  return NextResponse.json({ ok: true, ...found });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const move = (await req.json().catch(() => null)) as Move | null;
  if (!move || typeof move.action !== "string") return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const order = await moveOrder(id, move, by);
    const found = await getOrder(id);
    return NextResponse.json({ ok: true, order, events: found?.events ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That didn't work." }, { status: 400 });
  }
}
