import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { isScottish } from "@/lib/property-flags";
import { recordRtrOnHome, rtrForHome } from "@/lib/application-rtr";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * A sitting tenant's right to rent expiry on a home (Kirstie Mulholland,
 * 16 Oct 2026, ticket 066bb29e: "so they can chase the renewals").
 *
 *   GET  ?listing=<id>                       each tenant's newest record, the let's included
 *   POST { listingId, tenant, until | null, noTimeLimit }
 *
 * The home must be in the person's own book (the office's is everybody's).
 * Never on a Scottish home. Kept in the OS; audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Who = Awaited<ReturnType<typeof whoIs>>;

async function homeFor(req: NextRequest, who: Who, listingId: string) {
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return { error: "We can't tell which agent you are." as const };
  const { book } = await managedBookFor(scope.rexUserId);
  const p = book.properties.find((x) => String(x.listingId) === listingId);
  if (!p) return { error: "This home isn't in your book." as const };
  return { p };
}

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listingId = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  if (!listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const h = await homeFor(req, who, listingId);
    if ("error" in h) return NextResponse.json({ ok: false, error: h.error }, { status: 403 });
    if (isScottish(h.p.locality, h.p.name)) return NextResponse.json({ ok: true, scottish: true, records: [] });
    return NextResponse.json({ ok: true, scottish: false, records: await rtrForHome(listingId), canVerify: can(who.actor.role as never, "see:pretenancy") });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The right to rent dates couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!who || !actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (who?.subject && who.subject.id !== actor.id) return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { listingId?: unknown; tenant?: unknown; until?: unknown; noTimeLimit?: unknown } | null;
  const listingId = String(b?.listingId ?? "").trim();
  if (!listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const noTimeLimit = b?.noTimeLimit === true;
  const until = noTimeLimit ? null : String(b?.until ?? "").trim() || null;
  try {
    const h = await homeFor(req, who, listingId);
    if ("error" in h) return NextResponse.json({ ok: false, error: h.error }, { status: 403 });
    if (h.p.test) return NextResponse.json({ ok: false, error: "A test home keeps its own." }, { status: 400 });
    const r = await recordRtrOnHome(
      { listingId, property: h.p.name, locality: h.p.locality, agentName: h.p.agent?.name ?? "", tenants: h.p.tenants.map((t) => ({ name: t.name, email: t.email })) },
      String(b?.tenant ?? ""), until, noTimeLimit, actor
    );
    if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    await record({
      kind: "rtr_expiry_recorded",
      actorId: actor.id,
      actorEmail: actor.email,
      subjectEmail: r.record.tenantEmail,
      detail: `${r.property} · ${r.record.tenant} · ${r.record.noTimeLimit ? "no time limit" : `until ${r.record.rightUntil}`} · home ${listingId} · on screen`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, record: r.record });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be saved just now. Try again in a minute.") }, { status: 500 });
  }
}
