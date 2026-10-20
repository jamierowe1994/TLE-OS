import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { letPeople } from "@/lib/let-people";
import { handoversFor } from "@/lib/handover";
import { switchOn } from "@/lib/switches";
import { addLetTenant, letTenants, removeLetTenant } from "@/lib/let-tenants";
import { syncPerson } from "@/lib/let-propoly-sync";

/**
 * Tenants added to a let in progress (lib/let-tenants, 19 Oct 2026).
 *
 *   GET    ?let=<let ref>                         -> the added tenants, and where Propoly stands
 *   POST   { let, name, email, phone, reference } -> add one
 *   DELETE { let, id }                            -> take one off
 *
 * Who may: whoever may open the let (lib/let-people). Nothing is written to
 * REX. Once the let has a Propoly deal, an added tenant goes onto it
 * (lib/let-propoly-sync, behind propoly_people_live; rehearsed while off).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function access(req: NextRequest, letRef: string) {
  const { actor } = await whoIs(req);
  if (!actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  if (!letRef) return { error: NextResponse.json({ ok: false, error: "Which let?" }, { status: 400 }) };
  const r = await letPeople(letRef, actor);
  if (!r.ok) return { error: NextResponse.json({ ok: false, error: r.error }, { status: r.status }) };
  return { actor, people: r.let.tenants, deal: r.let.deal };
}

/** Where the added tenants stand with Propoly, in one word for the let. */
async function propoly(letRef: string, hasDeal: boolean): Promise<"pushed" | "held" | "with-push" | "to-deal" | "to-deal-practice"> {
  /* A deal already in Propoly - pushed from here or keyed by hand - takes
     them straight onto it (20 Oct 2026), once that is switched on. */
  if (hasDeal) {
    const [mine, handover] = await Promise.all([switchOn("propoly_people_live").catch(() => false), switchOn("handover_live").catch(() => false)]);
    return mine && handover ? "to-deal" : "to-deal-practice";
  }
  const runs = await handoversFor(letRef, 10).catch(() => []);
  if (runs.some((r) => r.mode === "live" && r.status === "ok")) return "pushed";
  return (await switchOn("tenant_changes_live").catch(() => false)) ? "with-push" : "held";
}

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, tenants: [], propoly: "held" });
  const letRef = clean(req.nextUrl.searchParams.get("let"), 80);
  const a = await access(req, letRef);
  if ("error" in a) return a.error;
  return NextResponse.json({ ok: true, tenants: await letTenants(letRef), propoly: await propoly(letRef, Boolean(a.deal)) });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const letRef = clean(b?.let, 80);
  const a = await access(req, letRef);
  if ("error" in a) return a.error;
  const name = clean(b?.name);
  const email = clean(b?.email, 200).toLowerCase() || null;
  const reference = b?.reference !== false;
  if (!name) return NextResponse.json({ ok: false, error: "What is their name?" }, { status: 400 });
  if (email && !EMAIL.test(email)) return NextResponse.json({ ok: false, error: "That email doesn't look right." }, { status: 400 });
  if (reference && !email) return NextResponse.json({ ok: false, error: `${name} needs an email address - Propoly sends their referencing to it.` }, { status: 400 });
  const same = (x: { name: string; email: string | null }) => (email && x.email?.toLowerCase() === email) || x.name.trim().toLowerCase() === name.toLowerCase();
  if (a.people.some(same) || (await letTenants(letRef)).some(same)) return NextResponse.json({ ok: false, error: `${name} is already on this let.` }, { status: 409 });
  const by = a.actor.name || a.actor.email || "unknown";
  const added = await addLetTenant({ letRef, name, email, phone: clean(b?.phone, 40) || null, reference, by });
  /* Onto the let's Propoly deal, if it has one: once, never on a read. */
  const sync = a.deal
    ? await syncPerson(letRef, { key: `let-tenant:${added.id}`, role: "tenant", source: "added", name: added.name, email: added.email, phone: added.phone, contactId: null, isPrimary: false, address: null, reference: added.reference }, a.deal, by).catch(() => null)
    : null;
  return NextResponse.json({ ok: true, tenants: await letTenants(letRef), propoly: await propoly(letRef, Boolean(a.deal)), sync });
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const letRef = clean(b?.let, 80);
  const a = await access(req, letRef);
  if ("error" in a) return a.error;
  const gone = (await letTenants(letRef)).find((t) => t.id === clean(b?.id, 40));
  if (!gone) return NextResponse.json({ ok: false, error: "They aren't on this let." }, { status: 404 });
  await removeLetTenant(gone.id);
  return NextResponse.json({ ok: true, tenants: await letTenants(letRef), propoly: await propoly(letRef, Boolean(a.deal)) });
}
