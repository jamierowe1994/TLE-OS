import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { rexConfigured } from "@/lib/rex";
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
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim() || null;
  if (!/^\d+$/.test(id)) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (!rexConfigured()) return NextResponse.json({ ok: true, live: false, upcoming: [], past: [] });

  try {
    const all = await fetchViewingsFor(id, property);
    await recordViewings(all).catch(() => null);
    const leadIds = await leadIdsByContact([...new Set(all.flatMap((v) => v.contacts.map((c) => c.id)))]);
    const withLeads: Viewing[] = all.map((v) => ({ ...v, contacts: v.contacts.map((c) => ({ ...c, leadId: leadIds.get(c.id) ?? null })) }));
    const now = Date.now();
    const upcoming = withLeads.filter((v) => new Date(v.startsAt).getTime() >= now).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = withLeads.filter((v) => new Date(v.startsAt).getTime() < now);
    return NextResponse.json({ ok: true, live: true, upcoming, past, count: all.length });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "REX didn't answer." }, { status: 502 });
  }
}
