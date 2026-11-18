import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { can } from "@/lib/roles";
import { takeOnPushLive } from "@/lib/take-on-push";
import { isLetType } from "@/lib/let-type";
import { cancelTakeOn, createTakeOn, getTakeOn, markComm, moveTakeOn, takeOnFor, type TakeOn, type TakeOnTenant } from "@/lib/take-ons";
import { forgetBooks } from "@/lib/managed-book-cache";
import { houseByListing, housesIn, MANAGED_READERS, roomLabel } from "@/lib/houses";
import { houseNameFrom, isRoomAddress } from "@/lib/address-parse";
import { record } from "@/lib/audit";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * Management transfers (lib/take-ons, 19 Oct 2026).
 *
 *   GET    ?home=<listing or OS id>  -> the take-on on that home, or null
 *   GET    ?id=<take-on>             -> one take-on, and whether its push is held
 *   POST   { home?, line1, town, postcode, bedrooms, letType, landlord, service,
 *            feePct, takeoverOn, previousAgent, tenancy, tenants, note }
 *   GET    ?id=<take-on>&rooms=1     -> and the rooms of its house, for Move to Another Room
 *   PATCH  { id, comm, done, note? } -> tick an onboarding letter
 *   PATCH  { id, move: { home } | { room } } -> put it on another room of the
 *            same house, or on a room the house doesn't show yet ("4", "Room 4")
 *   DELETE ?id=<take-on>             -> cancel it (the home's record stays)
 *
 * Writes to the OS only. Nothing reaches REX, Propoly or PayProp, and nobody
 * is emailed. The pushes are /api/take-ons/push.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const POSTCODE = /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i;
const clean = (v: unknown, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const day = (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const money = (v: unknown) => (typeof v === "number" && v >= 0 && v < 1_000_000 ? Math.round(v * 100) / 100 : null);

/** May this person see the home? Their own book, or the office's whole one. */
async function homeInBook(req: NextRequest, who: Awaited<ReturnType<typeof whoIs>>, homeRef: string): Promise<boolean> {
  if (!rexConfigured()) return true;
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return false;
  /* The office sees every home: no need to read the book to say so. */
  if (scope.everything) return true;
  const { book } = await managedBookFor(scope.rexUserId);
  return book.properties.some((p) => String(p.listingId) === homeRef);
}

/**
 * Held = its push to Propoly is still rehearsed (take_on_propoly off). `push`
 * says which of the two pushes run for real, and whether this person may
 * press them (the office: lib/take-on-push, /api/take-ons/push).
 */
async function answer(t: TakeOn | null, who?: Awaited<ReturnType<typeof whoIs>> | null) {
  const [propolyLive, rexLive] = await Promise.all([takeOnPushLive("propoly"), takeOnPushLive("rex")]);
  const canPush = Boolean(who?.actor && !who.viewingAs && can(who.actor.role, "see:pretenancy"));
  return { ok: true, takeOn: t, held: !propolyLive, push: { propolyLive, rexLive, canPush } };
}

/** One room of the take-on's house, as Move to Another Room lists it. */
type RoomChoice = { ref: string; label: string; tenant: string | null; here: boolean };

const addrOf = (p: ManagedProperty) => `${p.name}, ${p.locality}`;

/**
 * The home a take-on is on, as this person's book has it, and the other rooms
 * of its house. `home` is null when the book doesn't hold it (a take-on made
 * by somebody else, on a home outside this person's own book).
 */
async function roomsOf(req: NextRequest, who: Awaited<ReturnType<typeof whoIs>>, t: TakeOn): Promise<{ home: ManagedProperty | null; isRoom: boolean; rooms: RoomChoice[]; all: ManagedProperty[] }> {
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return { home: null, isRoom: false, rooms: [], all: [] };
  const { book } = await managedBookFor(scope.everything ? null : scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === t.homeRef) ?? null;
  if (!home) return { home: null, isRoom: false, rooms: [], all: [] };
  const house = houseByListing(housesIn(book.properties, MANAGED_READERS), MANAGED_READERS).get(String(home.listingId)) ?? null;
  const all = house?.kind === "rooms" ? house.rooms : [home];
  const takenOn = await Promise.all(all.map((p) => (String(p.listingId) === t.homeRef ? null : takeOnFor(String(p.listingId)).catch(() => null))));
  /* Whoever is named on this room only because this take-on put them there doesn't count as living in it. */
  const mine = new Set(t.tenants.map((x) => x.name.trim().toLowerCase()));
  return {
    home,
    isRoom: isRoomAddress(addrOf(home)),
    all,
    rooms: all.map((p, i) => {
      const here = String(p.listingId) === t.homeRef;
      const other = takenOn[i]?.tenants[0]?.name ?? null;
      const living = p.tenants.find((x) => here ? !mine.has(x.name.trim().toLowerCase()) : true)?.name ?? null;
      return { ref: String(p.listingId), label: roomLabel(p), tenant: here ? living : living ?? other, here };
    }),
  };
}

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, takeOn: null, held: true });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = clean(req.nextUrl.searchParams.get("id"), 40);
  const home = clean(req.nextUrl.searchParams.get("home"), 80);
  const t = id ? await getTakeOn(id) : home ? await takeOnFor(home) : null;
  if (id && !t) return NextResponse.json({ ok: false, error: "That take-on isn't here." }, { status: 404 });
  if (t && t.byEmail !== who.actor.email && !(await homeInBook(req, who, t.homeRef))) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 });
  if (t && id && req.nextUrl.searchParams.get("rooms") === "1") {
    const r = await roomsOf(req, who, t).catch(() => null);
    return NextResponse.json({ ...(await answer(t, who)), house: r ? { isRoom: r.isRoom, rooms: r.rooms } : { isRoom: false, rooms: [] } });
  }
  return NextResponse.json(await answer(t, who));
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b) return NextResponse.json({ ok: false, error: "Nothing was sent." }, { status: 400 });

  const homeRef = clean(b.home, 80) || null;
  if (homeRef) {
    if (!(await homeInBook(req, who, homeRef))) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 });
    if (await takeOnFor(homeRef)) return NextResponse.json({ ok: false, error: "This home is already marked as a management transfer." }, { status: 409 });
  }
  const line1 = clean(b.line1);
  const postcode = clean(b.postcode, 10).toUpperCase();
  if (!homeRef && !line1) return NextResponse.json({ ok: false, error: "What is the address?" }, { status: 400 });
  if (!homeRef && !POSTCODE.test(postcode)) return NextResponse.json({ ok: false, error: "That postcode doesn't look right." }, { status: 400 });

  const ll = (b.landlord ?? {}) as Record<string, unknown>;
  const landlord = { name: clean(ll.name), email: clean(ll.email, 200).toLowerCase() || null, phone: clean(ll.phone, 40) || null };
  if (!landlord.name) return NextResponse.json({ ok: false, error: "Who is the landlord?" }, { status: 400 });
  if (landlord.email && !EMAIL.test(landlord.email)) return NextResponse.json({ ok: false, error: "The landlord's email doesn't look right." }, { status: 400 });

  const tenants: TakeOnTenant[] = (Array.isArray(b.tenants) ? b.tenants : [])
    .map((x) => x as Record<string, unknown>)
    .map((x) => ({ name: clean(x.name), email: clean(x.email, 200).toLowerCase() || null, phone: clean(x.phone, 40) || null, reference: x.reference === true }))
    .filter((x) => x.name)
    .slice(0, 12);
  if (!tenants.length) return NextResponse.json({ ok: false, error: "Add the tenants living there." }, { status: 400 });
  const bad = tenants.find((x) => x.email && !EMAIL.test(x.email));
  if (bad) return NextResponse.json({ ok: false, error: `${bad.name}'s email doesn't look right.` }, { status: 400 });
  const noMail = tenants.find((x) => x.reference && !x.email);
  if (noMail) return NextResponse.json({ ok: false, error: `${noMail.name} needs an email address to be referenced.` }, { status: 400 });

  const takeoverOn = day(b.takeoverOn);
  if (!takeoverOn) return NextResponse.json({ ok: false, error: "When do we take it over?" }, { status: 400 });
  const tn = (b.tenancy ?? {}) as Record<string, unknown>;
  const t = await createTakeOn({
    homeRef,
    line1: line1 || clean(b.homeName),
    town: clean(b.town, 60),
    postcode,
    bedrooms: typeof b.bedrooms === "number" && b.bedrooms >= 0 && b.bedrooms < 30 ? Math.round(b.bedrooms) : null,
    letType: isLetType(b.letType) ? b.letType : "residential",
    landlord,
    service: b.service === "rent_collect" ? "rent_collect" : "managed",
    feePct: typeof b.feePct === "number" && b.feePct > 0 && b.feePct < 50 ? Math.round(b.feePct * 100) / 100 : null,
    takeoverOn,
    previousAgent: clean(b.previousAgent),
    tenancy: {
      startedOn: day(tn.startedOn),
      rentPcm: money(tn.rentPcm),
      depositPounds: money(tn.depositPounds),
      depositHeld: clean(tn.depositHeld, 30) || "previous_agent",
      periodic: tn.periodic === true,
      endsOn: tn.periodic === true ? null : day(tn.endsOn),
    },
    tenants,
    note: clean(b.note, 800),
    agentRexId: scope.rexUserId,
    by: who.actor.name || who.actor.email || "unknown",
    byEmail: who.actor.email ?? null,
  });
  return NextResponse.json(await answer(t, who));
}

