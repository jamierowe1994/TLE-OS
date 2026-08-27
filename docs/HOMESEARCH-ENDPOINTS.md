# External Property-Data Endpoints — reference map

Reverse-engineered from the private repo `hjjconsultingltd-sys/f-c-pipeline`
(Fine & Country pipeline, Base44 backend functions under `base44/functions/<name>/entry.ts`
and shared clients under `base44/shared/**`). Read-only audit - nothing in that repo was changed.

Everything below is what F&C actually calls in production. Where a field name is listed, it is a
field the F&C code reads off the response, so it is known to exist.

**Bottom line for TLE OS:** there is exactly **one** live external property-data provider -
**HomeSearch**. Land Registry is not called live; it arrives via an offline open-data pipeline.
There is no PropertyData, no RealtyAPI, no direct EPC/Ofcom/council-tax call - all of that
material info comes bundled inside one HomeSearch endpoint (`matinfo/basic`).

---

## 1. HomeSearch

### Connection

| Item | Value |
|---|---|
| Base URL | `https://data.homesearch.co.uk/avi` (env `HOMESEARCH_BASE_URL`, trailing slash stripped) |
| Full path shape | `{base}/api/v1/...` |
| Auth | `Authorization: Bearer {HOMESEARCH_API_KEY}` - a static API key, no OAuth, no refresh |
| Accept | `Accept: application/json` |
| Method | **GET on every endpoint.** No writes exist. |

Shared client: `base44/shared/ma/homesearch.ts` (`hsGet` swallows errors to `null`; `hsGetRaw`
returns `{ok, status, data}` so callers can tell 429/404 from empty).

### Cross-cutting conventions

- **Array params use PHP bracket encoding, repeated:** `districts[]=SE19&districts[]=SE20`,
  `sectors[]=SE19 1`, `postcodes[]=SE19 1AA`, `beds[]=3&beds[]=4`, `agents[]=`,
  `exclude_agents[]=`, `sort[]=-listed_on`. Getting this wrong is the usual cause of a silent
  empty result.
- **Geography levels** are `districts[]` (outcode, e.g. `SE19`), `sectors[]` (outcode + first
  inward digit, e.g. `SE19 1`), `postcodes[]` (full unit). A district-only string like `CV21` has
  **no sector** - F&C's parser deliberately requires the space + digit before it will emit one.
- **`date_listed_from` is effectively required** on every `current_listings*` search. F&C always
  sends `1900-01-01` when it means "no lower bound". Omitting it returns nothing useful.
- **Trailing slash before the query string matters** on the `_crm` search variants:
  `/current_listings_crm/search/sale/?...`. The live API 404s without it.
- **Rate limits are real.** 429 and 503 both occur; F&C retries with exponential backoff honouring
  `Retry-After`. Page size caps at **300**.
- **Timeouts:** F&C uses 10-15s AbortControllers on every call.
- **Response envelope varies.** Search endpoints return `{ data: [...], total, limit, offset }`.
  Single-object endpoints sometimes wrap in `{ data: {...} }` and sometimes do not - unwrap
  defensively (`res.data?.data && !Array.isArray(res.data.data) ? res.data.data : res.data`).

---

### 1a. Address resolution (get an `hs_id` - the key to everything else)

Every property endpoint is keyed on `hs_id`. You must resolve one first.

| Purpose | Path | Params | Notes / response fields used |
|---|---|---|---|
| Match one address to an id | `GET /api/v1/match_address` | `address` (**required**, full address string; F&C concatenates `"{address} {postcode}"`) | Returns `hs_id`, `address_label`. **404 = no match** (not an error - handle it). Fields sometimes nest as `data.hs_id`; also seen as plain `id`. |
| All addresses in a postcode | `GET /api/v1/find_addresses/{postcode}` | path segment = full postcode | Returns `{ data: [{ hs_id, address_label }], meta }` (sometimes a bare array). |
| Free-text typeahead | `GET /api/v1/find_addresses` | `query` (**required**, min 3 chars) | Returns a bare array of `{ hs_id, address_label }`, **max 100**. **422** on too-short query - treat as no results. |
| Full address detail | `GET /api/v1/return_address_details/{hs_id}` | - | Address detail object; F&C reads `hs_label`. |

> **Lettings note:** identical for lettings. Address resolution is type-agnostic.

---

### 1b. Property material info - the "Property Info" step

**This is the one you want.** A single call returns beds, type, floor area, council tax band,
tenure, title number, build year, garden orientation, broadband, heating, energy, external area,
flood, construction, planning applications - all of it.

