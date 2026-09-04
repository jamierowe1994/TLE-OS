import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { allSwitches } from "@/lib/switches";
import { JOURNEYS, type TestMark } from "@/lib/testing-journeys";

/**
 * GET  → the journeys, every step's mark, and the live state of any switch a
 *        step sits behind.
 * POST → one mark: { journey, step, result: "pass" | "fail", note }.
 *
 * Marks are made by a person and carry their name. A mark is never made by
 * the code, because the whole point of the page is that a human walked it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Row extends Record<string, unknown> {
  journey: string;
  step: string;
  result: string;
  by_name: string;
  at: string | Date;
  note: string;
}

async function marks(): Promise<TestMark[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(`SELECT journey, step, result, by_name, at, note FROM os_test_marks`);
  return rows.map((r) => ({
    journey: r.journey,
    step: r.step,
    result: r.result as "pass" | "fail",
    by: r.by_name,
    at: new Date(r.at).toISOString(),
    note: r.note,
  }));
}

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const [all, switches] = await Promise.all([marks(), allSwitches().catch(() => [])]);
  const switchState: Record<string, { on: boolean; label: string }> = {};
  for (const s of switches) switchState[s.key] = { on: s.on, label: s.label };
  return NextResponse.json({ ok: true, journeys: JOURNEYS, marks: all, switches: switchState });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database here." }, { status: 503 });
  let body: { journey?: string; step?: string; result?: string; note?: string; clear?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 });
  }
  const journey = JOURNEYS.find((j) => j.id === body.journey);
  const step = journey?.steps.find((s) => s.id === body.step);
  if (!journey || !step) return NextResponse.json({ ok: false, error: "Unknown step." }, { status: 400 });

  if (body.clear) {
    await q(`DELETE FROM os_test_marks WHERE journey = $1 AND step = $2`, [journey.id, step.id]);
    return NextResponse.json({ ok: true, marks: await marks() });
  }
  if (body.result !== "pass" && body.result !== "fail") {
    return NextResponse.json({ ok: false, error: "A mark is pass or fail." }, { status: 400 });
  }
  if (body.result === "fail" && !(body.note ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Say what failed, so it can be fixed." }, { status: 400 });
  }
  await q(
    `INSERT INTO os_test_marks (journey, step, result, by_name, at, note)
     VALUES ($1,$2,$3,$4,NOW(),$5)
     ON CONFLICT (journey, step) DO UPDATE SET result = EXCLUDED.result, by_name = EXCLUDED.by_name, at = NOW(), note = EXCLUDED.note`,
    [journey.id, step.id, body.result, me.name || me.email, (body.note ?? "").trim()]
  );
  return NextResponse.json({ ok: true, marks: await marks() });
}
