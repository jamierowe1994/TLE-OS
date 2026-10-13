import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { readListingDetails } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { deriveLetType, isHmoLet, isLetType, requiredFor, type LetType } from "@/lib/let-type";
import { isScottishHome } from "@/lib/compliance";
import { isTestId } from "@/lib/test-overlay";

/**
 * WHAT THIS HOME IS, AND WHAT IS ALREADY ON FILE FOR IT (James, 12 Oct 2026).
 *
 *   GET   ?id=<listing>               -> { letType, derived, why, required, scotland, noGas, terms }
 *   PATCH { id, letType }             -> the same, with the new type kept
 *
 * The type of let decides the certificates the listing's Compliance asks for.
 * Terms count from wherever they already are - REX's entry, an upload marked
 * as terms, a DocuSeal signature, or the OS property record - so a landlord
 * who signed years ago is never asked to sign again.
 *
 * Choosing HMO or Professional also marks the OS property record as an HMO,
 * so the tracker asks for the same certificates. Choosing Residential changes
 * nothing there: an HMO on the record is not undone from a listing.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const OFFICE = new Set(["owner", "super_admin", "developer", "pretenancy", "compliance"]);

const listingId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

type OsHome = { id: string; hmo: boolean; not_hmo: boolean | null; no_gas: boolean };

async function answer(id: number) {
  const d = await readListingDetails(id, { cached: true });
  const homeKey = d.propertyId ?? `listing:${id}`;
  const [kept, homes] = await Promise.all([
    hasDb() ? q<{ let_type: string; by_name: string; set_at: Date }>(`SELECT let_type, by_name, set_at FROM os_home_let_types WHERE home_key = $1`, [homeKey]).catch(() => []) : Promise.resolve([]),
    hasDb()
      ? q<OsHome>(`SELECT id, hmo, not_hmo, no_gas FROM os_properties WHERE ($1::text IS NOT NULL AND rex_property_id = $1) OR id = $2`, [d.propertyId, d.record.osPropertyId ?? ""]).catch(() => [] as OsHome[])
      : Promise.resolve([] as OsHome[]),
  ]);
  const hmo = homes.some((h) => h.hmo && !h.not_hmo);
  const noGas = homes.length > 0 && homes.every((h) => h.no_gas);
  const name = d.address || d.street;
  const scotland = d.record.scotland || isScottishHome({ name, locality: `${d.town} ${d.postcode}` });
  const guess = deriveLetType({ name, hmo, propertyType: d.propertyType, heading: d.heading });
  const k = kept[0];
  const letType: LetType = k && isLetType(k.let_type) ? k.let_type : guess.value;

  /* Terms, from wherever they already are. */
  let terms: { rex: boolean | null; held: { how: string; name: string; at: string | null } | null } = { rex: null, held: null };
  if (d.propertyId) {
    const { osTermsFor, rexHasTerms } = await import("@/lib/terms-to-rex");
    const [rex, mine] = await Promise.all([rexHasTerms(d.propertyId).catch(() => null), osTermsFor(d.propertyId).catch(() => null)]);
    terms = {
      rex,
      held: mine
        ? {
            how: mine.source === "record" ? "On the property record" : mine.source === "signed" ? "Signed online" : "Uploaded",
            name: mine.file_name,
            at: mine.at ? new Date(mine.at).toISOString() : null,
          }
        : null,
    };
  }

  return {
    ok: true,
    letType,
    derived: !k,
    why: k ? `Set by ${k.by_name || "the office"}` : guess.why,
    required: requiredFor(letType, { scotland, noGas }),
    scotland,
    noGas,
    terms,
  };
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("id");
  if (isTestId(raw)) return NextResponse.json({ ok: false, error: "A test listing has no home record.", test: true }, { status: 409 });
  const id = listingId(raw);
  if (!id) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  const notTheirs = await listingIsTheirs(actor, id);
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
  try {
    return NextResponse.json(await answer(id), { headers: { "cache-control": "private, no-store" } });
  } catch {
    return NextResponse.json({ ok: false, error: "The home's record did not answer. Try again in a minute." }, { status: 502 });
  }
}

export async function PATCH(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (viewingAs) return NextResponse.json({ ok: false, error: "You are viewing as somebody else. Stop viewing as them to change this." }, { status: 403 });
  if (actor.role !== "agent" && !OFFICE.has(actor.role)) return NextResponse.json({ ok: false, error: "The type of let is for the listing's agent or the office." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "There is no database on this environment." }, { status: 503 });

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; letType?: unknown };
  if (isTestId(b.id)) return NextResponse.json({ ok: false, error: "A test listing has no home record.", test: true }, { status: 409 });
  const id = listingId(b.id);
  if (!id) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  if (!isLetType(b.letType)) return NextResponse.json({ ok: false, error: "Residential, HMO or Professional." }, { status: 400 });
  const notTheirs = await listingIsTheirs(actor, id);
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });

  try {
    const d = await readListingDetails(id, { cached: true });
    const homeKey = d.propertyId ?? `listing:${id}`;
    await q(
      `INSERT INTO os_home_let_types (home_key, let_type, by_name) VALUES ($1,$2,$3)
       ON CONFLICT (home_key) DO UPDATE SET let_type = EXCLUDED.let_type, by_name = EXCLUDED.by_name, set_at = NOW()`,
      [homeKey, b.letType, actor.name ?? actor.email]
    );
    if (isHmoLet(b.letType)) {
      await q(
        `UPDATE os_properties SET hmo = TRUE, not_hmo = FALSE, updated_at = NOW()
          WHERE (($1::text IS NOT NULL AND rex_property_id = $1) OR id = $2) AND (NOT hmo OR not_hmo)`,
        [d.propertyId, d.record.osPropertyId ?? ""]
      ).catch(() => null);
    }
    return NextResponse.json(await answer(id));
  } catch {
    return NextResponse.json({ ok: false, error: "That did not save. Try again in a minute." }, { status: 502 });
  }
}
