import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { hs } from "@/lib/bond";
import { listAppraisals } from "@/lib/appraisal-store";
import type { ListingDetails } from "@/lib/listing-details";
import type { FactSource } from "@/lib/listing-marketing-store";
import { MAX_FEATURES_AI, OPTIONS } from "@/lib/listing-requirements";
import { matchIsTrustworthy } from "@/lib/ma-research";
import type { MatInfoRaw } from "@/lib/matinfo";
import { getMarketPicture } from "@/lib/market-picture";
import { answersForProperties } from "@/lib/property-answers-store";
import { rexCall } from "@/lib/rex";

/**
 * FILL IT IN FOR ME (James, 15 Sep 2026).
 *
 * "The only things we can't do are photos and floor plans." Everything else on
 * the Marketing tab is looked up, in this order of trust:
 *
 *   1. the landlord's own answers to the property questions
 *   2. the last listing on the same property (a relet usually has one)
 *   3. Homesearch's material information for the address - any UK address
 *   4. the market appraisal: the figure and the valuer's note
 *   5. Homesearch's live let book for the district, to say how the rent sits
 *
 * then Claude reads all of that with the photographs and writes the headline,
 * the description and the key features - the selling points included, like a
 * rent under the local median or a large floor area for the bedroom count.
 *
 * Nothing is saved. It comes back as suggestions with a source on each, and
 * the form fills only what is empty, so an agent's own typing is never
 * overwritten. Facts nobody can confirm are left empty, not guessed.
 */

export interface AutofillResult {
  facts: Partial<Record<FactKey, string | number>>;
  sources: Partial<Record<string, FactSource>>;
  heading: string | null;
  body: string | null;
  highlights: string[];
  /** What was looked at, in words, for the line under the button. */
  looked: string[];
  /** A lookup that could not be done, said plainly rather than hidden. */
  notes: string[];
}

type FactKey =
  | "councilTaxBand" | "parking" | "electricity" | "water" | "sewerage" | "broadband" | "heating"
  | "furnishing" | "pets" | "outsideSpace" | "beds" | "baths" | "receptions" | "deposit" | "floorAreaSqft";

const MODEL = process.env.ADVERT_WRITER_MODEL ?? "claude-opus-5";

/* ── the landlord's answers, in the form's words ─────────────────────────── */

const PARKING_FROM_ANSWER: Record<string, string> = {
  driveway: "On drive", garage: "Garage", allocated: "Allocated bay", street: "On street", permit: "Residents permit", none: "No parking",
};
const HEATING_FROM_ANSWER: Record<string, string> = {
  "gas-combi": "Gas central heating", "gas-system": "Gas central heating", electric: "Electric heating", "heat-pump": "Air source heat pump",
};
const FURNISHING_FROM_ANSWER: Record<string, string> = { unfurnished: "Unfurnished", part: "Part furnished", furnished: "Furnished" };
/* Never "No pets" from the questionnaire: a refusal needs a genuine reason
   the agent has checked (Renters' Rights Act; Susan, 19 Sep 2026), so the
   agent sets that by hand if it applies. */
const PETS_FROM_ANSWER: Record<string, string> = { open: "Considered", ask: "Considered", reason: "Considered", reluctant: "Considered" };

/* ── Homesearch's words, in the form's ───────────────────────────────────── */

function broadbandFrom(label: string | null | undefined): string | null {
  const s = (label ?? "").toLowerCase();
  if (!s) return null;
  if (/fttp|full fibre|ultrafast|gigabit/.test(s)) return "FTTP";
  if (/fttc|superfast|fibre/.test(s)) return "FTTC";
  if (/cable|virgin/.test(s)) return "Cable";
  if (/adsl|standard|basic|copper/.test(s)) return "ADSL";
  return null;
}
function heatingFrom(raw: MatInfoRaw["heating"]): string | null {
  const s = `${raw?.heating_system_type ?? ""} ${raw?.heating_fuel_type ?? ""}`.toLowerCase();
  if (!s.trim()) return null;
  if (/heat pump/.test(s)) return "Air source heat pump";
  if (/storage/.test(s)) return "Electric storage heaters";
  if (/community|communal|district/.test(s)) return "Communal heating";
  if (/oil/.test(s)) return "Oil central heating";
  if (/lpg/.test(s)) return "LPG";
  if (/gas/.test(s)) return "Gas central heating";
  if (/electric/.test(s)) return "Electric heating";
  return null;
}
const band = (v: string | null | undefined) => {
  const m = (v ?? "").trim().toUpperCase().match(/^(?:BAND\s*)?([A-I])$/);
  return m ? m[1] : null;
};

