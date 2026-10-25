import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * The order of the people on a home, the first being the point of contact
 * (James, 25 Oct 2026: "you could pick it up and move it above for them to
 * become the point of contact").
 *
 *   GET  ?property=<home key>            { keys }
 *   PUT  { property, keys, first? }      saved; `first` is the new point of contact's name, for the audit line
 *
 * Same home keys as /api/portfolio/people. Anyone signed in may set it, as
 * anyone may change the people themselves. Kept in the OS only.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function signedIn(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  return who?.actor ? who : null;
}

export async function GET(req: NextRequest) {
  if (!(await signedIn(req))) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const home = (req.nextUrl.searchParams.get("property") ?? "").trim();
  if (!home) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const rows = await q<{ keys: unknown }>(`SELECT keys FROM os_home_contact_order WHERE home_key = $1`, [home]);
    const keys = Array.isArray(rows[0]?.keys) ? (rows[0]!.keys as unknown[]).map(String) : [];
    return NextResponse.json({ ok: true, keys });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The order couldn't be read just now.") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const who = await signedIn(req);
  const actor = who?.actor;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { property?: string; keys?: unknown; first?: string };
  const home = String(b.property ?? "").trim();
  const keys = Array.isArray(b.keys) ? [...new Set(b.keys.map((k) => String(k).slice(0, 200)))].slice(0, 40) : null;
  if (!home || !keys) return NextResponse.json({ ok: false, error: "Which home, and in what order?" }, { status: 400 });
  try {
    await q(
      `INSERT INTO os_home_contact_order (home_key, keys, updated_by, updated_at) VALUES ($1, $2::jsonb, $3, NOW())
       ON CONFLICT (home_key) DO UPDATE SET keys = EXCLUDED.keys, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
      [home, JSON.stringify(keys), actor.email ?? actor.id]
    );
    await record({ kind: "property_person_changed", actorId: actor.id, actorEmail: actor.email, detail: `Home ${home}: point of contact now ${String(b.first ?? keys[0] ?? "").slice(0, 120)}. OS only, not REX.` });
    return NextResponse.json({ ok: true, keys });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The order didn't save. Try again.") }, { status: 500 });
  }
}
