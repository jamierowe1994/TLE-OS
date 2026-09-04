# The market-appraisal deck — the mockup, captured

James shared a built example on 4 Sep 2026:
`https://marvellouspresentations.base44.app/view/tMyoS6vJJwTHrZnCCBCZyBQj`

It is a Base44 app ("Marvellous Presentations", app `69eb2522fbc3eca467b873bf`) running a
template called **TLE Market Appraisal Presentation** (`6a5a49a35ad2703ce28887e1`,
brand slug `tle`, type `MAPresentation`). This file is the structure pulled out of that
app's own data, so we are building against what it actually contains rather than against
screenshots of it.

The sample record is a real landlord — Steven Springer, 7 Spring Close, Rugby CV23 8YZ,
agent Ian Panter. Treat the names as live client data, not fixtures.

## What this is, against what we already have

Ours today (`lib/present.ts`, three kinds, 5/6/8 slides) is a *lettings* deck for one
office. This mockup is **28 slides** and is the full market-appraisal pitch — the thing
the agent presents on the day and leaves behind.

Two mismatches to settle before building:

- **Branding is confused in the source.** `branding.company_name` is "The Property
  Experts" with primary `#D93025`, the slide copy says "The Letting Experts", and the
  contact slide signs off `thepropertyexperts.co.uk`. The template is being shared across
  Experts Group brands. Ours should be TLE throughout.
- **It leans sales, not lettings.** The market-stats payload carries average *asking
  price*, time to *sell*, asking-to-*sold* ratio and buyers per property. A landlord
  wants rent, void time and demand. Slides 11 and 27 need rebuilding on letting figures.

## The 28 slides

Layout names are the mockup's own. `{{...}}` are its merge fields.

| # | Layout | Title |
|---|---|---|
| 1 | hero | Welcome |
| 2 | two_column | Agenda |
| 3 | meet_expert | Meet Your Expert |
| 4 | text_background_image | A Different Approach to Lettings |
| 5 | text_background_image | Compliance & Professional Guidance |
| 6 | services | Landlord Legal Compliance |
| 7 | hero | Your Property (section divider) |
| 8 | material_info | Detailed Property Info |
| 9 | current_listings | Current Listings |
| 10 | homesearch_comparables | Let Listings |
| 11 | market_data | Local Market Data |
| 12 | hero | Marketing (section divider) |
| 13 | services | What We Offer |
| 14 | property_video | Property Video |
| 15 | brochure | Property Brochures |
| 16 | two_column | Property Portals |
| 17 | services | Property Management & Support |
| 18 | service_levels | Service Levels |
| 19 | two_column | Protecting you and your rental income |
| 20 | text_bullets | Experts Management Service (Rent & Legal Protection) |
| 21 | text_feature_image | How We Find and Screen Every Tenant |
| 22 | logo_grid | Fully Regulated, Fully Protected |
| 23 | logo_grid | The Experts Group Network |
| 24 | testimonial | Testimonial |
| 25 | contact | Get In Touch |
| 26 | services | Rent Collection made easy |
| 27 | listings_history | Historic Listings |
| 28 | two_column | Social Media Marketing |

**The running order is wrong at the end and the agenda proves it.** The agenda on slide 2
promises: Your Property · The Current Market · Comparables · Marketing · Compliance &
Professional Guidance · Service Levels · Property Management · Protecting Your Income ·
The Next Steps. But slides 26–28 (rent collection, historic listings, social media) sit
*after* "Get In Touch", which is the close. They read as slides appended to a finished
deck. Rent collection belongs with management (17–18), historic listings with the market
(11), social media with marketing (12–16).

## Slide content worth keeping

### 2 · Agenda
Nine items, as listed above. Subheading: "Today's Market Appraisal of
{{property_address}} comprises".

### 4 · A Different Approach to Lettings
Heading "Why Landlords Choose The Letting Experts". Four paragraphs: the local expert
takes personal responsibility (vs. the high-street model where it is split across
departments); an independent local business backed by national systems, training,
compliance and operational support; legislation keeps changing and guidance matters more
with every update; first property or a portfolio, the priority is the same — protect the
investment, support a successful tenancy.

### 5 · Compliance & Professional Guidance
Four blocks: Clear Service Levels · Compliance Guidance · Structured Tenant Referencing
(affordability, credit history, employment) · Legally Compliant Documentation.

