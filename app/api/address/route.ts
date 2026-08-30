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
 * ── Why this route now reports its own failures ───────────────────────────
 *
 * It used to answer {suggestions: []} for every outcome: no key, bad key,
 * blocked key, out of credit, genuine no-match. The dropdown simply never
 * appeared, so a broken lookup and an unknown address were indistinguishable
 * on screen, and the field looked merely unhelpful rather than broken.
 *
 * MEASURED, 30 Aug: the live GOOGLE_MAPS_API_KEY is the same key as
 * NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, and it is restricted by HTTP referrer.
 * That is correct for a browser key and fatal for a server one — a call from
 * here sends no referrer, so Google answers
 *
 *   403 API_KEY_HTTP_REFERRER_BLOCKED "Requests from referer <empty> are blocked."
 *
 * The map kept working (browser, referrer present) while lookup never had. A
 * server-side key cannot simply have that restriction lifted, because it is
 * the same public key the map ships to every visitor: it needs to be a SECOND
 * key, restricted by API rather than by referrer.
 *
 * So every failure now comes back with a `problem` the field can print. The
 * point is not politeness — it is that the next person to hit this should
 * spend a minute on it rather than an afternoon.
 */

type Suggestion = { id: string; label: string };

/** Read per-request. At module scope these freeze to whatever was set when the
 *  server booted, which is how a variable added in Railway looks ignored. */
const ideal = () => (process.env.IDEAL_POSTCODES_API_KEY ?? "").trim();
const google = () => (process.env.GOOGLE_MAPS_API_KEY ?? "").trim();

/** What went wrong, in words the person typing can act on. */
type Problem = { code: string; says: string } | null;

function googleProblem(status: number, body: unknown): Problem {
  const err = (body as { error?: { message?: string; details?: { reason?: string }[] } })?.error;
  const reason = err?.details?.find((d) => d?.reason)?.reason ?? "";
  if (reason === "API_KEY_HTTP_REFERRER_BLOCKED") {
    return {
      code: "key_is_a_browser_key",
      says:
        "Google is refusing the lookup because GOOGLE_MAPS_API_KEY is restricted to website " +
        "referrers, and this call comes from the server. It needs a second key restricted by " +
        "API (Places API New + Geocoding) instead of by referrer.",
    };
  }
  if (reason === "API_KEY_SERVICE_BLOCKED" || /has not been used|is disabled/i.test(err?.message ?? "")) {
    return {
      code: "api_not_enabled",
      says: "Places API (New) is not enabled on that Google Cloud project, so lookup is refused.",
    };
  }
  if (status === 403 || status === 401) {
    return { code: "denied", says: `Google refused the lookup: ${err?.message ?? "permission denied"}.` };
  }
  if (status === 429) {
    return { code: "quota", says: "Google's lookup quota for this key is exhausted." };
  }
  return { code: "error", says: `Google's address lookup answered ${status}.` };
}

