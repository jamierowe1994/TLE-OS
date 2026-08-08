import { NextRequest, NextResponse } from "next/server";

/**
 * The property dossier: everything two data services know about one address,
 * assembled the moment a landlord lead gives it.
 *
 *   Homesearch — the records: floor area, EPC (with potential), tax band,
 *                tenure, title, flood, valuation, area rents. Already paid
 *                for; one matinfo call carries the lot.
 *   RealtyAPI  — the colour: past listings with photos, any live listing.
 *
 * PropertyData was the original records source; Homesearch matched every
 * figure it produced and added six more, so it was stripped (James, 8 Aug
 * 2026) rather than paid for twice.
 *
 * PRIORITY IS LETTINGS. This is a lettings business: the last RENTAL price
 * leads the card, sale prices ride as tags. Both matter — but one is the
 * business and the other is context (James, 8 Aug 2026).
 *
 * THE RULE, learned the hard way on Recreation Terrace: address resolvers
 * silently match the wrong house. Any source's match that drops our house
 * number is a match that doesn't count.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const RA_KEY = process.env.REALTYAPI_KEY ?? "";
const HS_TOKEN = process.env.HOMESEARCH_TOKEN ?? "";

const HS = "https://data.homesearch.co.uk/avi/api/v1";

async function j(url: string, headers?: Record<string, string>) {
  try {
    const r = await fetch(url, { headers, cache: "no-store", signal: AbortSignal.timeout(20000) });
    return await r.json();
  } catch {
    return null;
  }
}

/** "Flat 2, 10 Cardiff Grove" → "10"; "183 Walesby Lane" → "183". */
function houseNumber(address: string): string | null {
  const m = address.match(/\b(\d+[a-zA-Z]?)\b/);
  return m ? m[1].toLowerCase() : null;
}

/**
 * Every building-ish number in an address, postcode digits excluded. Two
 * sources describing one property can order "Flat 2" and "10" differently —
 * comparing only the FIRST number made the trust check drop honest matches
 * (and their photos) on flats. Sharing ANY number is the honest test.
 */
function addressNumbers(address: string): Set<string> {
  const noPc = address.replace(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/gi, "");
  return new Set(
    (noPc.match(/\b\d+[a-zA-Z]?\b/g) ?? []).map((n) => n.toLowerCase())
  );
}

function sharesNumber(a: string, b: string): boolean {
  const an = addressNumbers(a);
  if (!an.size) return false;
  for (const n of addressNumbers(b)) if (an.has(n)) return true;
  return false;
}

/** Zoopla history prices: small numbers are rents, big ones are sale prices. */
function looksLikeRent(price: number): boolean {
  return price > 0 && price < 10000;
}