### 6 · Landlord Legal Compliance
Eight items, each pairing the obligation with how we help:
- Gas Safety Certificate (CP12) — annual; we track renewal dates
- Electrical Safety (EICR) — renewed at least every 5 years (England)
- EPC — minimum E rating; advice on upcoming MEES changes
- Smoke & Carbon Monoxide Alarms — checked at the start of every tenancy
- Deposit Protection — government-approved scheme, prescribed info served in time
- Right to Rent Checks — verified and documented for every tenant
- How to Rent Guide — current version issued to every new tenant
- Client Money Protection & Redress Scheme

Carries a footnote: requirements vary across the UK, this reflects England, Scotland and
Wales operate under separate legislation. **Keep this.** It is the kind of caveat that
stops a deck being wrong for half the book.

### 7 · Your Property
Body is a merge line: `{{hs_bedrooms}} Bedrooms · {{hs_floor_area_sqm}}sq m ·
{{hs_land_tenure}} · {{hs_borough}} Council · Tax Band {{hs_tax_band}}`.

### 13 · What We Offer
Professional photography & videography · virtual tours and 3D floor plans · premium
listings on Rightmove, Zoopla & OnTheMarket · targeted social media advertising ·
accompanied viewings · expert tenancy matching · tenancy agreements & compliance
documentation · regular rental market updates and performance reports.

### 14 · Property Video
Claims video "can generate 400% more enquiries". **Unsourced.** Our own rule is no
invented figures — either it gets a citation or the slide argues without it.

### 18 · Service Levels
A comparison table, three columns: **Experts Management Service · Rent Collection ·
Tenant Find**. Fourteen rows:

| Service | EMS | Rent Coll. | Tenant Find |
|---|---|---|---|
| Market Appraisal | ✓ | ✓ | ✓ |
| Preparation of property details & photographs | ✓ | ✓ | ✓ |
| Erect a 'To Let' Board | ✓ | ✓ | ✓ |
| Promote on Rightmove, Zoopla, OnTheMarket | ✓ | ✓ | ✓ |
| Accompanied viewings | ✓ | ✓ | ✓ |
| Comprehensive tenant referencing | ✓ | ✓ | ✓ |
| Tenancy Agreement | ✓ | ✓ | ✓ |
| Rent collection & statements | ✓ | ✓ | — |
| Deposit protected in government approved scheme | ✓ | — | — |
| Professional Inventory / schedule of condition & check-in | ✓ | — | — |
| Tenancy Extensions & legal notices | ✓ | — | — |
| Repairs & maintenance co-ordination | ✓ | — | — |
| Property inspections every 6 months | ✓ | — | — |
| Co-ordination of annual Gas Safety & Electrical checks | ✓ | — | — |

No fees on it. A landlord reading this asks the price immediately.

### 20 · Experts Management Service (Rent & Legal Protection)
Heading "More Than Management — Real Protection for Your Income". Included at no extra
cost on Full Management. Nine points:
- Full Vacant Possession Rent Cover — rent paid until vacant possession (12-month policies)
- Up to £100,000 Legal Expenses Cover — court fees, eviction, enforcement
- Fast-Starting Claims — rent begins within 30 days of a claim being accepted
- Section 8 Ready — covers extended arrears periods
- Post-Possession Rent — up to 3 months after possession is regained
- Tenant Damage Cover
- Eviction Managed For You
- No Gaps in Cover
- Available on New or Existing Tenancies

Disclaimer: subject to the insurer's terms, conditions and acceptance criteria; full
policy documentation provided separately. **Keep it** — this slide makes a financial
promise and the caveat is what makes it safe to make.

### 21 · How We Find and Screen Every Tenant
The Rental Passport pre-screen before a viewing is booked: affordability, credit history,
employment and income, previous landlord references, right to rent, guarantor option
where criteria aren't fully met. Only passing tenants are put forward. Qualified
applicants go to open viewings together — explicitly *not* a bidding process, it is about
reducing void time. Checks include AI-generated document fraud and tampering detection.
Real-time alerts on bookings, feedback and offers.

This is the strongest slide in the deck and it is buried at 21.

### 22 · Fully Regulated, Fully Protected
Eight logos with captions: Propertymark · CMP · redress scheme · ICO · TDS ·
mydeposits Scotland · Rent Smart Wales · Scottish letting agent register.

