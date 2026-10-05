import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { switchOn } from "@/lib/switches";
import { alertRules, setAlertRule } from "@/lib/alert-prefs";
import { ALERT_TYPES, isAlertRule, isAlertType } from "@/lib/alert-types";

/**
 * James's say over phone alerts (5 Oct 2026), Admin > Phone Alerts.
 *   GET                       every kind, its rule, whether the master
 *                             "phone_alerts" switch is armed, and how many
 *                             people have a phone set up
 *   PATCH { type, rule }      off for everyone / on, each person chooses /
 *                             always on
 *
 * manage:switches, as the master switch itself: what buzzes the whole
 * office's pockets is the owner's call.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function read() {
  const [rules, armed, phones, offs] = await Promise.all([
    alertRules(),
    switchOn("phone_alerts"),
    q<{ people: string; phones: string }>(`SELECT COUNT(DISTINCT user_id)::text AS people, COUNT(*)::text AS phones FROM os_push_devices`).catch(() => []),
    /* How many people have switched each kind off for themselves. */
    q<{ k: string; n: string }>(
      `SELECT k, COUNT(*)::text AS n FROM os_user_prefs, jsonb_each(value) AS e(k, v)
        WHERE key = 'alerts.phone' AND jsonb_typeof(value) = 'object' AND v = 'false'::jsonb GROUP BY k`
    ).catch(() => []),
  ]);
  const off = new Map(offs.map((r) => [r.k, Number(r.n)]));
  return {
    armed,
    people: Number(phones[0]?.people ?? 0),
    phones: Number(phones[0]?.phones ?? 0),
    types: ALERT_TYPES.map((t) => ({ ...t, rule: rules[t.key] ?? "on", optedOut: off.get(t.key) ?? 0 })),
  };
}

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, ...(await read()) });
  } catch {
    return NextResponse.json({ ok: false, error: "The alert rules did not load." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { type?: unknown; rule?: unknown };
  if (!isAlertType(b.type) || !isAlertRule(b.rule)) return NextResponse.json({ ok: false, error: "Which alert, and off, on or always?" }, { status: 400 });
  await setAlertRule(b.type, b.rule, me.email);
  return NextResponse.json({ ok: true, ...(await read()) });
}
