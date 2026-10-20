import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { readListingDetails } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { deriveLetType, isHmoLet, isLetType, requiredFor, type LetType } from "@/lib/let-type";
import { isScottishHome } from "@/lib/compliance";
import { isTestId, testListing } from "@/lib/test-overlay";
import { testTermsParties } from "@/lib/test-terms";
import { introOnlyMark, setIntroOnly } from "@/lib/intro-only";
import { forgetListing } from "@/lib/listing-details";
import { record } from "@/lib/audit";
import { homeFactsFor } from "@/lib/home-facts";
import { NO_FACTS } from "@/lib/home-facts-shared";

/**
 * WHAT THIS HOME IS, AND WHAT IS ALREADY ON FILE FOR IT (James, 12 Oct 2026).
 *
 *   GET   ?id=<listing>               -> { letType, derived, why, required, scotland, noGas, terms }
 *   PATCH { id, letType }             -> the same, with the new type kept
 *   PATCH { id, introOnly }           -> the same, marked intro only or not
 *
 * Intro only (16 Oct 2026, lib/intro-only) is the one service the OS keeps
 * itself: the agent or the office marks it here, and the file then ends at
 * the landlord's yes. The other services are the listing's own and are not
 * changed from here.
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
  /* What a person in the OS has said about the home (lib/home-facts, 19 Oct
     2026) beats the property record's own columns. */
  const factsKey = d.propertyId ?? d.record.osPropertyId ?? null;
  const facts = factsKey ? await homeFactsFor(factsKey).catch(() => NO_FACTS) : NO_FACTS;
  const hmo = facts.homeType ? facts.homeType === "hmo" : homes.some((h) => h.hmo && !h.not_hmo);
  const noGas = facts.gasSupply ? facts.gasSupply === "none" : homes.length > 0 && homes.every((h) => h.no_gas);
  const name = d.address || d.street;
  const scotland = d.record.scotland || isScottishHome({ name, locality: `${d.town} ${d.postcode}` });
  const guess = deriveLetType({ name, hmo, propertyType: d.propertyType, heading: d.heading });
  const k = kept[0];
  const letType: LetType = k && isLetType(k.let_type) ? k.let_type : guess.value;

  /* Terms, from wherever they already are. */
  let terms: { rex: boolean | null; held: { how: string; name: string; at: string | null } | null } = { rex: null, held: null };
  if (d.propertyId) {
    const { osTermsFor, rexHasTerms } = await import("@/lib/terms-to-rex");
    const [rex, mine] = await Promise.all([rexHasTerms(d.propertyId).catch(() => null), osTermsFor(d.propertyId, { record: true }).catch(() => null)]);
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

  const intro = await introOnlyMark(id).catch(() => null);
  return {
    ok: true,
    introOnly: intro ? { by: intro.by, at: intro.at } : null,
    letType,
    derived: !k,
    why: k ? `Set by ${k.by_name || "the office"}` : guess.why,
    required: requiredFor(letType, { scotland, noGas }),
    scotland,
    noGas,
    terms,
    /* For the home's facts card: the home it is keyed on, and what the advert says heats it. */
    homeKey: factsKey,
    heating: d.facts.heating ?? null,
    eic: facts.electrical === "eic",
  };
}

/**
 * A TEST listing's home (James, 13 Oct 2026, the E2E walk): its terms were
 * signed in the OS alone (lib/test-terms fileTestSignature, on the appraisal
 * the listing was made from), and the header still said "No terms on file"
 * because a test listing had no home answer at all. Residential, nothing
 * kept, and the terms held when that appraisal's test signature is there.
 */
async function testAnswer(id: number) {
  const l = await testListing(id).catch(() => null);
  if (!l) return null;
  const parties = l.appraisalId ? await testTermsParties(l.appraisalId).catch(() => null) : null;
  const signed = (parties ?? []).find((p) => p.role === "landlord" && p.completedAt);
  const intro = await introOnlyMark(id).catch(() => null);
  return {
    ok: true,
    introOnly: intro ? { by: intro.by, at: intro.at } : null,
    letType: "residential" as LetType,
    derived: true,
    why: "A test listing",
    required: requiredFor("residential", { scotland: false, noGas: false }),
    scotland: false,
    noGas: false,
    homeKey: null,
    heating: null,
    terms: { rex: null, held: signed ? { how: "Signed online (test)", name: "Terms of business (test)", at: signed.completedAt } : null },
    test: true,
  };
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const raw = req.nextUrl.searchParams.get("id");
  if (isTestId(raw)) {
    const t = await testAnswer(Number(raw));
    return t ? NextResponse.json(t, { headers: { "cache-control": "private, no-store" } }) : NextResponse.json({ ok: false, error: "That test listing has gone.", test: true }, { status: 404 });
  }
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

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; letType?: unknown; introOnly?: unknown };

  /* Intro only, on or off. A test listing can be marked too, so a tester
     can walk an intro-only let end to end. */
  if (typeof b.introOnly === "boolean") {
    const testId = isTestId(b.id);
    const lid = testId ? Number(b.id) : listingId(b.id);
    if (!lid) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
    if (!testId) {
      const notTheirs = await listingIsTheirs(actor, lid);
      if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });
    }
    try {
      await setIntroOnly(lid, b.introOnly, { by: actor.name || actor.email, source: "listing" });
      await forgetListing(lid);
      await record({ kind: "listing_edited", actorId: actor.id, actorEmail: actor.email, detail: `listing ${lid} ${b.introOnly ? "marked marketing only" : "no longer marketing only"} (kept in the OS only)` }).catch(() => {});
      if (testId) {
        const t = await testAnswer(lid);
        return t ? NextResponse.json(t) : NextResponse.json({ ok: false, error: "That test listing has gone.", test: true }, { status: 404 });
      }
      return NextResponse.json(await answer(lid));
    } catch {
      return NextResponse.json({ ok: false, error: "That did not save. Try again in a minute." }, { status: 502 });
    }
  }

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
