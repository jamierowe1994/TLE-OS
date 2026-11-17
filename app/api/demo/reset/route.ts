import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { demoMode } from "@/lib/demo/mode";
import { resetDemo } from "@/lib/demo/seed";

/**
 * Put the demo back to this morning (lib/demo/seed resetDemo): the invented
 * world rebuilt and everything typed into the demo since cleared.
 *
 * Only exists on the demo copy: without DEMO_MODE=1 this is a 404, so it
 * cannot be pressed on the live system. Called by the demo's nightly timer
 * (x-cron-key) or by the demo's owner sign-in.
 *
 * `?world=1` rebuilds the invented world only and leaves the database alone.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!demoMode()) return new NextResponse(null, { status: 404 });
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const given = req.headers.get("x-cron-key") ?? "";
  const byTimer = Boolean(secret) && given === secret;
  if (!byTimer) {
    const { actor } = await whoIs(req);
    if (!actor || actor.role !== "owner") return NextResponse.json({ ok: false, error: "Sign in as the demo's owner first." }, { status: 401 });
  }
  if (req.nextUrl.searchParams.get("world") === "1") {
    const { resetDemoWorld } = await import("@/lib/demo/world");
    resetDemoWorld();
    return NextResponse.json({ ok: true, world: "rebuilt" });
  }
  const done = await resetDemo();
  return NextResponse.json({ ok: true, ...done });
}
