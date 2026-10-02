import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { can } from "@/lib/roles";
import { getUpdate, listUpdates, settleRecipient } from "@/lib/customer-updates";
import { logSystemEvent } from "@/lib/business/deal-store";
import { noteToRex } from "@/lib/rex-notes";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * Customer updates (lib/customer-updates).
 *
 * GET  ?application=<REX id>&deal=<Propoly uuid>   the updates on one let
 * GET  ?mine=1 | ?all=1 [&open=1] [&id=N]           the agent's list, or everyone's
 * POST { id, index, action: "call", note }          rang them; the one-line outcome
 * POST { id, index, action: "skip", note }          not needed, and why
 *
 * Emailing them is the review sheet (/api/confirmations, kind "update"), so
 * every send is read before it goes.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const id = Number(sp.get("id"));
  if (id) {
    const u = await getUpdate(id);
    return u ? NextResponse.json({ ok: true, updates: [u] }) : NextResponse.json({ ok: false, error: "That update isn't here." }, { status: 404 });
  }
  const everyone = can(actor.role, "see:everything") || can(actor.role, "see:pretenancy");
  const mine = sp.get("mine") === "1" || (sp.get("all") === "1" && !everyone);
  const updates = await listUpdates({
    applicationId: sp.get("application"),
    dealId: sp.get("deal"),
    agentEmail: mine ? actor.email : null,
    openOnly: sp.get("open") === "1",
    limit: 200,
  });
  return NextResponse.json({ ok: true, updates, everyone });
}

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { id?: number; index?: number; action?: string; note?: string };
  const id = Number(body.id);
  const index = Number(body.index);
  const note = (body.note ?? "").trim().slice(0, 500);
  if (!id || !Number.isInteger(index) || (body.action !== "call" && body.action !== "skip")) {
    return NextResponse.json({ ok: false, error: "Which update, and what happened?" }, { status: 400 });
  }
  if (!note) {
    return NextResponse.json(
      { ok: false, error: body.action === "call" ? "Say in a line what was said, so the next person knows." : "Say in a line why they don't need telling." },
      { status: 400 }
    );
  }
  const before = await getUpdate(id);
  const who = before?.recipients[index];
  if (!before || !who) return NextResponse.json({ ok: false, error: "That update isn't here." }, { status: 404 });
  if (who.state !== "open") return NextResponse.json({ ok: false, error: `${who.name} has already been dealt with.` }, { status: 409 });

  const after = await settleRecipient(id, index, { state: body.action === "call" ? "called" : "skipped", by: actor.name || actor.email, note });

  /* A call is part of the record everywhere the customer is: the deal's own
     thread, and REX as a note on their contact, in the agent's name. */
  let rex: string | null = null;
  if (body.action === "call") {
    const line = `Rang ${who.name} (${who.role}) about "${before.headline}" at ${before.property}: ${note}`;
    if (before.dealId) {
      await logSystemEvent(before.dealId, { id: actor.id, name: actor.name || actor.email, role: "agent" }, line).catch(() => null);
    }
    if (who.contactId) {
      const r = await noteToRex({ leadId: `rex-${who.contactId}`, contactId: String(who.contactId), text: line, byUserId: actor.id }).catch(() => null);
      /* Agent screens never name the records system. */
      rex = r?.ok ? "Saved on their contact record too." : null;
    }
  }
  return NextResponse.json({ ok: true, update: after, rex });
}
