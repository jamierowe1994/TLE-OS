import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { repliesFor, replyToQuery } from "@/lib/compliance-desk";
import { publicError } from "@/lib/public-error";

/**
 * An agent's answer to a compliance query (20 Oct 2026, the agents' call:
 * "when Josselle writes a note ... can agents write back, so it's logged?").
 *
 *   GET  ?kind=certificate&id=<id>         the answers so far
 *   POST { kind, id, body }                answer: kept on the record, emailed to whoever queried it
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set(["certificate", "landlord_document"]);

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: true, replies: [] });
  const kind = req.nextUrl.searchParams.get("kind") ?? "";
  const id = (req.nextUrl.searchParams.get("id") ?? "").trim();
  if (!KINDS.has(kind) || !id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
  const map = await repliesFor([{ kind, id }]).catch(() => new Map());
  return NextResponse.json({ ok: true, replies: map.get(`${kind}:${id}`) ?? [] });
}

export async function POST(req: NextRequest) {
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first, so the answer is in your name." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database is connected." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { kind?: unknown; id?: unknown; body?: unknown };
  const kind = typeof b.kind === "string" && KINDS.has(b.kind) ? (b.kind as "certificate" | "landlord_document") : null;
  const id = typeof b.id === "string" ? b.id.trim() : "";
  if (!kind || !id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
  const me = subject ?? actor;
  try {
    const out = await replyToQuery({ kind, id, body: typeof b.body === "string" ? b.body : "", me: { id: me.id, name: me.name, email: me.email } });
    return NextResponse.json({ ok: true, ...out });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save.") }, { status: 400 });
  }
}
