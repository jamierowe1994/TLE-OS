import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { can } from "@/lib/roles";
import { rtrById, rtrChaseList, verifyRtr } from "@/lib/application-rtr";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * The right to rent renewals list (Kirstie Mulholland, 16 Oct 2026, ticket
 * 066bb29e): every overseas tenant's expiry, to chase the renewal before it
 * runs out, and Kirstie's check of each one.
 *
 *   GET            an agent's own tenants; the office's, everybody's
 *   PATCH { id }   checked: the office only (Kirstie, Michael, Josel, owners)
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const officeOf = (role: string) => can(role as never, "see:pretenancy");

export async function GET(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const me = who.subject ?? who.actor;
  try {
    const office = officeOf(me.role);
    return NextResponse.json({ ok: true, office, records: await rtrChaseList(me, office) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The right to rent dates couldn't be read just now.") }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (who?.subject && who.subject.id !== actor.id) return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  if (!officeOf(actor.role)) return NextResponse.json({ ok: false, error: "Pre-tenancy checks these." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = String(b?.id ?? "").trim();
  try {
    const done = await verifyRtr(id, actor);
    if (!done) {
      const was = await rtrById(id);
      return NextResponse.json(was?.verifiedAt ? { ok: true, record: was } : { ok: false, error: "That date isn't on file any more." }, { status: was ? 200 : 404 });
    }
    await record({
      kind: "rtr_expiry_verified",
      actorId: actor.id,
      actorEmail: actor.email,
      subjectEmail: done.tenantEmail,
      detail: `${done.property} · ${done.tenant} · ${done.noTimeLimit ? "no time limit" : `until ${done.rightUntil}`} · checked`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, record: done });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be saved just now. Try again in a minute.") }, { status: 500 });
  }
}