export async function PATCH(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { id?: string; comm?: string; done?: boolean; note?: string; move?: { home?: unknown; room?: unknown } } | null;
  const t = b?.id ? await getTakeOn(String(b.id)) : null;
  if (!t || (!b?.comm && !b?.move)) return NextResponse.json({ ok: false, error: b?.move ? "That take-on isn't here." : "Which letter?" }, { status: 400 });
  if (t.byEmail !== who.actor.email && !(await homeInBook(req, who, t.homeRef))) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 });
  if (b.move) {
    if (who.viewingAs) return NextResponse.json({ ok: false, error: "You are looking as somebody else: nothing is changed from here." }, { status: 403 });
    const r = await roomsOf(req, who, t);
    if (!r.home) return NextResponse.json({ ok: false, error: "The home this transfer is on isn't in your book, so it can't be moved from here." }, { status: 404 });
    if (!r.isRoom) return NextResponse.json({ ok: false, error: "This home isn't a room in a shared house." }, { status: 400 });
    const here = r.rooms.find((x) => x.here);
    if (here?.tenant) return NextResponse.json({ ok: false, error: `${here.tenant} is on ${here.label} as well. Take them off it first, so the room is left right.` }, { status: 409 });
    const toHome = clean(b.move.home, 80);
    const typed = clean(b.move.room, 20);
    let to: Parameters<typeof moveTakeOn>[1];
    let label: string;
    if (toHome) {
      const target = r.all.find((p) => String(p.listingId) === toHome);
      const choice = r.rooms.find((x) => x.ref === toHome);
      if (!target || !choice || choice.here) return NextResponse.json({ ok: false, error: "Pick another room of this house." }, { status: 400 });
      if (choice.tenant) return NextResponse.json({ ok: false, error: `${choice.tenant} is on ${choice.label} already.` }, { status: 409 });
      label = choice.label;
      to = { homeRef: toHome, line1: target.name, town: target.town ?? "", postcode: target.postcode ?? "", locality: target.locality };
    } else {
      const m = typed.match(/^(?:room\s*)?([a-z0-9]{1,3})$/i);
      if (!m) return NextResponse.json({ ok: false, error: "Which room? A number or a letter, like 4." }, { status: 400 });
      label = `Room ${m[1].toUpperCase()}`;
      const has = r.rooms.find((x) => x.label.toLowerCase() === label.toLowerCase());
      if (has) return NextResponse.json({ ok: false, error: has.here ? `It is on ${label} now.` : `${label} is on this house already: pick it from the list.` }, { status: 409 });
      const postcode = (r.home.postcode ?? t.postcode ?? "").trim();
      if (!postcode) return NextResponse.json({ ok: false, error: "This home has no postcode on it. Add one with Change address, then move the transfer." }, { status: 400 });
      to = { homeRef: null, line1: `${label}, ${houseNameFrom(r.home.name)}`, town: r.home.town ?? t.town ?? "", postcode, locality: r.home.locality };
    }
    const moved = await moveTakeOn(t.id, to);
    if ("error" in moved) return NextResponse.json({ ok: false, error: moved.error }, { status: 409 });
    await forgetBooks();
    await record({
      kind: "take_on_moved",
      actorId: who.actor.id,
      actorEmail: who.actor.email ?? "",
      subjectId: t.id,
      detail: `Management transfer ${t.id}: ${moved.from} -> ${moved.takeOn.line1}${to.homeRef ? "" : " (a room new to the OS)"}. OS only.`,
    });
    return NextResponse.json({ ...(await answer(moved.takeOn, who)), moved: { from: here?.label ?? moved.from, to: label } });
  }
  if (!b.comm) return NextResponse.json({ ok: false, error: "Which letter?" }, { status: 400 });
  const next = await markComm(t.id, String(b.comm), b.done !== false, who.actor.name || who.actor.email || "unknown", clean(b.note, 300));
  if (!next) return NextResponse.json({ ok: false, error: "That letter isn't on the list." }, { status: 400 });
  return NextResponse.json(await answer(next, who));
}

export async function DELETE(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const t = await getTakeOn(clean(req.nextUrl.searchParams.get("id"), 40));
  if (!t) return NextResponse.json({ ok: false, error: "That take-on isn't here." }, { status: 404 });
  if (t.byEmail !== who.actor.email && !(await homeInBook(req, who, t.homeRef))) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 });
  return NextResponse.json({ ok: await cancelTakeOn(t.id) });
}
