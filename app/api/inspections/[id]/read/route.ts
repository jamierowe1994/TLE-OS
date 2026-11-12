import { NextRequest, NextResponse, after } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { getInspection, logEvent } from "@/lib/inspections";
import { publicError } from "@/lib/public-error";
import { beginRead, getRead, markApplied } from "@/lib/visit-report-store";

/**
 * A visit's uploaded report, read into the visit's own boxes (lib/visit-report).
 *
 *   GET    where the read has got to, and what it found
 *   POST   { key }            read this file on the visit (answers at once; the reading carries on)
 *   PATCH  { applied: true }  what was read has been checked and saved onto the visit
 *
 * Nothing here changes the visit: the screen saves the checked boxes through
 * the visit's own route, the same way a visit written up here is saved.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json({ ok: true, read: await getRead(id) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => null)) as { key?: string } | null;
  const found = await getInspection(id);
  if (!found) return NextResponse.json({ ok: false, error: "No such inspection." }, { status: 404 });
  const file = found.inspection.files.find((f) => f.key === body?.key);
  if (!file) return NextResponse.json({ ok: false, error: "That file isn't on this visit." }, { status: 400 });
  const was = await getRead(id);
  if (was?.status === "reading" && was.key === file.key) return NextResponse.json({ ok: true, read: was });
  const me = subject ?? actor;
  const by = me.name || me.email;
  try {
    const { state, run } = await beginRead(id, file, by);
    await logEvent(id, by, "report_read", `${file.name} is being read into the visit's boxes.`);
    after(run);
    return NextResponse.json({ ok: true, read: state });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The report could not be read.") }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor, subject } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const me = subject ?? actor;
  return NextResponse.json({ ok: true, read: await markApplied(id, me.name || me.email) });
}
