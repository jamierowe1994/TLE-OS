import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { lastImport, openTasks } from "@/lib/rexpm-tasks";
import { listReviews } from "@/lib/tenancy-reviews";
import type { ManagedProperty } from "@/lib/portfolio-types";
import { listMoveOuts, openMoveOuts, recordMoveOut, summarise, OUTCOME_IDS, type MoveOut, type NewMoveOut, type Outcome } from "@/lib/move-outs";

/**
 * The move-outs board (2 Oct 2026). See lib/move-outs.
 *
 * GET  → every tenancy that is ending, what has been closed off here, the
 *        figures, and when the old system's list was last copied across.
 * POST → close a move-out: they moved out (the day and the jobs done), they
 *        are staying after all, or something else.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", open: [], done: [], summary: null });

  let done: MoveOut[];
  let tasks: Awaited<ReturnType<typeof openTasks>>;
  let reviews: Awaited<ReturnType<typeof listReviews>>;
  let read: Awaited<ReturnType<typeof lastImport>>;
  try {
    [done, tasks, reviews, read] = await Promise.all([listMoveOuts(), openTasks("move_out"), listReviews(), lastImport("move_out")]);
  } catch {
    return NextResponse.json({ ok: false, error: "The move-outs couldn't be read just now, so nothing is shown rather than a list that might be wrong. Try again in a minute." }, { status: 503 });
  }

  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({ ok: true, live: true, open: [], done: [], summary: summarise([], []), readAt: read?.at ?? null,
      bookError: "We can't tell which REX user you are, so we can't work out which move-outs are yours." });
  }

  /* The managed book fills in names and, for an agent, decides which homes
     are theirs. REX being down must not hide the list from the people who
     see everything, so a failed book only blanks the details. */
  let book: ManagedProperty[] = [];
  if (rexConfigured()) {
    try {
      book = (await managedBookFor(scope.rexUserId)).book.properties;
    } catch {
      book = [];
    }
  }

  const me = ((subject ?? actor).name || "").trim().toLowerCase();
  const mine = scope.rexUserId ? new Set(book.map((p) => String(p.propertyId ?? "")).filter(Boolean)) : null;
  const isMine = (rexPropertyId: string | null, who: string | undefined) =>
    !mine || (rexPropertyId && mine.has(rexPropertyId)) || (me && (who ?? "").trim().toLowerCase() === me);

  const open = openMoveOuts(
    tasks.filter((t) => isMine(t.rexPropertyId, t.managedBy)),
    reviews.filter((r) => isMine(r.rexPropertyId, r.doneBy)),
    done, book
  );
  const myDone = done.filter((r) => isMine(r.rexPropertyId, r.doneBy));
  return NextResponse.json({ ok: true, live: true, open, done: myDone, summary: summarise(open, myDone), readAt: read?.at ?? null });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Partial<NewMoveOut> | null;
  if (!b || !b.propertyName?.trim()) return NextResponse.json({ ok: false, error: "A move-out needs a property." }, { status: 400 });
  if (!(OUTCOME_IDS as readonly string[]).includes(b.outcome ?? "")) return NextResponse.json({ ok: false, error: "Say what happened." }, { status: 400 });
  const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  const str = (v: unknown) => (typeof v === "string" ? v : null);
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const moveOut = await recordMoveOut({
      rexpmTaskId: str(b.rexpmTaskId), reviewId: str(b.reviewId),
      osPropertyId: str(b.osPropertyId), rexPropertyId: str(b.rexPropertyId),
      propertyName: b.propertyName, tenant: b.tenant, landlord: b.landlord,
      plannedOn: ymd(b.plannedOn),
      outcome: b.outcome as Outcome,
      movedOutOn: ymd(b.movedOutOn),
      steps: Array.isArray(b.steps) ? b.steps.map(String) : [],
      note: b.note,
    }, by);
    return NextResponse.json({ ok: true, moveOut });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not close it." }, { status: 400 });
  }
}