| Purpose | Path | Params |
|---|---|---|
| **Material information (full)** | `GET /api/v1/matinfo/basic/{hs_id}` | none |

Response fields F&C reads (flat unless nested shown):

```
bedrooms, category, floor_area (sqm), external_area (sqm), garden_orientation, city, borough,
building_age ("1993-1999" - parse the first 4 digits), tax_band, land_tenure,
remaining_lease_in_years, title_number, conservation_area (bool), flood_risk,
energy_rating, energy_score, potential_energy_rating, potential_energy_score, energy_epc_date,
lat, lon
broadband: { connectivity, mobile_coverage }
heating:   { heating_system_type, heating_fuel_type, water_heating_type }
energy:    { electricity_operator, gas_operator }
water:     { water_provider, water_biller, sewerage_provider, sewerage_biller }
construction: { walls_description, roof_description, floor_description, windows_description,
                lighting_description }
rights_restrictions: { grade }            // listed-building grade: "I" | "II" | "II*"
nuisance: { near_hv_line, near_wind_farm, in_coal_mine_area }   // booleans
planning_applications: [ { refno, title, submitted_date | date_received, decision,
                           decision_descr, decision_date } ]
```

| Purpose | Path | Response fields used |
|---|---|---|
| Property details (lighter) | `GET /api/v1/property/details/{hs_id}` | `bedrooms`, `floor_area` (**sqm** - multiply by 10.7639 for sqft), `energy_rating`, `energy_score`, `potential_energy_rating` |
| Is it on the market now? | `GET /api/v1/on_market_checker/{hs_id}` | `is_on_market` (bool) |
| AVM / quick valuation | `GET /api/v1/property/quick_valuation/{hs_id}` | `price` (or `estimate`/`value`, sometimes `sale.estimate`); `low`/`range_low`/`price_low`, `high`/`range_high`/`price_high`; **`last_sold_date`**, **`price_last_sold`**. Values may be a plain number **or** a `{low, high}` object - handle both. |

**Lettings usefulness:**
- `matinfo/basic` is the single best call for a lettings pre-tenancy / property record. Council tax
  band, EPC + expiry date, tenure, heating and fuel type, flood risk and broadband are all
  compliance-relevant for lettings and are otherwise scraped by hand.
- `quick_valuation` is a **sales** AVM. Its `last_sold_date` / `price_last_sold` are still useful
  as a landlord-contact trigger, but the estimate itself is a sale price, not a rent.
- There is **no rental AVM endpoint**. Rent estimates must be derived from
  `area_statistics/lettings/avg_price_on_market` plus let comparables (1e).

---

### 1c. Listings search - the on-market feed WITH photos

Two variants of the same search exist. F&C tries the full one first and falls back:

| Variant | Path |
|---|---|
| Full (preferred) | `GET /api/v1/current_listings/search/{sale\|let}/?{params}` |
| CRM (fallback, and what most F&C code actually uses) | `GET /api/v1/current_listings_crm/search/{sale\|let}/?{params}` |

`{sale|let}` - **`let` is the lettings feed.** This is fully supported, not sales-only.

**Parameters** (all optional unless marked):

| Param | Type | Notes |
|---|---|---|
| `date_listed_from` | date `YYYY-MM-DD` | **Send it always.** Use `1900-01-01` for "no bound". |
| `date_listed_to` | date | |
| `districts[]` | repeated string | outcode |
| `sectors[]` | repeated string | e.g. `SE19 1` |
| `postcodes[]` | repeated string | full unit |
| `search` | string | free-text address match |
| `beds[]` | repeated int | |
| `type` | `F` \| `H` | Flat / House. (Distinct from `category=HSE\|FLA` used on area_statistics.) |
| `price_from`, `price_to` | int | For `let` this is **pcm**. |
| `status` | string | **one value only** - fan out and merge for multiple. Live values: `on market`, `sstc`, `let agreed`, `withdrawn`, `fallen through`, `unavailable`. Undocumented but confirmed live. |
| `is_available` | `1` \| `0` | `1` = current stock only. **Do not force it** - it hides let-agreed/withdrawn rows from a status search. |
| `is_reduced` | `true`\|`false` | |
| `date_reduced_from` | date | |
| `agents[]`, `exclude_agents[]` | repeated string | exact agency name strings |
| `north`, `south`, `east`, `west` | float | map-viewport bounds. **All four required together.** F&C converts a radius: `miToLat = miles/69`, `miToLon = miles/(69*cos(lat))`. |
| `sort[]` | string | e.g. `-listed_on` (leading `-` = desc) |
| `limit` | int | **max 300** |
| `offset` | int | |

