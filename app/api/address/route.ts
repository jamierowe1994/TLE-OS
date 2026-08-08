import { NextRequest, NextResponse } from "next/server";

/**
 * Address lookup + geocoding, proxied server-side.
 *
 * The key never reaches the browser — a Places key in client JS is a key
 * anyone can lift and bill you for. Everything goes through here.
 *
 * Two providers, chosen by whichever key is present, because the right answer
 * depends on the bill rather than the code:
 *
 *   IDEAL_POSTCODES_API_KEY — UK-only, Royal Mail PAF, exact and cheap
 *                             (~£0.05/lookup). Best for a lettings book.
 *   GOOGLE_MAPS_API_KEY     — worldwide, needs Places API (New) enabled in
 *                             the Google Cloud console, billing attached.
 *
 * With neither set the route answers {configured:false} and the form falls
 * back to plain text entry — the panel still works, it just can't geocode.
 */

type Suggestion = { id: string; label: string };

const IDEAL = process.env.IDEAL_POSTCODES_API_KEY;
const GOOGLE = process.env.GOOGLE_MAPS_API_KEY;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const resolve = req.nextUrl.searchParams.get("resolve");

  if (!IDEAL && !GOOGLE) {
    return NextResponse.json({ configured: false, suggestions: [] as Suggestion[] });
  }

  try {
    /* ---------------- Ideal Postcodes (preferred for UK) ---------------- */
    if (IDEAL) {
      if (resolve) {
        const r = await fetch(
          `https://api.ideal-postcodes.co.uk/v1/addresses/${encodeURIComponent(resolve)}?api_key=${IDEAL}`,
          { cache: "no-store" }
        );
        const j = await r.json();
        const a = j?.result;
        if (!a) return NextResponse.json({ configured: true, error: "not_found" }, { status: 404 });
        return NextResponse.json({
          configured: true,
          address: [a.line_1, a.line_2, a.post_town, a.postcode].filter(Boolean).join(", "),
          postcode: a.postcode ?? null,
          lat: a.latitude ?? null,
          lng: a.longitude ?? null,
        });
      }

      if (q.length < 3) return NextResponse.json({ configured: true, suggestions: [] });
      const r = await fetch(
        `https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses?query=${encodeURIComponent(q)}&api_key=${IDEAL}`,
        { cache: "no-store" }
      );
      const j = await r.json();
      const suggestions: Suggestion[] = (j?.result?.hits ?? []).map(
        (h: { suggestion: string; udprn?: number; id?: string }) => ({
          id: String(h.udprn ?? h.id ?? h.suggestion),
          label: h.suggestion,
        })
      );
      return NextResponse.json({ configured: true, suggestions });
    }

    /* ---------------------- Google Places (New) ---------------------- */
    if (resolve) {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(resolve)}`, {
        headers: {
          "X-Goog-Api-Key": GOOGLE!,
          // addressComponents carries the postcode — formattedAddress alone
          // sometimes omits it, and the property dossier can't run without
          // one. Learned live: "Newark, UK" resolves fine and dossiers never.
          "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
        },
        cache: "no-store",
      });
      const j = await r.json();
      if (!j?.formattedAddress) {
        return NextResponse.json({ configured: true, error: "not_found" }, { status: 404 });
      }
      const postcode =
        (j.addressComponents ?? []).find(
          (c: { types?: string[] }) => c.types?.includes("postal_code")
        )?.longText ?? null;
      return NextResponse.json({
        configured: true,
        // The postcode joins the display address too — an agent reading a UK
        // address without one reads it twice.
        address:
          postcode && !j.formattedAddress.includes(postcode)
            ? j.formattedAddress.replace(/, UK$/, `, ${postcode}, UK`)
            : j.formattedAddress,
        postcode,
        lat: j.location?.latitude ?? null,
        lng: j.location?.longitude ?? null,
      });
    }

    if (q.length < 3) return NextResponse.json({ configured: true, suggestions: [] });
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE! },
      body: JSON.stringify({ input: q, includedRegionCodes: ["gb"] }),
      cache: "no-store",
    });
    const j = await r.json();
    const suggestions: Suggestion[] = (j?.suggestions ?? [])
      .filter((s: { placePrediction?: unknown }) => s.placePrediction)
      .map((s: { placePrediction: { placeId: string; text: { text: string } } }) => ({
        id: s.placePrediction.placeId,
        label: s.placePrediction.text.text,
      }));
    return NextResponse.json({ configured: true, suggestions });
  } catch {
    // A lookup outage must never block adding a lead — the form falls back.
    return NextResponse.json({ configured: true, suggestions: [], error: "lookup_failed" });
  }
}
