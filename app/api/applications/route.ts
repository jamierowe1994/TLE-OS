import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { rexTokenFor } from "@/lib/rex-user";
import {
  createApplication,
  validateApplication,
  type NewApplication,
} from "@/lib/applications";
import { rexConfigured, rexWritesLocked } from "@/lib/rex";
import { scopeFor } from "@/lib/scope";
import { testApplicationsFor } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";
import { ASSEMBLE_AT, assembled, cut, markApplicationsFiled } from "@/lib/applications-board";
import { acceptedRexRefs } from "@/lib/offer-decisions";
import { hasDb, q } from "@/lib/db";
import { can } from "@/lib/roles";
import { propolyOnlyLets } from "@/lib/propoly-only-lets";

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
    return NextResponse.json({ error: "Applications aren't connected here.", applications: [] }, { status: 503 });
  }
  const limit = Math.min(ASSEMBLE_AT, Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100);

  /* Whose book. An owner gets the business, an agent their own, and an agent
     whose account is not linked to a REX user gets a sentence rather than
     everybody's applicants - see lib/scope.ts for why that third state is
     the one that matters. whoIs alongside, for the tester's own overlay. */
  const [scope, { actor }] = await Promise.all([
    scopeFor(req),
    whoIs(req).catch(() => ({ actor: null })),
  ]);
  if (scope.unlinked) {
    return NextResponse.json({
      error:
        "Your account isn't linked to your applications yet, so we can't show you yours, and we won't show you everybody's. Ask James to link your account.",
      unlinked: true,
      applications: [],
    });
  }

  try {
    /* The tester's own test offers (lib/test-overlay), on top - never anyone
       else's. Read alongside the book rather than after it. */
    const [{ held, stale }, testRows, decided, osAccepted, propolyOnly] = await Promise.all([
      assembled(scope.rexUserId),
      req.nextUrl.searchParams.get("tests") === "0" ? Promise.resolve([]) : testApplicationsFor(actor?.email).catch(() => []),
      /* The agent's Accept or Decline in the OS (7 Oct 2026): the board shows
         an offer once it is accepted, here or in REX. */
      acceptedRexRefs().catch(() => new Map()),
      osAcceptedOffers(scope.everything ? null : actor?.email ?? null).catch(() => []),
      /* Lets that only Propoly knows about (9 Oct 2026, 54 Maple Avenue). */
      propolyOnlyLets(scope, { canPretenancy: Boolean(actor && can(actor.role as never, "see:pretenancy")) }).catch(() => []),
    ]);
    const { applications, stages, closed } = held.value;
    const tests = testRows.map((a) => ({ ...a, stageLabel: a.stageLabel ?? a.statusLabel, test: true }));
    /* ?include=<id>: one application asked for by name - the PLC wizard's
       "Open the application" (6 Oct 2026). The board's cut drops accepted
       lets whose move-in has passed, so a pack could point at an application
       the board never loaded, and the link opened nothing. Still only from
       this person's own book. */
    const include = req.nextUrl.searchParams.get("include");
    const shown = cut(applications, limit);
    const extra = include && !shown.some((a) => String(a.id) === include)
      ? applications.filter((a) => String(a.id) === include)
      : [];
    return NextResponse.json({
      applications: [...tests, ...[...shown, ...extra].map((a) => ({
        ...a,
        stageLabel: stages.get(a.id) ?? a.statusLabel,
        closed: closed.get(a.id) ?? null,
        osDecision: decided.get(`rex:${a.id}`) ?? null,
      }))],
      osAccepted,
      propolyOnly,
      scope: scope.label,
      everything: scope.everything,
      /* When REX actually said this, not when it was served. */
      pulledAt: new Date(held.at).toISOString(),
      ...(stale ? { stale: true } : {}),
      writesLocked: rexWritesLocked(),
    });
  } catch (e) {
    return NextResponse.json({ error: publicError(e), applications: [] }, { status: 502 });
  }
}

/**
 * Offers saved in the OS and accepted there (lib/offer-decisions) - no REX
 * application behind them yet, so the board lists them on their own with the
 * job of creating it in REX. An agent sees the ones on listings they are
 * emailed for or that they put forward; the owner sees them all.
 */
async function osAcceptedOffers(email: string | null) {
  if (!hasDb()) return [];
  const rows = await q<{ id: string; name: string; address: string; listing_id: string | null; payload: { amount?: number; moveIn?: string }; by_name: string; decided_at: Date }>(
    `SELECT r.id, r.name, r.address, r.listing_id, r.payload, d.by_name, d.decided_at
       FROM os_offer_decisions d JOIN os_tenant_viewing_responses r ON d.ref = 'os:' || r.id
      WHERE d.decision = 'accepted'
        AND ($1::text IS NULL OR LOWER(COALESCE(r.sent_to, '')) = LOWER($1) OR LOWER(COALESCE(r.payload->'recordedBy'->>'email', '')) = LOWER($1) OR LOWER(d.by_email) = LOWER($1))
      ORDER BY d.decided_at DESC LIMIT 100`,
    [email]
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    address: r.address,
    listingId: r.listing_id,
    amount: typeof r.payload?.amount === "number" ? r.payload.amount : null,
    moveIn: r.payload?.moveIn ?? null,
    by: r.by_name,
    at: new Date(r.decided_at).toISOString(),
  }));
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
    /* One just made must be on the board now, not in a minute: every held
       copy, here and in os_cache, is older than this and will not be shown. */
    markApplicationsFiled();
    return NextResponse.json({ ok: true, status: "received", result });
  } catch (e) {
    // RexWriteBlocked lands here carrying its own instructions for lifting it.
    return NextResponse.json(
      { error: publicError(e), writesLocked: rexWritesLocked("TenancyApplications", "create") },
      { status: 423 }
    );
  }
}