**Response:** `{ data: [row], total, limit, offset }`.

**Row fields** (names vary between the two variants - F&C normalises across all of these):

```
id | listing_id | current_listing_id | hs_listing_id | crm_id     // often ABSENT
hs_id, uprn
street, full_address | address, postcode, paon
type | category, beds | bedrooms
agent | agency | agency_name
price, lat, lon
image | thumb | image_url                                          // <-- THE PHOTO
listed_on | date_listed, status, is_reduced, reduced_at
let_agreed_on, status_changed_on
link                                                               // <-- TRAP, see below
portal_url | listing_url | rightmove_url | zoopla_url | url
days_on_market                                                     // present on some feeds
```

> **Two traps, both documented in the F&C code:**
> 1. **`link` is usually the raw HomeSearch API detail URL**, not a webpage. Never render it as an
>    advert href - it returns JSON. Test with `/homesearch\.co\.uk\/avi|\/api\/v1\//i` and reject.
> 2. **When there's no `id` field, recover it from `link`** with `/current_listings\/(\d+)/`. You
>    need that id for the photo/advert endpoints below.
>
> **Multi-agent duplicates:** the same property listed with N agents returns N rows. Group by
> `hs_id` when present, else by normalised `address|postcode|beds`, or your counts inflate.

#### Listing detail, photos and the real advert link

| Purpose | Path | Response fields |
|---|---|---|
| Full listing detail incl. **all photos** | `GET /api/v1/current_listings/{listing_id}` | `images` \| `image_urls` \| `photos` - array of strings **or** objects `{url\|image\|src}`. Also price history, `portal_url`/`listing_url`/`rightmove_url`/`zoopla_url`, and a `links[]` array. |
| Portal advert deep link | `GET /api/v1/current_listings/{listing_id}/url` | `url` \| `report_url` \| `link` \| `portal_url` (sometimes a bare string). 404 = no advert. |
| Competitor agency directory | `GET /api/v1/current_listings/agents/search` | params: `search`, `districts[]`, `sectors[]`, `postcodes[]`. Returns array (or `{data}`/`{agents}`) of strings or `{agent\|name\|agency\|agency_name}`. |

**Photos for a property that is not currently listed:** `match_address` → `hs_id` →
`GET /api/v1/current_listings/{hs_id}` and read `images`. Best-effort; a property with no portal
history returns nothing.

**Lettings usefulness: this is the core lettings feed.** `search/let` with `sectors[]` + `beds[]`
gives you live competing rentals with photos, agent, pcm price and `listed_on` - everything a
rental valuation or a "what else is the landlord competing with" panel needs. Days-on-market is
**computed by you** from `listed_on`, not supplied by an endpoint (see 1d).

---

### 1d. Area statistics

**Only three metrics exist, each in a sale and a lettings flavour, plus one sector-breakdown call.**
That is the complete set - `avg_time_on_market` and similar names 404 because they do not exist.

| Path | Params | Response | Lettings? |
|---|---|---|---|
| `GET /api/v1/area_statistics/sale/avg_price_on_market` | one of `districts[]` / `sectors[]` / `postcodes[]` (**required**), optional `beds[]`, optional `category=HSE\|FLA` | `{ avg_price }` | sales only |
| `GET /api/v1/area_statistics/lettings/avg_price_on_market` | same | `{ avg_price }` = **average asking rent pcm** | **yes** |
| `GET /api/v1/area_statistics/sale/on_market_count` | same | `{ count }` = live stock | sales only |
| `GET /api/v1/area_statistics/lettings/on_market_count` | same | `{ count }` = homes to let now | **yes** |
| `GET /api/v1/area_statistics/sale/off_market_count` | same | `{ count }` = **sold in the last 12 months** | sales only |
| `GET /api/v1/area_statistics/lettings/off_market_count` | same | `{ count }` = **let in the last 12 months** | **yes** |
| `GET /api/v1/area_statistics` | `district` (**singular, not bracketed**), optional `beds[]`, `category` | array of per-**sector** statistics objects for that district | mixed |

Note the segment is `lettings` (plural) here, while the listings routes use `let` (singular). F&C
has a comment about exactly this.

**Live market insight** (paged lists behind the counts):

