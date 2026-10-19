import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { can } from "@/lib/roles";
import { takeOnPushLive } from "@/lib/take-on-push";
import { isLetType } from "@/lib/let-type";
import { cancelTakeOn, createTakeOn, getTakeOn, markComm, takeOnFor, type TakeOn, type TakeOnTenant } from "@/lib/take-ons";

/**
 * Management transfers (lib/take-ons, 19 Oct 2026).
 *
 *   GET    ?home=<listing or OS id>  -> the take-on on that home, or null
 *   GET    ?id=<take-on>             -> one take-on, and whether its push is held
 *   POST   { home?, line1, town, postcode, bedrooms, letType, landlord, service,
 *            feePct, takeoverOn, previousAgent, tenancy, tenants, note }
 *   PATCH  { id, comm, done, note? } -> tick an onboarding letter
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

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, takeOn: null, held: true });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = clean(req.nextUrl.searchParams.get("id"), 40);
  const home = clean(req.nextUrl.searchParams.get("home"), 80);
  const t = id ? await getTakeOn(id) : home ? await takeOnFor(home) : null;
  if (id && !t) return NextResponse.json({ ok: false, error: "That take-on isn't here." }, { status: 404 });
  if (t && t.byEmail !== who.actor.email && !(await homeInBook(req, who, t.homeRef))) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 });
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
  const b = (await req.json().catch(() => null)) as { id?: string; comm?: string; done?: boolean; note?: string } | null;
  const t = b?.id ? await getTakeOn(String(b.id)) : null;
  if (!t || !b?.comm) return NextResponse.json({ ok: false, error: "Which letter?" }, { status: 400 });
  if (t.byEmail !== who.actor.email && !(await homeInBook(req, who, t.homeRef))) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 });
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
