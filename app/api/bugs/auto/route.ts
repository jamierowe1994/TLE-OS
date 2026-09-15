import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { logFailure } from "@/lib/auto-bugs";

/**
 * POST { what, status?, message, path } → a failure the browser saw, filed as
 * an automatic bug (lib/auto-bugs, 15 Sep 2026).
 *
 * Signed in only, and capped per person, because it is a write any screen can
 * make without a click: a runaway loop on one agent's laptop must not become
 * ten thousand rows. Repeats are counted on the server regardless.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PER_MINUTE = 30;
const hits = new Map<string, number[]>();

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false }, { status: 401 });

  const now = Date.now();
  const mine = (hits.get(actor.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= PER_MINUTE) return NextResponse.json({ ok: true, throttled: true });
  mine.push(now);
  hits.set(actor.id, mine);
  if (hits.size > 5_000) hits.clear();

  const b = (await req.json().catch(() => ({}))) as { what?: unknown; status?: unknown; message?: unknown; path?: unknown };
  const what = typeof b.what === "string" ? b.what.trim().slice(0, 160) : "";
  const message = typeof b.message === "string" ? b.message.trim().slice(0, 500) : "";
  if (!what || !message) return NextResponse.json({ ok: false, error: "What went wrong, and where?" }, { status: 400 });

  await logFailure({
    source: "Screen",
    what,
    status: typeof b.status === "number" ? b.status : null,
    message,
    path: typeof b.path === "string" ? b.path.slice(0, 300) : "",
    who: actor.email,
  });
  return NextResponse.json({ ok: true });
}
