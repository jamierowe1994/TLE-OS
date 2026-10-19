import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { recordRtr, rtrFor, rtrLet } from "@/lib/application-rtr";
import { record } from "@/lib/audit";

/**
 * GET  → the right to rent expiry recorded for each tenant on a let
 *        (lib/application-rtr), for the let's own page.
 * POST { tenant, until: "YYYY-MM-DD" | null, noTimeLimit } → record one on
 *        the let (Kirstie Mulholland, 16 Oct 2026, ticket 066bb29e: a field,
 *        not only Steve). Kirstie checks it from /right-to-rent.
 *
 * Only for somebody who may open the let - the same rule as its people.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const got = await rtrLet(id, actor);
  if (!got.ok) return NextResponse.json({ ok: false, error: got.error }, { status: 403 });
  if (got.scottish) return NextResponse.json({ ok: true, scottish: true, records: [] });
  const records = await rtrFor(id).catch(() => null);
  if (!records) return NextResponse.json({ ok: false, error: "The right to rent dates couldn't be read just now." }, { status: 502 });
  /* Pre-tenancy checks each date (ticket 066bb29e); the page offers it to them. */
  return NextResponse.json({ ok: true, scottish: false, records, canVerify: can(actor.role as never, "see:pretenancy") });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (subject && subject.id !== actor.id) return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { tenant?: unknown; until?: unknown; noTimeLimit?: unknown } | null;
  const noTimeLimit = b?.noTimeLimit === true;
  const until = noTimeLimit ? null : String(b?.until ?? "").trim() || null;
  const r = await recordRtr(id, String(b?.tenant ?? ""), until, noTimeLimit, actor, "screen").catch(() => null);
  if (!r) return NextResponse.json({ ok: false, error: "That couldn't be saved just now. Try again in a minute." }, { status: 500 });
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
  await record({
    kind: "rtr_expiry_recorded",
    actorId: actor.id,
    actorEmail: actor.email,
    subjectEmail: r.record.tenantEmail,
    detail: `${r.property} · ${r.record.tenant} · ${r.record.noTimeLimit ? "no time limit" : `until ${r.record.rightUntil}`} · let ${id} · on screen`,
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, record: r.record });
}
