import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { alertRules, alertTypesFor, myAlerts, setMyAlert } from "@/lib/alert-prefs";
import { isAlertType, wantsAlert } from "@/lib/alert-types";

/**
 * What buzzes my phone (5 Oct 2026): the app's Profile > Phone Alerts list.
 *   GET                     every kind that can reach me, James's rule for
 *                           it and whether it is on for me
 *   POST { type, on }       my choice for one kind. A kind James has set to
 *                           off or always is not mine to change.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function read(userId: string, me: Parameters<typeof alertTypesFor>[0]) {
  const [rules, mine] = await Promise.all([alertRules(), myAlerts(userId)]);
  return alertTypesFor(me).map((t) => ({
    key: t.key,
    label: t.label,
    what: t.what,
    rule: rules[t.key] ?? "on",
    on: wantsAlert(t.key, rules, mine),
  }));
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not on this environment." }, { status: 503 });
  try {
    return NextResponse.json({ ok: true, types: await read(actor.id, actor) });
  } catch {
    return NextResponse.json({ ok: false, error: "Your alert settings did not load." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else." }, { status: 423 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Not on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { type?: unknown; on?: unknown };
  if (!isAlertType(b.type) || typeof b.on !== "boolean") return NextResponse.json({ ok: false, error: "Which alert, and on or off?" }, { status: 400 });
  const rule = (await alertRules())[b.type] ?? "on";
  if (rule !== "on") {
    return NextResponse.json({ ok: false, error: rule === "off" ? "This one is switched off for everyone." : "This one is always on for everyone." }, { status: 409 });
  }
  await setMyAlert(actor.id, b.type, b.on);
  return NextResponse.json({ ok: true, types: await read(actor.id, actor) });
}
