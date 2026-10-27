import { NextRequest, NextResponse } from "next/server";
import { maskContactFields, seesContactLists } from "@/lib/contact-mask";
import { publicError } from "@/lib/public-error";
import { hasDb, q } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { widenForOverview } from "@/lib/overview-access";
import { bookScope } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { factsByRexId } from "@/lib/os-properties";
import { getComplianceBook } from "@/lib/compliance-cache";
import { isOurs } from "@/lib/compliance";
import { lastClosedByHome, lastImport, openTasks } from "@/lib/rexpm-tasks";
import {
  createInspection, dueFromTasks, dueList, inspectionRules, listInspections, logEvent, moveInspection, openFindings, summarise,
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
 * finds out a home has not been visited in two years. *
 * Until the team books visits here, the due list is REX PM's own open
 * inspection tasks instead (rules.source "rex-pm", 1 Oct 2026), read across
 * by /api/admin/rexpm-tasks, so the figures match REX PM's dashboard.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const who = await whoIs(req);
  const { actor, subject } = who;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  /* Opened from its Overview tile: the same book the tile counted. */
  await widenForOverview(req, who);
  if (!hasDb()) {
    return NextResponse.json({ ok: true, live: false, reason: "No database on this environment.", inspections: [], due: [], actions: [], rules: null, summary: null });
  }

  const kindRaw = req.nextUrl.searchParams.get("kind");
  const kind = (KIND_IDS as readonly string[]).includes(kindRaw ?? "") ? (kindRaw as Kind) : null;
  const open = req.nextUrl.searchParams.get("open") === "1";
  const propertyId = req.nextUrl.searchParams.get("property");

  /* Read without a safety net (1 Oct 2026): listInspections used to answer []
     on a database error, and the due list then counted every home as never
     visited - everything due, everything overdue, as if true. Now a failed
     read is an error the screen shows. */
  let inspections: Awaited<ReturnType<typeof listInspections>>;
  let rules: Awaited<ReturnType<typeof inspectionRules>>;
  let actions: Awaited<ReturnType<typeof openFindings>>;
  try {
    [inspections, rules, actions] = await Promise.all([
      listInspections({ kind, open, propertyId, strict: true }),
      inspectionRules(),
      openFindings(),
    ]);
  } catch {
    return NextResponse.json({ ok: false, error: "The inspections couldn't be read just now, so nothing is shown rather than a list that might be wrong. Try again in a minute." }, { status: 503 });
  }

  /* The due list needs the managed book. When REX is not connected, or the
     person is not linked to a REX user, we say so instead of showing a due
     list built from nothing - an empty board reads as "nothing is due". */
  let due: ReturnType<typeof dueList> = [];
  let bookError: string | null = null;
  /* The homes in this person's own book, for which inspections keep their
     contacts whole (null: the whole business). */
  let ownHomes: Set<string> | null = new Set();
  /* Where the due list came from, and when REX PM was last read, for the
     line under the figures. See lib/rexpm-tasks. */
  const read = rules.source === "rex-pm" ? await lastImport("inspection").catch(() => null) : null;
  const fromTasks = rules.source === "rex-pm" && !!read;
  if (!rexConfigured()) {
    bookError = "REX isn't connected on this environment, so nothing can be worked out as due.";
  } else {
    const scope = await bookScope(req);
    if (scope.unlinked) {
      bookError = "We can't tell which REX user you are, so we can't work out what's due on your book.";
    } else {
      try {
        const [{ book }, facts, comp] = await Promise.all([managedBookFor(scope.rexUserId), factsByRexId(), getComplianceBook()]);
        ownHomes = scope.rexUserId
          ? new Set(book.properties.flatMap((p) => [String(p.propertyId ?? ""), String(p.listingId ?? "")]).filter(Boolean))
          : null;
        const hmoIds = new Set([...facts.entries()].filter(([, f]) => f.hmo).map(([id]) => id));
        /* Only the homes we actually look after (James, 18 Sep 2026): the
           board said 257 when the real job was 150. REX's leased listings
           carry every home ever let, including tenant-find-only lets and the
           books of agents who have left, and none of those get a visit from
           us. The scope is the compliance screen's own - managed in REX PM,
           not let only, agent still here - so the two screens agree about
           which homes are ours. A home the managed book has under a second
           REX id is covered by the one the compliance book knows. */
        const ours = new Set(comp.book.properties.filter(isOurs).map((p) => String(p.id)));
        if (fromTasks) {
          /* REX PM's open tasks are the list (1 Oct 2026), so the figures
             match its dashboard. An agent sees the tasks on homes in their
             own book, and any REX PM has under their name. */
          const tasks = await openTasks("inspection");
          const me = ((subject ?? actor).name || "").trim().toLowerCase();
          const mine = scope.rexUserId
            ? new Set(book.properties.map((p) => String(p.propertyId ?? "")).filter(Boolean))
            : null;
          const scoped = mine ? tasks.filter((t) => (t.rexPropertyId && mine.has(t.rexPropertyId)) || (me && t.managedBy.trim().toLowerCase() === me)) : tasks;
          due = dueFromTasks(scoped, inspections, book.properties, hmoIds);
        } else {
          const prior = await lastClosedByHome("inspection");
          due = dueList(book.properties.filter((p) => ours.has(String(p.propertyId ?? p.listingId))), inspections, rules, hmoIds, prior);
        }
      } catch (e) {
        bookError = publicError(e, "REX didn't answer, so the due list is missing.");
      }
    }
  }

  /* Who can be sent (3 Oct 2026): the team, for the inspector on a booking,
     with the person asking first. Names only. */
  const me = subject ?? actor;
  const team = await q<{ id: string; name: string }>(`SELECT id, name FROM os_users WHERE name <> '' ORDER BY name`).catch(() => []);

  /* Every inspection in the business is listed, so an agent's copy carries
     the contacts shortened on homes outside their own book (lib/contact-mask,
     10 Oct 2026). The due list is their own book already. */
  const full = seesContactLists(actor.role) || ownHomes === null;
  const shownInspections = full
    ? inspections
    : inspections.map((i) => (ownHomes!.has(String(i.propertyId ?? "")) || ownHomes!.has(String(i.listingId ?? "")) ? i : maskContactFields(i)));
  return NextResponse.json({
    ok: true, live: true, inspections: shownInspections, due, actions, rules,
    me: { id: me.id, name: me.name || me.email },
    team: team.map((t) => ({ id: t.id, name: t.name })),
    summary: summarise(inspections, due),
    source: fromTasks ? "rex-pm" : "os",
    readAt: read?.at ?? null,
    ...(bookError ? { bookError } : {}),
  });
}

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as (Partial<NewInspection> & { doneOn?: string; doneBy?: string }) | null;
  if (!b || !b.propertyName?.trim()) return NextResponse.json({ ok: false, error: "An inspection needs a property." }, { status: 400 });
  const kind = (KIND_IDS as readonly string[]).includes(b.kind ?? "") ? (b.kind as Kind) : "interim";
  /* Already done (Rhiannon Dodge, 12 Oct 2026): a due row the agent has
     already visited - done in the old system after its tasks were copied
     across, which the board cannot see. The day is checked before anything
     is written, so a bad date raises nothing. */
  let doneAt: string | null = null;
  if (b.doneOn != null) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b.doneOn).trim());
    const d = m ? new Date(`${m[0]}T12:00:00Z`) : null;
    if (!d || Number.isNaN(d.getTime())) return NextResponse.json({ ok: false, error: "Pick the day the visit was done." }, { status: 400 });
    if (d.getTime() > Date.now() + 12 * 3600_000) return NextResponse.json({ ok: false, error: "A visit can't be done on a day that hasn't happened yet." }, { status: 400 });
    doneAt = d.getTime() > Date.now() ? new Date().toISOString() : d.toISOString();
  }
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const { doneOn: _doneOn, doneBy: _doneBy, ...fields } = b;
    let inspection = await createInspection({ ...fields, kind, propertyName: b.propertyName, rexpmTaskId: typeof b.rexpmTaskId === "string" ? b.rexpmTaskId : null }, by);
    if (doneAt) {
      /* Visited on that day, then closed: the write-up lives where the visit
         was made, so nothing is left here asking for one. No emails - neither
         move sends any. The cadence counts from this day from now on, and a
         copied-across task it came from leaves the due list. */
      /* Who made it, where that was somebody else (Kayleigh Wright, 19 Oct
         2026: visits done in Inventory Base, recorded here afterwards). */
      await moveInspection(inspection.id, { action: "visited", at: doneAt, inspector: String(b.doneBy ?? "").trim().slice(0, 80) || undefined }, by);
      await logEvent(inspection.id, by, "note", "Recorded as already done: the visit was made and written up before it was booked here.");
      inspection = await moveInspection(inspection.id, { action: "close" }, by);
    }
    return NextResponse.json({ ok: true, inspection });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not raise it.") }, { status: 400 });
  }
}
