import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { geocode } from "@/lib/geocode";
import { rexCall } from "@/lib/rex";
import { dossier, findCandidates } from "@/lib/property-lookup";
import { EMPTY_PROPERTY, type PropertyFactsData } from "@/lib/lead-facts";

export const dynamic = "force-dynamic";

/**
 * "Fill this page for me" (James, 11 Sep 2026). Given the address on a
 * landlord lead, run the lookups the OS already has and hand back what is
 * CERTAIN:
 *
 *   1. Google places the address - the pin on the map, the tidied address
 *      and the postcode.
 *   2. REX's own property list is asked for the door. Only an exact match
 *      (same house number, same postcode) counts, and then its last photo
 *      and REX id come with it. A near miss is left for the agent to pick.
 *   3. Bond's property register (the same one the Bond board reads) gives
 *      bedrooms, the property type and the EPC rating, again only on an
 *      exact match.
 *
 * Bathrooms and receptions come from nowhere we hold, and the answer says
 * so rather than guessing. READ-ONLY on REX: Properties/autocomplete only.
 */

const POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})/i;
const numbersIn = (s: string) => new Set(s.toUpperCase().match(/\b\d+[A-Z]?\b/g) ?? []);
const postcodeOf = (s: string) => { const m = POSTCODE.exec(s); return m ? `${m[1]}${m[2]}`.toUpperCase() : null; };
const firstWord = (s: string) => (s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").match(/[a-z]{3,}/) ?? [""])[0];

/** The same door: same numbers, same postcode when both carry one, same street word. */
function sameDoor(a: string, b: string): boolean {
  const na = numbersIn(a), nb = numbersIn(b);
  if (na.size && nb.size && ([...na].some((n) => !nb.has(n)) || [...nb].some((n) => !na.has(n)))) return false;
  const pa = postcodeOf(a), pb = postcodeOf(b);
  if (pa && pb && pa !== pb) return false;
  const wa = firstWord(a.replace(POSTCODE, "")), wb = firstWord(b.replace(POSTCODE, ""));
  return Boolean(wa && wb && (wa === wb || a.toLowerCase().includes(wb) || b.toLowerCase().includes(wa)));
}

const TYPE_WORDS: Array<[RegExp, string]> = [
  [/flat|apartment|maisonette/i, "Flat"], [/terrace/i, "Terraced"], [/semi/i, "Semi-detached"],
  [/detached/i, "Detached"], [/bungalow/i, "Bungalow"], [/hmo/i, "HMO"], [/room/i, "Room"],
];
const typeOf = (s: string | null | undefined) => (s ? (TYPE_WORDS.find(([re]) => re.test(s))?.[1] ?? "") : "");

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await ctx.params;
  let body: { address?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: "Expected JSON." }, { status: 400 }); }
  const address = (body.address ?? "").trim();
  if (address.length < 4) return NextResponse.json({ ok: false, error: "Put an address on the lead first, then try again." }, { status: 400 });

  const property: PropertyFactsData = { ...EMPTY_PROPERTY, address };
  const filled: string[] = [];
  const missing: string[] = [];
  const nearMisses: { id: string; address: string; image: string | null }[] = [];

  const [geo, rex, bond] = await Promise.all([
    geocode(address).catch(() => null),
    rexCall("Properties", "autocomplete", { search_string: address, limit: 8 }).catch(() => null),
    findCandidates(address).catch(() => ({ candidates: [] as { hs_id: string; label: string }[] })),
  ]);

  if (geo?.ok) {
    property.lat = geo.at.lat; property.lng = geo.at.lng;
    property.address = geo.at.tidied || address;
    property.postcode = geo.at.postcode ?? postcodeOf(address);
    property.matched = "pin";
    filled.push("the map pin");
  } else {
    property.postcode = postcodeOf(address);
    missing.push("the map pin - Google could not place that address");
  }

  type Hit = { id?: string | number; address?: string; image?: { url?: string } | null };
  const hits = rex?.ok && Array.isArray(rex.result) ? (rex.result as Hit[]).filter((h) => h.id && h.address) : [];
  const exact = hits.filter((h) => sameDoor(address, String(h.address)));
  if (exact.length === 1) {
    const h = exact[0];
    property.rexPropertyId = String(h.id);
    property.matched = "rex";
    property.address = String(h.address);
    if (h.image?.url) { property.image = `https:${String(h.image.url).replace(/^https?:/, "")}`; filled.push("the photo from REX"); }
    filled.push("the REX property");
  } else {
    for (const h of hits.slice(0, 5)) nearMisses.push({ id: String(h.id), address: String(h.address), image: h.image?.url ? `https:${String(h.image.url).replace(/^https?:/, "")}` : null });
    missing.push(hits.length ? "a sure match in REX - pick one below if it is there" : "the property in REX");
  }

  const cands = bond.candidates.filter((c) => sameDoor(address, c.label));
  if (cands.length === 1) {
    const d = await dossier(cands[0].hs_id).catch(() => null);
    if (d) {
      if (d.facts.beds != null) { property.beds = d.facts.beds; filled.push(`${d.facts.beds} bedrooms`); }
      const t = typeOf(d.facts.category); if (t) { property.type = t; filled.push(t.toLowerCase()); }
      if (d.facts.energy_rating) { property.epc = d.facts.energy_rating; filled.push(`EPC ${d.facts.energy_rating}`); }
      if (!property.lat && d.facts.lat != null && d.facts.lon != null) { property.lat = d.facts.lat; property.lng = d.facts.lon; property.matched ??= "pin"; }
    }
  }
  if (property.beds == null) missing.push("bedrooms");
  missing.push("bathrooms and receptions - nothing we hold records them");

  return NextResponse.json({ ok: true, property, filled, missing, nearMisses });
}