| Path | Params | Response |
|---|---|---|
| `GET /api/v1/live_market_insight/new_to_market` | `districts[]`, `beds[]`, `limit`, `offset` | `{ total, data: [ { category, agency_name, ... } ] }`. **Page size is 10** - F&C pages 5 deep and reports `total` from the API. |
| `GET /api/v1/live_market_insight/on_market_over_period` | as above **plus `on_market_over_weeks`** (int, e.g. 4) | same shape - stale stock |

**What does NOT exist, and how F&C works around it:**

| Wanted | Reality |
|---|---|
| time on market / days on market | **No endpoint.** Compute it: pull `current_listings_crm/search` with `is_available=1`, parse `listed_on`, take `(now - listed_on)` in days and median it. F&C also counts "over 12 weeks" (>84 days). |
| new-to-market vs stale counts | Either `live_market_insight` (above), or derive exactly from listing rows using a 28-day cutoff on `listed_on` - F&C prefers deriving, so the window is theirs and exact. |
| price bands / price distribution | **No endpoint.** F&C builds Rightmove-convention bands client-side and buckets live listing prices into them. |
| market trends over time | **No endpoint.** F&C aggregates `listed_on` by month from a full paged pull (up to 40 pages x 300 = 12,000 rows), and separately snapshots monthly ratios into its own database to build a history. |
| neighbourhood / demographics | Not HomeSearch - see section 2. |
| properties-on-market list | = `on_market_count` + the listings search. No separate endpoint. |

---

### 1e. Comparables

| Purpose | Path | Response fields | Lettings? |
|---|---|---|---|
| Recently sold nearby | `GET /api/v1/property/comparable/recently_sold/{hs_id}` | array (or `{data}`/`{result}`) of `{ address, price, sold_date, beds\|bedrooms, floor_feet_area (sqft), property_type\|type, tenure }` | **SALES ONLY - no lettings equivalent** |
| Similar off-market homes | `GET /api/v1/property/comparable/off_market/{hs_id}` | `{ address, beds, floor_feet_area, last_sold_date, price_range }` | sales only |
| Similar homes on the market | `GET /api/v1/property/similar_on_market/{hs_id}` | `{ thumb, street, district, beds, baths, agency, price }` | sales-flavoured |

> **Documented gotchas on `recently_sold`:**
> - It has returned **HTTP 403 "This action is unauthorized"** on some API keys - the comparable-sales
>   entitlement is licensed separately. Handle 403 as "empty", not as a bug.
> - The payload carries **no postcode, no listing id and no photo** - just address, price, floor area.
>   F&C measured a **1-in-10** hit rate trying to bridge each sold comp back to a photo via
>   `current_listings_crm`, and gave up: sold comparables are text and figures only.
> - Floor area here is `floor_feet_area` in **sqft**, whereas `property/details.floor_area` is in
>   **sqm**. Do not mix them.

**Lettings comparables have no dedicated endpoint.** F&C builds them from the listings feed:
`GET /api/v1/current_listings_crm/search/let/?sectors[]={sector}&beds[]={n}&date_listed_from=1900-01-01&sort[]=-listed_on&limit=100`
then keeps rows whose `status` is **not** "on market"/"available" - i.e. `let`, `agreed`,
`completed`, `under offer`, `withdrawn`, `removed`. Date comes from
`let_agreed_on || status_changed_on || listed_on`. That is the lettings comparables pattern to copy.

---

### 1f. Reports

| Purpose | Path | Params | Response |
|---|---|---|---|
| Customer insight report (PDF/URL) | `GET /api/v1/customer/insight/insight_report/{hs_id}` | `email` (**required**, validated), optional `company_name`, `branch` | `{ report_url }` (or `url`). Failure often means the account's licence does not cover reports - pass the status through. |

---

## 2. HM Land Registry

**There is no live Land Registry API call anywhere in the F&C pipeline.** The "Upper market -
Land Registry" panel (median sold + sales count by district/sector) is served from a Base44 entity
called `AreaStats`, which is built **offline**.

| Item | Detail |
|---|---|
| Producer | Separate repo `github.com/hjjconsultingltd-sys/fc-area-data`, `pipeline/aggregate.py` |
| Loader | `tools/load_to_base44.py`, refreshed **monthly** |
| Grain | One record per England & Wales **postcode sector** (~9,600) |
| Sources | HM Land Registry **Price Paid Data**, ONS **Census 2021**, ONS Postcode Directory, Historic England / Cadw (National Heritage List), Environment Agency / NRW Flood Map for Planning. All Open Government Licence v3. |
| Row fields | `sector`, `district`, `households`, `population`, `postcodes_live`, `sale_prices[]` (**every individual sale price, sorted ascending**), `sales{count, mean, median, by_type{D,S,T,F,O}}`, `sales_window_end`, `tenure{owned_outright, owned_mortgage, private_rented, social_rented, shared_ownership, rent_free}`, `accommodation{detached, semi_detached, terraced, flat}`, `bedrooms{b1,b2,b3,b4_plus}`, `occupancy`, `composition`, `cars`, `heritage{total_entries, grade_i, grade_ii_star, grade_ii, conservation_areas}`, `flood{zone3_households, zone2_households}` |

