import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { findUserById, ensureRexLink } from "@/lib/users";
import { lettingsAgents } from "@/lib/rex-agents";
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

  const { userId, rexUserId } = (await req.json().catch(() => ({}))) as {
    userId?: string;
    rexUserId?: string;
  };

  /* Two ways in. By OS account when they have one; by REX id when they do not
     — which is most of the team, and the people worth testing as. */
  const subject = userId ? await findUserById(userId) : null;
  if (userId && !subject) {
    return NextResponse.json({ ok: false, error: "No such person." }, { status: 404 });
  }
  if (!subject && !rexUserId) {
    return NextResponse.json({ ok: false, error: "Which person?" }, { status: 400 });
  }

  let rexId = rexUserId ?? null;
  let label = subject?.name || subject?.email || "";
  if (!rexId && subject) rexId = await ensureRexLink(subject);
  if (!label && rexId) {
    const agent = (await lettingsAgents().catch(() => [])).find((a) => a.id === rexId);
    if (!agent) {
      return NextResponse.json(
        { ok: false, error: "That isn't one of TLE's people." },
        { status: 403 }
      );
    }
    label = agent.name;
  }

  /* An owner may not wear another owner's face. The whole point is to see what
     an AGENT sees; owner-into-owner adds no testing value and would let one
     owner read another's admin screens without ever signing in as them. */
  if (subject && subject.role === "owner" && subject.id !== owner.id) {
    return NextResponse.json(
      { ok: false, error: "You can't view as another owner — only as an agent." },
      { status: 403 }
    );
  }

  await record({
    kind: "view_as_start",
    actorId: owner.id, actorEmail: owner.email,
    subjectId: subject?.id ?? null, subjectEmail: subject?.email ?? label,
    detail: `read-only, 30 minutes, REX ${rexId ?? "unlinked"}`, ip: ipOf(req),
  });

  const res = NextResponse.json({ ok: true, subject: { name: label, rexUserId: rexId } });
  res.cookies.set(VIEW_AS_COOKIE, mintViewAs(subject?.id ?? "-", owner.id, rexId, label), {
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
