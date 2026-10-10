import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, signedTokenUserId } from "@/lib/auth";
import { lockStateOf } from "@/lib/lockout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Is the person holding this session locked out? Asked by the middleware
 * (askSelf, cached per person for twenty seconds), which cannot reach the
 * database itself - see lib/lockout. Answers about the cookie's own holder
 * only, so it tells nobody anything about anybody else.
 */
export async function GET(req: NextRequest) {
  const userId = signedTokenUserId(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: true, locked: false });
  try {
    const s = await lockStateOf(userId);
    return NextResponse.json({ ok: true, locked: s.locked }, { headers: { "cache-control": "private, no-store" } });
  } catch {
    /* No answer: the middleware lets the page through, and every route
       still refuses them from the in-memory list. */
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
