import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { pushTakeOn, takeOnPushLive } from "@/lib/take-on-push";

/**
 * POST /api/take-ons/push { id, system: "propoly" | "rex", newProperty?, rehearse? }
 *
 * Send a take-on to Propoly, or add it to REX (lib/take-on-push). Each runs
 * for real only with its own switch on (take_on_propoly, take_on_rex); off,
 * it is rehearsed - live reads, nothing written, every step recorded as what
 * it would do. The office presses it (the pre-tenancy and compliance desk,
 * and owners), never an agent, and never while viewing as somebody else.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (who.viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody else first: a push goes in your own name." }, { status: 403 });
  if (!can(who.actor.role, "see:pretenancy")) return NextResponse.json({ ok: false, error: "The office sends a take-on on." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { id?: unknown; system?: unknown; newProperty?: unknown; rehearse?: unknown } | null;
  const id = typeof b?.id === "string" ? b.id.trim().slice(0, 40) : "";
  const system = b?.system === "propoly" || b?.system === "rex" ? b.system : null;
  if (!id || !system) return NextResponse.json({ ok: false, error: "Which take-on, and where to?" }, { status: 400 });
  try {
    const takeOn = await pushTakeOn(id, system, {
      by: who.actor.name || who.actor.email || "unknown",
      byUserId: who.actor.id,
      byEmail: who.actor.email ?? null,
      newProperty: b?.newProperty === true,
      rehearse: b?.rehearse === true,
    });
    const [propolyLive, rexLive] = await Promise.all([takeOnPushLive("propoly"), takeOnPushLive("rex")]);
    return NextResponse.json({ ok: true, takeOn, held: !propolyLive, push: { propolyLive, rexLive, canPush: true } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error)?.message ?? "The push couldn't start." }, { status: 409 });
  }
}
