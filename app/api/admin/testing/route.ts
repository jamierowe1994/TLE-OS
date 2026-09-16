import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";
import { allSwitches } from "@/lib/switches";
import { JOURNEYS, type TestMark, type TestRun } from "@/lib/testing-journeys";

/**
 * GET  → the journeys, every step's mark, the runs behind those marks, and the
 *        live state of any switch a step sits behind.
 * POST → one mark: { journey, step, result: "pass" | "fail", note }.
 *
 * Marks are made by a person and carry their name. A mark is never made by
 * the code, because the whole point of the page is that a human walked it.
 *
 * ── A log, not a board (16 Sep 2026) ─────────────────────────────────────
 *
 * Every mark is APPENDED to os_test_runs, and the mark a step shows is simply
 * its newest run. Before this, the second person to walk a step overwrote the
 * first, so a failure that was found and fixed left nothing behind - and on
 * Monday twelve people walk the same journeys. `clear` now takes back the
 * newest run only, so a mis-click is undone and the run before it stands
 * again, rather than a step's whole history disappearing on a stray press.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface Row extends Record<string, unknown> {
  id: string;
  journey: string;
  step: string;
  result: string;
  by_name: string;
  at: string | Date;
  note: string;
}

const shape = (r: Row): TestRun => ({
  id: r.id,
  journey: r.journey,
  step: r.step,
  result: r.result as "pass" | "fail",
  by: r.by_name,
  at: new Date(r.at).toISOString(),
  note: r.note,
});

/**
 * Every run, newest first. Capped: a step walked two hundred times is not two
 * hundred things to read, and the page shows the recent ones under each step
 * with a count. The cap is generous enough that a fortnight of pilot fits.
 */
async function runs(): Promise<TestRun[]> {
  if (!hasDb()) return [];
  const rows = await q<Row>(
    `SELECT id, journey, step, result, by_name, at, note FROM os_test_runs ORDER BY at DESC LIMIT 2000`
  );
  return rows.map(shape);
}

/** The mark on a step is its newest run. One pass over the list, already sorted. */
function latest(all: TestRun[]): TestMark[] {
  const seen = new Set<string>();
  const out: TestMark[] = [];
  for (const r of all) {
    const key = `${r.journey}/${r.step}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:wiring");
  if (!me) return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  const [all, switches] = await Promise.all([runs(), allSwitches().catch(() => [])]);
  const switchState: Record<string, { on: boolean; label: string }> = {};
  for (const s of switches) switchState[s.key] = { on: s.on, label: s.label };
  return NextResponse.json({ ok: true, journeys: JOURNEYS, marks: latest(all), runs: all, switches: switchState });
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

  const answer = async () => {
    const all = await runs();
    return NextResponse.json({ ok: true, marks: latest(all), runs: all });
  };

  /* Taking back the newest run, not the step's history. os_test_marks is kept
     in step with it so anything still reading the old table sees the truth. */
  if (body.clear) {
    await q(
      `DELETE FROM os_test_runs WHERE id = (
         SELECT id FROM os_test_runs WHERE journey = $1 AND step = $2 ORDER BY at DESC LIMIT 1)`,
      [journey.id, step.id]
    );
    const back = await q<Row>(
      `SELECT id, journey, step, result, by_name, at, note FROM os_test_runs
        WHERE journey = $1 AND step = $2 ORDER BY at DESC LIMIT 1`,
      [journey.id, step.id]
    );
    if (back[0]) {
      await q(
        `INSERT INTO os_test_marks (journey, step, result, by_name, at, note)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (journey, step) DO UPDATE SET result = EXCLUDED.result, by_name = EXCLUDED.by_name, at = EXCLUDED.at, note = EXCLUDED.note`,
        [journey.id, step.id, back[0].result, back[0].by_name, back[0].at, back[0].note]
      );
    } else {
      await q(`DELETE FROM os_test_marks WHERE journey = $1 AND step = $2`, [journey.id, step.id]);
    }
    return answer();
  }
  if (body.result !== "pass" && body.result !== "fail") {
    return NextResponse.json({ ok: false, error: "A mark is pass or fail." }, { status: 400 });
  }
  if (body.result === "fail" && !(body.note ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "Say what failed, so it can be fixed." }, { status: 400 });
  }
  const note = (body.note ?? "").trim();
  const by = me.name || me.email;
  await q(
    `INSERT INTO os_test_runs (id, journey, step, result, by_id, by_name, at, note)
     VALUES ($1,$2,$3,$4,$5,$6,NOW(),$7)`,
    [uid(), journey.id, step.id, body.result, me.id, by, note]
  );
  await q(
    `INSERT INTO os_test_marks (journey, step, result, by_name, at, note)
     VALUES ($1,$2,$3,$4,NOW(),$5)
     ON CONFLICT (journey, step) DO UPDATE SET result = EXCLUDED.result, by_name = EXCLUDED.by_name, at = NOW(), note = EXCLUDED.note`,
    [journey.id, step.id, body.result, by, note]
  );
  return answer();
}
