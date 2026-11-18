import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { hasDb } from "@/lib/db";
import { chasesForHome } from "@/lib/cert-chase";
import { publicError } from "@/lib/public-error";

/**
 * The certificate reminders sent to the agent about one home, for the
 * property page (Michael Healy, ticket 7717f8d1, 17 Nov 2026: "where id find
 * the email reminders to the agents on the property notes?"). The same
 * os_cert_agent_chases rows the compliance desk lists, by hand and automatic.
 *
 * The compliance office (and anybody who sees everything) reads every chase
 * on the home; anybody else only the ones that were sent to them.
 *
 *   GET ?property=<id>   newest first
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  if (!/^[A-Za-z0-9:_-]{1,80}$/.test(property)) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const me = subject ?? actor;
  const office = can(me.role, "see:agent-compliance") || can(me.role, "see:everything");
  try {
    const chases = await chasesForHome(property, office ? null : me.id);
    return NextResponse.json({ ok: true, office, chases });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The reminders couldn't be read just now.") }, { status: 502 });
  }
}
