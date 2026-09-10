import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { factsByRexId } from "@/lib/os-properties";
import {
  createInspection, dueList, inspectionRules, listInspections, openFindings, summarise,
  KIND_IDS, type Kind, type NewInspection,
} from "@/lib/inspections";

/**
 * The inspections board: what is due, what is in hand, and raising one.
 *
 * GET  ?kind= ?open=1 ?property=<id>
 *      → the inspections we hold, the DUE list worked out against the clock
 *        right now from the managed book and the cadence, the rules those
 *        came from, and the figures.
 * POST → raise one, either off a due row or typed in from scratch.
 *
 * The due list is computed, never stored. A schedule written down once is a
 * schedule that is wrong by next month, and this screen is where somebody
 * finds out a home has not been visited in two years.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) {
    return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", inspections: [], due: [], actions: [], rules: null, summary: null });
  }

  const kindRaw = req.nextUrl.searchParams.get("kind");
  const kind = (KIND_IDS as readonly string[]).includes(kindRaw ?? "") ? (kindRaw as Kind) : null;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const propertyId = req.nextUrl.searchParams.get("property");

  const [inspections, rules, actions] = await Promise.all([
    listInspections({ kind, open, propertyId }),
    inspectionRules(),
    openFindings(),
  ]);

  /* The due list needs the managed book. When REX is not connected, or the
     person is not linked to a REX user, we say so instead of showing a due
     list built from nothing - an empty board reads as "nothing is due". */
  let due: ReturnType<typeof dueList> = [];
  let bookError: string | null = null;
  if (!rexConfigured()) {
    bookError = "REX isn't connected on this environment, so nothing can be worked out as due.";
  } else {
    const scope = await scopeFor(req);
    if (scope.unlinked) {
      bookError = "We can't tell which REX user you are, so we can't work out what's due on your book.";
    } else {
      try {
        const [{ book }, facts] = await Promise.all([managedBookFor(scope.rexUserId), factsByRexId()]);
        const hmoIds = new Set([...facts.entries()].filter(([, f]) => f.hmo).map(([id]) => id));
        due = dueList(book.properties, inspections, rules, hmoIds);
      } catch (e) {
        bookError = e instanceof Error ? e.message : "REX didn't answer, so the due list is missing.";
      }
    }
  }

  return NextResponse.json({
    ok: true, live: true, inspections, due, actions, rules,
    summary: summarise(inspections, due),
    ...(bookError ? { bookError } : {}),
  });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Partial<NewInspection> | null;
  if (!b || !b.propertyName?.trim()) return NextResponse.json({ ok: false, error: "An inspection needs a property." }, { status: 400 });
  const kind = (KIND_IDS as readonly string[]).includes(b.kind ?? "") ? (b.kind as Kind) : "interim";
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const inspection = await createInspection({ ...b, kind, propertyName: b.propertyName }, by);
    return NextResponse.json({ ok: true, inspection });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not raise it." }, { status: 400 });
  }
}
