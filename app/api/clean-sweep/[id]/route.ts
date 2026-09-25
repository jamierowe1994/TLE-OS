import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb, q } from "@/lib/db";
import { isFactKey, SECTION_BY_KEY, sweepDetail, type SectionKey } from "@/lib/clean-sweep";
import { FIELD_BY_KEY, recordFact } from "@/lib/property-facts";

/**
 * One home in the clean sweep: GET its facts, papers and certificates; POST a
 * value the checker has found ({ field, value }) or the sign-off
 * ({ signOff: true, notes } / { signOff: false }). Whatever the checker types
 * is source 'manual' and wins over REX PM and Propoly - they looked.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  if (!can(actor.role, "see:clean-sweep")) return { error: NextResponse.json({ ok: false, error: "The clean sweep is for the office." }, { status: 403 }) };
  if (!hasDb()) return { error: NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 }) };
  return { actor };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if (g.error) return g.error;
  const { id } = await ctx.params;
  const detail = await sweepDetail(id);
  if (!detail) return NextResponse.json({ ok: false, error: "No such home." }, { status: 404 });
  return NextResponse.json({ ok: true, ...detail });
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await gate(req);
  if (g.error) return g.error;
  const { id } = await ctx.params;
  const by = g.actor!.name || g.actor!.email;
  const body = (await req.json().catch(() => ({}))) as {
    field?: string; value?: string; na?: boolean; signOff?: boolean; notes?: string;
    verify?: string[]; section?: SectionKey; done?: boolean;
  };
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });

  /*
   * The second pass: tick what is right ({ verify: [fields] }; a certificate is
   * "cert_gas" etc.) and, with { section, done: true }, sign that section off.
   * When all three sections are signed, the home is signed off as a whole.
   */
  if (Array.isArray(body.verify) || body.section) {
    const fields = (body.verify ?? []).map(String);
    const facts = fields.filter((f) => isFactKey(f));
    if (facts.length) {
      await q(`UPDATE os_property_facts SET verified_at = NOW(), verified_by = $3 WHERE property_id = $1 AND field = ANY($2) AND (value IS NOT NULL OR file_key IS NOT NULL)`, [id, facts, by]);
    }
    for (const c of fields.filter((f) => /^cert_(gas|eicr|epc)$/.test(f))) {
      await recordFact({ propertyId: id, field: `verify_${c}`, value: "Correct", source: "manual", by });
    }
    if (body.notes !== undefined && body.section && SECTION_BY_KEY.has(body.section)) {
      await recordFact({ propertyId: id, field: `check_notes_${body.section}`, value: body.notes.trim().slice(0, 2000) || null, source: "manual", by });
    }
    if (body.section && SECTION_BY_KEY.has(body.section)) {
      if (body.done === false) await q(`DELETE FROM os_property_facts WHERE property_id = $1 AND field = $2`, [id, `check_${body.section}`]);
      else if (body.done) await recordFact({ propertyId: id, field: `check_${body.section}`, value: today, source: "manual", by });
      const signed = await q<{ n: string }>(`SELECT count(*) n FROM os_property_facts WHERE property_id = $1 AND field IN ('check_compliance','check_tenancy','check_landlord') AND value IS NOT NULL`, [id]);
      if (Number(signed[0]?.n) === 3) await recordFact({ propertyId: id, field: "check_signed_off", value: today, source: "manual", by });
    }
    return NextResponse.json({ ok: true, ...(await sweepDetail(id)) });
  }

  if (typeof body.signOff === "boolean") {
    if (body.signOff) {
      await recordFact({ propertyId: id, field: "check_signed_off", value: today, source: "manual", by });
    } else {
      await q(`DELETE FROM os_property_facts WHERE property_id = $1 AND field = 'check_signed_off'`, [id]);
    }
    if (body.notes !== undefined) await recordFact({ propertyId: id, field: "check_notes", value: body.notes.trim().slice(0, 2000) || null, source: "manual", by });
    return NextResponse.json({ ok: true, ...(await sweepDetail(id)) });
  }

  const field = String(body.field ?? "");
  if (!isFactKey(field)) return NextResponse.json({ ok: false, error: "That is not one of the columns." }, { status: 400 });
  const kind = FIELD_BY_KEY.get(field)!.kind;
  /* "Not applicable" is an answer too: the column does not apply to this home. */
  const value = body.na ? "Not applicable" : String(body.value ?? "").trim().slice(0, 500);
  if (!value) return NextResponse.json({ ok: false, error: "Type something first." }, { status: 400 });
  if (!body.na && kind === "date" && !YMD.test(value)) return NextResponse.json({ ok: false, error: "Pick a date." }, { status: 400 });
  if (!body.na && kind === "number" && !/^\d+$/.test(value)) return NextResponse.json({ ok: false, error: "A whole number, please." }, { status: 400 });
  await recordFact({ propertyId: id, field, value, source: "manual", by });
  /* A person typed it, so it is checked. */
  await q(`UPDATE os_property_facts SET verified_at = NOW(), verified_by = $3 WHERE property_id = $1 AND field = $2`, [id, field, by]);
  return NextResponse.json({ ok: true, ...(await sweepDetail(id)) });
}
