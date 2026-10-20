import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { addPerson, cleanPerson, isKind, KIND_LABEL, peopleOn, personById, removePerson, updatePerson } from "@/lib/property-people";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * The joint landlords and points of contact on a home (agent call, 16 Oct
 * 2026; lib/property-people).
 *
 *   GET    ?property=<id>                            everyone on the home
 *   POST   { propertyId, kind, name, email?, phone?, relation? }
 *   PATCH  { id, name, email?, phone?, relation? }
 *   DELETE ?id=<id>
 *
 * Anyone signed in may change them, from wherever the landlord shows (20 Oct
 * 2026); every change is audited.
 * Kept in the OS only: nothing here is written to REX.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Who = Awaited<ReturnType<typeof whoIs>>;

/**
 * The home, for the audit line. NEVER a reason to refuse (James, 20 Oct 2026:
 * "we always need to be able to update their details. We should never stop
 * them from doing it"): the same people are changed from a let, a listing, an
 * appraisal and the home's page, and most of those homes are not in the
 * agent's own managed book - a listing isn't on the book until it is let. So
 * any home key is taken: a REX property id, a REX PM home ("pm-..."), or the
 * screen's own key where there is no home yet ("listing:<id>", "let:<ref>",
 * "appraisal:<id>"). A test home still keeps its own people.
 */
async function homeFor(_req: NextRequest, _who: Who, propertyId: string) {
  const { book } = await managedBookFor(null).catch(() => ({ book: { properties: [] as Array<{ propertyId: string; name: string; test?: boolean }> } }));
  const home = (book.properties as Array<{ propertyId: string; name: string; test?: boolean }>).find((p) => p.propertyId === propertyId);
  if (home?.test) return { error: NextResponse.json({ ok: false, error: "A test home keeps its own people." }, { status: 400 }) };
  return { home: { name: home?.name ?? propertyId } };
}

async function signedIn(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  return who?.actor ? who : null;
}

export async function GET(req: NextRequest) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const propertyId = (req.nextUrl.searchParams.get("property") ?? "").trim();
  if (!propertyId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  try {
    return NextResponse.json({ ok: true, people: await peopleOn(propertyId) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The people on this home couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const actor = who.actor!;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  if (!propertyId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (!isKind(b?.kind)) return NextResponse.json({ ok: false, error: "A joint landlord or a point of contact?" }, { status: 400 });
  const kind = b.kind;
  const c = cleanPerson(b);
  if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: 400 });
  try {
    const h = await homeFor(req, who, propertyId);
    if (h.error) return h.error;
    if ((await peopleOn(propertyId)).length >= 12) return NextResponse.json({ ok: false, error: "That's twelve people on this home already. Remove one first." }, { status: 400 });
    const person = await addPerson(propertyId, { kind, ...c.value }, actor.name || actor.email);
    await record({
      kind: "property_person_added",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Home ${propertyId} (${h.home.name}): ${KIND_LABEL[kind]} ${c.value.name}${c.value.relation ? ` (${c.value.relation})` : ""} added. OS only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, person });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be saved just now. Try again in a minute.") }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const actor = who.actor!;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const was = await personById(String(b?.id ?? "")).catch(() => null);
  if (!was) return NextResponse.json({ ok: false, error: "That person isn't on the home any more." }, { status: 404 });
  const c = cleanPerson(b);
  if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: 400 });
  try {
    const h = await homeFor(req, who, was.propertyId);
    if (h.error) return h.error;
    const person = await updatePerson(was.id, c.value);
    await record({
      kind: "property_person_changed",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Home ${was.propertyId} (${h.home.name}): ${KIND_LABEL[was.kind]} "${was.name}" ${was.email ?? ""} ${was.phone ?? ""} -> "${c.value.name}" ${c.value.email ?? ""} ${c.value.phone ?? ""}. OS only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, person });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be saved just now. Try again in a minute.") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const who = await signedIn(req);
  if (!who) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const actor = who.actor!;
  const was = await personById((req.nextUrl.searchParams.get("id") ?? "").trim()).catch(() => null);
  if (!was) return NextResponse.json({ ok: true });
  try {
    const h = await homeFor(req, who, was.propertyId);
    if (h.error) return h.error;
    await removePerson(was.id);
    await record({
      kind: "property_person_removed",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Home ${was.propertyId} (${h.home.name}): ${KIND_LABEL[was.kind]} ${was.name} removed.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be removed just now. Try again in a minute.") }, { status: 500 });
  }
}
