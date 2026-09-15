import { NextRequest, NextResponse } from "next/server";
import { geocode } from "@/lib/geocode";

/**
 * Address lookup + geocoding, proxied server-side.
 *
 * The key never reaches the browser — a Places key in client JS is a key
 * anyone can lift and bill you for. Everything goes through here.
 *
 * ── Homesearch first, Google behind it (15 Sep 2026) ──────────────────────
 *
 * Howard, 14 Sep: he typed a postcode and got the street. Google answers a UK
 * postcode with the road, never the doors on it. Howard's own answer was
 * Homesearch, which the OS already pays for and already uses inside Bond, and
 * James chose it the next day after a side-by-side on 40 homes off TLE's own
 * book (houses, flats, HMO rooms, a quarter of them Scottish):
 *
 *                               Homesearch      Google
 *     postcode lists the door   35 of 39        0 of 40
 *     typed address finds it    28 of 39        31 of 40
 *
 * Homesearch carries the Royal Mail UDPRN and the UPRN on every door, so it is
 * the same PAF file Ideal Postcodes sells, at no extra cost. That is why
 * Ideal Postcodes was not bought.
 *
 * So, in order:
 *
 *   1. HOMESEARCH_TOKEN — a postcode lists every door in it, narrowed to the
 *      house number when one is typed; anything else is its type-ahead.
 *   2. Google, when Homesearch has nothing. Two of the 39 were genuinely not
 *      on the register (a flat split it lists as one door, and a converted
 *      HMO in a postcode it only knows a shop in). And for typed text, when
 *      none of Homesearch's answers carries the number that was typed,
 *      Google's go underneath them rather than instead of them.
 *   3. Typing it by hand, which every field already falls back to.
 *
 * A Homesearch suggestion's id is "hs:<hs_id>", so ?resolve= knows which
 * provider to ask without guessing from the shape of the value. The resolved
 * door comes back with its hs_id, UPRN and UDPRN as well, which are the keys
 * Bond, the dossier and the material info already use for the same home.
 *
 * The older providers, still honoured when their keys are present:
 *
 *   IDEAL_POSTCODES_API_KEY — UK-only, Royal Mail PAF, ~£0.05/lookup. Not set,
 *                             and not needed while Homesearch answers.
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
 * MEASURED 30 Aug, and FIXED the same day: GOOGLE_MAPS_API_KEY used to be the
 * same key as NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, restricted by HTTP referrer.
 * That is correct for a browser key and fatal for a server one — a call from
 * here sends no referrer, so Google answered
 *
 *   403 API_KEY_HTTP_REFERRER_BLOCKED "Requests from referer <empty> are blocked."
 *
 * The map kept working (browser, referrer present) while lookup never had.
 *
 * James issued a SECOND key that evening, restricted by API rather than by
 * referrer, and pointed GOOGLE_MAPS_API_KEY at it. So the two are now
 * genuinely different keys with different jobs, and they must stay that way:
 *
 *   NEXT_PUBLIC_GOOGLE_MAPS_API_KEY — browser, referrer-locked, the research
 *                                     map in components/MarketMap
 *   GOOGLE_MAPS_API_KEY             — server, API-locked, this route only
 *
 * Setting them to the same value again silently breaks lookup and nothing
 * else, which is exactly how it went unnoticed the first time.
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
const homesearch = () => (process.env.HOMESEARCH_TOKEN ?? "").trim();

/* ── Homesearch ─────────────────────────────────────────────────────────── */

const HS = "https://data.homesearch.co.uk/avi/api/v1";
const HS_PREFIX = "hs:";
const POSTCODE = /\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i;
const numbersIn = (s: string) => new Set(s.toUpperCase().match(/\b\d+[A-Z]?\b/g) ?? []);

/**
 * One Homesearch call, sized for somebody typing.
 *
 * Not lib/bond's hs(): that retries three times on a fifteen-second timeout,
 * which is right for a background sweep and wrong for a dropdown, where a
 * slow answer is worse than Google's answer. Here it is three seconds and one
 * retry on a rate limit, and anything else is null - which means "ask Google".
 */
