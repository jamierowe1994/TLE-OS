import { NextRequest, NextResponse } from "next/server";
import { handoffFor } from "@/lib/deal-handoff";
import { ensureHandoverTodos, handoverMode, handoversFor, runHandover } from "@/lib/handover";
import { dealDraftFor, DEAL_TEMPLATES, DEPOSIT_SCHEMES, PAYMENT_SCHEDULES, SERVICE_LEVELS, TENANCY_TYPES, type DealTerms } from "@/lib/handover-deal";
import { switchOn } from "@/lib/switches";
import { rexConfigured } from "@/lib/rex";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { getApplicationById } from "@/lib/applications";
import { decisionsFor } from "@/lib/offer-decisions";
import { can } from "@/lib/roles";
import type { OsUser } from "@/lib/users";

/**
 * GET  /api/handoff?application=37709 → the packet, what's missing, the mode,
 *                                       and the last few runs
 *                                       and, with the deal switch on, the
 *                                       deal's terms for the agent to check
 * POST /api/handoff { applicationId, force?, rehearse?, propertyUuid?, newProperty?, deal? }
 *                                     → run the handover ("Push to Propoly")
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

/**
 * An agent pushes their own applications only (9 Oct 2026) - the same test
 * the journey route makes: the application names its agent. The office and
 * owners push any.
 */
function isOffice(me: OsUser) {
  return can(me.role, "staff:internal");
}
function notTheirs(me: OsUser, agent: string | null | undefined): string | null {
  if (isOffice(me) || !agent) return null;
  return agent.trim().toLowerCase() === (me.name ?? "").trim().toLowerCase() ? null : `That application is ${agent.split(/\s+/)[0]}'s.`;
}

export async function GET(req: NextRequest) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
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
    const app = await getApplicationById(id).catch(() => null);
    const refused = notTheirs(me, app?.agent);
    if (refused) return NextResponse.json({ error: refused }, { status: 403 });
    const [mode, runs, dealOn] = await Promise.all([handoverMode(), handoversFor(id, 5), switchOn("handover_deal")]);
    /* The deal the push would start, for the agent to check first. Only
       when the push would really start one. */
    const draft = mode === "live" && dealOn ? await dealDraftFor(handoff).catch(() => null) : null;
    return NextResponse.json({
      ...handoff,
      mode,
      runs,
      deal: draft ? { ...draft, templates: DEAL_TEMPLATES, services: SERVICE_LEVELS, schedules: PAYMENT_SCHEDULES, tenancyTypes: TENANCY_TYPES, schemes: DEPOSIT_SCHEMES } : null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const me = await who(req);
  if (!me) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ error: e.message }, { status: 423 });
    throw e;
  }
  type Body = { applicationId?: string; force?: boolean; rehearse?: boolean; propertyUuid?: string; newProperty?: boolean; deal?: Partial<DealTerms> };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!body.applicationId) {
    return NextResponse.json({ error: "applicationId is required" }, { status: 400 });
  }

  /* Whose it is, and whether it has been accepted - here or in REX. Before
     9 Oct 2026 only REX's own "accepted" showed the button, so an offer the
     agent accepted in the OS sat with no way forward. */
  const app = await getApplicationById(body.applicationId).catch(() => null);
  if (!app) return NextResponse.json({ error: `No application ${body.applicationId}.` }, { status: 404 });
  const refused = notTheirs(me, app.agent);
  if (refused) return NextResponse.json({ error: refused }, { status: 403 });
  if (!body.rehearse && app.status !== "accepted") {
    const mine = (await decisionsFor([`rex:${app.id}`]).catch(() => new Map())).get(`rex:${app.id}`);
    if (mine?.decision !== "accepted") {
      return NextResponse.json({ error: "Accept the offer first. Only an accepted offer goes to Propoly." }, { status: 409 });
    }
  }
  /* Force sends a second live run. Only the office, with the first in front of them. */
  if (body.force === true && !isOffice(me)) {
    return NextResponse.json({ error: "Only the office can push an application a second time." }, { status: 403 });
  }
  const uuid = typeof body.propertyUuid === "string" && /^[A-Za-z0-9-]{8,64}$/.test(body.propertyUuid) ? body.propertyUuid : null;

  try {
    void ensureHandoverTodos();
    const run = await runHandover(body.applicationId, {
      by: me.name || me.email || "unknown",
      /* The accepted emails go out from this person's own mailbox, so the
         handover needs the id and not just the name (16 Sep 2026). */
      byId: me.id ?? null,
      mode: body.rehearse ? "shadow" : undefined,
      force: body.force === true,
      propertyUuid: uuid,
      newProperty: body.newProperty === true,
      /* Checked field by field in lib/handover-deal withChanges. */
      deal: body.deal && typeof body.deal === "object" ? body.deal : null,
    });
    return NextResponse.json({ ok: run.status === "ok", run });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 409 });
  }
}
