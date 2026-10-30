import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { rexCall, rexConfigured } from "@/lib/rex";
import { ensureRexLink } from "@/lib/users";
import { getPropolyCompletes } from "@/lib/business/propoly-deals";
import { getApplications } from "@/lib/applications";
import { sameHome } from "@/lib/address-parse";
import { hasDb, q } from "@/lib/db";

/**
 * A listing that has left the market, for the listing page (Rhiannon, 29 Oct 2026).
 *
 * The page opens what is on the Listings board or in its archive. 12b Cliff
 * Road was let on 22 Oct (tenant find), so it was in neither, and clicking an
 * old enquiry for it said "This listing isn't in your book - it may belong to
 * another agent". It was hers. This says what happened to it instead: let, and
 * when, on what service, at what rent, and where the let is.
 *
 * GET ?id=843616 -> { ok, state, address, agent, let, applicationId }
 *
 * Read only. An agent is told only about their own listing, the same test as
 * the rest of the listing screens; the office and owners see every one.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });

  const res = await rexCall("Listings", "read", { id }).catch(() => null);
  if (!res?.ok || !res.result) return NextResponse.json({ ok: false, error: "That listing could not be read just now. Try again in a minute." }, { status: 502 });
  const l = res.result as Row;
  const agent = (l.listing_agent_1 ?? null) as Row | null;
  const agentId = str(agent?.id);

  if (actor.role === "agent") {
    const mine = await ensureRexLink(actor).catch(() => null);
    if (!agentId || !mine || agentId !== String(mine)) return NextResponse.json({ ok: false, error: "This listing isn't in your book." }, { status: 404 });
  }

  const property = (l.property ?? {}) as Row;
  const address = str(property.system_search_key) || str(l.system_search_key);
  const state = str(l.system_listing_state) || null;

  /* The let, where Propoly finished one on this home: the newest move-in. */
  const done = state === "leased" && address ? ((await getPropolyCompletes().catch(() => null)) ?? []).filter((c) => c.address && sameHome(address, c.address)) : [];
  const last = done.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0] ?? null;

  /* Its let file, when there is one: the newest accepted application on it. */
  const apps = state === "leased" ? await getApplications(300).catch(() => []) : [];
  const app = apps
    .filter((a) => String(a.listingId ?? "") === String(id) && a.status === "accepted")
    .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""))[0];
  /* A let that has moved in has left the open board: the one the OS pushed for this listing. */
  const pushed =
    !app && state === "leased" && hasDb()
      ? (await q<{ application_id: string }>(
          `SELECT application_id FROM os_handovers WHERE mode = 'live' AND packet->>'listingId' = $1 ORDER BY started_at DESC LIMIT 1`,
          [String(id)]
        ).catch(() => []))[0]?.application_id ?? null
      : null;

  return NextResponse.json(
    {
      ok: true,
      state,
      address,
      agent: str(agent?.name) || null,
      let: last ? { date: last.date, service: last.service, rentPcm: last.rentPcm } : null,
      applicationId: app?.id ?? pushed,
    },
    { headers: { "cache-control": "private, no-store" } }
  );
}
