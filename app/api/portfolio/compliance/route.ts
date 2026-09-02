import { NextRequest, NextResponse } from "next/server";
import { scopeFor } from "@/lib/scope";
import { managedBookFor, managedCertsFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";

/**
 * Certificates for the managed book — the second, slower half of Portfolio.
 *
 * Answers "pending" and starts the read when nothing is held, so the property
 * list is never made to wait behind a walk that takes minutes. The screen
 * polls until this says ready. "failed" is a real answer too: a refused REX
 * call is shown as one, not as a spinner that never stops.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, status: "failed", error: "REX isn't connected on this environment." });
  }
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({ ok: false, status: "failed", error: "Your account isn't linked to a REX user." });
  }

  try {
    const { book } = await managedBookFor(scope.rexUserId);
    const answer = await managedCertsFor(scope.rexUserId, book);
    if (answer.status === "ready") {
      return NextResponse.json({
        ok: true,
        status: "ready",
        properties: answer.certs.properties,
        counts: answer.certs.counts,
        ageMs: answer.ageMs,
        ...(answer.stale ? { stale: true } : {}),
      });
    }
    if (answer.status === "failed") {
      return NextResponse.json({ ok: false, status: "failed", error: answer.message });
    }
    return NextResponse.json({ ok: true, status: "pending" });
  } catch (e) {
    return NextResponse.json(
      { ok: false, status: "failed", error: e instanceof Error ? e.message : "REX didn't answer." },
      { status: 502 }
    );
  }
}
