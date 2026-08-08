import { NextRequest, NextResponse } from "next/server";

/**
 * The property dossier: everything two data services know about one address,
 * assembled the moment a landlord lead gives it.
 *
 * Two sources, deliberately layered:
 *   PropertyData  — licensed records: UPRN, floor area, EPC, HMO. The anchor.
 *   RealtyAPI     — portal history: past listings (with photos), sales, and
 *                   any LIVE listing. The colour.
 *
 * THE RULE, learned the hard way on Recreation Terrace: portal address
 * resolvers silently match the wrong house. So the UPRN from PropertyData is
 * resolved FIRST and drives the Zoopla history; and a Rightmove result only
 * counts as "this property" if its address carries our house number —
 * otherwise it is reported as street-level and labelled that way.
 *
 * Cost per run ≈ 3 PropertyData + 2 RealtyAPI credits. Everything degrades:
 * a missing key, a throttle, a miss — each just leaves its section absent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PD_KEY = process.env.PROPERTYDATA_API_KEY ?? "";
const RA_KEY = process.env.REALTYAPI_KEY ?? "";
const HS_TOKEN = process.env.HOMESEARCH_TOKEN ?? "";

const PD = "https://api.propertydata.co.uk";
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
    sources: { propertydata: Boolean(PD_KEY), realtyapi: Boolean(RA_KEY) },
  };

  /* ── Homesearch first: one matinfo call carries what took PropertyData
     three — floor area, EPC (with potential), tax band, tenure, title,
     flood, broadband — and the valuation needs no guessed inputs. Probed
     against 183 Walesby Lane: every figure agreed with PropertyData's, and
     the extras were free. PropertyData below stays as the fallback. ── */
  let uprn: string | null = null;
  let recordsDone = false;
  if (HS_TOKEN) {
    const hsAuth = { Authorization: `Bearer ${HS_TOKEN}` };
    const match = await j(
      `${HS}/match_address?address=${encodeURIComponent(`${address} ${postcode}`)}`,
      hsAuth
    );
    const hsId = match?.hs_id;
    // Trust the match only if it kept our house number — same law as the
    // portals, same Recreation Terrace reason.
    const hsTrusted =
      hsId && (!num || houseNumber(match.address_label ?? "") === num);

    if (hsTrusted) {
      const [mat, val] = await Promise.all([
        j(`${HS}/matinfo/basic/${hsId}`, hsAuth),
        j(`${HS}/property/quick_valuation/${hsId}`, hsAuth),
      ]);

      if (mat) {
        recordsDone = true;
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

      // What do 3-beds around here actually ask? Sector-level, bed-matched.
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

  /* ── PropertyData: the fallback anchor when Homesearch isn't wired. ── */
  if (PD_KEY && !recordsDone) {
    const pc = encodeURIComponent(postcode);

    const uprns = await j(`${PD}/uprns?key=${PD_KEY}&postcode=${pc}`);
    const rows: { uprn: number; addressParts: { primary: string | null } }[] =
      uprns?.data ?? [];
    const hit = num
      ? rows.find((r) => (r.addressParts?.primary ?? "").toLowerCase() === num)
      : null;
    if (hit) {
      uprn = String(hit.uprn);
      out.uprn = uprn;
    }

    const floors = await j(`${PD}/floor-areas?key=${PD_KEY}&postcode=${pc}`);
    const floorRow = (floors?.known_floor_areas ?? []).find(
      (r: { address: string }) => num && houseNumber(r.address) === num
    );
    if (floorRow) {
      out.sqft = floorRow.square_feet;
      out.habitableRooms = floorRow.habitable_rooms;
    }

    const epc = await j(`${PD}/energy-efficiency?key=${PD_KEY}&postcode=${pc}`);
    const epcRow = (epc?.energy_efficiency ?? []).find(
      (r: { address: string }) => num && houseNumber(r.address) === num
    );
    if (epcRow) {
      const when = new Date(epcRow.inspection_date);
      const tenYears = 10 * 365.25 * 24 * 3600 * 1000;
      out.epc = {
        rating: epcRow.rating,
        score: epcRow.score,
        date: epcRow.inspection_date?.slice(0, 10),
        // EPCs run ten years — "current" is a fact, not a vibe.
        current: Date.now() - when.getTime() < tenYears,
      };
    }
  }

  /* ── RealtyAPI: the colour. UPRN when we have one; address if we must. ── */
  if (RA_KEY) {
    const raHeaders = { "x-realtyapi-key": RA_KEY };

    const hist = await j(
      uprn
        ? `https://zoopla.realtyapi.io/history?uprn=${uprn}`
        : `https://zoopla.realtyapi.io/history?address=${encodeURIComponent(`${address}, ${postcode}`)}`,
      raHeaders
    );
    const detail = hist?.detail;
    // Without a UPRN anchor, only trust Zoopla's resolution if it kept our
    // house number — Recreation Terrace taught us what happens otherwise.
    const zooplaTrusted =
      Boolean(uprn) || (detail?.fullAddress && num && houseNumber(detail.fullAddress) === num);

    if (detail && zooplaTrusted) {
      const listings: {
        date: string; price: number; url: string; beds: number | null;
        baths: number | null; images: string[];
      }[] = detail.historicListings ?? [];

      const latest = listings[0];
      if (latest) {
        out.lastListing = {
          date: latest.date,
          price: latest.price,
          kind: looksLikeRent(latest.price) ? "rent" : "sale",
          beds: latest.beds ?? null,
          baths: latest.baths ?? null,
          url: latest.url ? `https://www.zoopla.co.uk${latest.url}` : null,
          image: latest.images?.[0] ?? null,
        };
        if (latest.beds) out.beds = latest.beds;
        if (latest.baths) out.baths = latest.baths;
      }

      const lastRent = listings.find((l) => looksLikeRent(l.price));
      if (lastRent) out.lastRent = { price: lastRent.price, date: lastRent.date };

      const sales: { date: string; price: number }[] = detail.historicSales ?? [];
      if (sales[0]) out.lastSale = { price: sales[0].price, date: sales[0].date };
    }

    const rm = await j(
      `https://rightmove.realtyapi.io/details/byaddress?address=${encodeURIComponent(`${address}, ${postcode}`)}`,
      raHeaders
    );
    // A listing with no link, agent or price is an empty claim — drop it
    // rather than render a tag that says nothing.
    const rmHasSubstance =
      rm?.detail && (rm.detail.propertyUrl || rm.detail.branch?.displayName || rm.detail.price?.primary);
    if (rmHasSubstance) {
      const resolved: string = rm.resolvedAddress ?? rm.detail.address ?? "";
      const exact = Boolean(num && houseNumber(resolved) === num);
      out.currentListing = {
        // "exact" = provably this house; "street" = a listing on this road.
        // The UI words them differently, because they ARE different claims.
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
