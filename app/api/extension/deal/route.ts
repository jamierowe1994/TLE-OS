import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { resolveDealAccess } from "@/lib/business/deal-access";
import { PORTAL_STAGE_BY_KEY, portalStageOf } from "@/lib/business/propoly-stages";
import { publicOrigin } from "@/lib/origin";

/**
 * "IS THIS DEAL IN TLE OS?" - asked by the TLE OS Chrome extension from a
 * Propoly deal page (James, 8 Nov 2026, phase 1 of the extension).
 *
 *   GET /api/extension/deal?id=<Propoly deal uuid>
 *
 * The extension sends the deal's uuid from the address bar
 * (tle.propoly.com/deals/<uuid>) with the agent's own os_session cookie, so
 * the answer follows the same rules as the let page: an agent sees their own
 * deals, pre-tenancy and the owners see every deal (lib/business/deal-access).
 *
 * Reads only. Nothing here asks Propoly anything: the deal comes from the
 * watcher's saved copy of the book (lib/business/propoly-deals), which is why
 * a deal made a minute ago can honestly be "not seen yet".
 *
 * Answers, always JSON:
 *   401 { signedIn: false }                         sign in to TLE OS first
 *   503 { error }                                   the saved copy can't be read
 *   200 { found: false }                            not in the book (yet)
 *   200 { found: true, yours: false }               another agent's deal
 *   200 { found: true, yours: true, deal: {...} }   the let, with a link to it
 */

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function answer(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(req: NextRequest) {
  const id = String(req.nextUrl.searchParams.get("id") ?? "").trim().toLowerCase();
  const { actor } = await whoIs(req);
  if (!actor) return answer({ ok: false, signedIn: false, error: "Sign in to TLE OS first." }, 401);
  const me = { name: actor.name || actor.email };
  /* No id: the extension's own "am I signed in?" check, for its toolbar pop-up. */
  if (!id) return answer({ ok: true, signedIn: true, me });
  if (!UUID.test(id)) return answer({ ok: false, signedIn: true, me, error: "That isn't a Propoly deal address." }, 400);

  const access = await resolveDealAccess(req, id);
  if (!access.ok) {
    if (access.status === 404) return answer({ ok: true, signedIn: true, me, found: false });
    if (access.status === 403) return answer({ ok: true, signedIn: true, me, found: true, yours: false });
    if (access.status === 401) return answer({ ok: false, signedIn: false, error: "Sign in to TLE OS first." }, 401);
    return answer(
      { ok: false, signedIn: true, me, error: "TLE OS can't read its copy of Propoly just now. Try again in a minute." },
      503
    );
  }

  const d = access.deal;
  const stage = PORTAL_STAGE_BY_KEY[portalStageOf(d.statusKey)];
  const pushed = await pushOf(id);
  const origin = publicOrigin(req);
  /* The let the OS pushed this deal from, or the deal itself: the let page
     opens on a Propoly deal's uuid as well as an application's. */
  const letId = pushed?.applicationId ?? id;

  return answer({
    ok: true,
    signedIn: true,
    me,
    found: true,
    yours: true,
    deal: {
      id,
      address: [d.app.propertyName, d.app.locality].filter(Boolean).join(", "),
      stage: d.statusKey === "cancelled" ? "Cancelled" : stage?.label ?? d.app.status,
      cancelled: d.statusKey === "cancelled",
      agent: d.managerName,
      tenants: d.app.tenants.map((t) => t.name).filter(Boolean),
      moveIn: d.app.startDate ? d.app.startDate.slice(0, 10) : null,
      pushed: pushed ? { by: pushed.by, at: pushed.at } : null,
      letUrl: `${origin}/applications/${encodeURIComponent(letId)}`,
    },
  });
}

/** The live Push to Propoly that started this deal, if the OS started it. */
async function pushOf(dealId: string): Promise<{ applicationId: string; by: string | null; at: string } | null> {
  if (!hasDb()) return null;
  const rows = await q<{ application_id: string; triggered_by: string; started_at: string }>(
    `SELECT application_id, triggered_by, started_at
       FROM os_handovers h
      WHERE mode = 'live'
        AND jsonb_typeof(steps) = 'array'
        AND EXISTS (SELECT 1 FROM jsonb_array_elements(h.steps) s
                     WHERE s->>'id' = 'deal' AND s->>'state' = 'ok' AND lower(s->'response'->>'uuid') = $1)
      ORDER BY started_at DESC
      LIMIT 1`,
    [dealId]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return null;
  return {
    applicationId: r.application_id,
    by: r.triggered_by || null,
    at: new Date(r.started_at).toISOString(),
  };
}
