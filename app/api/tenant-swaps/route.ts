import { NextRequest, NextResponse } from "next/server";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { managedBookFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { createSwap, type SwapPerson } from "@/lib/tenant-swaps";
import { markApplicationsFiled } from "@/lib/applications-board";
import { forgetApplications } from "@/lib/applications";

/**
 * POST /api/tenant-swaps -> a tenant swap on a home in the caller's book
 * (lib/tenant-swaps, 12 Oct 2026). Body: { listingId, leaving: [contactId],
 * joining: [{ name, email, phone }], moveIn, rentPcm?, note? }. Answers the
 * application it became ("swap:<id>"), which is pushed to Propoly from its file.
 * Nothing is sent to anyone and nothing is written to REX here.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, n = 120) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The book isn't connected on this environment." }, { status: 503 });
  const who = await whoIs(req).catch(() => null);
  if (!who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell whose book this is." }, { status: 403 });

  const body = (await req.json().catch(() => null)) as { listingId?: string; leaving?: string[]; joining?: Array<{ name?: string; email?: string; phone?: string }>; moveIn?: string; rentPcm?: number; note?: string } | null;
  if (!body?.listingId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  const { book } = await managedBookFor(scope.rexUserId);
  const home = book.properties.find((p) => String(p.listingId) === String(body.listingId));
  if (!home) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 404 });

  const leavingIds = new Set((body.leaving ?? []).map(String));
  const leaving: SwapPerson[] = home.tenants.filter((t) => leavingIds.has(String(t.contactId))).map((t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: t.contactId }));
  const staying: SwapPerson[] = home.tenants.filter((t) => !leavingIds.has(String(t.contactId))).map((t) => ({ name: t.name, email: t.email, phone: t.phone, contactId: t.contactId }));
  const joining: SwapPerson[] = (body.joining ?? [])
    .map((j) => ({ name: clean(j.name), email: clean(j.email, 200).toLowerCase() || null, phone: clean(j.phone, 40) || null }))
    .filter((j) => j.name);

  if (!leaving.length) return NextResponse.json({ ok: false, error: "Pick who is leaving." }, { status: 400 });
  if (!joining.length) return NextResponse.json({ ok: false, error: "Add who is moving in." }, { status: 400 });
  const noEmail = joining.find((j) => !j.email || !EMAIL.test(j.email));
  if (noEmail) return NextResponse.json({ ok: false, error: `${noEmail.name} needs an email address - Propoly sends their referencing to it.` }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(body.moveIn ?? "")) return NextResponse.json({ ok: false, error: "When are they moving in?" }, { status: 400 });
  const rent = typeof body.rentPcm === "number" && body.rentPcm > 0 && body.rentPcm < 100000 ? Math.round(body.rentPcm * 100) / 100 : home.rentMonthly ?? null;

  const swap = await createSwap({
    listingId: String(home.listingId),
    property: [home.name, home.locality].filter(Boolean).join(", "),
    leaving,
    staying,
    joining,
    moveIn: body.moveIn!,
    rentPcm: rent,
    note: clean(body.note, 600),
    by: who.actor.name || who.actor.email,
    byEmail: who.actor.email ?? null,
  });
  forgetApplications();
  markApplicationsFiled();
  return NextResponse.json({ ok: true, swap, application: `swap:${swap.id}` });
}
