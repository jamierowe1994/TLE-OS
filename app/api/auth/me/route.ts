import { NextRequest, NextResponse } from "next/server";
import { countUsers } from "@/lib/users";
import { hasDb } from "@/lib/db";
import { whoIs } from "@/lib/admin";

/**
 * Who is this?
 *
 * Returns the SUBJECT as `user` — whoever's data the OS is currently
 * rendering — so every screen that asks "who am I" keeps working unchanged
 * while an owner is viewing as somebody else. That is the point of view-as:
 * the app should not need to know.
 *
 * `actor` and `viewingAs` are carried alongside for the two things that DO
 * need the truth: the red banner, and the admin bar. Admin permission is
 * decided on the actor and never on the subject — see lib/admin.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, user: null, anyUsers: false, hasDb: false });

  const { actor, subject, viewingAs } = await whoIs(req);
  return NextResponse.json({
    ok: true,
    user: subject,
    actor: actor ? { id: actor.id, name: actor.name, email: actor.email, role: actor.role } : null,
    viewingAs,
    subject: viewingAs && subject ? { name: subject.name, email: subject.email } : null,
    isOwner: actor?.role === "owner",
    anyUsers: (await countUsers()) > 0,
    hasDb: true,
  });
}
