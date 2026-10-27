import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";
import { putBack, takeOff } from "@/lib/inspections-off";

/**
 * Take a home off Inspections by hand, or put it back. See lib/inspections-off.
 *
 * POST   { homes, propertyName, locality, reason, note } → off the Due list
 * DELETE ?id=                                            → back on it
 *
 * Neither sends anything to anybody.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as { homes?: unknown; propertyName?: unknown; locality?: unknown; reason?: unknown; note?: unknown } | null;
  if (!b || typeof b.propertyName !== "string" || !b.propertyName.trim()) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    const by = (subject ?? actor).name || (subject ?? actor).email;
    const off = await takeOff({
      homes: Array.isArray(b.homes) ? b.homes.map((h) => (typeof h === "string" ? h : null)) : [],
      propertyName: b.propertyName,
      locality: typeof b.locality === "string" ? b.locality : "",
      reason: typeof b.reason === "string" ? b.reason : "",
      note: typeof b.note === "string" ? b.note : "",
    }, by);
    return NextResponse.json({ ok: true, off });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not take it off.") }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const id = req.nextUrl.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    await putBack(id, (subject ?? actor).name || (subject ?? actor).email);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not put it back.") }, { status: 400 });
  }
}
