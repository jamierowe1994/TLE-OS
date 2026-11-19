import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { recordFact } from "@/lib/property-facts";
import { DEPOSIT_FIELDS, EDITABLE } from "@/lib/deposit-audit";
import { filesUnder } from "@/lib/clean-sweep";
import { VIEW_AS_COOKIE, assertNotViewingAs, ViewingAsRefused } from "@/lib/view-as";

/**
 * POST /api/admin/deposits/<home id> - set one deposit value on a home from
 * Admin > Deposits, or mark the home's deposit as checked.
 *
 *   { field, value }   value "" clears it
 *   { checked: true }  the person has checked every deposit value against the scheme
 *
 * Written into the OS's own record of the home (os_property_facts) as source
 * 'manual', which wins over every imported value (lib/property-facts). The
 * value it replaced is kept in checked_against, so nothing typed over is lost
 * without trace. The certificate itself is uploaded through the clean sweep's
 * file route (field doc_deposit_cert), which Admin can use.
 *
 * Nothing leaves the OS: no scheme, REX, Propoly or PayProp write, no email.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** GET: the certificate and prescribed information files on file for the home. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor || !can(actor.role, "admin:open")) return NextResponse.json({ ok: false, error: "Only Admin can see the deposit register." }, { status: 403 });
  const { id } = await ctx.params;
  if (!/^[\w-]{1,80}$/.test(id)) return NextResponse.json({ ok: false, error: "No such home." }, { status: 404 });
  try {
    const files = await filesUnder(`documents/property-${id}/doc_deposit_cert/`);
    return NextResponse.json({ ok: true, files });
  } catch (e) {
    console.error("[deposits] files", e instanceof Error ? e.message : e);
    return NextResponse.json({ ok: false, error: "The files couldn't be listed just now." }, { status: 500 });
  }
}
const DATES = new Set(["deposit_protected_on", "deposit_pi_served_on"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!can(actor.role, "admin:open")) return NextResponse.json({ ok: false, error: "Only Admin can change the deposit register." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: "You're viewing as someone else. Switch back to change anything." }, { status: 403 });
    throw e;
  }

  const { id } = await ctx.params;
  const home = await q<{ id: string }>(`SELECT id FROM os_properties WHERE id = $1 AND active`, [id]).catch(() => []);
  if (!home.length) return NextResponse.json({ ok: false, error: "That home isn't on the book." }, { status: 404 });

  const by = actor.name || actor.email;
  const body = (await req.json().catch(() => ({}))) as { field?: unknown; value?: unknown; checked?: unknown };

  if (body.checked === true) {
    await q(
      `UPDATE os_property_facts SET verified_at = NOW(), verified_by = $3
        WHERE property_id = $1 AND field = ANY($2) AND (value IS NOT NULL OR file_key IS NOT NULL)`,
      [id, [...DEPOSIT_FIELDS], by]
    );
    return NextResponse.json({ ok: true });
  }

  const field = typeof body.field === "string" ? body.field : "";
  if (!EDITABLE.has(field)) return NextResponse.json({ ok: false, error: "That can't be changed here." }, { status: 400 });
  let value = typeof body.value === "string" ? body.value.trim().slice(0, field === "deposit_notes" ? 1000 : 200) : "";

  if (value && DATES.has(field)) {
    const d = YMD.test(value) ? new Date(`${value}T12:00:00Z`) : null;
    /* A real calendar date (no 31 June), not in the future, not before deposit protection began (2007). */
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (!d || Number.isNaN(+d) || d.toISOString().slice(0, 10) !== value || value > today || value < "2007-04-06") {
      return NextResponse.json({ ok: false, error: "Use a real date, no later than today." }, { status: 400 });
    }
  }
  if (value && field === "deposit_amount") {
    const n = Number(value.replace(/[£,\s]/g, ""));
    if (!Number.isFinite(n) || n < 0 || n > 100_000) return NextResponse.json({ ok: false, error: "Type the amount in pounds, for example 950." }, { status: 400 });
    value = String(Math.round(n * 100) / 100);
  }
  if (value && field === "deposit_registered_by" && !/^(agent|landlord)$/.test(value)) {
    return NextResponse.json({ ok: false, error: "Registered by is the agent (us) or the landlord." }, { status: 400 });
  }
  if (value && field === "deposit_ref") value = value.replace(/\s+/g, " ");

  const before = await q<{ value: string | null; source: string | null }>(
    `SELECT value, source FROM os_property_facts WHERE property_id = $1 AND field = $2`,
    [id, field]
  );
  const old = before[0];
  await recordFact({ propertyId: id, field, value: value || null, source: "manual", by });
  const changed = old && old.value && old.value !== (value || null);
  await q(
    `UPDATE os_property_facts SET verified_at = NOW(), verified_by = $3${changed ? ", checked_against = $4" : ""}
      WHERE property_id = $1 AND field = $2`,
    changed ? [id, field, by, `Was ${old!.value} (${old!.source ?? "unknown"})`.slice(0, 500)] : [id, field, by]
  );
  return NextResponse.json({ ok: true });
}
