import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { accessBoard } from "@/lib/access-board";
import { agentByEmail } from "@/lib/rex-agents";
import { hasDb, q } from "@/lib/db";

/**
 * GET /api/viewings/access?days=14
 *   → { ok, rows } - the caller's own viewings coming up and whether we can get in.
 *
 * Read-only, signed in. The Viewings screen leads with the ones that still
 * need chasing (James, 20 Sep 2026).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor: signedIn, subject, viewingAs } = await whoIs(req);
  if (!signedIn) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  /* An owner viewing as somebody sees THEIR board, as with the diary. */
  const actor = viewingAs && subject ? subject : signedIn;
  const days = Math.min(60, Math.max(1, Number(req.nextUrl.searchParams.get("days")) || 14));
  /* THEIR OWN VIEWINGS ONLY (James, 24 Sep 2026: everybody sees only their
     own diary, and this board is part of it). A viewing carries the name REX
     files it under, which is not always the OS name - Howard's calendar is
     "Automated System" - so the REX user behind their address counts too. */
  const names = new Set<string>();
  const add = (n: string | null | undefined) => {
    const k = (n ?? "").trim().toLowerCase();
    if (k) names.add(k);
  };
  add(actor.name);
  const rexLogin = hasDb()
    ? await q<{ rex_email: string }>(`SELECT rex_email FROM os_rex_tokens WHERE user_id = $1`, [actor.id]).catch(() => [])
    : [];
  for (const email of [actor.email, rexLogin[0]?.rex_email]) {
    if (email) add((await agentByEmail(email).catch(() => null))?.name);
  }
  const first = (actor.name ?? "").trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  const rows = (await accessBoard(days).catch(() => [])).filter((r) => {
    const agent = (r.agent ?? "").trim().toLowerCase();
    /* A test booking carries only the booker's first name. */
    return names.has(agent) || Boolean(r.test && first && agent === first);
  });
  return NextResponse.json({ ok: true, days, rows });
}
