import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { addTenantMessage, markTenantEmailed, tenantAgentEmail, tenantThread } from "@/lib/chats";
import { emailTenantReply } from "@/lib/chats-email";
import { publicOrigin } from "@/lib/origin";
import type { OsUser } from "@/lib/users";

/**
 * A tenant's conversation on the phone (3 Oct 2026), from the tenant portal.
 *   GET              the thread, marked read (not while viewing as someone)
 *   POST { text }    reply as the agent: stored, then emailed to the tenant
 *                    with a sign-in link into their Messages
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, subject, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const t = await tenantThread((subject ?? actor) as OsUser, id, !viewingAs);
  if (!t) return NextResponse.json({ ok: false, error: "That conversation is not one of yours." }, { status: 404 });
  return NextResponse.json({ ok: true, title: t.title, about: "Tenant portal", phone: null, email: t.email, messages: t.messages });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as someone else, so nothing is sent." }, { status: 423 });
  const b = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(b.text ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ ok: false, error: "Write something first." }, { status: 400 });
  const t = await tenantThread(actor, id, false);
  if (!t) return NextResponse.json({ ok: false, error: "That conversation is not one of yours." }, { status: 404 });

  /* The thread stays with the agent it already belongs to. */
  const message = await addTenantMessage({ accountId: id, direction: "agent", body: text, agentEmail: (await tenantAgentEmail(id)) || actor.email, authorId: actor.id });
  let emailed = false;
  if (t.email) {
    try {
      await emailTenantReply({ to: t.email, tenantFirst: t.title.split(/\s+/)[0] || "there", agentName: actor.name, agentEmail: actor.email, body: text, origin: publicOrigin(req) });
      await markTenantEmailed(message.id);
      emailed = true;
    } catch (e) {
      await markTenantEmailed(message.id, e instanceof Error ? e.message : String(e));
    }
  }
  return NextResponse.json({ ok: true, message, emailed });
}
