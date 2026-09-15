import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { record } from "@/lib/audit";
import { MAX_HIGHLIGHTS, planListingWrite, readListingDetails, type ListingEdit } from "@/lib/listing-details";
import { gateListingWrite } from "@/lib/listing-gate";
import { invalidateListingBook } from "@/lib/listings-cache";
import { isExpiredToken, rexCall, rexConfigured, rexWritesLocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";

/**
 * The advert, live from REX, and saved back to it.
 *
 *   GET   ?id=843312        → everything the Marketing tab and the portal
 *                             preview show, with REX's own blockers
 *   PATCH { id, ...edit }   → rent, deposit, available date, heading, body,
 *                             key features, photo order, bedrooms, bathrooms,
 *                             receptions. Anything left out is left alone.
 *
 * The listing half needs Listings/update on REX_ALLOW_WRITES (open since 29
 * Aug for the write-up); the rooms half needs Properties/update, because REX
 * keeps bedrooms on the property, not the listing. A save that touches both
 * reports each half on its own, so a locked property write never loses the
 * listing half.
 *
 * Switch: "Edit the advert into REX" under Listings (lib/area-map).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const listingId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

export async function GET(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = listingId(req.nextUrl.searchParams.get("id"));
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });
  try {
    const details = await readListingDetails(id);
    return NextResponse.json(
      { ok: true, details, locks: { listing: rexWritesLocked("Listings", "update"), rooms: rexWritesLocked("Properties", "update"), media: rexWritesLocked("Upload", "uploadFileFromUrl") || rexWritesLocked("Listings", "update") } },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "REX did not answer." }, { status: 502 });
  }
}

const count = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 50 ? n : undefined;
};
const money = (v: unknown): number | null | undefined => {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? Math.round(n) : undefined;
};

export async function PATCH(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  const gate = await gateListingWrite(req, "listing-edit");
  if ("refuse" in gate) return gate.refuse;
  const { actor } = gate;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = listingId(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "A numeric listing id is required." }, { status: 400 });

  const edit: ListingEdit = {};
  const bad: string[] = [];
  const take = <K extends keyof ListingEdit>(key: K, value: ListingEdit[K] | undefined, raw: unknown) => {
    if (raw === undefined) return;
    if (value === undefined) bad.push(key);
    else edit[key] = value;
  };
  take("rent", money(b.rent), b.rent);
  take("deposit", money(b.deposit), b.deposit);
  take("beds", count(b.beds), b.beds);
  take("baths", count(b.baths), b.baths);
  take("receptions", count(b.receptions), b.receptions);
  if (b.availableFrom !== undefined) {
    if (b.availableFrom === null || b.availableFrom === "") edit.availableFrom = null;
    else if (typeof b.availableFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.availableFrom)) edit.availableFrom = b.availableFrom;
    else bad.push("availableFrom");
  }
  if (b.heading !== undefined) {
    if (typeof b.heading === "string" && b.heading.length <= 255) edit.heading = b.heading.trim();
    else bad.push("heading (255 characters at most - Zoopla refuses longer)");
  }
  if (b.body !== undefined) {
    if (typeof b.body === "string" && b.body.length <= 20_000) edit.body = b.body;
    else bad.push("body");
  }
  if (b.highlights !== undefined) {
    if (Array.isArray(b.highlights) && b.highlights.every((h) => typeof h === "string" && h.length <= 200) && b.highlights.length <= MAX_HIGHLIGHTS) {
      edit.highlights = b.highlights as string[];
    } else bad.push(`key features (${MAX_HIGHLIGHTS} at most, 200 characters each)`);
  }
  if (b.imageOrder !== undefined) {
    if (Array.isArray(b.imageOrder) && b.imageOrder.every((x) => typeof x === "string" || typeof x === "number")) edit.imageOrder = (b.imageOrder as unknown[]).map(String);
    else bad.push("imageOrder");
  }
  if (bad.length) return NextResponse.json({ ok: false, error: `These did not look right: ${bad.join(", ")}.` }, { status: 400 });

  try {
    const plan = await planListingWrite(id, edit);
    if (!plan.listing && !plan.property) return NextResponse.json({ ok: true, id, note: "Nothing to change." });

    const token = await rexTokenFor(actor.id);
    const outcome: { listing?: string; rooms?: string } = {};
    let failed = false;

    if (plan.listing) {
      if (rexWritesLocked("Listings", "update")) {
        outcome.listing = "Locked here: REX_ALLOW_WRITES needs Listings/update.";
        failed = true;
      } else {
        const r = await rexCall("Listings", "update", { data: plan.listing }, token);
        if (!r.ok && token && isExpiredToken(r)) {
          return NextResponse.json({ ok: false, error: "Your REX sign-in has lapsed - reconnect it in your profile and try again.", reconnect: true }, { status: 401 });
        }
        outcome.listing = r.ok ? "Saved." : `REX refused it: ${r.error ?? r.status}`;
        failed ||= !r.ok;
      }
    }
    if (plan.property) {
      if (rexWritesLocked("Properties", "update")) {
        outcome.rooms = "Locked here: REX_ALLOW_WRITES needs Properties/update.";
        failed = true;
      } else {
        const r = await rexCall("Properties", "update", { data: plan.property }, token);
        outcome.rooms = r.ok ? "Saved." : `REX refused it: ${r.error ?? r.status}`;
        failed ||= !r.ok;
      }
    }

    await invalidateListingBook();
    await record({
      kind: "listing_edited",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${id}: ${Object.keys(edit).join(", ")} - listing ${outcome.listing ?? "untouched"}; rooms ${outcome.rooms ?? "untouched"}${token ? "" : " (office account)"}`,
    });

    /* Read back rather than trusting the write: REX trims and normalises. */
    const details = await readListingDetails(id).catch(() => null);
    return NextResponse.json({ ok: !failed, id, outcome, details, error: failed ? [outcome.listing, outcome.rooms].filter((x) => x && x !== "Saved.").join(" ") : undefined });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "REX did not answer." }, { status: 502 });
  }
}
