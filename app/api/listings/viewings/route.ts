import { NextRequest, NextResponse, after } from "next/server";
import { hasDb } from "@/lib/db";
import { TEST_REFUSAL, testDetails, testLandlord, testListingViewings, testPortals, testPublication } from "@/lib/test-listing-answers";
import { isTestId } from "@/lib/test-overlay";
import { whoIs } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";
import { forAgent } from "@/lib/agent-words";
import { fetchViewingsFor, leadIdsByContact, recordViewings, type Viewing } from "@/lib/rex-viewings";

/**
 * GET /api/listings/viewings?id=<listing id>&property=<property id>
 *
 * The listing's diary out of REX: every viewing (and appraisal, inspection)
 * booked against it or its sister listings on the same property, upcoming
 * and past, with who came and who took it. Read live, kept in os_viewings,
 * and each viewer filed as a lead if they were not one already.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const testId = req.nextUrl.searchParams.get("id");
  if (isTestId(testId)) {
    const t = await testListingViewings(Number(testId));
    return t ? NextResponse.json(t) : NextResponse.json({ ok: false, error: "That test listing has gone." }, { status: 404 });
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim() || null;
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: true, live: false, upcoming: [], past: [] });

  try {
    const all = await fetchViewingsFor(id, property);
    const contactIds = [...new Set(all.flatMap((v) => v.contacts.map((c) => c.id)))];
    let leadIds = await leadIdsByContact(contactIds);
    /* Kept AFTER the reply when every viewer already has a lead (2 Oct
       2026): the write is an upsert plus a statement per viewing, and the
       drawer waited for all of it on every open. A viewer the ledger does not
       hold yet is made a lead BY that write, so then it is waited for as
       before - a link to a lead that does not exist yet is a dead click. */
    const newViewers = all.some((v) => v.contacts.some((c) => !leadIds.has(c.id)));
    let written = false;
    if (hasDb() && all.length) {
      if (newViewers) {
        written = await recordViewings(all).then(() => true).catch(() => false);
        /* Read back, as before: the ids the write actually made. */
        if (written) leadIds = await leadIdsByContact(contactIds);
      }
      else after(() => recordViewings(all).catch(() => null));
    }
    const withLeads: Viewing[] = all.map((v) => ({
      ...v,
      contacts: v.contacts.map((c) => ({ ...c, leadId: leadIds.get(c.id) ?? null })),
    }));
    const now = Date.now();
    const upcoming = withLeads.filter((v) => new Date(v.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = withLeads.filter((v) => new Date(v.startsAt).getTime() < now);
    return NextResponse.json({ ok: true, live: true, upcoming, past, count: all.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? forAgent(actor, e.message, "The listings system did not answer. Try again in a minute.") : "The listings system did not answer. Try again in a minute." }, { status: 502 });
  }
}
