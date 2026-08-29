import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { requireOwner } from "@/lib/admin";
import { logBug, bugs, setBugState } from "@/lib/pilot";

/**
 * Reporting something broken, and reading what's been reported.
 *
 * POST is open to ANY signed-in person — that is the entire point. A pilot
 * agent who hits something odd must be one click from telling us, from the
 * page it happened on. A form they have to go and find is a form that catches
 * the frustrations somebody was still angry about ten minutes later, which is
 * a biased and much smaller sample.
 *
 * GET and PATCH are owner-only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as {
    body?: string; path?: string; kind?: string; context?: Record<string, unknown>;
    shot?: string;
  };
  if (!b.body?.trim()) {
    return NextResponse.json({ ok: false, error: "Tell us what happened." }, { status: 400 });
  }

  await logBug({
    reporterId: actor.id,
    reporterEmail: actor.email,
    body: b.body,
    path: b.path ?? "",
    kind: b.kind ?? "bug",
    /* Recorded because a report filed while VIEWING AS somebody reads as that
       person's problem otherwise, and an owner testing is not a pilot agent
       hitting a wall. The two need telling apart. */
    context: {
      ...(b.context ?? {}),
      ...(viewingAs ? { viewingAs: subject?.email ?? subject?.name ?? true } : {}),
    },
    /* Guarded rather than trusted: a data URL is the only thing accepted, and
       only up to a size a screenshot could plausibly be. The field is posted
       by a browser, so it is an untrusted string like any other. */
    shot:
      typeof b.shot === "string" &&
      b.shot.startsWith("data:image/jpeg;base64,") &&
      b.shot.length < 3_000_000
        ? b.shot
        : null,
  });
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ bugs: await bugs(200) });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const { id, state } = (await req.json().catch(() => ({}))) as { id?: string; state?: string };
  if (!id || !["open", "ack", "fixed", "wontfix"].includes(state ?? "")) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  await setBugState(id, state!);
  return NextResponse.json({ ok: true });
}