export async function GET(req: NextRequest) {
  const address = req.nextUrl.searchParams.get("address")?.trim() ?? "";
  const postcode = req.nextUrl.searchParams.get("postcode")?.trim() ?? "";
  if (!address || !postcode) {
    return NextResponse.json({ ok: false, error: "address and postcode required" }, { status: 400 });
  }

  const num = houseNumber(address);
  const out: Record<string, unknown> = {
    ok: true,
    sources: { homesearch: Boolean(HS_TOKEN), realtyapi: Boolean(RA_KEY) },
  };

  /* ── Homesearch: the records. ── */
  if (HS_TOKEN) {
    const hsAuth = { Authorization: `Bearer ${HS_TOKEN}` };
    const match = await j(
      `${HS}/match_address?address=${encodeURIComponent(`${address} ${postcode}`)}`,
      hsAuth
    );
    const hsId = match?.hs_id;
    const hsTrusted = hsId && (!num || houseNumber(match.address_label ?? "") === num);

    if (hsTrusted) {
      const [mat, val] = await Promise.all([
        j(`${HS}/matinfo/basic/${hsId}`, hsAuth),
        j(`${HS}/property/quick_valuation/${hsId}`, hsAuth),
      ]);

      if (mat) {
        if (mat.bedrooms) out.beds = mat.bedrooms;
        if (mat.floor_area) out.sqft = Math.round(mat.floor_area * 10.764);
        if (mat.tax_band) out.taxBand = mat.tax_band;
        if (mat.category) out.propertyType = mat.category;
        if (mat.land_tenure) out.tenure = mat.land_tenure;
        if (mat.title_number) out.titleNumber = mat.title_number;
        if (mat.flood_risk) out.floodRisk = mat.flood_risk;
        if (mat.energy_rating) {
          const when = mat.energy_epc_date ? new Date(mat.energy_epc_date) : null;
          const tenYears = 10 * 365.25 * 24 * 3600 * 1000;
          out.epc = {
            rating: mat.energy_rating,
            score: mat.energy_score ?? null,
            potential: mat.potential_energy_rating ?? null,
            date: mat.energy_epc_date ?? null,
            current: when ? Date.now() - when.getTime() < tenYears : false,
          };
        }
      }
      if (val?.price) {
        out.valuation = {
          price: val.price,
          lastSold: val.price_last_sold ?? null,
          lastSoldDate: val.last_sold_date ?? null,
        };
        if (val.price_last_sold) {
          out.lastSale = { price: val.price_last_sold, date: val.last_sold_date ?? "" };
        }
      }

      // The number this business actually runs on: what do same-sized homes
      // here LET for. Sector-level, bed-matched.
      const sector = postcode.replace(/\s*\d[A-Z]{2}$/i, (m) => ` ${m.trim()[0]}`).trim();
      const beds = (out.beds as number) || 0;
      if (beds) {
        const area = await j(
          `${HS}/area_statistics/lettings/avg_price_on_market?sectors%5B%5D=${encodeURIComponent(sector)}&beds%5B%5D=${beds}`,
          hsAuth
        );
        if (area?.avg_price) out.areaRent = { avg: area.avg_price, beds };
      }
    }
  }

  /* ── RealtyAPI: the colour. ── */
  if (RA_KEY) {
    const raHeaders = { "x-realtyapi-key": RA_KEY };

    // The resolver gets one clean address: strip the ", UK" tail and any
    // embedded postcode, then append the postcode exactly once.
    const cleanAddress = address
      .replace(/,?\s*UK\s*$/i, "")
      .replace(/[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}/gi, "")
      .replace(/\s*,\s*,/g, ",")
      .replace(/,\s*$/, "")
      .trim();
    const raAddress = `${cleanAddress}, ${postcode}`;

    const hist = await j(
      `https://zoopla.realtyapi.io/history?address=${encodeURIComponent(raAddress)}`,
      raHeaders
    );
    const detail = hist?.detail;
    const zooplaTrusted = Boolean(
      detail?.fullAddress && sharesNumber(address, detail.fullAddress)
    );

    if (detail && zooplaTrusted) {
      const listings: {
        date: string; price: number; url: string; beds: number | null;
        baths: number | null; images: string[];
      }[] = detail.historicListings ?? [];

      // LETTINGS FIRST: the card leads with the last RENTAL listing when one
      // exists; a sale listing only fronts the card when the property has
      // never been let through the portals.
      const rentListing = listings.find((l) => looksLikeRent(l.price));
      const card = rentListing ?? listings[0];
      if (card) {
        out.lastListing = {
          date: card.date,
          price: card.price,
          kind: looksLikeRent(card.price) ? "rent" : "sale",
          beds: card.beds ?? null,
          baths: card.baths ?? null,
          url: card.url ? `https://www.zoopla.co.uk${card.url}` : null,
          image: card.images?.[0] ?? null,
        };
        if (!out.beds && card.beds) out.beds = card.beds;
        if (card.baths) out.baths = card.baths;
      }
      if (rentListing) out.lastRent = { price: rentListing.price, date: rentListing.date };

      const sales: { date: string; price: number }[] = detail.historicSales ?? [];
      if (!out.lastSale && sales[0]) {
        out.lastSale = { price: sales[0].price, date: sales[0].date };
      }
    }

    const rm = await j(
      `https://rightmove.realtyapi.io/details/byaddress?address=${encodeURIComponent(raAddress)}`,
      raHeaders
    );
    const rmHasSubstance =
      rm?.detail && (rm.detail.propertyUrl || rm.detail.branch?.displayName || rm.detail.price?.primary);
    if (rmHasSubstance) {
      const resolved: string = rm.resolvedAddress ?? rm.detail.address ?? "";
      const exact = sharesNumber(address, resolved);
      out.currentListing = {
        confidence: exact ? "exact" : "street",
        address: resolved,
        price: rm.detail.price?.primary ?? null,
        kind: rm.detail.transactionType === "RENT" ? "rent" : "sale",
        status: rm.detail.status?.label ?? null,
        agent: rm.detail.branch?.displayName ?? null,
        url: rm.detail.propertyUrl ?? null,
      };
    }
  }

  return NextResponse.json(out);
}
