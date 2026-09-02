import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexTokenFor } from "@/lib/rex-user";
import {
  createApplication,
  getApplications,
  validateApplication,
  type NewApplication,
} from "@/lib/applications";
import { rexConfigured, rexWritesLocked } from "@/lib/rex";
import { scopeFor } from "@/lib/scope";

/**
 * GET  /api/applications?limit=100  → the live book from REX, newest first
 * POST /api/applications            → file a new one, status "received"
 *
 * The POST half is validated by US before REX is asked, because REX will
 * happily accept an application with no Right to Rent answer — it has nowhere
 * to put one. The check has to live here or it lives nowhere.
 */

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected here.", applications: [] }, { status: 503 });
  }
  const limit = Math.min(300, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100);

  /* Whose book. An owner gets the business, an agent their own, and an agent
     whose account is not linked to a REX user gets a sentence rather than
     everybody's applicants - see lib/scope.ts for why that third state is
     the one that matters. */
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({
      error:
        "We can't tell which REX user you are, so we can't show you your applications — and we won't show you everybody's. Ask James to link your account.",
      unlinked: true,
      applications: [],
    });
  }

  try {
    const applications = await getApplications(limit, scope.rexUserId);
    return NextResponse.json({
      applications,
      scope: scope.label,
      everything: scope.everything,
      pulledAt: new Date().toISOString(),
      writesLocked: rexWritesLocked(),
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message, applications: [] }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  /* A REAL application in the team's live system, filed in somebody's name.
     This route had no authentication at all — the middleware was the only
     thing in front of it, and a middleware redirect protects the ROUTE while
     saying nothing about WHO is writing. */
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const me = userId ? await findUserById(userId) : null;
  if (!me) {
    return NextResponse.json(
      { error: "Sign in first — an application is filed under an agent's name." },
      { status: 401 }
    );
  }

  let body: NewApplication & { askingRent?: number };
  try {
    body = (await req.json()) as NewApplication & { askingRent?: number };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const errors = validateApplication(body, body.askingRent ?? null);
  if (errors.length) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  try {
    const result = await createApplication(body, await rexTokenFor(me.id).catch(() => null));
    return NextResponse.json({ ok: true, status: "received", result });
  } catch (e) {
    // RexWriteBlocked lands here carrying its own instructions for lifting it.
    return NextResponse.json(
      { error: (e as Error).message, writesLocked: rexWritesLocked("TenancyApplications", "create") },
      { status: 423 }
    );
  }
}
