import { NextRequest, NextResponse } from "next/server";
import { handoffFor } from "@/lib/deal-handoff";
import { ensureHandoverTodos, handoverMode, handoversFor, runHandover } from "@/lib/handover";
import { rexConfigured } from "@/lib/rex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * GET  /api/handoff?application=37709 → the packet, what's missing, the mode,
 *                                       and the last few runs
 * POST /api/handoff { applicationId, force?, rehearse? } → run the handover
 *
 * The OS runs the handover itself now (lib/handover). With the switch off it
 * rehearses - live reads, nothing written, every step recorded as what it
 * would do; with it on, the same steps do the work. `rehearse: true` asks
 * for a shadow run whatever the switch says.
 *
 * ── Its own door, not just the middleware's ──────────────────────────────
 *
 * The sign-in redirect in middleware happens to cover this path, but a route
 * that fires a colleague's flow with a landlord's details in the payload must
 * not depend on a list it is not on. It checks the session itself, and it
 * refuses while viewing as somebody else, the same as every other write:
 * a handover in a colleague's name is a lie on the file.
 */

export const dynamic = "force-dynamic";

async function who(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  return userId ? findUserById(userId) : null;
}

export async function GET(req: NextRequest) {
  if (!(await who(req))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rexConfigured()) {
    return NextResponse.json({ error: "REX isn't connected here." }, { status: 503 });
  }
  const id = req.nextUrl.searchParams.get("application");
  if (!id) return NextResponse.json({ error: "application id is required" }, { status: 400 });

  try {
    const handoff = await handoffFor(id);
    if (!handoff) {
      return NextResponse.json({ error: `No application ${id}.` }, { status: 404 });
    }
    const [mode, runs] = await Promise.all([handoverMode(), handoversFor(id, 5)]);
    return NextResponse.json({ ...handoff, mode, runs });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await who(req))) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ error: e.message }, { status: 423 });
    throw e;
  }
  let body: { applicationId?: string; force?: boolean; rehearse?: boolean };
  try {
    body = (await req.json()) as { applicationId?: string; force?: boolean; rehearse?: boolean };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  try {
    void ensureHandoverTodos();
    const me = await who(req);
    const run = await runHandover(body.applicationId, {
      by: me?.name || me?.email || "unknown",
      mode: body.rehearse ? "shadow" : undefined,
      force: body.force === true,
    });
    return NextResponse.json({ ok: run.status === "ok", run });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
