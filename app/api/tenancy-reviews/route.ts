import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { scopeFor } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { getComplianceBook } from "@/lib/compliance-cache";
import { isOurs } from "@/lib/compliance";
import { lastClosedByHome, lastImport, openTasks } from "@/lib/rexpm-tasks";
import { rentCollectIds } from "@/lib/os-properties";
import type { ManagedProperty } from "@/lib/portfolio-types";
import {
  dueFromCadence, dueFromTasks, listReviews, recordReview, reviewRules, summarise,
  OUTCOME_IDS, type NewReview, type Outcome, type Review,
} from "@/lib/tenancy-reviews";

/**
 * The tenancy reviews board (1 Oct 2026). See lib/tenancy-reviews.
 *
 * GET  → what is due, what has been recorded here, the figures, and where
 *        the list came from.
 * POST → record a review: what was decided, and the new rent if it went up.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", due: [], done: [], summary: null });

  let rules: Awaited<ReturnType<typeof reviewRules>>;
  let done: Review[];
  try {
    [rules, done] = await Promise.all([reviewRules(), listReviews()]);
  } catch {
    return NextResponse.json({ ok: false, error: "The tenancy reviews couldn't be read just now, so nothing is shown rather than a list that might be wrong. Try again in a minute." }, { status: 503 });
  }

  const read = rules.source === "rex-pm" ? await lastImport("tenancy_review").catch(() => null) : null;
  const fromTasks = rules.source === "rex-pm" && !!read;
  const scope = await scopeFor(req);
  if (scope.unlinked) {
    return NextResponse.json({ ok: true, live: true, due: [], done: [], summary: summarise([], []), source: fromTasks ? "rex-pm" : "os", readAt: read?.at ?? null,
      bookError: "We can't tell which REX user you are, so we can't work out which reviews are yours." });
  }

  /* The managed book fills in contact details and, for an agent, decides
     which homes are theirs. REX being down must not hide REX PM's list from
     the people who see everything, so a failed book only blanks the details. */
  let book: ManagedProperty[] = [];
  let bookError: string | null = null;
  if (rexConfigured()) {
    try {
      book = (await managedBookFor(scope.rexUserId)).book.properties;
    } catch (e) {
      bookError = e instanceof Error ? e.message : "REX didn't answer, so some details are missing.";
    }
  } else {
    bookError = "REX isn't connected on this environment.";
  }

  const me = ((subject ?? actor).name || "").trim().toLowerCase();
  const mine = scope.rexUserId ? new Set(book.map((p) => String(p.propertyId ?? "")).filter(Boolean)) : null;
  const isMine = (rexPropertyId: string | null, who: string | undefined) =>
    !mine || (rexPropertyId && mine.has(rexPropertyId)) || (me && (who ?? "").trim().toLowerCase() === me);

  let due: ReturnType<typeof dueFromTasks> = [];
  try {
    if (fromTasks) {
      /* Rent collect: renewals are the landlord's (James, 2 Oct 2026). */
      const [tasks, rentCollect] = await Promise.all([openTasks("tenancy_review"), rentCollectIds()]);
      const theirs = (t: (typeof tasks)[number]) =>
        (t.osPropertyId && rentCollect.has(t.osPropertyId)) || (t.rexPropertyId && rentCollect.has(t.rexPropertyId));
      due = dueFromTasks(tasks.filter((t) => isMine(t.rexPropertyId, t.managedBy) && !theirs(t)), done, book);
    } else if (book.length) {
      const [comp, prior] = await Promise.all([getComplianceBook(), lastClosedByHome("tenancy_review")]);
      const ours = new Set(comp.book.properties.filter(isOurs).map((p) => String(p.id)));
      due = dueFromCadence(book.filter((p) => ours.has(String(p.propertyId ?? p.listingId))), done, prior, rules);
    }
  } catch {
    return NextResponse.json({ ok: false, error: "The tenancy reviews couldn't be read just now. Try again in a minute." }, { status: 503 });
  }

  const myDone = done.filter((r) => isMine(r.rexPropertyId, r.doneBy));
  return NextResponse.json({
    ok: true, live: true, due, done: myDone, rules,
    summary: summarise(due, myDone),
    source: fromTasks ? "rex-pm" : "os",
    readAt: read?.at ?? null,
    ...(bookError && !fromTasks ? { bookError } : {}),
  });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Partial<NewReview> | null;
  if (!b || !b.propertyName?.trim()) return NextResponse.json({ ok: false, error: "A review needs a property." }, { status: 400 });
  if (!(OUTCOME_IDS as readonly string[]).includes(b.outcome ?? "")) return NextResponse.json({ ok: false, error: "Say what was decided." }, { status: 400 });
  const newRent = b.newRent == null || b.newRent === ("" as unknown) ? null : Number(b.newRent);
  if (newRent !== null && !Number.isFinite(newRent)) return NextResponse.json({ ok: false, error: "The new rent should be a number." }, { status: 400 });
  const ymd = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const review = await recordReview({
      rexpmTaskId: typeof b.rexpmTaskId === "string" ? b.rexpmTaskId : null,
      osPropertyId: typeof b.osPropertyId === "string" ? b.osPropertyId : null,
      rexPropertyId: typeof b.rexPropertyId === "string" ? b.rexPropertyId : null,
      propertyName: b.propertyName,
      tenant: b.tenant, landlord: b.landlord,
      dueOn: ymd(b.dueOn),
      outcome: b.outcome as Outcome,
      rentBefore: b.rentBefore,
      newRent, newRentPeriod: b.newRentPeriod === "week" ? "week" : "month",
      newRentFrom: ymd(b.newRentFrom),
      note: b.note,
    }, by);
    return NextResponse.json({ ok: true, review });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not record it." }, { status: 400 });
  }
}
