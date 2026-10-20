import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { letPeople, type LetParty } from "@/lib/let-people";
import { cancellationFor } from "@/lib/let-cancel";
import { savePersonEdit } from "@/lib/let-landlords";
import { addPerson, personById, removePerson, updatePerson } from "@/lib/property-people";
import { record } from "@/lib/audit";
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
    /* Onto the HOME, not the let (20 Oct 2026): the same joint landlord then
       shows on the listing, the home's page and every let of it. */
    const added = await addPerson(r.let.homeKey, { kind: "joint_landlord", name, email, phone, relation: clean(b.relation, 80) }, by);
    await record({ kind: "property_person_added", actorId: actor.id, actorEmail: actor.email, detail: `Home ${r.let.homeKey} (${r.let.property}): Joint landlord ${name} added from the let ${id}. OS only, not REX.` }).catch(() => undefined);
    /* Their own home goes where every landlord's is kept (lib/landlord-home),
       so the contact block, the contracts and Propoly all read the one copy. */
    if (address) await saveHomeAddress({ email, name, address, by }).catch(() => null);
    const key = `home-person:${added.id}`;
    const { person, deal } = await fresh(key);
    const sync = person ? await syncPerson(id, person, deal, by).catch(() => null) : null;
    return answer(id, actor, sync);
  }

  const key = clean(b.key, 200);
  const person = key ? find(key) : null;
  if (!person) return bad("That person isn't on this let.", 404);

  if (action === "edit") {
    if (person.source === "rex") return bad("Change them in the contact block - that keeps REX in step.");
    if (person.source === "record") return bad("Change them in the contact block - that keeps the home's record in step.");
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
    if (key.startsWith("home-person:")) {
      const was = await personById(key.slice("home-person:".length));
      if (!was) return bad("That person isn't on the home any more.", 404);
      await updatePerson(was.id, { name: change.name ?? was.name, email: "email" in change ? change.email ?? null : was.email, phone: "phone" in change ? change.phone ?? null : was.phone, relation: was.relation });
      if (change.address && (change.email ?? was.email)) await saveHomeAddress({ email: (change.email ?? was.email) as string, name: change.name ?? was.name, address: change.address, by }).catch(() => null);
      await record({ kind: "property_person_changed", actorId: actor.id, actorEmail: actor.email, detail: `Home ${was.propertyId}: Joint landlord "${was.name}" changed from the let ${id}. OS only, not REX.` }).catch(() => undefined);
    }
    else if (key.startsWith("let-tenant:")) await updateLetTenant(key.slice("let-tenant:".length), { ...(change.name ? { name: change.name } : {}), ...("email" in change ? { email: change.email ?? null } : {}), ...("phone" in change ? { phone: change.phone ?? null } : {}) });
    else await savePersonEdit(id, key, { ...change, ...(change.email === null ? { email: "" } : {}), ...(change.phone === null ? { phone: "" } : {}) }, by);
    const again = await fresh(key);
    const sync = again.person ? await syncPerson(id, again.person, again.deal, by).catch(() => null) : null;
    return answer(id, actor, sync);
  }

  if (action === "remove-landlord") {
    if (!key.startsWith("home-person:")) return bad("Only an additional landlord can be taken off here.");
    const landlords = r.let.people.filter((p) => p.role === "landlord");
    if (landlords.length <= 1) return bad("Every let needs a landlord. Add the right one first, then take this one off.");
    await removePerson(key.slice("home-person:".length));
    await record({ kind: "property_person_removed", actorId: actor.id, actorEmail: actor.email, detail: `Home ${r.let.homeKey}: Joint landlord ${person.name} taken off from the let ${id}.` }).catch(() => undefined);
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
