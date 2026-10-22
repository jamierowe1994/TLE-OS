import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { letPeople, type LetPeople } from "@/lib/let-people";
import { publicError } from "@/lib/public-error";
import { record } from "@/lib/audit";
import { guarantorPdf, planGuarantors, sendGuarantors } from "@/lib/deal-guarantors";
import { planRepush, publicRepush, repushHistory, runRepush } from "@/lib/propoly-repush";

/**
 * A let and its Propoly deal: guarantors and the owners' repush.
 *
 * GET                                   the guarantor details as they would go, and canRepush
 * POST { action: "send-guarantors" }     the Guarantor details document onto the deal (lib/deal-guarantors)
 * POST { action: "repush-plan" }         owners: everything missing from the deal, nothing sent
 * POST { action: "repush", keys }        owners: send the ticked items still missing (lib/propoly-repush)
 *
 * Whoever may open the let may send its guarantors; Repush is owners only.
 * Every Propoly write is behind its switches, and with them off each of
 * these is a rehearsal that sends nothing.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

/** Everyone renting on the let, a tenant added on it included. */
const tenantsOf = (lp: LetPeople) => lp.people.filter((p) => p.role === "tenant").map((p) => ({ name: p.name, email: p.email }));

async function load(req: NextRequest, id: string) {
  const { actor } = await whoIs(req);
  if (!actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  const r = await letPeople(id, actor);
  if (!r.ok) return { error: NextResponse.json({ ok: false, error: r.error }, { status: r.status }) };
  return { actor, lp: r.let, rentPcm: r.app?.offerAmount ?? null };
}

async function guarantors(lp: LetPeople, rentPcm: number | null) {
  const plan = await planGuarantors({ letRef: lp.ref, dealId: lp.deal?.id ?? null, address: [lp.property, lp.locality].filter(Boolean).join(", "), rentPcm, tenants: tenantsOf(lp) });
  return { ...plan, guarantors: plan.guarantors.map(({ id, name, forName }) => ({ id, name, forName })), dealUrl: lp.deal?.url ?? null };
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const l = await load(req, id);
  if ("error" in l) return l.error;
  try {
    /* The Guarantor details document exactly as it would go, to look at first. */
    if (req.nextUrl.searchParams.get("pdf") === "guarantors") {
      const plan = await planGuarantors({ letRef: id, dealId: l.lp.deal?.id ?? null, address: [l.lp.property, l.lp.locality].filter(Boolean).join(", "), rentPcm: l.rentPcm, tenants: tenantsOf(l.lp) });
      if (!plan.guarantors.length) return NextResponse.json({ ok: false, error: "No guarantor is held for anyone on this let." }, { status: 404 });
      const bytes = await guarantorPdf(plan);
      return new NextResponse(Buffer.from(bytes), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="Guarantor details.pdf"`, "cache-control": "no-store" } });
    }
    const owner = l.actor.role === "owner";
    const [g, history] = await Promise.all([guarantors(l.lp, l.rentPcm), owner ? repushHistory(id) : Promise.resolve([])]);
    return NextResponse.json({ ok: true, guarantors: g, canRepush: owner && Boolean(l.lp.deal), history });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const l = await load(req, id);
  if ("error" in l) return l.error;
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const action = String(b.action ?? "");
  const by = l.actor.name || l.actor.email;
  try {
    if (action === "send-guarantors") {
      const plan = await planGuarantors({ letRef: id, dealId: l.lp.deal?.id ?? null, address: [l.lp.property, l.lp.locality].filter(Boolean).join(", "), rentPcm: l.rentPcm, tenants: tenantsOf(l.lp) });
      if (plan.blocked) return NextResponse.json({ ok: false, error: plan.blocked }, { status: 400 });
      const sent = await sendGuarantors(plan, id, by);
      await record({ kind: "propoly_guarantors_sent", actorId: l.actor.id, actorEmail: l.actor.email, detail: `Let ${id}, deal ${plan.dealId}: ${sent.outcome}. ${sent.detail}` }).catch(() => {});
      return NextResponse.json({ ok: true, sent, guarantors: await guarantors(l.lp, l.rentPcm) });
    }
    if (action === "repush-plan" || action === "repush") {
      if (l.actor.role !== "owner") return NextResponse.json({ ok: false, error: "Owners only." }, { status: 403 });
      if (action === "repush-plan") return NextResponse.json({ ok: true, plan: publicRepush(await planRepush(l.lp, l.rentPcm)) });
      const keys = Array.isArray(b.keys) ? b.keys.map(String).slice(0, 60) : [];
      if (!keys.length) return NextResponse.json({ ok: false, error: "Tick at least one thing to send." }, { status: 400 });
      const plan = await runRepush(l.lp, l.rentPcm, keys, by);
      const n = plan.items.filter((i) => i.outcome && i.outcome !== "skipped").length;
      await record({ kind: "propoly_repush", actorId: l.actor.id, actorEmail: l.actor.email, detail: `Let ${id}, deal ${plan.deal?.id ?? "-"}, ${plan.live ? "live" : "practice"}: ${n} item${n === 1 ? "" : "s"}. ${plan.items.filter((i) => i.outcome && i.outcome !== "skipped").map((i) => `${i.label} ${i.outcome}`).join("; ")}` }).catch(() => {});
      return NextResponse.json({ ok: true, plan, history: await repushHistory(id) });
    }
    return NextResponse.json({ ok: false, error: "Unknown action." }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work just now. Try again in a minute.") }, { status: 500 });
  }
}
