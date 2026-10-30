import { NextRequest, NextResponse } from "next/server";
import { maskContactFields, seesContactLists } from "@/lib/contact-mask";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { worksSnapshotAround } from "@/lib/works-trend";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { createOrder, listOrders, listContractors, worksSummary, logEvent, moveOrder, KINDS, type Kind, type NewOrder, type MoveOut } from "@/lib/works-orders";
import { emailsForMove, outcomeLine } from "@/lib/works-emails";
import { alreadyTakenOn, carriedJobs, markTakenOn, withCarried } from "@/lib/works-carried";
import { landlordKey, landlordPrefsFor, ringsForApproval } from "@/lib/landlord-prefs";
import { mineFor, summariseOrders, type MineAnswer } from "@/lib/works-mine";

/**
 * Works orders: the list, the figures, and raising one.
 *
 * GET  ?kind=repair|planned  ?open=1  ?property=<rex id>  → the jobs, the
 *      summary counts, and the contractors book (one call, one screen).
 * POST → raise a job. Any signed-in member of staff; the job records who.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  const { actor, subject } = who;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", orders: [], contractors: [], summary: null });
  const kindRaw = req.nextUrl.searchParams.get("kind");
  const kind = KINDS.includes(kindRaw as Kind) ? (kindRaw as Kind) : null;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const propertyId = req.nextUrl.searchParams.get("property");
  const me = subject ?? actor;
  /* `lastMonth` is the snapshot nearest to thirty days ago, or null when we
     do not hold one yet - the board draws a delta only when there is a real
     one to draw. See lib/works-trend.ts. */
  const [orders, contractors, own, lastMonth, carried] = await Promise.all([
    listOrders({ kind, open, propertyId }),
    listContractors(me.id),
    worksSummary(),
    worksSnapshotAround(30).catch(() => null),
    /* REX PM's open jobs not yet taken on here (1 Oct 2026, lib/works-carried).
       A failed read is said out loud, never shown as an empty list. */
    carriedJobs().catch(() => null),
  ]);
  const summary = carried ? withCarried(own, carried.jobs) : own;
  /* Jobs awaiting a landlord who is not to be emailed about them: the board
     says ring them rather than "waiting on the landlord" (6 Oct 2026). */
  const awaiting = orders.filter((o) => o.status === "approval");
  const prefs = awaiting.length ? await landlordPrefsFor(awaiting.map((o) => o.landlordEmail)).catch(() => new Map()) : new Map();
  const ringForApproval = awaiting.filter((o) => ringsForApproval(o, prefs.get(landlordKey(o.landlordEmail)))).map((o) => o.id);
  /* The board lists names; a job's numbers and emails come when it is opened
     (/api/works-orders/<id>). An agent's list carries them shortened (lib/
     contact-mask, 10 Oct 2026) so the whole book's tenants are not one call. */
  /* Which of them are this person's own (Rhiannon, 15 Oct 2026, lib/works-mine):
     the board shows Mine or Everyone, and the tiles count whichever is shown.
     A failed read of their homes is said on the page, never an empty Mine. */
  /* A failure here used to fall back to Everyone without a word (26 Oct 2026):
     an agent who opens on Mine saw their count jump by everybody else's jobs
     on one refresh and drop back on the next. Tried twice now, and if it still
     fails the page says it is showing everyone's (mineFailed). */
  const mineOf = () => mineFor(req, who, orders, carried?.jobs ?? null, [...(carried?.done ?? []), ...(carried?.closed ?? [])]);
  let mine: MineAnswer | null = await mineOf().catch(() => mineOf()).catch((e) => {
    console.error("[works-orders] Mine could not be worked out", e instanceof Error ? e.message : e);
    return null;
  });

  /* AN AGENT SEES THEIR OWN (James, 29 Oct 2026, opening a works order on
     the team call: "I can see everyone's, which is not ideal"). Contractors
     went this way on 21 Oct (lib/contractor-scope); Maintenance still sent an
     agent every colleague's jobs - tenants, landlords, the notifications on
     each - one press of Everyone away. Now the server sends an agent only
     Mine: the jobs on the homes in their book and the ones they raised. The
     office and the owners (see:everything) keep Mine / Everyone. A home's own
     page (?property=) still lists that home's jobs, as it always has.
     If Mine cannot be worked out, an agent gets the jobs they raised and is
     told so - never everybody's. */
  const scoped = !can(me.role, "see:everything") && !propertyId;
  let ownOrders = orders;
  let ownCarried = carried;
  if (scoped) {
    if (!mine) {
      const names = new Set([me.name, me.email].map((x) => (x ?? "").trim().toLowerCase()).filter(Boolean));
      const raised = orders.filter((o) => names.has((o.raisedBy ?? "").trim().toLowerCase()));
      mine = { orders: raised.map((o) => o.id), carried: [], summary: summariseOrders(raised), startOn: "mine", note: "Your homes couldn't be read just now, so this shows only the jobs you raised. Try again in a minute." };
    }
    /* Its note talks about the Mine toggle; an agent has none now. */
    if (mine.note) mine = { ...mine, note: mine.note.replace(/Mine shows/g, "this shows") };
    const ids = new Set(mine.orders);
    const tasks = new Set(mine.carried);
    ownOrders = orders.filter((o) => ids.has(o.id));
    ownCarried = carried ? { ...carried, jobs: carried.jobs.filter((j) => tasks.has(j.taskId)), done: (carried.done ?? []).filter((j) => tasks.has(j.taskId)), closed: (carried.closed ?? []).filter((j) => tasks.has(j.taskId)) } : carried;
  }
  const shown = seesContactLists(actor.role) ? ownOrders : ownOrders.map((o) => maskContactFields(o));
  return NextResponse.json({
    ok: true, live: true, orders: shown, contractors, summary: scoped && mine ? mine.summary : summary, ringForApproval: ringForApproval.filter((id) => !scoped || ownOrders.some((o) => o.id === id)), mine,
    /* True when this is only the person's own: the page has no Everyone to offer. */
    scoped,
    carried: ownCarried?.jobs ?? [],
    /* Planned jobs a certificate on file has since finished (5 Oct 2026). */
    carriedDone: ownCarried?.done ?? [],
    /* Closed here by hand, with the note (Sean McMahon, 26 Oct 2026). Off the board and its figures. */
    carriedClosed: ownCarried?.closed ?? [],
    carriedReadAt: carried?.readAt ?? null,
    ...(carried ? {} : { carriedError: "The jobs copied across from the old system couldn't be read just now, so the figures leave them out. Try again in a minute." }),
    ...(carried?.certsUnchecked ? { carriedWarning: "We couldn't check which planned jobs a certificate has since finished, so a few finished ones may be counted as open just now. Try again in a minute." } : {}),
    ...(mine ? {} : { mineFailed: true }),
    /* The month-ago snapshot is the whole business's: no delta against an agent's own. */
    lastMonth: scoped ? null : lastMonth?.summary ?? null,
    lastMonthOn: lastMonth?.day ?? null,
    canCorporate: can(actor.role, "see:business"),
    /* The office says an invoice is on the payment run (James, 21 Oct 2026). */
    canPayrun: can(actor.role, "see:everything"),
  });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as (Partial<NewOrder> & { rexpmTaskId?: string; rexpmReportedOn?: string | null; rexpmDueOn?: string | null }) | null;
  if (!b || !b.propertyName?.trim() || !b.title?.trim() || !b.category) {
    return NextResponse.json({ ok: false, error: "A job needs a property, a title and a category." }, { status: 400 });
  }
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    /* Taking on a job copied across from the old system: once only, and
       quietly - it was reported long ago and nobody needs telling again. */
    const taskId = typeof b.rexpmTaskId === "string" && b.rexpmTaskId ? b.rexpmTaskId : null;
    if (taskId && (await alreadyTakenOn(taskId))) {
      return NextResponse.json({ ok: false, error: "Someone has already taken this job on." }, { status: 409 });
    }
    const order = await createOrder({ ...b, kind: b.kind ?? "repair", propertyName: b.propertyName, title: b.title, category: b.category }, by);
    if (taskId) {
      await markTakenOn(order.id, { taskId, reportedOn: b.rexpmReportedOn ?? null, dueOn: b.rexpmDueOn ?? null });
      await logEvent(order.id, by, "note", "Taken on from the old system, where it was already in progress. Nobody was emailed.");
      return NextResponse.json({ ok: true, order, emails: [] });
    }
    /* Steps passed by with Skip for now (Howard, 12 Oct 2026): said on the
       timeline, so whoever opens the job knows what nobody checked. */
    const skipped = Array.isArray((b as { skipped?: unknown }).skipped)
      ? ((b as { skipped: unknown[] }).skipped).filter((x): x is string => typeof x === "string" && x.length < 60).slice(0, 8)
      : [];
    if (skipped.length) await logEvent(order.id, by, "note", `Raised with ${skipped.map((x) => x.toLowerCase()).join(" and ")} skipped for now. Check ${skipped.length === 1 ? "it" : "them"} on the job.`);
    /* The step emails, after the job is safe. Each outcome goes on the
       timeline so the sheet says who was told. */
    const emails = await emailsForMove(order, "raised", subject ?? actor).catch(() => []);
    for (const e of emails) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
    /* Quote first (Sean, 20 Oct 2026): the contractor is asked for a price,
       and no works order goes until it is approved. */
    if ((b as { askQuote?: unknown }).askQuote === true && order.contractorId && b.send !== true) {
      const out: MoveOut = {};
      /* Several asked at once from the raise screen (James, 22 Oct 2026); the picked one always among them. */
      const from = (b as { quoteFrom?: unknown }).quoteFrom;
      const ids = Array.isArray(from) ? [...new Set([order.contractorId, ...from.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length < 64)])].slice(0, 8) : [];
      const asked = await moveOrder(order.id, ids.length > 1 ? { action: "request_quote", contractorIds: ids } : { action: "request_quote" }, by, out);
      const sent = await emailsForMove(asked, "request_quote", subject ?? actor, out).catch(() => []);
      for (const e of sent) await logEvent(order.id, "TLE OS", "email", outcomeLine(e));
      return NextResponse.json({ ok: true, order: asked, emails: [...emails, ...sent] });
    }
    return NextResponse.json({ ok: true, order, emails });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not raise the job.") }, { status: 400 });
  }
}
