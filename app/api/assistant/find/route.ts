import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { scopeForWho } from "@/lib/scope";
import { lookFor } from "@/lib/new-look-store";
import { confirmFind, findMissing, recentFills, undoFill } from "@/lib/steve-find";
import { publicError } from "@/lib/public-error";
import type { FindWho } from "@/lib/steve-find-shared";

/**
 * STEVE FINDS WHAT'S MISSING (lib/steve-find, James 24 Nov 2026).
 *
 *   POST { path, who? }     look: what he found on this home or listing, sealed
 *   POST { confirm }        the agent's yes: saved in the OS, blanks only
 *   GET                     James's list of every fill, newest first (Admin)
 *   POST { undo }           put one back (Admin)
 *
 * Behind the "stevefind" switch for looking and saying yes. The person must
 * have the home on their own book, unless they are one of the people who
 * may fix any home (lib/steve-find findsAnyHome).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor || !can(actor.role, "admin:open")) return NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 });
  try {
    return NextResponse.json({ ok: true, fills: await recentFills() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Steve's list couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { path?: unknown; who?: unknown; confirm?: unknown; undo?: unknown } | null;

  try {
    if (typeof b?.undo === "string") {
      if (!can(actor.role, "admin:open")) return NextResponse.json({ ok: false, error: "Admin only." }, { status: 403 });
      const done = await undoFill(b.undo, { name: actor.name || actor.email, email: actor.email });
      return NextResponse.json(done ? { ok: true } : { ok: false, error: "That one has already been undone." }, { status: done ? 200 : 409 });
    }

    if (!(await lookFor(actor)).stevefind) return NextResponse.json({ ok: false, error: "Steve can't look for this yet." }, { status: 403 });
    const scope = await scopeForWho(req, who);

    if (typeof b?.confirm === "string") {
      const r = await confirmFind(actor, scope, b.confirm);
      return NextResponse.json(r, { status: r.ok ? 200 : 409 });
    }

    const path = String(b?.path ?? "").split(/[?#]/)[0];
    const asked: FindWho | null = b?.who === "landlord" || b?.who === "tenant" ? b.who : null;
    if (!path.startsWith("/")) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
    return NextResponse.json({ ok: true, answer: await findMissing(actor, scope, path, asked) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Steve couldn't do that just now. Your report can still go to James.") }, { status: 500 });
  }
}
