import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { CHANGE_LABEL, createSwap, openSwapFor, type SwapPerson, type TenantChangeKind } from "@/lib/tenant-swaps";
import { getCase } from "@/lib/plc-store";
import { caseIdFor, PLC_STATES } from "@/lib/plc";
import { markApplicationsFiled } from "@/lib/applications-board";
import { forgetApplications } from "@/lib/applications";

/**
 * POST /api/tenant-swaps -> a tenant swap on a home in the caller's book
 * (lib/tenant-swaps, 12 Oct 2026). Body: { listingId, leaving: [contactId],
 * joining: [{ name, email, phone }], moveIn, rentPcm?, note?, kind?,
 * rereference?: [contactId] }. kind is "swap" (the default), "add" (nobody
 * leaves) or "rereference" (nobody leaves or joins; 19 Oct 2026). Answers the
 * application it became ("swap:<id>"), which is pushed to Propoly from its file.
 * Nothing is sent to anyone and nothing is written to REX here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");

/**
 * GET /api/tenant-swaps?listingId=<home> -> the swap under way on a home in the
 * caller's book, with where its PLC check stands (16 Oct 2026, Lianna on 44
 * South Bridge: she went to the home for the PLC check, and the home's page
 * showed no sign the swap had ever been made). { ok, swap: null } when none.
 */
/** Where the PLC stands, in the words an agent uses. */
const PLC_SHORT: Record<string, string> = {
  assembling: "PLC not sent yet",
  submitted: "PLC with compliance",
  scanning: "PLC with compliance",
  reviewing: "PLC with compliance",
  checked: "PLC with compliance",
  approved: "PLC passed",
  deferred: "PLC needs an answer",
  declined: "PLC declined",
};

export async function GET(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: true, swap: null });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const listingId = clean(req.nextUrl.searchParams.get("listingId"), 60);
  if (!listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const swap = await openSwapFor(listingId);
  if (!swap) return NextResponse.json({ ok: true, swap: null });
  /* Only for a home the caller may see, as making one is. */
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });
  if (rexConfigured()) {
    const { book } = await managedBookFor(scope.rexUserId);
    if (!book.properties.some((p) => String(p.listingId) === listingId)) return NextResponse.json({ ok: true, swap: null });
  }
  const application = `swap:${swap.id}`;
  const pack = await getCase(caseIdFor(application)).catch(() => null);
  const st = pack ? PLC_STATES.find((x) => x.id === pack.state) : null;
  return NextResponse.json({
    ok: true,
    application,
    swap: { kind: swap.kind, label: CHANGE_LABEL[swap.kind], rereference: swap.rereference, leaving: swap.leaving.map((x) => x.name), staying: swap.staying.map((x) => x.name), joining: swap.joining.map((x) => x.name), moveIn: swap.moveIn, rentPcm: swap.rentPcm, rentPortion: swap.rentPortion, by: swap.by, at: swap.at },
    plc: pack ? { state: pack.state, label: st?.label ?? pack.state, who: st?.who ?? "", short: PLC_SHORT[pack.state] ?? "PLC under way" } : null,
  });
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The book isn't connected on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { listingId?: string; leaving?: string[]; joining?: Array<{ name?: string; email?: string; phone?: string }>; moveIn?: string; rentPcm?: number; rentPortion?: number; note?: string; kind?: string; rereference?: string[] } | null;
  if (!body?.listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === String(body.listingId));
  if (!home) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 });

  const kind: TenantChangeKind = body.kind === "add" || body.kind === "rereference" ? body.kind : "swap";
  const leavingIds = new Set(kind === "swap" ? (body.leaving ?? []).map(String) : []);
  const leaving: SwapPerson[] = home.tenants.filter((t) => leavingIds.has(String(t.contactId))).map((t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: t.contactId }));
  const staying: SwapPerson[] = home.tenants.filter((t) => !leavingIds.has(String(t.contactId))).map((t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: t.contactId }));
  const joining: SwapPerson[] = (kind === "rereference" ? [] : body.joining ?? [])
    .map((j) => ({ name: clean(j.name), email: clean(j.email, 200).toLowerCase() || null, phone: clean(j.phone, 40) || null }))
    .filter((j) => j.name);

  /* Staying tenants referenced again, by name as the push matches them. */
  const againIds = new Set((body.rereference ?? []).map(String));
  const rereference = staying.filter((t) => againIds.has(String(t.contactId))).map((t) => t.name);
  if (kind === "swap" && !leaving.length) return NextResponse.json({ ok: false, error: "Pick who is leaving." }, { status: 400 });
  if (kind !== "rereference" && !joining.length) return NextResponse.json({ ok: false, error: "Add who is moving in." }, { status: 400 });
  if (kind === "rereference" && !rereference.length) return NextResponse.json({ ok: false, error: "Tick who is being referenced." }, { status: 400 });
  const noMail = staying.find((t) => againIds.has(String(t.contactId)) && (!t.email || !EMAIL.test(t.email)));
  if (noMail) return NextResponse.json({ ok: false, error: `${noMail.name} has no email address on the home - add it first, Propoly sends their referencing to it.` }, { status: 400 });
  const noEmail = joining.find((j) => !j.email || !EMAIL.test(j.email));
  if (noEmail) return NextResponse.json({ ok: false, error: `${noEmail.name} needs an email address - Propoly sends their referencing to it.` }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.moveIn ?? "")) return NextResponse.json({ ok: false, error: kind === "rereference" ? "When does the new contract start?" : "When are they moving in?" }, { status: 400 });
  const rent = typeof body.rentPcm === "number" && body.rentPcm > 0 && body.rentPcm < 100000 ? Math.round(body.rentPcm * 100) / 100 : home.rentMonthly ?? null;

  const portion = typeof body.rentPortion === "number" && body.rentPortion > 0 && body.rentPortion < 100000 ? Math.round(body.rentPortion * 100) / 100 : null;
  if (portion != null && rent != null && portion > rent) return NextResponse.json({ ok: false, error: "Their portion is more than the rent for the whole home." }, { status: 400 });

  const swap = await createSwap({
    kind,
    rereference,
    listingId: String(home.listingId),
    property: [home.name, home.locality].filter(Boolean).join(", "),
    leaving,
    staying,
    joining,
    moveIn: body.moveIn!,
    rentPcm: rent,
    rentPortion: portion,
    note: clean(body.note, 600),
    by: who.actor.name || who.actor.email,
    byEmail: who.actor.email ?? null,
  });
  forgetApplications();
  markApplicationsFiled();
  return NextResponse.json({ ok: true, swap, application: `swap:${swap.id}` });
}
