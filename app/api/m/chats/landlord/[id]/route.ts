import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { whoIs } from "@/lib/admin";
import { landlordThread } from "@/lib/chats";
import { replyAsAgent } from "@/lib/appraisal-messages";
import { publicOrigin } from "@/lib/origin";
import type { OsUser } from "@/lib/users";

/**
 * A landlord's conversation on the phone (3 Oct 2026) - the same thread as the
 * appraisal file's Messages panel, but only the agent's own (or an owner's).
 *   GET              the thread, marked read (not while viewing as someone)
 *   POST { text }    reply as the agent: stored, then emailed to the landlord
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const t = await landlordThread((subject ?? actor) as OsUser, id, !viewingAs);
  if (!t) return NextResponse.json({ ok: false, error: "That conversation is not one of yours." }, { status: 404 });
  return NextResponse.json({ ok: true, title: t.title, about: t.about, phone: t.phone, email: t.email, messages: t.messages });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else, so nothing is sent." }, { status: 423 });
  const b = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(b.text ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  const t = await landlordThread(actor, id, false);
  if (!t) return NextResponse.json({ ok: false, error: "That conversation is not one of yours." }, { status: 404 });
  try {
    const r = await replyAsAgent({ ma: t.ma, me: actor, body: text, origin: publicOrigin(req) });
    return NextResponse.json({ ok: true, message: { id: r.message.id, from: "agent", body: r.message.body, at: r.message.sentAt }, emailed: r.emailed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That did not send.") }, { status: 502 });
  }
}
