import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { scopeForWho } from "@/lib/scope";
import { managedBookFor } from "@/lib/managed-book-cache";
import { isTestId } from "@/lib/test-overlay";
import { changeById, changedLandlordFor, cleanChange, saveChange, undoChange } from "@/lib/landlord-change";
import { KIND_LABEL } from "@/lib/landlord-kinds";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * Change landlord (Dan Richards, 17 Oct 2026, ticket 083d7752; lib/landlord-change).
 *
 *   GET    ?listing=<id>&property=<id>     the change in force, if any
 *   POST   { listingId?, propertyId?, kind, name, companyNumber?, contactName?,
 *            email?, phone?, directors?, lateOwner?, confirm: true }
 *   DELETE ?id=<change id>                  undo: REX's owner shows again
 *
 * From the listing page (listingId) or the home's page on Portfolio
 * (propertyId, which must be in the person's own book). The steps on screen
 * end in a check-and-confirm, and the server will not save without
 * `confirm: true`. Kept in the OS only; nothing is written to REX. Every
 * change and undo is audited with who it was before and after.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Who = Awaited<ReturnType<typeof whoIs>>;
type Home = { listingId: string | null; propertyId: string | null; address: string; previous: { name: string; email: string | null; phone: string | null } | null };

async function signedIn(req: NextRequest) {
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (!who?.actor) return { error: NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 }) };
  if (who.subject && who.subject.id !== who.actor.id) {
    return { error: NextResponse.json({ ok: false, error: "You're viewing as somebody else, so this is read-only." }, { status: 403 }) };
  }
  return { who };
}

/** The home being changed, and who its landlord is now, or the answer to send back. */
async function homeFor(req: NextRequest, who: Who, listingIdIn: string, propertyIdIn: string): Promise<{ home: Home } | { error: NextResponse }> {
  if (isTestId(listingIdIn)) return { error: NextResponse.json({ ok: false, error: "A test listing keeps its own landlord." }, { status: 400 }) };
  if (/^\d+$/.test(listingIdIn)) {
    const { readListingDetails } = await import("@/lib/listing-details");
    const { landlordForListing } = await import("@/lib/rex-landlord");
    const [d, now] = await Promise.all([
      readListingDetails(Number(listingIdIn), { cached: true }),
      landlordForListing(listingIdIn).catch(() => null),
    ]);
    const l = now && now.ok ? now.landlord : null;
    return {
      home: {
        listingId: listingIdIn,
        propertyId: d.propertyId ?? (propertyIdIn || null),
        address: d.address,
        previous: l ? { name: l.name, email: l.email, phone: l.phone } : null,
      },
    };
  }
  if (!propertyIdIn) return { error: NextResponse.json({ ok: false, error: "Which home?" }, { status: 400 }) };
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) return { error: NextResponse.json({ ok: false, error: "We can't tell which agent you are, so this can't be saved." }, { status: 403 }) };
  const { book } = await managedBookFor(scope.rexUserId);
  const homes = book.properties.filter((p) => p.propertyId === propertyIdIn);
  const h = homes.find((p) => p.landlord) ?? homes[0];
  if (!h) return { error: NextResponse.json({ ok: false, error: "This home isn't in your book." }, { status: 403 }) };
  if (h.test) return { error: NextResponse.json({ ok: false, error: "A test home keeps its own landlord." }, { status: 400 }) };
  return {
    home: {
      listingId: h.listingId ?? null,
      propertyId: propertyIdIn,
      address: [h.name, h.locality, h.postcode].filter(Boolean).join(", "),
      previous: h.landlord ? { name: h.landlord.name, email: h.landlord.email, phone: h.landlord.phone } : null,
    },
  };
}

export async function GET(req: NextRequest) {
  const s = await signedIn(req);
  if ("error" in s) return s.error;
  const listingId = (req.nextUrl.searchParams.get("listing") ?? "").trim();
  const propertyId = (req.nextUrl.searchParams.get("property") ?? "").trim();
  try {
    return NextResponse.json({ ok: true, change: await changedLandlordFor({ listingId, propertyId }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The landlord couldn't be read just now.") }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const s = await signedIn(req);
  if ("error" in s) return s.error;
  const actor = s.who.actor!;
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (b?.confirm !== true) return NextResponse.json({ ok: false, error: "Confirm the change first." }, { status: 400 });
  const c = cleanChange(b);
  if (!c.ok) return NextResponse.json({ ok: false, error: c.error }, { status: 400 });
  try {
    const h = await homeFor(req, s.who, String(b?.listingId ?? "").trim(), String(b?.propertyId ?? "").trim());
    if ("error" in h) return h.error;
    const { home } = h;
    const change = await saveChange({
      listingId: home.listingId,
      propertyId: home.propertyId,
      address: home.address,
      value: c.value,
      previous: home.previous,
      by: { id: actor.id, name: actor.name || actor.email },
    });
    const v = c.value;
    await record({
      kind: "landlord_changed",
      actorId: actor.id,
      actorEmail: actor.email,
      detail:
        `${home.address || `Listing ${home.listingId}`}: landlord "${home.previous?.name ?? "nobody"}" -> ${KIND_LABEL[v.kind]} "${v.name}"` +
        `${v.companyNumber ? ` (${v.companyNumber})` : ""}${v.contactName ? `, contact ${v.contactName}` : ""}${v.email ? `, ${v.email}` : ""}${v.phone ? `, ${v.phone}` : ""}` +
        `${v.directors.length ? `, directors ${v.directors.map((d) => d.name).join(" / ")}` : ""}. Change ${change.id}. OS only, not REX.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, change });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "The landlord couldn't be changed just now. Try again in a minute.") }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const s = await signedIn(req);
  if ("error" in s) return s.error;
  const actor = s.who.actor!;
  const was = await changeById((req.nextUrl.searchParams.get("id") ?? "").trim()).catch(() => null);
  if (!was) return NextResponse.json({ ok: true });
  try {
    const h = await homeFor(req, s.who, was.listingId ?? "", was.propertyId ?? "");
    if ("error" in h) return h.error;
    await undoChange(was.id, actor.name || actor.email);
    await record({
      kind: "landlord_change_undone",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${h.home.address || `Listing ${was.listingId}`}: change ${was.id} to ${KIND_LABEL[was.kind]} "${was.name}" undone; "${was.previous?.name ?? "nobody"}" shows again.`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be undone just now. Try again in a minute.") }, { status: 500 });
  }
}
