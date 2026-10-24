import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { publicError } from "@/lib/public-error";
import { lockTruth, rexTruth, walkTruth } from "@/lib/wiring-truth";

/**
 * Wiring's own reading of the three facts other tabs own (24 Oct 2026,
 * lib/wiring-truth): REX's state from REX status, the locks from Switches and
 * the server, and whether a row is tested from Testing's recorded walks.
 *
 * Each part answers or fails on its own, so one unreadable table shows an
 * error on its own line rather than blanking the tab. Names and booleans only,
 * as /api/os-health: never a key or a token.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function part<T>(fn: () => Promise<T>): Promise<{ value: T | null; error: string | null }> {
  try {
    return { value: await fn(), error: null };
  } catch (e) {
    return { value: null, error: publicError(e, "could not be read").slice(0, 200) };
  }
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:wiring"))) {
    return NextResponse.json({ ok: false, error: "This is the wiring sheet's." }, { status: 403 });
  }
  const [rex, locks, walks] = await Promise.all([part(rexTruth), part(lockTruth), part(walkTruth)]);
  return NextResponse.json({
    ok: true,
    at: new Date().toISOString(),
    rex: rex.value,
    rexError: rex.error,
    locks: locks.value,
    locksError: locks.error,
    walks: walks.value,
    walksError: walks.error ?? (walks.value === null ? "No database here, so Testing's walks can't be read." : null),
  });
}