**Gotchas carried in their code, worth inheriting:**
- The sales window is a **complete 12 months ending `sales_window_end`**, deliberately backed off
  because HMLR registers sales months after completion. Never call it "the last 12 months" or
  "recent" - registration lags ~6 months.
- An **empty heritage or flood block means "no data held", never "measured zero."** Both stop at the
  Welsh border. Percentages must be computed over covered households only, and must return
  **null**, not 0, when uncomputable. Rendering unknown flood exposure as 0% is the exact bug they
  guard against.
- When merging sectors into a patch, **sum the counts and recompute percentages** - never average
  percentages across sectors, or a 200-household sector outweighs a 4,000-household one.
- Because they hold every individual sale price rather than a histogram, price slices are **exact**.

**Lettings relevance:** the Census 2021 `tenure.private_rented` share per sector is the single most
useful field here for lettings - it sizes the local rental market. `bedrooms` and `accommodation`
give you the stock mix. The HMLR sale prices themselves are sales-only.

**If TLE OS wants live Land Registry:** it is open data - `https://landregistry.data.gov.uk/app/ppd`
(F&C link out to it manually from a task checklist). No key needed, but no rental data in it either.

---

## 3. Other providers

| Provider | Status in f-c-pipeline |
|---|---|
| **PropertyData** | Not present. No calls, no key. |
| **RealtyAPI** | Not present. |
| **EPC register** | Not called directly. EPC rating, score, potential rating and EPC date all come from HomeSearch `matinfo/basic`. |
| **Ofcom / broadband** | Not called directly. `matinfo/basic.broadband.{connectivity, mobile_coverage}`. |
| **Council tax** | Not called directly. `matinfo/basic.tax_band` + `.borough`. |
| **Homedata** (postcode profile, price trends, growth, distributions) | Code paths compiled in but **flag-disabled** (`RESEARCH_SOURCES.homedata = false`, `presentationConfig.ts`). Would need a `HOMEDATA_API_KEY`. Never called. |
| **Scrapfly** (Rightmove photo scraping) | Same - `RESEARCH_SOURCES.scrapfly = false`. Never called. |
| **REX** | `https://api.uk.rexsoftware.com/v1/rex` - their CRM, not a property-data provider. Out of scope here. |
| **DocuSeal, Microsoft Graph, Facebook Graph, Google Maps** | Present, but not property data. |

---

## 4. Suggested implementation order for TLE OS (lettings)

1. `match_address` → `hs_id`. Everything hangs off this. Handle 404 as "no match", not an error.
2. `matinfo/basic/{hs_id}` - one call fills the entire property record: beds, type, floor area,
   council tax band, tenure, EPC + expiry, heating, flood, broadband. Highest value per call.
3. `current_listings_crm/search/let/` with `sectors[]` + `beds[]` + `is_available=1` - live
   competing rentals with photos and pcm prices.
4. Same endpoint **without** `is_available`, filtered to non-available statuses - your let
   comparables.
5. `area_statistics/lettings/{avg_price_on_market, on_market_count, off_market_count}` - the three
   headline lettings numbers, at district / sector / postcode.
6. Compute days-on-market and new-vs-stale yourself from `listed_on`. There is no endpoint.

### Things that will bite

- Bracketed array params must be **repeated**, not comma-joined.
- Trailing slash before `?` on the `_crm` search routes.
- `date_listed_from` on every search.
- `link` is an API URL, not an advert - and the listing `id` often only exists inside it.
- Dedupe multi-agent rows or every count is inflated.
- 300 is the hard page cap; 429/503 need backoff on `Retry-After`.
- `floor_area` is sqm on `property/details` and `matinfo`; `floor_feet_area` is sqft on comparables.
- `lettings` on area_statistics vs `let` on listings routes.
- No rental AVM, no rental comparables endpoint, no time-on-market endpoint, no price-band endpoint,
  no trend endpoint. All four are derived client-side.
