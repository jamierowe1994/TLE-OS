import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { getOrder } from "@/lib/works-orders";
import { releaseContractor, sendChase, setChase } from "@/lib/works-chase";
import { stopChase } from "@/lib/works-chase-store";
import { chaseLive } from "@/lib/works-chase-rules";
import { previewChaseEmail } from "@/lib/works-emails";

/**
 * Chase the contractor on one job (Sean McMahon, 26 Oct 2026). Any signed-in
 * member of staff, as the job's own moves are.
 *
 *   { action: "send", kind: "reminder" | "final" }   one reminder, now
 *   { action: "set", firstDays, finalDays }         the reminders on dates
 *   { action: "stop" }                              stop chasing
 *   { action: "keep_waiting" }                      48 hours on: leave it with them
 *   { action: "release" }                           48 hours on: take it off them
 *
 * Answers with the job and its timeline, as PATCH /api/works-orders/<id> does.
 * GET ?kind=reminder|final is that email as this contractor would get it, sent nowhere.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Body =
  | { action: "send"; kind?: string }
  | { action: "set"; firstDays?: unknown; finalDays?: unknown }
  | { action: "stop" | "keep_waiting" | "release" };

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const b = (await req.json().catch(() => null)) as Body | null;
  if (!b || typeof b.action !== "string") return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
  const found = await getOrder(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  const o = found.order;
  const me = subject ?? actor;
  const by = me.name || me.email;
  try {
    let error: string | null = null;
    if (b.action === "send") {
      const sent = await sendChase(o, b.kind === "final" ? "final" : "reminder", me, by);
      if (!sent.sent) error = `It didn't go: ${(sent.reason ?? "it could not be sent").replace(/\s*\u2014\s*/g, " - ").replace(/\.+$/, "")}.`;
    } else if (b.action === "set") {
      await setChase(o, b.firstDays, b.finalDays, me, by);
    } else if (b.action === "stop") {
      if (!chaseLive(o.chase)) throw new Error("Nothing is being chased on this job.");
      await stopChase(o.id, `stopped by ${by}`, by);
    } else if (b.action === "keep_waiting") {
      if (!chaseLive(o.chase)) throw new Error("Nothing is being chased on this job.");
      await stopChase(o.id, `${by} is keeping it with them for now`, by);
    } else if (b.action === "release") {
      if (!chaseLive(o.chase) || o.chase.contractorId !== o.contractorId) throw new Error("Nothing is being chased on this job.");
      await releaseContractor(o, me, by);
    } else {
      return NextResponse.json({ ok: false, error: "Say what to do." }, { status: 400 });
    }
    const next = await getOrder(id);
    return NextResponse.json({ ok: !error, error: error ?? undefined, order: next?.order ?? o, events: next?.events ?? found.events });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work.") }, { status: 400 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const found = await getOrder(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such job." }, { status: 404 });
  const o = found.order;
  const kind = req.nextUrl.searchParams.get("kind") === "final" ? "final" : "reminder";
  try {
    const live = chaseLive(o.chase) && o.chase.contractorId === o.contractorId ? o.chase : null;
    const mail = await previewChaseEmail(o, kind, subject ?? actor, live?.remindedAt ?? null);
    return NextResponse.json({ ok: true, ...mail });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The preview could not be written.") }, { status: 400 });
  }
}