type Obj = Record<string, unknown>;

export async function autofillListing(d: ListingDetails, options: { writeCopy: boolean }): Promise<AutofillResult> {
  const facts: AutofillResult["facts"] = {};
  const sources: AutofillResult["sources"] = {};
  const looked: string[] = [];
  const notes: string[] = [];
  const context: string[] = [];
  const put = (k: FactKey, v: string | number | null | undefined, src: FactSource) => {
    if (v == null || v === "" || facts[k] != null) return;
    facts[k] = v;
    sources[k] = src;
  };

  const [answers, previous, material, appraisal, market] = await Promise.all([
    d.propertyId ? answersForProperties([d.propertyId]).then((a) => a[0] ?? null).catch(() => null) : Promise.resolve(null),
    previousListing(d).catch(() => null),
    homesearch(d).catch(() => null),
    listAppraisals()
      .then((all) => all.find((a) => (d.propertyId && a.rexPropertyId === d.propertyId) || (a.postcode && a.postcode.replace(/\s/g, "") === d.postcode.replace(/\s/g, "") && a.address.toLowerCase().startsWith(d.street.toLowerCase()))) ?? null)
      .catch(() => null),
    d.postcode ? getMarketPicture(d.postcode).catch(() => null) : Promise.resolve(null),
  ]);

  /* 0. What the listing already holds beats every lookup: on 4 Williams
     Court Homesearch said two bedrooms for a one-bed flat. */
  put("deposit", d.deposit ?? (d.rent ? Math.floor(((d.rent * 12) / 52) * 5) : null), d.deposit != null ? "agent" : "market");
  put("beds", d.beds, "agent");
  put("baths", d.baths, "agent");
  put("receptions", d.receptions, "agent");
  for (const k of ["councilTaxBand", "parking", "electricity", "water", "sewerage", "broadband", "heating", "furnishing", "pets", "outsideSpace"] as const) {
    put(k, d.facts[k], d.sources[k] ?? "agent");
  }

  /* 1. The landlord said so. */
  if (answers) {
    looked.push("the landlord's answers");
    const a = answers.answers;
    const one = (k: string) => (Array.isArray(a[k]) ? (a[k] as string[])[0] : (a[k] as string | undefined)) ?? null;
    put("parking", PARKING_FROM_ANSWER[one("parking") ?? ""], "landlord");
    put("heating", HEATING_FROM_ANSWER[one("heating-type") ?? ""], "landlord");
    put("furnishing", FURNISHING_FROM_ANSWER[one("furnishing") ?? ""], "landlord");
    put("pets", PETS_FROM_ANSWER[one("pets") ?? ""], "landlord");
    put("councilTaxBand", band(one("council-tax-band")), "landlord");
    if (one("garden") === "none") put("outsideSpace", "None", "landlord");
    if (one("electric-supplier")) put("electricity", "Mains Supply", "landlord");
    if (one("water-supplier")) {
      put("water", "Mains Supply", "landlord");
    }
  }

  /* 2. The last time it was let. */
  if (previous) {
    looked.push("the last listing");
    const text = [previous.heading, previous.body, ...previous.highlights].join(" \n").toLowerCase();
    if (/\bunfurnished\b/.test(text)) put("furnishing", "Unfurnished", "last-listing");
    else if (/part[- ]furnished/.test(text)) put("furnishing", "Part furnished", "last-listing");
    else if (/\bfurnished\b/.test(text)) put("furnishing", "Furnished", "last-listing");
    if (/no parking/.test(text)) put("parking", "No parking", "last-listing");
    if (/no gas|fully electric|electric heating/.test(text)) put("heating", "Electric heating", "last-listing");
    if (/balcony/.test(text)) put("outsideSpace", "Balcony", "last-listing");
    else if (/communal garden/.test(text)) put("outsideSpace", "Communal garden", "last-listing");
    else if (/private garden|rear garden|enclosed garden/.test(text)) put("outsideSpace", "Private garden", "last-listing");
    context.push(
      `The last listing on this property (${previous.state}, £${previous.rent ?? "?"} pcm):\nHeadline: ${previous.heading}\nKey features: ${previous.highlights.join("; ")}\nDescription: ${previous.body.slice(0, 2500)}`
    );
  }

  /* 3. Homesearch, for any address it can confirm. */
  if (material) {
    looked.push("Homesearch");
    /* A block of flats can share one house number, and Homesearch can land on
       the wrong flat: for 4 Williams Court it said two bedrooms. When its
       bedrooms disagree with ours, only the building-wide facts are kept. */
    const sameHome = !material.bedrooms || d.beds == null || material.bedrooms === d.beds;
    if (!sameHome) {
      notes.push(`Homesearch's record says ${material.bedrooms} bedrooms, so its size and council tax were not used.`);
      material.floor_area = null;
      material.tax_band = null;
      material.bedrooms = null;
    }
    put("councilTaxBand", band(material.tax_band), "homesearch");
    put("broadband", broadbandFrom(material.broadband?.connectivity), "homesearch");
    put("heating", heatingFrom(material.heating), "homesearch");
    if (material.energy?.electricity_operator) put("electricity", "Mains Supply", "homesearch");
    if (material.water?.water_provider) put("water", "Mains Supply", "homesearch");
    if (material.water?.sewerage_provider) put("sewerage", "Mains Supply", "homesearch");
    if (material.bedrooms) put("beds", material.bedrooms, "homesearch");
    if (material.floor_area) put("floorAreaSqft", Math.round(material.floor_area * 10.764), "homesearch");
    context.push(
      [
        "Homesearch material information:",
        material.category && `Type: ${material.category}`,
        material.bedrooms && `Bedrooms: ${material.bedrooms}`,
        material.floor_area && `Floor area: ${material.floor_area} m² (${Math.round(material.floor_area * 10.764)} sq ft)`,
        material.tax_band && `Council tax band: ${material.tax_band}`,
        material.energy_rating && `EPC: ${material.energy_rating}`,
        material.broadband?.connectivity && `Broadband: ${material.broadband.connectivity}`,
        material.broadband?.mobile_coverage && `Mobile coverage: ${material.broadband.mobile_coverage}`,
        material.heating?.heating_system_type && `Heating: ${material.heating.heating_system_type}`,
        material.garden_orientation && `Garden faces: ${material.garden_orientation}`,
        material.building_age && `Built: ${material.building_age}`,
      ].filter(Boolean).join("\n")
    );
  } else {
    notes.push("Homesearch could not confirm this address, so its details were not used.");
  }

  /* 4. The appraisal. */
  if (appraisal) {
    looked.push("the appraisal");
    context.push(`Market appraisal: valued at £${appraisal.valuation ?? "?"} pcm${appraisal.valuationNote ? `. The valuer's note: ${appraisal.valuationNote}` : ""}.`);
  }

  /* 5. How the rent sits locally. */
  const scope = market?.scopes.at(-1);
  const beds = (facts.beds as number | undefined) ?? d.beds;
  const bandRent = scope?.beds.find((b) => b.beds === beds)?.rent ?? null;
  if (scope && bandRent && d.rent) {
    looked.push(`the ${scope.area} market`);
    const diff = Math.round(((d.rent - bandRent.median) / bandRent.median) * 100);
    context.push(
      `Local market (${scope.area}, ${bandRent.n} ${beds}-bed homes advertised): median asking rent £${bandRent.median} pcm, range £${bandRent.low}-£${bandRent.high}. This property is £${d.rent} pcm, ${diff === 0 ? "at" : `${Math.abs(diff)}% ${diff < 0 ? "below" : "above"}`} the median.`
    );
  }

  let heading: string | null = null;
  let body: string | null = null;
  let highlights: string[] = [];
  if (options.writeCopy) {
    const written = await writeCopy(d, facts, context).catch((e: unknown) => {
      notes.push(e instanceof Error ? e.message : "The writer did not answer.");
      return null;
    });
    if (written) {
      looked.push("the photos");
      heading = written.heading;
      body = written.body;
      highlights = written.highlights;
      for (const [k, v] of Object.entries(written.facts)) {
        const allowed = OPTIONS[k as keyof typeof OPTIONS] as readonly string[] | undefined;
        if (typeof v === "string" && allowed?.includes(v)) put(k as FactKey, v, "photos");
      }
    }
  }

  return { facts, sources, heading, body, highlights, looked, notes };
}

async function homesearch(d: ListingDetails): Promise<MatInfoRaw | null> {
  if (!d.street || !d.postcode) return null;
  const m = await hs<{ hs_id?: number; address_label?: string }>(`match_address?address=${encodeURIComponent(`${d.street} ${d.postcode}`)}`);
  if (!m?.hs_id || !m.address_label || !matchIsTrustworthy(d.street, d.postcode, m.address_label)) return null;
  const raw = await hs<MatInfoRaw | { data?: MatInfoRaw }>(`matinfo/basic/${m.hs_id}`);
  if (!raw) return null;
  return ("data" in (raw as Obj) && (raw as { data?: MatInfoRaw }).data) || (raw as MatInfoRaw);
}

async function previousListing(d: ListingDetails) {
  if (!d.propertyId) return null;
  const res = await rexCall("Listings", "search", {
    criteria: [
      { name: "property_id", value: d.propertyId },
      { name: "listing_category_id", value: "residential_rental" },
    ],
    limit: 10,
    order_by: { system_ctime: "desc" },
  });
  const rows = ((res.result as { rows?: Obj[] } | null)?.rows ?? []).filter((r) => String(r.id) !== d.id);
  const last = rows[0];
  if (!last) return null;
  const read = await rexCall("Listings", "read", { id: Number(last.id) });
  const l = (read.result ?? {}) as Obj;
  const related = (l.related ?? {}) as Obj;
  const adverts = Array.isArray(related.listing_adverts) ? (related.listing_adverts as Obj[]) : [];
  const net = adverts.find((a) => a.advert_type === "internet") ?? {};
  return {
    state: String(l.system_listing_state ?? "earlier"),
    rent: typeof l.price_rent === "number" ? l.price_rent : null,
    heading: String(net.advert_heading ?? ""),
    body: String(net.advert_body ?? ""),
    highlights: Array.isArray(related.listing_highlights) ? (related.listing_highlights as Obj[]).map((h) => String(h.description ?? "")).filter(Boolean) : [],
  };
}

const FACT_ENUM = (k: keyof typeof OPTIONS) => ({ type: "string", enum: [...OPTIONS[k], "unknown"] });

const TOOL: Anthropic.Tool = {
  name: "fill_listing",
  description: "Hand back the advert and anything the photographs settle.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    required: ["heading", "body", "highlights", "facts"],
    properties: {
      heading: { type: "string", description: "One line under 80 characters: what it is and where, the line the portals show first." },
      body: { type: "string", description: "The advert, 150 to 260 words, plain paragraphs separated by blank lines. No headings, bullets or markdown." },
      highlights: {
        type: "array",
        items: { type: "string" },
        description: `${MAX_FEATURES_AI} key features, each under 60 characters, most persuasive first. Specific and factual: what makes THIS home worth viewing.`,
      },
      facts: {
        type: "object",
        additionalProperties: false,
        required: ["furnishing", "outsideSpace", "heating", "parking"],
        properties: {
          furnishing: { ...FACT_ENUM("furnishing"), description: "Only if the photographs or the facts settle it; otherwise unknown." },
          outsideSpace: { ...FACT_ENUM("outsideSpace"), description: "Only if seen or stated; otherwise unknown." },
          heating: { ...FACT_ENUM("heating"), description: "Only if stated or clearly visible (a gas boiler, storage heaters); otherwise unknown." },
          parking: { ...FACT_ENUM("parking"), description: "Only if stated; otherwise unknown." },
        },
      },
    },
  },
};