function idealProblem(status: number, body: unknown): Problem {
  /* Ideal Postcodes puts a machine-readable code in the body as well as the
     status, and the codes are the useful half — 4020 is "out of credit", which
     reads nothing like "invalid key" to the person who has to fix it. */
  const code = (body as { code?: number })?.code ?? 0;
  if (code === 4010 || status === 401) {
    return { code: "denied", says: "Ideal Postcodes rejected IDEAL_POSTCODES_API_KEY as invalid." };
  }
  if (code === 4020 || status === 402) {
    return { code: "quota", says: "The Ideal Postcodes account is out of lookup credit." };
  }
  if (code === 4040 || status === 403) {
    return {
      code: "blocked",
      says:
        "Ideal Postcodes is refusing this key — it is usually restricted to an allowed URL or " +
        "IP list that the server is not on.",
    };
  }
  if (status === 429) return { code: "quota", says: "Ideal Postcodes is rate-limiting this key." };
  return { code: "error", says: `Ideal Postcodes answered ${status}.` };
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const resolve = req.nextUrl.searchParams.get("resolve");
  const IDEAL = ideal();
  const GOOGLE = google();

  if (!IDEAL && !GOOGLE) {
    return NextResponse.json({
      configured: false,
      provider: null,
      suggestions: [] as Suggestion[],
      problem: {
        code: "no_key",
        says:
          "No address provider is configured. Set IDEAL_POSTCODES_API_KEY (UK) or " +
          "GOOGLE_MAPS_API_KEY in Railway to switch lookup on.",
      },
    });
  }

  const provider = IDEAL ? "ideal" : "google";

  try {
    /* ---------------- Ideal Postcodes (preferred for UK) ---------------- */
    if (IDEAL) {
      if (resolve) {
        /* Two different endpoints, and picking the wrong one 404s every time.
           A UDPRN is a bare number and resolves at /v1/udprn/<n>; an Ideal
           Postcodes address id looks like "paf_25946711" and resolves at
           /v1/addresses/<id>. The autocomplete hit can yield either, so the
           shape of the value decides the URL rather than a guess. */
        const numeric = /^\d+$/.test(resolve);
        const url = numeric
          ? `https://api.ideal-postcodes.co.uk/v1/udprn/${resolve}?api_key=${IDEAL}`
          : `https://api.ideal-postcodes.co.uk/v1/addresses/${encodeURIComponent(resolve)}?api_key=${IDEAL}`;
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json().catch(() => null);
        if (!r.ok || (j as { code?: number })?.code !== 2000) {
          const problem = idealProblem(r.status, j);
          return NextResponse.json({ configured: true, provider, problem }, { status: 200 });
        }
        const a = (j as { result?: Record<string, string> })?.result;
        if (!a) {
          return NextResponse.json(
            { configured: true, provider, problem: { code: "not_found", says: "That address could not be resolved." } },
            { status: 200 }
          );
        }
        return NextResponse.json({
          configured: true,
          provider,
          address: [a.line_1, a.line_2, a.post_town, a.postcode].filter(Boolean).join(", "),
          postcode: a.postcode ?? null,
          lat: a.latitude ?? null,
          lng: a.longitude ?? null,
        });
      }

      if (q.length < 3) return NextResponse.json({ configured: true, provider, suggestions: [] });
      const r = await fetch(
        `https://api.ideal-postcodes.co.uk/v1/autocomplete/addresses?query=${encodeURIComponent(q)}&api_key=${IDEAL}`,
        { cache: "no-store" }
      );
      const j = await r.json().catch(() => null);
      /* An invalid key answers 401 with {"code":4010} — checking only for the
         absence of hits turns that into "no matches found". Both the status
         and the body code are checked, because Ideal Postcodes has historically
         used 200-with-an-error-code as well. */
      if (!r.ok || (j as { code?: number })?.code !== 2000) {
        return NextResponse.json({
          configured: true,
          provider,
          suggestions: [],
          problem: idealProblem(r.status, j),
        });
      }
      const hits = (j as { result?: { hits?: Record<string, unknown>[] } })?.result?.hits ?? [];
      const suggestions: Suggestion[] = hits.map((h) => {
        /* The UDPRN is exposed as a URL path ("/v1/udprn/25946711"), not as a
           bare field, so it is fished out of there before falling back. */
        const fromUrl = String((h.urls as { udprn?: string } | undefined)?.udprn ?? "").match(/(\d+)\s*$/)?.[1];
        return {
          id: String(h.udprn ?? fromUrl ?? h.id ?? h.suggestion ?? ""),
          label: String(h.suggestion ?? ""),
        };
      });
      return NextResponse.json({ configured: true, provider, suggestions });
    }

    /* ---------------------- Google Places (New) ---------------------- */
    if (resolve) {
      const r = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(resolve)}`, {
        headers: {
          "X-Goog-Api-Key": GOOGLE,
          // addressComponents carries the postcode — formattedAddress alone
          // sometimes omits it, and the property dossier can't run without
          // one. Learned live: "Newark, UK" resolves fine and dossiers never.
          "X-Goog-FieldMask": "formattedAddress,location,addressComponents",
        },
        cache: "no-store",
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) {
        return NextResponse.json({ configured: true, provider, problem: googleProblem(r.status, j) });
      }
      const place = j as { formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { types?: string[]; longText?: string }[] };
      if (!place?.formattedAddress) {
        return NextResponse.json({
          configured: true,
          provider,
          problem: { code: "not_found", says: "That address could not be resolved." },
        });
      }
      let postcode: string | null =
        (place.addressComponents ?? []).find((c) => c.types?.includes("postal_code"))?.longText ?? null;

      // Some premises come back with NO postal_code component at all (183
      // Walesby Lane did, live). The coordinates always know their postcode
      // though — one reverse-geocode fills the gap, only when needed.
      if (!postcode && place.location) {
        const rg = await fetch(
          `https://maps.googleapis.com/maps/api/geocode/json?latlng=${place.location.latitude},${place.location.longitude}&result_type=postal_code&key=${GOOGLE}`,
          { cache: "no-store" }
        ).then((res) => res.json()).catch(() => null);
        postcode =
          rg?.results?.[0]?.address_components?.find(
            (c: { types?: string[] }) => c.types?.includes("postal_code")
          )?.long_name ?? null;
      }
      return NextResponse.json({
        configured: true,
        provider,
        // The postcode joins the display address too — an agent reading a UK
        // address without one reads it twice.
        address:
          postcode && !place.formattedAddress.includes(postcode)
            ? place.formattedAddress.replace(/, UK$/, `, ${postcode}, UK`)
            : place.formattedAddress,
        postcode,
        lat: place.location?.latitude ?? null,
        lng: place.location?.longitude ?? null,
      });
    }

    if (q.length < 3) return NextResponse.json({ configured: true, provider, suggestions: [] });
    const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": GOOGLE },
      body: JSON.stringify({ input: q, includedRegionCodes: ["gb"] }),
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!r.ok) {
      return NextResponse.json({
        configured: true,
        provider,
        suggestions: [],
        problem: googleProblem(r.status, j),
      });
    }
    const suggestions: Suggestion[] = ((j as { suggestions?: unknown[] })?.suggestions ?? [])
      .filter((s): s is { placePrediction: { placeId: string; text: { text: string } } } =>
        Boolean((s as { placePrediction?: unknown })?.placePrediction)
      )
      .map((s) => ({ id: s.placePrediction.placeId, label: s.placePrediction.text.text }));
    return NextResponse.json({ configured: true, provider, suggestions });
  } catch (e) {
    // A lookup outage must never block adding a lead — the form falls back to
    // plain text. It does now say so, rather than looking like no matches.
    return NextResponse.json({
      configured: true,
      provider,
      suggestions: [],
      problem: {
        code: "unreachable",
        says: `Could not reach the address provider: ${e instanceof Error ? e.message : "network error"}.`,
      },
    });
  }
}
