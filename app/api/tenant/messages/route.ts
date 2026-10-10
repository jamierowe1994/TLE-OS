import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";
import { addTenantMessage, markTenantEmailed, tenantMessages } from "@/lib/chats";
import { emailAgentAboutTenant } from "@/lib/chats-email";
import { publicOrigin } from "@/lib/origin";

/**
 * A TENANT'S MESSAGES, from their portal (3 Oct 2026). Until today the page
 * said "Messages here are on their way" and offered an email link.
 *
 *   GET              their conversation with their agent
 *   POST { text }    a message to their agent: stored first, then the agent
 *                    is emailed, and it shows in the agent's Chats
 *
 * Their agent is the one the portal already names (loadTenantHome): the
 * agent on their deal, else the one who issued their passport. With no agent
 * yet it goes to the office's own inbox, so nothing is lost.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OFFICE = "hello@thelettingexperts.co.uk";

export async function GET() {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, messages: await tenantMessages(me.id) });
}

export async function POST(req: NextRequest) {
  const me = await currentTenant();
  if (!me) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { text?: string };
  const text = String(b.text ?? "").trim().slice(0, 4000);
  if (!text) return NextResponse.json({ ok: false, error: "Write your message first." }, { status: 400 });

  const home = await loadTenantHome(me).catch(() => null);
  const agentEmail = home?.agent?.email?.trim().toLowerCase() || OFFICE;
  const message = await addTenantMessage({ accountId: me.id, direction: "tenant", body: text, agentEmail });
  try {
    await emailAgentAboutTenant({
      to: agentEmail,
      tenant: me.name || me.email,
      tenantEmail: me.email,
      body: text,
      link: `${publicOrigin(req).replace(/\/+$/, "")}/agent/chats/tenant/${encodeURIComponent(me.id)}`,
    });
    await markTenantEmailed(message.id);
  } catch (e) {
    await markTenantEmailed(message.id, publicError(e));
  }
  return NextResponse.json({ ok: true, message, to: home?.agent?.name ?? null });
}