async function hsGet(path: string, token: string): Promise<unknown | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`${HS}/${path}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(3_000),
      });
      if (r.ok) return await r.json();
      /* 422 is Homesearch saying the query is too short to search, and 404 a
         postcode it has never heard of. Both are "no doors", not a fault. */
      if (r.status === 422 || r.status === 404) return [];
      if (r.status !== 429 || attempt > 0) return null;
      await new Promise((res) => setTimeout(res, 400));
    } catch {
      return null;
    }
  }
  return null;
}

const rowsOf = (raw: unknown): { hs_id?: string | number; address_label?: string }[] =>
  Array.isArray(raw) ? raw : Array.isArray((raw as { data?: unknown })?.data) ? (raw as { data: [] }).data : [];

/**
 * Homesearch's suggestions for what was typed, or null when it could not be
 * asked at all.
 *
 * A full postcode lists every door in it. If a house number was typed as well
 * ("12 AL7 3HU"), the list narrows to the doors carrying it - and widens back
 * to the whole postcode if none do, because a wrong number is likelier than an
 * empty postcode. Anything that is not a postcode goes to the type-ahead.
 */
async function hsSuggest(q: string, token: string): Promise<{ suggestions: Suggestion[]; weak: boolean; byPostcode: boolean } | null> {
  const pc = q.match(POSTCODE);
  const typedNumbers = numbersIn(pc ? q.replace(POSTCODE, "") : q);
  const raw = pc
    ? await hsGet(`find_addresses/${encodeURIComponent(`${pc[1]} ${pc[2]}`.toUpperCase())}`, token)
    : await hsGet(`find_addresses?query=${encodeURIComponent(q)}`, token);
  if (raw === null) return null;
  const all = rowsOf(raw)
    .filter((a) => a.hs_id != null && a.address_label)
    .map((a) => ({ id: `${HS_PREFIX}${a.hs_id}`, label: String(a.address_label) }));
  const carrying = typedNumbers.size
    ? all.filter((a) => [...numbersIn(a.label)].some((n) => typedNumbers.has(n)))
    : all;
  const suggestions = (carrying.length ? carrying : all).slice(0, pc ? 100 : 12);
  /* Weak = a number was typed and no door here carries it. For typed text the
     type-ahead guessed. For a postcode the doors are still worth showing, but
     the one they want may not be among them - "166 Gloucester Road North,
     BS34 7QA" lists only the Toolstation at 164, because the HMO at 166 is not
     on the register - so Google is asked as well. Caught on the first live
     test, 15 Sep 2026. */
  const weak = typedNumbers.size > 0 && carrying.length === 0;
  return { suggestions, weak, byPostcode: Boolean(pc) };
}

/** A picked Homesearch door, as the rest of the OS wants it. */
async function hsResolve(id: string, token: string) {
  const raw = (await hsGet(`return_address_details/${encodeURIComponent(id)}`, token)) as Record<string, unknown> | null;
  const d = (raw && typeof raw === "object" && !Array.isArray(raw) && raw.data && typeof raw.data === "object" ? raw.data : raw) as Record<string, unknown> | null;
  const label = String(d?.hs_label ?? d?.address_label ?? "").trim();
  if (!d || !label) return null;
  const num = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    address: label,
    postcode: d.postcode ? String(d.postcode) : label.match(POSTCODE)?.[0]?.toUpperCase() ?? null,
    lat: num(d.lat),
    lng: num(d.lon),
    hsId: String(d.hs_id ?? id),
    uprn: d.uprn == null ? null : String(d.uprn),
    udprn: d.udprn == null ? null : String(d.udprn),
  };
}

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

  /* ?geocode=<free text> — for an address we ALREADY hold as a string and
     nobody is typing: the home address the TEG Hub has for someone, a lead's
     area. Autocomplete needs a person choosing from a dropdown; this needs an
     answer. Shares lib/geocode with the travel-time lookup, so both agree
     about what counts as a precise hit. */
  const toGeocode = req.nextUrl.searchParams.get("geocode")?.trim();
  if (toGeocode) {
    const found = await geocode(toGeocode);
    if (!found.ok) {
      return NextResponse.json({ configured: Boolean(GOOGLE), problem: found.problem });
    }
    return NextResponse.json({
      configured: true,
      provider: "google",
      address: found.at.tidied,
      postcode: found.at.postcode,
      lat: found.at.lat,
      lng: found.at.lng,
      precise: found.at.precise,
    });
  }

  const HSK = homesearch();

  /* A Homesearch door being picked. Its own provider, whatever keys are set:
     the id says where it came from. */
  if (resolve?.startsWith(HS_PREFIX)) {
    const door = HSK ? await hsResolve(resolve.slice(HS_PREFIX.length), HSK) : null;
    if (!door) {
      return NextResponse.json({
        configured: Boolean(HSK),
        provider: "homesearch",
        problem: HSK
          ? { code: "not_found", says: "That address could not be resolved. Type it in full instead." }
          : { code: "no_key", says: "HOMESEARCH_TOKEN is not set on this environment, so a Homesearch address cannot be resolved." },
      });
    }
    return NextResponse.json({ configured: true, provider: "homesearch", ...door });
  }

  /* Homesearch first. A confident answer goes straight back; a weak one (typed
     text where nothing carries the typed number) is held and shown alongside
     Google's, below; no answer, or Homesearch unreachable, falls through to
     the providers below as though it were not there. */
  let hsHeld: Suggestion[] = [];
  let hsHeldFirst = false;
  if (!resolve && HSK && q.length >= 3) {
    const found = await hsSuggest(q, HSK);
    if (found && found.suggestions.length && !found.weak) {
      return NextResponse.json({ configured: true, provider: "homesearch", suggestions: found.suggestions });
    }
    if (found?.weak) {
      /* A postcode's doors stay whole and stay on top: the list IS the answer
         a postcode is typed for. Typed text keeps its five best guesses, under
         Google's. */
      hsHeldFirst = found.byPostcode;
      hsHeld = found.byPostcode ? found.suggestions : found.suggestions.slice(0, 5);
    }
  }

  if (!IDEAL && !GOOGLE) {
    /* Homesearch is the only provider here. Its answer, or an honest empty. */
    if (HSK) return NextResponse.json({ configured: true, provider: "homesearch", suggestions: hsHeld });
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
      /* Google down with Homesearch's guesses in hand: show the guesses. A
         maybe beats a red note, and the field still saves what is typed. */
      if (hsHeld.length) return NextResponse.json({ configured: true, provider: "homesearch", suggestions: hsHeld });
      return NextResponse.json({
        configured: true,
        provider,
        suggestions: [],
        problem: googleProblem(r.status, j),
      });
    }
    const fromGoogle: Suggestion[] = ((j as { suggestions?: unknown[] })?.suggestions ?? [])
      .filter((s): s is { placePrediction: { placeId: string; text: { text: string } } } =>
        Boolean((s as { placePrediction?: unknown })?.placePrediction)
      )
      .map((s) => ({ id: s.placePrediction.placeId, label: s.placePrediction.text.text }));
    /* Typed text: Google's first, because none of the held doors carries the
       number that was typed. A postcode: its doors first, Google underneath. */
    const suggestions = hsHeldFirst ? [...hsHeld, ...fromGoogle] : [...fromGoogle, ...hsHeld];
    return NextResponse.json({ configured: true, provider: hsHeld.length ? "mixed" : provider, suggestions });
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
