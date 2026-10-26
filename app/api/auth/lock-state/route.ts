import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, signedTokenUserId } from "@/lib/auth";
import { q } from "@/lib/db";
import { emailCheckDue } from "@/lib/email-check";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Is the person holding this session locked out, and does the pace cap
 * apply to them (everybody but an owner)? Asked by the middleware
 * (askSelf, cached per person for twenty seconds), which cannot reach the
 * database itself - see lib/lockout. Answers about the cookie's own holder
 * only, so it tells nobody anything about anybody else.
 */
export async function GET(req: NextRequest) {
  const userId = signedTokenUserId(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return NextResponse.json({ ok: true, locked: false, capped: true });
  try {
    const rows = await q<{ role: string; locked_at: Date | null }>(`SELECT role, locked_at FROM os_users WHERE id = $1`, [userId]);
    const r = rows[0];
    /* capped: the middleware's pace cap applies - to everybody but an owner.
       emailDue: the every-few-days email check is owed (lib/email-check); a
       check that can't be read is not owed, so it never locks anyone out. */
    const emailDue = r && !r.locked_at ? await emailCheckDue(userId).catch(() => false) : false;
    return NextResponse.json(
      { ok: true, locked: Boolean(r?.locked_at), capped: r?.role !== "owner", emailDue },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    /* No answer: the middleware lets the page through, and every route
       still refuses them from the in-memory list. */
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
