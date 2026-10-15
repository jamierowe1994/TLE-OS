import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { isRecordLandlord, recordRowsFor, saveRecordLandlord } from "@/lib/record-landlords";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * Add or change the landlord of a home REX names no owner for (Lorna
 * Fieldson, 14 Oct 2026, 44 Pilots Way). POST { propertyId, name, email?, phone? }.
 *
 * Kept on the OS's own property record and nowhere else: nothing is written
 * to REX (putting an owner on a REX listing is a separate, switched write,
 * lib/rex-listing-owner). A home whose REX listing does name its landlord is
 * changed on that landlord's card instead, so this never sits beside one.
 * The person must have the home in their own book; every save is audited.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  const actor = who?.actor ?? null;
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as { propertyId?: unknown; name?: unknown; email?: unknown; phone?: unknown } | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  const name = String(b?.name ?? "").trim().replace(/\s+/g, " ");
  const email = String(b?.email ?? "").trim().toLowerCase() || null;
  const phone = String(b?.phone ?? "").trim() || null;
  if (!propertyId) return NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 });
  if (name.length < 2) return NextResponse.json({ ok: false, error: "Put the landlord's name in." }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ ok: false, error: "That name is too long." }, { status: 400 });
  if (email && !EMAIL.test(email)) return NextResponse.json({ ok: false, error: "That email address doesn't look right." }, { status: 400 });
  if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone)) return NextResponse.json({ ok: false, error: "That phone number doesn't look right." }, { status: 400 });

  try {
    const scope = await scopeForWho(req, who);
    if (scope.unlinked) return NextResponse.json({ ok: false, error: "We can't tell which agent you are, so this can't be saved." }, { status: 403 });
    const { book } = await managedBookFor(scope.rexUserId);
    const homes = book.properties.filter((p) => p.propertyId === propertyId);
    if (!homes.length) return NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 });
    const named = homes.find((p) => p.landlord && !isRecordLandlord(p.landlord.contactId));
    if (named) return NextResponse.json({ ok: false, error: `${named.landlord!.name} is already the landlord on record. Change their details on their card.` }, { status: 409 });

    const rows = await recordRowsFor(propertyId);
    if (!rows.length) return NextResponse.json({ ok: false, error: "This home has no file of its own in the OS yet, so the landlord can't be kept here." }, { status: 404 });
    await saveRecordLandlord(rows.map((r) => r.id), { name, email, phone });
    const was = rows.find((r) => r.landlord_name?.trim())?.landlord_name?.trim() ?? "";
    await record({
      kind: "record_landlord_saved",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `Home ${propertyId} (${homes[0].name}): landlord "${was}" -> "${name}"${email ? `, ${email}` : ""}${phone ? `, ${phone}` : ""}. OS record only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, landlord: { contactId: `record:${name.toLowerCase()}`, name, email, phone } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The landlord couldn't be saved just now. Try again in a minute.") }, { status: 500 });
  }
}
