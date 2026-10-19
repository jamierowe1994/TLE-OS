import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { addPerson, cleanPerson, isKind, KIND_LABEL, peopleOn } from "@/lib/property-people";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * A new person on a home we already manage, from the landlord lead (Dan
 * Richards, 17 Oct 2026, ticket f252e21d): the address search found the home
 * on our books, so they go onto it as a co-owner (joint landlord) or a point
 * of contact - the same os_property_people the home's page shows - rather
 * than a new lead and a second file for the same home.
 *
 *   POST { propertyId, kind: "joint_landlord" | "contact", name, email?, phone?, relation? }
 *
 * Any home on the managed book, whoever's it is: the agent taking the call is
 * often not the home's agent. Kept in the OS only, never REX; audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (who?.subject && who.subject.id !== actor.id) {
    return NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 });
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  if (!propertyId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (!isKind(b?.kind)) return NextResponse.json({ ok: false, error: "A co-owner or a point of contact?" }, { status: 400 });
  const kind = b.kind;
  const c = cleanPerson(b);
  if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: 400 });
  try {
    const { book } = await managedBookFor(null);
    const home = book.properties.find((p) => p.propertyId === propertyId && !p.test);
    if (!home) return NextResponse.json({ ok: false, error: "That home isn't on our books." }, { status: 404 });
    const there = await peopleOn(propertyId);
    if (there.length >= 8) return NextResponse.json({ ok: false, error: "That's eight people on this home already. Remove one on the home's page first." }, { status: 400 });
    const same = there.find((p) => p.name.toLowerCase() === c.value.name.toLowerCase() || (c.value.email && p.email === c.value.email));
    if (same) return NextResponse.json({ ok: false, error: `${same.name} is already on this home as ${KIND_LABEL[same.kind].toLowerCase()}.` }, { status: 409 });
    const person = await addPerson(propertyId, { kind, ...c.value }, actor.name || actor.email);
    await record({
      kind: "property_person_added",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Home ${propertyId} (${home.name}): ${KIND_LABEL[kind]} ${c.value.name}${c.value.relation ? ` (${c.value.relation})` : ""} added from a new landlord lead. OS only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, person, home: { listingId: String(home.listingId), name: home.name } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be saved just now. Try again in a minute.") }, { status: 500 });
  }
}
