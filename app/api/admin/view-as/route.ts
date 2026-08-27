import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { findUserById } from "@/lib/users";
import { mintViewAs, readViewAs, VIEW_AS_COOKIE } from "@/lib/view-as";
import { record } from "@/lib/audit";

/**
 * Start and stop viewing as somebody.
 *
 * POST { userId }  → start
 * DELETE           → stop
 *
 * Both are audited. An unlogged impersonation is indistinguishable from an
 * intrusion after the fact, and "I was only testing" is not evidence.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ipOf = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "";

export async function POST(req: NextRequest) {
  const owner = await requireOwner(req);
  if (!owner) return new NextResponse(null, { status: 404 });

  const { userId } = (await req.json().catch(() => ({}))) as { userId?: string };
  if (!userId) return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });

  const subject = await findUserById(userId);
  if (!subject) return NextResponse.json({ ok: false, error: "No such person." }, { status: 404 });

  /* An owner may not wear another owner's face. The whole point is to see what
     an AGENT sees; owner-into-owner adds no testing value and would let one
     owner read another's admin screens without ever signing in as them. */
  if (subject.role === "owner" && subject.id !== owner.id) {
    return NextResponse.json(
      { ok: false, error: "You can't view as another owner — only as an agent." },
      { status: 403 }
    );
  }

  await record({
    kind: "view_as_start",
    actorId: owner.id, actorEmail: owner.email,
    subjectId: subject.id, subjectEmail: subject.email,
    detail: "read-only, 30 minutes", ip: ipOf(req),
  });

  const res = NextResponse.json({ ok: true, subject: { id: subject.id, name: subject.name, email: subject.email } });
  res.cookies.set(VIEW_AS_COOKIE, mintViewAs(subject.id, owner.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 30 * 60,
  });
  return res;
}

export async function DELETE(req: NextRequest) {
  const owner = await requireOwner(req);
  const va = readViewAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  if (owner && va) {
    const subject = await findUserById(va.subjectId);
    await record({
      kind: "view_as_end",
      actorId: owner.id, actorEmail: owner.email,
      subjectId: va.subjectId, subjectEmail: subject?.email ?? "",
      ip: ipOf(req),
    });
  }
  /* Cleared even for a caller we could not identify. A stuck view-as cookie
     that only an owner can clear is a trap; clearing it grants nothing. */
  const res = NextResponse.json({ ok: true });
  res.cookies.set(VIEW_AS_COOKIE, "", { httpOnly: true, path: "/", maxAge: 0 });
  return res;
}
