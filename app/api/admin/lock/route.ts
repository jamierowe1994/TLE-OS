import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { findUserById } from "@/lib/users";
import { clientIp } from "@/lib/client-ip";
import { asText, jsonObject } from "@/lib/json-body";
import { lockRefusal, lockStateOf, lockUser, unlockUser } from "@/lib/lockout";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lock somebody out of the OS, or let them back in (10 Oct 2026). Owner only,
 * from the person's file in Admin > People. See lib/lockout for what a lock
 * does and why owners and yourself are off limits.
 *
 * POST { userId, action: "lock" | "unlock", reason? }
 */
export async function POST(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor || actor.role !== "owner") {
    return NextResponse.json({ ok: false, error: "Only an owner can do that." }, { status: 403 });
  }
  if (viewingAs) {
    return NextResponse.json({ ok: false, error: "Stop viewing as somebody first." }, { status: 409 });
  }
  const body = await jsonObject(req);
  const userId = asText(body.userId).trim();
  const action = asText(body.action);
  if (!userId || (action !== "lock" && action !== "unlock")) {
    return NextResponse.json({ ok: false, error: "Who, and lock or unlock?" }, { status: 400 });
  }
  const target = await findUserById(userId);
  if (!target) return NextResponse.json({ ok: false, error: "No such account." }, { status: 404 });

  if (action === "lock") {
    const no = lockRefusal(actor, target);
    if (no) return NextResponse.json({ ok: false, error: no }, { status: 403 });
    await lockUser(actor, target, asText(body.reason), clientIp(req));
  } else {
    await unlockUser(actor, target, clientIp(req));
  }
  return NextResponse.json({ ok: true, lock: await lockStateOf(target.id) });
}
