import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";
import { letPeople } from "@/lib/let-people";
import { createUpdate } from "@/lib/customer-updates";
import { HEADLINE, updateVars, type UpdateKind } from "@/lib/customer-update-copy";
import { isScottish } from "@/lib/property-flags";

/**
 * POST { kind, role: "tenant" | "landlord", index? } → a customer update the
 * agent started from the let's page (James, 12 Oct 2026: "an email builder
 * within here so they're able to send out emails to each party", the failed
 * referencing words, the reminders).
 *
 * It lands as an ordinary customer update for one person (lib/customer-
 * updates), so the page opens it in the same review sheet as every other:
 * the words written, read and changed by the agent, sent from their own
 * address only when they press Send. Nothing goes from here.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KINDS = new Set<UpdateKind>([
  "general", "reference_failed", "guarantor_needed", "cancelled", "agreement_out",
  "nudge_holding_fee", "nudge_referencing", "nudge_sign_agreement", "nudge_move_in_money", "nudge_documents",
]);

const day = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Europe/London" }) : null;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 423 });
    throw e;
  }
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { kind?: string; role?: string; index?: number };
  const kind = body.kind as UpdateKind;
  if (!KINDS.has(kind)) return NextResponse.json({ ok: false, error: "Pick what the email is about." }, { status: 400 });
  const role = body.role === "landlord" ? "landlord" : "tenant";

  const r = await letPeople(id, actor);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  /* Several landlords on a let (20 Oct 2026): the index picks one, the first by default. */
  const landlords = r.let.people.filter((p) => p.role === "landlord");
  const who = role === "landlord" ? landlords[Math.max(0, Number(body.index ?? 0) || 0)] ?? r.let.landlord : r.let.tenants[Math.max(0, Number(body.index ?? 0) || 0)];
  if (!who) {
    return NextResponse.json({ ok: false, error: role === "landlord" ? r.let.landlordProblem ?? "No landlord is held for this let." : "That tenant isn't on the let." }, { status: 404 });
  }

  const agentName = actor.name || actor.email;
  const vars = updateVars(kind, role, {
    address: r.let.property,
    firstName: who.name.trim().split(/\s+/)[0] ?? "",
    agentName,
    moveIn: day(r.let.moveIn),
    scotland: isScottish(r.let.locality, r.let.property),
  });
  const made = await createUpdate(
    {
      key: `agent:${id}:${kind}:${role}:${Date.now()}`,
      applicationId: r.let.kind === "application" ? id : null,
      dealId: r.let.dealId,
      property: r.let.property,
      agentEmail: actor.email,
      agentName,
      kind,
      headline: HEADLINE[kind],
      why: `Written by ${agentName} from the let's page.`,
      recipients: [{ role, name: who.name, email: who.email, emailId: role === "landlord" ? "update-landlord" : "update-tenant", vars, contactId: who.contactId }],
    },
    { tellAgent: false }
  );
  if (!made) return NextResponse.json({ ok: false, error: "The email couldn't be written just now." }, { status: 503 });
  return NextResponse.json({ ok: true, update: { id: made.id }, index: 0 });
}
