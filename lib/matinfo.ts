/**
 * Material information — everything Homesearch knows about the building.
 *
 * ── Why this file exists ──────────────────────────────────────────────────
 *
 * Our appraisal builder showed four things about a property: address,
 * postcode, sector, and whether we had matched it. Fine & Country's showed
 * thirty. James called it "night and day" and asked how they were doing it,
 * on the assumption they had a data source we did not.
 *
 * They do not. It is ONE endpoint we had never called — `matinfo/basic/{hs_id}`
 * — on the same Homesearch subscription, with the same token. Measured against
 * our own key on 11 Station Road, L34 5SN: a 200 carrying tenure, council tax
 * band, floor area, EPC current and potential, build-age band, flood risk,
 * broadband and mobile coverage, heating, water, sewerage, electricity and gas
 * operators, wall/roof/window/floor/lighting construction, conservation area,
 * coal-mining area, title number and planning applications.
 *
 * So there was nothing to buy and nothing to ask F&C for. There was a call to
 * make.
 *
 * ── Two things that are NOT available to us ───────────────────────────────
 *
 * `property/similar_on_market/{hs_id}` returns **403** on our token where it
 * works on theirs. We do not need it: `current_listings_crm/search/let/` gives
 * us the same stock WITH photographs, and is the lettings flavour rather than
 * the sales one.
 *
 * `floor_area` is SQUARE METRES, not square feet. F&C convert with ×10.7639 and
 * label the result sq ft. We show both, because a landlord over sixty thinks in
 * square feet and their builder thinks in metres.
 *
 * ── The rule this file obeys ──────────────────────────────────────────────
 *
 * A field we do not hold renders as absent, never as a zero, a dash dressed up
 * as data, or an inherited default. `bedrooms: 0` came back for a converted
 * flat that plainly has at least one — Homesearch uses 0 for "not recorded" —
 * so 0 beds is treated as unknown. Printing "0 bedrooms" on a document a
 * landlord reads is worse than printing nothing.
 */

/* ── the raw shape, as measured ───────────────────────────────────────────── */

export interface MatInfoRaw {
  bedrooms?: number | null;
  floor_area?: number | null;
  external_area?: number | null;
  tax_band?: string | null;
  category?: string | null;
  building_age?: string | null;
  energy_score?: number | null;
  energy_rating?: string | null;
  potential_energy_score?: number | null;
  potential_energy_rating?: string | null;
  energy_epc_date?: string | null;
  land_tenure?: string | null;
  remaining_lease_in_years?: number | null;
  title_number?: string | null;
  borough?: string | null;
  city?: string | null;
  conservation_area?: string | null;
  garden_orientation?: string | null;
  flood_risk?: string | null;
  lat?: number | null;
  lon?: number | null;
  address?: string | null;
  broadband?: { connectivity?: string | null; mobile_coverage?: string | null } | null;
  energy?: { electricity_operator?: string | null; gas_operator?: string | null } | null;
  heating?: {
    heating_system_type?: string | null;
    heating_fuel_type?: string | null;
    water_heating_type?: string | null;
  } | null;
  water?: {
    water_provider?: string | null;
    water_biller?: string | null;
    sewerage_provider?: string | null;
    sewerage_biller?: string | null;
  } | null;
  construction?: {
    walls_description?: string | null;
    roof_description?: string | null;
    windows_description?: string | null;
    floor_description?: string | null;
    lighting_description?: string | null;
  } | null;
  nuisance?: {
    near_hv_line?: boolean | null;
    near_wind_farm?: boolean | null;
    in_coal_mine_area?: boolean | null;
  } | null;
  rights_restrictions?: { grade?: string | null } | null;
  planning_applications?: Array<{
    title?: string | null;
    refno?: string | null;
    decision?: string | null;
    decision_descr?: string | null;
    submitted_date?: string | null;
    decision_date?: string | null;
  }> | null;
}

/** The AVM, which comes from a different endpoint but belongs on the same panel. */
export interface Valuation {
  /** Homesearch's estimate. A SALE value, not a rent — labelled as such. */
  estimate: number | null;
  lastSold: number | null;
  lastSoldDate: string | null;
}

/* ── the presentable shape ────────────────────────────────────────────────── */

export interface MatField {
  label: string;
  value: string;
  /** Fields a landlord asks about unprompted lead the panel. */
  headline?: boolean;
}

export interface MatGroup {
  id: string;
  title: string;
  fields: MatField[];
}

export interface MaterialInfo {
  hsId: number;
  /** Grouped for display. Empty groups are dropped before you get here. */
  groups: MatGroup[];
  /** How much of what we asked for came back — shown honestly on the panel. */
  known: number;
  possible: number;
  valuation: Valuation | null;
  /** Straight through for a map pin, when we have it. */
  lat: number | null;
  lon: number | null;
}

const SQFT_PER_SQM = 10.7639;

/** A value we can actually show. Rejects null, "", and the 0-means-unknown trap. */
function has(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "string") return v.trim() !== "";
  if (typeof v === "number") return Number.isFinite(v) && v !== 0;
  return true;
}

const titleCase = (s: string) =>
  s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

/** "30" → "30 sqm · 323 sq ft". Both, deliberately — see the header. */
function area(sqm: number): string {
  return `${Math.round(sqm)} sqm · ${Math.round(sqm * SQFT_PER_SQM).toLocaleString("en-GB")} sq ft`;
}

