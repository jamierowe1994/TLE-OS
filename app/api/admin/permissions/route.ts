import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { findUserById } from "@/lib/users";
import { ROLES, ROLE_BLURB, ROLE_LABEL, asRole, capabilitiesOf } from "@/lib/roles";
import { record } from "@/lib/audit";

/**
 * Who holds which role, and changing it.
 *
 * Reading needs `manage:roles` too, not merely `see:people`. A list of who can
 * do what is a map of where the power sits, and support staff have no reason
 * to hold it.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:roles"))) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ error: "No database." }, { status: 503 });

  const rows = await q<{ id: string; email: string; name: string; role: string; last_seen_at: Date | null }>(
    `select id, email, name, role, last_seen_at from os_users order by role, email`
  );

  return NextResponse.json({
    roles: ROLES.map((r) => ({
      id: r, label: ROLE_LABEL[r], blurb: ROLE_BLURB[r], can: capabilitiesOf(r),
    })),
    people: rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name || r.email.split("@")[0],
      role: asRole(r.role),
      lastSeenAt: r.last_seen_at ? new Date(r.last_seen_at).toISOString() : null,
    })),
  });
}

export async function PATCH(req: NextRequest) {
  const me = await requireCapability(req, "manage:roles");
  if (!me) return new NextResponse(null, { status: 404 });

  const { userId, role } = (await req.json().catch(() => ({}))) as { userId?: string; role?: string };
  if (!userId || !(ROLES as readonly string[]).includes(role ?? "")) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }

  const target = await findUserById(userId);
  if (!target) return NextResponse.json({ ok: false, error: "No such person." }, { status: 404 });

  /* THE TRAP THIS AVOIDS. A permissions screen whose worst outcome is "nobody
     can administer this system any more" is not a feature. Demoting the last
     owner is refused outright, and an owner cannot demote themselves by
     accident while tidying the list. */
  if (target.role === "owner" && role !== "owner") {
    const owners = await q<{ n: string }>(`select count(*)::text as n from os_users where role = 'owner'`);
    if (Number(owners[0]?.n ?? 0) <= 1) {
      return NextResponse.json(
        { ok: false, error: "That's the only owner. Make somebody else an owner first." },
        { status: 409 }
      );
    }
    if (target.id === me.id) {
      return NextResponse.json(
        { ok: false, error: "You can't take your own owner role off. Ask the other owner." },
        { status: 409 }
      );
    }
  }

  await q(`update os_users set role = $1 where id = $2`, [role, userId]);
  await record({
    kind: "password_reset", // reusing the audit kinds; the detail carries the truth
    actorId: me.id, actorEmail: me.email,
    subjectId: target.id, subjectEmail: target.email,
    detail: `role changed ${target.role} → ${role}`,
  });

  return NextResponse.json({ ok: true, message: `${target.name || target.email} is now ${ROLE_LABEL[asRole(role)]}.` });
}
