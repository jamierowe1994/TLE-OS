import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { q, hasDb } from "@/lib/db";
import { uid } from "@/lib/auth";

/** The system to-do list. Owner-only; 404 to everyone else. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database." }, { status: 503 });
  const { title, detail, area } = (await req.json().catch(() => ({}))) as {
    title?: string; detail?: string; area?: string;
  };
  if (!title?.trim()) return NextResponse.json({ ok: false, error: "Needs a title." }, { status: 400 });
  await q(`insert into os_todos (id, title, detail, area) values ($1,$2,$3,$4)`, [
    uid(), title.trim(), detail ?? "", area ?? "general",
  ]);
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest) {
  if (!(await requireOwner(req))) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database." }, { status: 503 });
  const { id, state } = (await req.json().catch(() => ({}))) as { id?: string; state?: string };
  if (!id || !["open", "doing", "done"].includes(state ?? "")) {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  await q(`update os_todos set state = $1, done_at = case when $1 = 'done' then now() else null end where id = $2`, [state, id]);
  return NextResponse.json({ ok: true });
}