function yesNo(v: unknown): string | null {
  return v === true ? "Yes" : v === false ? "No" : null;
}

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

function ukDate(s: string): string {
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

/**
 * Turn the raw payload into groups a person can read.
 *
 * The grouping is not cosmetic. An agent standing in a hallway is answering one
 * question at a time — "what is it", "what will it cost to run", "is there
 * anything wrong with it" — and a flat alphabetical list of thirty fields makes
 * them hunt. Compliance-adjacent facts (EPC, flood, mining, listed status) are
 * kept together because those are the ones that stop a let.
 */
export function shapeMaterialInfo(
  hsId: number,
  m: MatInfoRaw,
  valuation: Valuation | null
): MaterialInfo {
  const groups: MatGroup[] = [];
  let known = 0;
  let possible = 0;

  const push = (id: string, title: string, rows: Array<[string, unknown, boolean?]>) => {
    const fields: MatField[] = [];
    for (const [label, raw, headline] of rows) {
      possible++;
      if (!has(raw)) continue;
      known++;
      fields.push({ label, value: String(raw), headline });
    }
    if (fields.length) groups.push({ id, title, fields });
  };

  push("what", "What it is", [
    ["Property type", m.category, true],
    ["Bedrooms", has(m.bedrooms) ? m.bedrooms : null, true],
    ["Floor area", has(m.floor_area) ? area(m.floor_area as number) : null, true],
    ["External area", has(m.external_area) ? area(m.external_area as number) : null],
    ["Built", m.building_age],
    ["Garden faces", m.garden_orientation ? titleCase(m.garden_orientation) : null],
  ]);

  push("legal", "Tenure and tax", [
    ["Tenure", m.land_tenure, true],
    ["Council tax band", m.tax_band, true],
    [
      "Lease remaining",
      has(m.remaining_lease_in_years) ? `${m.remaining_lease_in_years} years` : null,
    ],
    ["Title number", m.title_number],
    ["Council", m.borough],
  ]);

  /* EPC leads because a rental cannot legally be let below E, which makes it
     the one field here that can stop the instruction dead. */
  push("epc", "Energy", [
    [
      "EPC rating",
      has(m.energy_rating)
        ? `${m.energy_rating}${has(m.energy_score) ? ` (${m.energy_score})` : ""}`
        : null,
      true,
    ],
    [
      "EPC potential",
      has(m.potential_energy_rating)
        ? `${m.potential_energy_rating}${has(m.potential_energy_score) ? ` (${m.potential_energy_score})` : ""}`
        : null,
    ],
    ["EPC assessed", has(m.energy_epc_date) ? ukDate(m.energy_epc_date as string) : null],
    ["Heating", m.heating?.heating_system_type ? titleCase(m.heating.heating_system_type) : null],
    ["Heating fuel", m.heating?.heating_fuel_type ? titleCase(m.heating.heating_fuel_type) : null],
    [
      "Hot water",
      m.heating?.water_heating_type ? titleCase(m.heating.water_heating_type) : null,
    ],
  ]);

  push("utilities", "Utilities and connectivity", [
    ["Broadband", m.broadband?.connectivity],
    ["Mobile coverage", m.broadband?.mobile_coverage],
    ["Electricity", m.energy?.electricity_operator],
    ["Gas", m.energy?.gas_operator],
    ["Water", m.water?.water_provider],
    ["Sewerage", m.water?.sewerage_provider],
  ]);

  push("build", "Construction", [
    ["Walls", m.construction?.walls_description],
    ["Roof", m.construction?.roof_description],
    ["Windows", m.construction?.windows_description],
    ["Floor", m.construction?.floor_description],
    ["Lighting", m.construction?.lighting_description],
  ]);

  /* The "is there anything wrong with it" group. `false` is a real answer here
     and must survive — "Coal mining area: No" is worth printing, where an
     absent field is not. Hence yesNo() rather than the has() path. */
  push("risk", "Risks and restrictions", [
    ["Flood risk", m.flood_risk],
    ["Conservation area", m.conservation_area],
    ["Listed building", m.rights_restrictions?.grade],
    ["Coal mining area", yesNo(m.nuisance?.in_coal_mine_area)],
    ["Near high-voltage line", yesNo(m.nuisance?.near_hv_line)],
    ["Near a wind farm", yesNo(m.nuisance?.near_wind_farm)],
  ]);

  const planning = m.planning_applications ?? [];
  if (planning.length) {
    groups.push({
      id: "planning",
      title: `Planning history (${planning.length})`,
      fields: planning.slice(0, 8).map((p) => ({
        label: p.submitted_date ? ukDate(p.submitted_date) : (p.refno ?? "Application"),
        value: [p.title, p.decision_descr ?? p.decision].filter(Boolean).join(" — ") || "—",
      })),
    });
  }

  return { hsId, groups, known, possible, valuation, lat: m.lat ?? null, lon: m.lon ?? null };
}

/** Format the AVM for display. Sale value — never let a rent figure borrow it. */
export function valuationLines(v: Valuation): MatField[] {
  const out: MatField[] = [];
  if (has(v.estimate)) out.push({ label: "Estimated value", value: gbp(v.estimate as number) });
  if (has(v.lastSold)) {
    out.push({
      label: "Last sold",
      value: `${gbp(v.lastSold as number)}${v.lastSoldDate ? ` · ${ukDate(v.lastSoldDate)}` : ""}`,
    });
  }
  return out;
}