### 23 · The Experts Group Network
Eight brand logos: The Lettings Experts · TPE · TRE · TTE · Prestige · TME · TCPE ·
Marketing. Subheading offers connections across sales, mortgages, auctions and commercial.

### 25 · Get In Touch
"Let's Get Started, {{client_name}}" · {{agent_phone}} · {{agent_email}} ·
{{local_area}} Office · thepropertyexperts.co.uk (**wrong domain for TLE**).

### 26 · Rent Collection made easy
PayProp: same-day rent payment · automated arrears chasing · track payments and
statements · landlord portal.

### 28 · Social Media Marketing
"Only 2-3% of the population are actively looking on Rightmove" — targets passive
prospects. **Also unsourced**, and it is written in the first person singular ("I
target…") while the rest of the deck says "we".

## Merge fields it expects

`client_name` · `property_address` · `property_image_url` · `agent_name` · `agent_image` ·
`hs_bedrooms` · `hs_floor_area_sqm` · `hs_land_tenure` · `hs_borough` · `hs_tax_band` ·
`research_summary` · `agent_review_text` · `agent_review_author` · `agent_reviews_rating` ·
`agent_phone` · `agent_email` · `local_area`

The `hs_*` prefix is Homesearch. We already have a Homesearch seam
(`docs/HOMESEARCH-ENDPOINTS.md`) and `PresentMarket` in `lib/present.ts`.

## Data the sample carried

Beyond the merge fields, the record ships a `_area_statistics` block (district / sector /
postcode levels, competition breakdown, an AVM valuation), `_listings_history` (monthly
for-sale / sold / withdrawn counts plus named nearby listings with photos and agents), and
`_market_stats`. Ours already snapshots the equivalent at send time, which is the right
call and should not change — see the three decisions at the top of `lib/present.ts`.

## What was built from it (4 Sep 2026)

James settled the two open questions: it is **one deck**, and the **fee gets a page
of its own**. The post-valuation version is the same deck plus the agreed rent, the
terms with a DocuSeal signing button, and a real call to action at the end.

- `lib/present-copy.ts` — the standing copy, lifted from the structure above.
- `lib/present.ts` — `SlideId` extended to 33; `MAIN` is written once and
  post-appraisal splices `valuation` / `terms` around `fees`, so the two long decks
  cannot drift.
- `components/present-kit.tsx` — colours, `Rise`, `Slide`, `Eyebrow`, `Mark`, icons,
  moved out of PresentDeck so two files can render slides.
- `components/PresentSlides.tsx` — the twenty-four new slides.
- `components/PresentDeck.tsx` — dispatch, and a kind-aware close.

Live counts: pre-appraisal 5 slides, on-valuation **29**, post-valuation **31**.

Three slides from the source deck moved, because that deck contradicted its own
agenda — rent collection, historic listings and social media all sat after the close.
Two unsourced claims were dropped rather than repeated.

### Still open

- **Logo artwork.** The eight regulatory tiles and the Experts Group brands have no
  files in the repo, so they render as names set in the brand's type. Drop them into
  `/public/brand` and set `logo` in `lib/present-copy.ts`.
- **Three dense slides run tall on a phone** — service levels (1363px), rent & legal
  (1277px) and legal compliance (1173px) against an 812px viewport. They scroll
  rather than clip, which the deck allows, but they are the first candidates for a
  trim.
- **Fee figures are placeholders.** `SAMPLE_DECK.fees` carries 10% / 7% / £750 / £600
  because the slide needed something to render. Real numbers are James's call.

## Notes for the rebuild

- **Slide count.** 28 is a lot for a doorstep. Ours splits into three decks by kind; this
  one is a single run. Worth deciding whether 28 is the on-the-day deck, the leave-behind,
  or both with sections hidden.
- **Every field can be missing.** The mockup assumes a property image, an agent photo, a
  review and Homesearch data all exist. Our measured position is that they often do not.
  The existing empty-state rules in `lib/present.ts` still apply.
- **No invented figures.** Two claims in this deck (400% more enquiries, 2-3% actively
  looking) have no source attached.
- The `?internal=1` viewer's entrance animations never complete while the browser pane is
  hidden — the slides render near-invisible. Not our bug, but it means screenshotting the
  mockup needs the pane open.
