import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { letPeople, type LetParty } from "@/lib/let-people";
import { cancellationFor } from "@/lib/let-cancel";
import { addLetLandlord, removeLetLandlord, savePersonEdit, updateLetLandlord } from "@/lib/let-landlords";
import { updateLetTenant } from "@/lib/let-tenants";
import { propolyPicture, syncPerson, type SyncResult } from "@/lib/let-propoly-sync";
import { saveHomeAddress } from "@/lib/landlord-home";
import { forgetApplications } from "@/lib/applications";
import { forgetListing } from "@/lib/listing-details";
import { forgetLandlord } from "@/lib/rex-landlord";

/**
 * GET  → who is on a let (lib/let-people), for its page's tenant and landlord
 *        drawers and the customer update builder, whether it was cancelled,
 *        and each person against the let's Propoly deal (from the saved copy:
 *        no Propoly call).
 *
 * POST → change the people on the let (James, 20 Oct 2026):
 *   { action: "add-landlord", name, email, phone, address }
 *   { action: "edit", key, name?, email?, phone?, address? }  - anyone not in
 *        REX (REX contacts change through PATCH /api/people/contact)
 *   { action: "remove-landlord", key }                         - one added here
 *   { action: "send", key }                                    - Add to the Propoly deal
 *   { action: "changed", key }                                 - after a REX edit
 * Each answers with the let as GET does, plus `sync`: what Propoly was sent,
 * or would be (lib/let-propoly-sync, behind propoly_people_live).
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");

async function answer(id: string, actor: NonNullable<Awaited<ReturnType<typeof whoIs>>["actor"]>, sync?: SyncResult | null) {
  const [r, cancelled] = await Promise.all([letPeople(id, actor), cancellationFor(id)]);
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  const propoly = await propolyPicture(id, r.let.people, r.let.deal).catch(() => null);
  return NextResponse.json({ ok: true, let: r.let, cancelled, propoly, ...(sync ? { sync } : {}) });
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return answer(id, actor);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const by = actor.name || actor.email || "unknown";
  const bad = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

  /* Whoever may open the let may change its people - and only its people. */
  const r = await letPeople(id, actor);
  if (!r.ok) return bad(r.error, r.status);
  const find = (key: string): LetParty | null => r.let.people.find((p) => p.key === key) ?? null;
  const fresh = async (key: string) => {
    const again = await letPeople(id, actor);
    return again.ok ? { person: again.let.people.find((p) => p.key === key) ?? null, deal: again.let.deal } : { person: null, deal: null };
  };

  const action = clean(b.action, 30);
  if (action === "add-landlord") {
    const name = clean(b.name);
    const email = clean(b.email, 200).toLowerCase() || null;
    const phone = clean(b.phone, 40) || null;
    const address = clean(b.address, 300) || null;
    if (!name) return bad("What is the landlord's name?");
    if (!email) return bad(`${name} needs an email address - the contracts and Propoly go to it.`);
    if (!EMAIL.test(email)) return bad("That email doesn't look right.");
    const same = r.let.people.find((p) => p.role === "landlord" && ((p.email && p.email.toLowerCase() === email) || p.name.trim().toLowerCase() === name.toLowerCase()));
    if (same) return bad(`${same.name} is already a landlord on this let.`, 409);
    const added = await addLetLandlord({ letRef: id, name, email, phone, address, by });
    /* Their own home goes where every landlord's is kept (lib/landlord-home),
       so the contact block, the contracts and Propoly all read the one copy. */
    if (address) await saveHomeAddress({ email, name, address, by }).catch(() => null);
    const key = `let-landlord:${added.id}`;
    const { person, deal } = await fresh(key);
    const sync = person ? await syncPerson(id, person, deal, by).catch(() => null) : null;
    return answer(id, actor, sync);
  }

  const key = clean(b.key, 200);
  const person = key ? find(key) : null;
  if (!person) return bad("That person isn't on this let.", 404);

  if (action === "edit") {
    if (person.source === "rex") return bad("Change them in the contact block - that keeps REX in step.");
    if (person.source === "record") return bad("This landlord comes from the home's record: change them on the home's page.");
    const change: { name?: string; email?: string | null; phone?: string | null; address?: string | null } = {};
    if (typeof b.name === "string") {
      const name = clean(b.name);
      if (!name) return bad("They need a name.");
      change.name = name;
    }
    if (typeof b.email === "string") {
      const email = clean(b.email, 200).toLowerCase();
      if (email && !EMAIL.test(email)) return bad("That email doesn't look right.");
      change.email = email || null;
    }
    if (typeof b.phone === "string") change.phone = clean(b.phone, 40) || null;
    if (typeof b.address === "string") change.address = clean(b.address, 300) || null;
    if (!Object.keys(change).length) return bad("Nothing to change.");
    if (key.startsWith("let-landlord:")) await updateLetLandlord(key.slice("let-landlord:".length), change);
    else if (key.startsWith("let-tenant:")) await updateLetTenant(key.slice("let-tenant:".length), { ...(change.name ? { name: change.name } : {}), ...("email" in change ? { email: change.email ?? null } : {}), ...("phone" in change ? { phone: change.phone ?? null } : {}) });
    else await savePersonEdit(id, key, { ...change, ...(change.email === null ? { email: "" } : {}), ...(change.phone === null ? { phone: "" } : {}) }, by);
    const again = await fresh(key);
    const sync = again.person ? await syncPerson(id, again.person, again.deal, by).catch(() => null) : null;
    return answer(id, actor, sync);
  }

  if (action === "remove-landlord") {
    if (!key.startsWith("let-landlord:")) return bad("Only a landlord added on this let can be taken off here.");
    const landlords = r.let.people.filter((p) => p.role === "landlord");
    if (landlords.length <= 1) return bad("Every let needs a landlord. Add the right one first, then take this one off.");
    await removeLetLandlord(key.slice("let-landlord:".length));
    return answer(id, actor, { state: "nothing", detail: "Taken off the let. If they were sent to Propoly, take them off the deal there too - Propoly can't be told from here." });
  }

  if (action === "send") {
    const sync = await syncPerson(id, person, r.let.deal, by, true).catch(() => null);
    return answer(id, actor, sync);
  }

  if (action === "changed") {
    /* A REX contact was just changed: read them again, not the held copies
       (the applications for a minute, the landlord for twelve hours), or the
       card is redrawn with what they were before. */
    if (person.source === "rex") {
      forgetApplications();
      if (r.let.listingId) {
        forgetListing(r.let.listingId);
        await forgetLandlord(r.let.listingId);
      }
    }
    const again = await fresh(key);
    const sync = again.person ? await syncPerson(id, again.person, again.deal, by).catch(() => null) : null;
    return answer(id, actor, sync);
  }

  return bad("What should change?");
}
