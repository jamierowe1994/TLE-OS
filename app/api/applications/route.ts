import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexTokenFor } from "@/lib/rex-user";
import {
  closedReasons,
  createApplication,
  getApplications,
  validateApplication,
  type NewApplication,
} from "@/lib/applications";
import { rexConfigured, rexWritesLocked } from "@/lib/rex";
import { scopeFor } from "@/lib/scope";
import { stageLabels } from "@/lib/application-journey";
import { testApplicationsFor } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";

/**
 * GET  /api/applications?limit=100  → the live book from REX, newest first
 * POST /api/applications            → file a new one, status "received"
 *
 * The POST half is validated by US before REX is asked, because REX will
 * happily accept an application with no Right to Rent answer — it has nowhere
 * to put one. The check has to live here or it lives nowhere.
 */

export const dynamic = "force-dynamic";

/**
 * The applications with their stage and their closed reason, assembled ONCE a
 * minute per book (19 Sep 2026). The dashboard tile and the board both ask for
 * this, often at the same moment; each was running the whole thing itself, and
 * the let-or-withdrawn lookup alone was six to eight seconds of REX every time.
 * A minute is the rule applications have always kept (lib/staleness), and two
 * callers arriving together share one read rather than racing two.
 */
type Assembled = { applications: Awaited<ReturnType<typeof getApplications>>; stages: Map<string, string>; closed: Map<string, string> };
const ASSEMBLED_MS = 60_000;
const assembledHeld = new Map<string, { at: number; value: Assembled }>();
const assembling = new Map<string, Promise<Assembled>>();

function assembled(limit: number, rexUserId: string | null): Promise<Assembled> {
  const key = `${rexUserId ?? "all"}:${limit}`;
  const hit = assembledHeld.get(key);
  if (hit && Date.now() - hit.at < ASSEMBLED_MS) return Promise.resolve(hit.value);
  const running = assembling.get(key);
  if (running) return running;
  const p = (async () => {
    const applications = await getApplications(limit, rexUserId);
    /* Where each one has actually GOT TO, rather than which of REX's four
       statuses it is on. One Propoly call for the whole page - see
       stageLabels(). It never fails the request: a list that says
       "Accepted" is worse than one that says "Signing & move-in monies",
       but it is far better than no list. */
    /* And which of them are really over, though REX still calls them open -
       moved in, or the home gone to someone else. See closedReasons(). */
    const [stages, closed] = await Promise.all([
      stageLabels(applications).catch(() => new Map<string, string>()),
      closedReasons(applications).catch(() => new Map<string, string>()),
    ]);
    /* The tester's own test offers (lib/test-overlay), on top - never anyone else's. */
    const value = { applications, stages, closed };
    assembledHeld.set(key, { at: Date.now(), value });
    return value;
  })().finally(() => assembling.delete(key));
  assembling.set(key, p);
  return p;
}

export async function GET(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ error: "Applications aren't connected here.", applications: [] }, { status: 503 });
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
        "Your account isn't linked to your applications yet, so we can't show you yours, and we won't show you everybody's. Ask James to link your account.",
      unlinked: true,
      applications: [],
    });
  }

  try {
    const { applications, stages, closed } = await assembled(limit, scope.rexUserId);
    const { actor } = await whoIs(req).catch(() => ({ actor: null }));
    const tests = (req.nextUrl.searchParams.get("tests") === "0" ? [] : await testApplicationsFor(actor?.email).catch(() => [])).map((a) => ({ ...a, stageLabel: a.stageLabel ?? a.statusLabel, test: true }));
    return NextResponse.json({
      applications: [...tests, ...applications.map((a) => ({
        ...a,
        stageLabel: stages.get(a.id) ?? a.statusLabel,
        closed: closed.get(a.id) ?? null,
      }))],
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
    /* One just made must be on the board now, not in a minute. */
    assembledHeld.clear();
    return NextResponse.json({ ok: true, status: "received", result });
  } catch (e) {
    // RexWriteBlocked lands here carrying its own instructions for lifting it.
    return NextResponse.json(
      { error: (e as Error).message, writesLocked: rexWritesLocked("TenancyApplications", "create") },
      { status: 423 }
    );
  }
}
