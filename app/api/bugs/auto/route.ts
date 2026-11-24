import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { logFailure } from "@/lib/auto-bugs";

/**
 * POST { what, status?, message, path, detail? } → a failure the browser saw, filed as
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

/** Where it happened (lib/auto-report), kept small: short strings, numbers and short lists of strings only. */
function detailOf(v: unknown): Record<string, string | number | string[]> | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const out: Record<string, string | number | string[]> = {};
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 12)) {
    const key = k.slice(0, 24);
    if (typeof x === "string" && x) out[key] = x.slice(0, 1800);
    else if (typeof x === "number" && Number.isFinite(x)) out[key] = x;
    else if (Array.isArray(x)) out[key] = x.filter((y): y is string => typeof y === "string").slice(0, 12).map((y) => y.slice(0, 120));
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false }, { status: 401 });

  const now = Date.now();
  const mine = (hits.get(actor.id) ?? []).filter((t) => now - t < 60_000);
  if (mine.length >= PER_MINUTE) return NextResponse.json({ ok: true, throttled: true });
  mine.push(now);
  hits.set(actor.id, mine);
  if (hits.size > 5_000) hits.clear();

  const b = (await req.json().catch(() => ({}))) as { what?: unknown; status?: unknown; message?: unknown; path?: unknown; detail?: unknown };
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
    detail: detailOf(b.detail),
  });
  return NextResponse.json({ ok: true });
}
