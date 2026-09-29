import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { syncAll } from "@/lib/flatfair-sync";

/**
 * Refresh our copy of Flatfair (lib/flatfair-sync). Run by a Railway cron with
 * the cron key, or by an owner from the wiring sheet. Read-only on Flatfair's
 * side: it lists and reads, it never writes there. Fails shut with no
 * CRON_SECRET, so it is safe on the middleware's machine-route list.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function cronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? "";
  if (!secret || !given) return false;
  const a = Buffer.from(secret);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function run(req: NextRequest) {
  if (!cronAuthorised(req)) {
    const { actor } = await whoIs(req);
    if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
    if (!can(actor.role, "see:wiring")) return NextResponse.json({ ok: false, error: "That is for the owners." }, { status: 403 });
  }
  const out = await syncAll();
  return NextResponse.json(out, { status: out.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
}

export const GET = run;
export const POST = run;
