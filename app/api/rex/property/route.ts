import { NextRequest, NextResponse } from "next/server";
import { requireOwner } from "@/lib/admin";
import { createProperty, propertySubcategories, type NewProperty } from "@/lib/rex-properties";

/**
 * PROVING THE PROPERTY PAYLOAD, before any form is built on top of it.
 *
 * ── Why a test endpoint and not a screen ──────────────────────────────────
 *
 * `Properties/create` has never run against live REX. The payload is copied
 * off a real record, which is the strongest evidence short of a write — but
 * building a form, a picker and a success state on top of an unproven shape
 * means discovering it is wrong through three layers of UI. One supervised
 * call proves it or corrects it in a minute.
 *
 * ── Two things stop this being dangerous ──────────────────────────────────
 *
 * 1. **GET is a DRY RUN.** It returns the exact payload that would be sent and
 *    writes nothing. Look at it before firing it.
 * 2. **POST needs `confirm: true`.** Not because the switch and the write lock
 *    are insufficient, but because this creates a record in the live system
 *    six businesses share and a mistyped curl should not be enough.
 *
 * Owner-only on top of that. This is not an agent's tool; it exists to be run
 * once, deliberately, by the person who armed the switch.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

function readBody(v: Record<string, unknown>): NewProperty {
  const s = (k: string) => String(v[k] ?? "").trim();
  return {
    streetNumber: s("streetNumber"),
    streetName: s("streetName"),
    town: s("town"),
    postcode: s("postcode"),
    categoryId: s("categoryId") || "residential",
    subcategoryId: s("subcategoryId") || null,
    ownerContactId: s("ownerContactId") || null,
  };
}

/** What would be sent, and the subcategories to choose from. Writes nothing. */
export async function GET(req: NextRequest) {
  const me = await requireOwner(req);
  if (!me) return new NextResponse(null, { status: 404 });

  const p = req.nextUrl.searchParams;
  const draft = readBody(Object.fromEntries(p.entries()));

  return NextResponse.json({
    dryRun: true,
    wouldSend: {
      adr_street_number: draft.streetNumber,
      adr_street_name: draft.streetName,
      adr_suburb_or_town: draft.town,
      adr_postcode: draft.postcode.toUpperCase(),
      adr_country: "uk",
      property_category: { id: draft.categoryId },
      ...(draft.subcategoryId ? { property_subcategory: { id: draft.subcategoryId } } : {}),
      ...(draft.ownerContactId
        ? {
            related: {
              contact_reln_property: [
                { reln_type: { id: "owner" }, contact: { id: draft.ownerContactId } },
              ],
            },
          }
        : {}),
    },
    /* Offered here so the first real call can name a subcategory rather than
       omitting it — the ids are account-specific and cannot be guessed. */
    subcategories: await propertySubcategories().catch(() => []),
    note:
      "Nothing was written. POST the same fields with confirm:true to create it. " +
      "Use a clearly-marked test address — this lands in the live REX account.",
  });
}

export async function POST(req: NextRequest) {
  const me = await requireOwner(req);
  if (!me) return new NextResponse(null, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (body.confirm !== true) {
    return NextResponse.json(
      {
        error:
          "Add confirm:true to actually create it. This writes a real record into the REX " +
          "account six businesses share — GET the same endpoint first to see the payload.",
      },
      { status: 428 }
    );
  }

  const outcome = await createProperty(readBody(body), me.id);
  if (!outcome.ok) {
    /* The library's own words, verbatim. Each refusal names the gate it hit —
       a switch, the write lock, a missing REX link — and a generic "failed"
       would send somebody hunting through three of them. */
    return NextResponse.json(outcome, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    propertyId: outcome.propertyId,
    createdBy: me.name || me.email,
    /* NO DEEP LINK. lib/business/rex-links confirms the shape for LISTINGS
       (#lens=rental&id=…) against live records and says nothing about
       properties, so a /properties/<id> URL would be a guess — and a link that
       looks right and opens the wrong thing is worse than the id on its own.
       Search the id in REX until the property shape is confirmed. */
    note:
      "Created in live REX. Find it by searching the id, check the address and the owner " +
      "link, and archive it if this was a test.",
  });
}
