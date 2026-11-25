import { after, NextRequest, NextResponse } from "next/server";
import { asText, jsonObject } from "@/lib/json-body";
import { whoIs } from "@/lib/admin";
import { requireOwner } from "@/lib/admin";
import { logBug, bugs, setBugState, attachShot, myReports, setBugPriority, setBugReviewAt } from "@/lib/pilot";
import { tellReporter } from "@/lib/bug-bot";
import { publicOrigin } from "@/lib/origin";
import { claudeConfigured, maySendToClaude, sendClaudeReply } from "@/lib/claude-tickets";
import { githubConfigured } from "@/lib/github-pr";

/**
 * Reporting something broken, and reading what's been reported.
 *
 * POST is open to ANY signed-in person — that is the entire point. A pilot
 * agent who hits something odd must be one click from telling us, from the
 * page it happened on. A form they have to go and find is a form that catches
 * the frustrations somebody was still angry about ten minutes later, which is
 * a biased and much smaller sample.
 *
 * GET ?mine=1 is each person's own reports. GET and PATCH are otherwise owner-only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const who = await whoIs(req);
  const { actor, subject, viewingAs } = who;
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const raw = await jsonObject(req);
  /* Typed and capped (Rig run 4, P-072, 10 Oct 2026): a two-million
     character report made Admin > Tickets thirteen million pixels wide, and
     {"body":123} was an empty 500. */
  const b = {
    body: asText(raw.body).slice(0, 10_000),
    path: asText(raw.path).slice(0, 500),
    kind: asText(raw.kind).slice(0, 40),
    context: raw.context && typeof raw.context === "object" && !Array.isArray(raw.context) && JSON.stringify(raw.context).length <= 20_000 ? (raw.context as Record<string, unknown>) : undefined,
    shot: raw.shot,
  };
  if (!b.body.trim()) {
    return NextResponse.json({ ok: false, error: "Tell us what happened." }, { status: 400 });
  }

  const id = await logBug({
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
  /* Tickets sort themselves (lib/ticket-sort, behind "ticketsort"): after the
     answer has gone, never in the reporter's way, and never thrown at them.
     Steve answers as them, so their own book is read from this request. */
  if (id && b.kind !== "auto") {
    const origin = publicOrigin(req);
    const reporter = { id: actor.id, email: actor.email, name: actor.name ?? null, role: actor.role };
    const ticket = { id, body: b.body.trim(), path: b.path, kind: b.kind || "bug", context: b.context };
    after(async () => {
      try {
        const { sortNewTicket } = await import("@/lib/ticket-sort");
        const { bookScope } = await import("@/lib/scope");
        await sortNewTicket(ticket, reporter, await bookScope(req, who), origin);
      } catch (e) {
        console.error("[ticket-sort]", id, e instanceof Error ? e.message : e);
      }
    });
  }
  return NextResponse.json({ ok: true, id });
}

/**
 * The picture, arriving after the words.
 *
 * Drawing the screen holds the browser's only thread, so a report that waited
 * for it kept somebody looking at a frozen window and, on a heavy page, never
 * went at all (14 Sep 2026). The words are posted first and the picture is put
 * on afterwards, here. Same rules as the POST: signed in, their own report,
 * a JPEG data URL and nothing else.
 */
export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });

  const b = (await req.json().catch(() => ({}))) as { id?: string; shot?: string };
  const fine =
    typeof b.shot === "string" &&
    b.shot.startsWith("data:image/jpeg;base64,") &&
    b.shot.length < 3_000_000;
  if (!b.id || !fine) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });

  const done = await attachShot(b.id, actor.id, b.shot!);
  return NextResponse.json({ ok: done });
}

export async function GET(req: NextRequest) {
  /* Your own reports, and where each has got to. Any signed-in person, and
     only ever the ACTOR's: a view-as must not show somebody else's. */
  if (req.nextUrl.searchParams.get("mine") === "1") {
    const { actor } = await whoIs(req);
    if (!actor) return NextResponse.json({ ok: false, error: "Not signed in." }, { status: 401 });
    return NextResponse.json({ ok: true, reports: await myReports(actor.id) });
  }
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });
  /* Whether Send to Claude shows (lib/claude-tickets): only to the person
     whose plan it runs on, and only once the routine is wired up. canPush:
     whether Push It Live can merge Claude's fix itself (lib/github-pr). */
  return NextResponse.json({
    bugs: await bugs(200),
    claude: { canSend: maySendToClaude(owner.email), ready: claudeConfigured(), canPush: maySendToClaude(owner.email) && githubConfigured() },
  });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  const { id, state, priority, sendReply, story, reviewAt, quiet } = (await req.json().catch(() => ({}))) as { id?: string; state?: string; priority?: string | null; sendReply?: boolean; story?: string; reviewAt?: string | null; quiet?: boolean };
  if (!id) return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  /* Review Later: out of Open until the day given, or back now with null (lib/pilot setBugReviewAt). */
  if (reviewAt !== undefined) {
    if (reviewAt !== null && !/^\d{4}-\d{2}-\d{2}$/.test(reviewAt)) return NextResponse.json({ ok: false, error: "A date, please." }, { status: 400 });
    await setBugReviewAt(id, reviewAt);
    return NextResponse.json({ ok: true });
  }
  /* Send Claude's Answer: the reply Claude wrote for somebody who asked how
     to do something goes to them, and the ticket closes. */
  if (sendReply === true) {
    const sent = await sendClaudeReply(id, publicOrigin(req)).catch(() => false);
    return NextResponse.json({ ok: sent, ...(sent ? {} : { error: "That answer couldn't be sent." }) }, { status: sent ? 200 : 409 });
  }
  /* The letter alone, from Tickets: A broken, B everything else, C a recommendation. */
  if (priority !== undefined && !state) {
    if (priority !== null && !["A", "B", "C"].includes(priority)) return NextResponse.json({ ok: false, error: "A, B or C." }, { status: 400 });
    await setBugPriority(id, (priority ?? null) as "A" | "B" | "C" | null);
    return NextResponse.json({ ok: true });
  }
  if (!["open", "ack", "fixed", "wontfix"].includes(state ?? "")) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  /* "How we fixed it", in plain words, from the Fixed, Tell Them box (9 Nov
     2026): kept on the ticket for the email and for Steve (lib/ticket-fixed). */
  if (state === "fixed" && typeof story === "string") {
    const { saveFixStory } = await import("@/lib/ticket-fixed");
    await saveFixStory(id, story).catch(() => null);
  }
  await setBugState(id, state!);
  /* That Sorted It (lib/ticket-sort, 25 Nov 2026): Steve's answer already
     reached them in his chat, so the ticket closes as fixed without the
     Fixed email or a second Steve message. */
  if (quiet === true && state === "fixed") return NextResponse.json({ ok: true, told: false });
  /* Fixed means live (15 Sep 2026): the person who reported it is told once,
     so they can try it again. Never fails the change of state. */
  const told = state === "fixed" ? await tellReporter(id, publicOrigin(req)).catch(() => false) : false;
  return NextResponse.json({ ok: true, told });
}