async function writeCopy(d: ListingDetails, facts: AutofillResult["facts"], context: string[]) {
  const known = [
    `Address: ${d.street}, ${d.town} ${d.postcode}`,
    d.rent != null && `Rent: £${d.rent} pcm`,
    facts.deposit != null && `Deposit: £${facts.deposit}`,
    d.availableFrom && `Available from: ${d.availableFrom}`,
    d.propertyType && `Property type: ${d.propertyType}`,
    (facts.beds ?? d.beds) != null && `Bedrooms: ${facts.beds ?? d.beds}`,
    d.baths != null && `Bathrooms: ${d.baths}`,
    d.epc.rating && `EPC rating: ${d.epc.rating}`,
    ...Object.entries(facts)
      .filter(([k]) => !["beds", "deposit"].includes(k))
      .map(([k, v]) => `${k}: ${v}`),
  ].filter(Boolean);
  /* Fetched here and sent as data: the model's own fetcher is refused by the
     photo host's robots.txt (15 Sep 2026), which is why "Write it for me"
     came back without ever seeing a room. */
  const photos = (
    await Promise.all(
      d.images.slice(0, 6).map(async (i): Promise<Anthropic.ImageBlockParam | null> => {
        try {
          const r = await fetch(i.thumb, { signal: AbortSignal.timeout(10_000) });
          const type = (r.headers.get("content-type") ?? "").split(";")[0];
          if (!r.ok || !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(type)) return null;
          const data = Buffer.from(await r.arrayBuffer()).toString("base64");
          return { type: "image", source: { type: "base64", media_type: type as "image/jpeg", data } };
        } catch {
          return null;
        }
      })
    )
  ).filter((p): p is Anthropic.ImageBlockParam => p !== null);
  const content: Anthropic.ContentBlockParam[] = [
    ...photos,
    {
      type: "text",
      text:
        `Fill in the portal listing for this rental, for Rightmove, OnTheMarket and Zoopla, on behalf of The Letting Experts.\n\n` +
        `What we know for certain:\n${known.map((f) => `- ${f}`).join("\n")}\n\n` +
        (context.length ? `Other sources:\n${context.join("\n\n")}\n\n` : "") +
        (d.body ? `The current description, which may be out of date:\n"""\n${d.body.slice(0, 3000)}\n"""\n\n` : "") +
        `${photos.length} photographs are attached; describe only what you can see in them.\n\n` +
        `Key features should lead with genuine selling points the sources support - a rent below the local median, a large floor area for the bedroom count, an early or flexible available date, a strong EPC, parking in an area where it is scarce, internet included - then the practical facts a renter filters on. ` +
        `Rules: British English. Warm, plain, confident; no clichés like "stunning" or "must-see"; never use an em dash. Never invent rooms, dimensions, transport links, schools or features that are not in the sources or visible. For each fact, answer "unknown" unless it is stated or plainly visible. Use the fill_listing tool.`,
    },
  ];
  const client = new Anthropic();
  const res = await client.messages.create({ model: MODEL, max_tokens: 4000, tools: [TOOL], tool_choice: { type: "tool", name: "fill_listing" }, messages: [{ role: "user", content }] });
  if (res.stop_reason === "refusal") throw new Error("The writer declined this one.");
  const call = res.content.find((c): c is Anthropic.ToolUseBlock => c.type === "tool_use" && c.name === "fill_listing");
  if (!call) throw new Error("The writer did not hand anything back.");
  const out = call.input as { heading: string; body: string; highlights: string[]; facts: Record<string, string> };
  const clean = (s: string) => s.replace(/—/g, "-").trim();
  return {
    heading: clean(out.heading).slice(0, 255),
    body: clean(out.body),
    highlights: out.highlights.map(clean).filter(Boolean).slice(0, MAX_FEATURES_AI),
    facts: Object.fromEntries(Object.entries(out.facts).filter(([, v]) => v && v !== "unknown")),
  };
}
