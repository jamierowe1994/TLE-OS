import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { record } from "@/lib/audit";
import { forgetListing, readListingDetails } from "@/lib/listing-details";
import { invalidateListingBook } from "@/lib/listings-cache";
import { rexCall, rexConfigured, rexWritesLocked } from "@/lib/rex";
import { lettingsAgents } from "@/lib/rex-agents";
import { isTestId } from "@/lib/test-overlay";
import { q, hasDb } from "@/lib/db";

/**
 * Who a listing belongs to, and moving it to somebody else.
 *
 * James and Susan only (6 Oct 2026). 6 Ruskin Place was relisted in REX with
 * no Listing Agent, so it sat on nobody's board but the owner's, and the fix
 * meant a trip into REX while on a call with the agent. Now the file itself
 * says whose it is, and an owner or super admin picks somebody else.
 *
 *   GET  ?id=848794            → { agent, agents, canChange }
 *   POST { id, rexUserId }     → listing_agent_1 and the listing's REX owner
 *                                become that person, and so does the
 *                                property's REX owner, which is what decides
 *                                whose Portfolio a home sits in.
 *
 * Written as the office account rather than the person pressing it: the new
 * owner is somebody else, and REX checks the writer's rights on the record,
 * which an agent-scoped sign-in may not have on another agent's file.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAY_CHANGE = new Set(["owner", "super_admin"]);

const listingId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("id");
  if (isTestId(raw)) return NextResponse.json({ ok: true, agent: null, agents: [], canChange: false, test: true });
  const id = listingId(raw);
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });
  const canChange = MAY_CHANGE.has(actor.role) && !viewingAs;
  try {
    const [details, agents] = await Promise.all([
      readListingDetails(id, { cached: true }),
      canChange ? lettingsAgents().catch(() => []) : Promise.resolve([]),
    ]);
    return NextResponse.json(
      {
        ok: true,
        agent: details.agent.id ? { id: details.agent.id, name: details.agent.name } : null,
        agents: agents.map((a) => ({ id: a.id, name: a.name })),
        canChange,
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "The listing did not answer. Try again in a minute." }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!MAY_CHANGE.has(actor.role)) return NextResponse.json({ ok: false, error: "Changing who a listing belongs to is for James and Susan." }, { status: 403 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to change the owner." }, { status: 403 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; rexUserId?: unknown };
  if (isTestId(b.id)) return NextResponse.json({ ok: false, error: "A test listing has no owner to change." }, { status: 409 });
  const id = listingId(b.id);
  const to = typeof b.rexUserId === "string" || typeof b.rexUserId === "number" ? String(b.rexUserId) : "";
  if (!id || !/^\d+$/.test(to)) return NextResponse.json({ ok: false, error: "Pick a listing and a person." }, { status: 400 });

  const agents = await lettingsAgents().catch(() => []);
  const who = agents.find((a) => a.id === to);
  if (!who) return NextResponse.json({ ok: false, error: "That person is not one of the lettings agents." }, { status: 400 });
  if (rexWritesLocked("Listings", "update")) {
    return NextResponse.json({ ok: false, error: "Changing a listing is not switched on yet." }, { status: 423 });
  }

  let details;
  try {
    details = await readListingDetails(id);
  } catch {
    return NextResponse.json({ ok: false, error: "The listing did not answer, so nothing was changed. Try again in a minute." }, { status: 502 });
  }
  const from = details.agent.name ?? "nobody";

  const listing = await rexCall("Listings", "update", {
    data: { id: String(id), listing_agent_1: { id: to }, system_owner_user: { id: to } },
  });
  if (!listing.ok) {
    return NextResponse.json({ ok: false, error: "The listing did not move. Try again in a minute." }, { status: 502 });
  }

  /* The property too: a let home's Portfolio place follows its REX owner
     (lib/managed-book). A refusal here does not undo the listing half. */
  let property = "untouched";
  if (details.propertyId) {
    if (rexWritesLocked("Properties", "update")) property = "locked";
    else {
      const p = await rexCall("Properties", "update", { data: { id: details.propertyId, system_owner_user: { id: to } } });
      property = p.ok ? "moved" : `refused (${p.error ?? p.status})`;
    }
  }

  /* Every board re-reads REX: the old agent's must lose it and the new one's
     gain it, and the Portfolio books are keyed per agent the same way. */
  forgetListing(id);
  await invalidateListingBook();
  if (hasDb()) await q("DELETE FROM os_cache WHERE key LIKE 'portfolio:%'").catch(() => {});

  await record({
    kind: "listing_owner_changed",
    actorId: actor.id,
    actorEmail: actor.email,
    detail: `${id}: ${from} -> ${who.name}; property ${details.propertyId ?? "none"} ${property}`,
  });

  const after = await readListingDetails(id).catch(() => null);
  return NextResponse.json({
    ok: true,
    agent: after?.agent.id ? { id: after.agent.id, name: after.agent.name } : { id: to, name: who.name },
    property,
  });
}
