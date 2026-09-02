# Landlord Radar — the plan

*Written 2 Sep 2026. Phase 1 built the same day; see the status block at the end.*

A Spectre-style landlord prospecting tool inside TLE-OS, under Tools → Prospecting.
It turns the daily Homesearch sweep we already run into a scored list of properties
whose landlord is likely to move agent, and gives Howard and Kirstie a way to work it.

The order below is deliberate: first the signals we can read today with no new data,
no new cost and no personal data; then the reach; then the deeper sources.

---

## What we found on 2 Sep

Sampled the four busiest districts in the patch (NN1, NN5, LU1, LU2) straight from the
Homesearch feed: 2,432 current rows. Of the 300 most recent listings:

| Lister | Rows |
|---|---|
| OpenRent (self-managing landlords) | 43 |
| Your Move | 20 |
| Leaders | 19 |
| Penrose | 17 |
| haart | 14 |

Statuses present in the feed: on market, withdrawn, let agreed, fallen through.

Fields the feed returns that the sweep currently throws away: `hs_id`, `uprn`, `udprn`,
`reduced_at`, `link`, `image`. **UPRN is the property's permanent id** and the key to
joining every other source below (EPC, Land Registry, HMO registers all carry it or an
address that resolves to it).

Two things to check before Phase 1:

- The watch list is **181 sectors seeded from the REX book, spread across the whole UK**
  (Birmingham, Bristol, Edinburgh...). Radar should watch TLE's real patch only. Confirm the
  districts with Susan (NN and LU, but which?) and seed from those.
- The sweep upserts in place, so today it cannot see a rent reduction or an agent change
  after the fact. Phase 1 fixes that with an events table.

---

## Phase 1 — Signals from data we already have (before launch)

No new data source, no personal data, no cost beyond calls we already make.

**1. Keep history.** New table `os_listing_events (listing_key, uprn, event, from, to, at)`.
The sweep diffs each row against what it held and writes an event when rent, status or
agent changes, plus `first_seen` and `gone`. Also store `uprn`, `hs_id`, `reduced_at`,
`link` on `os_listing_capture` (additive columns, same CREATE-IF-NOT-EXISTS pattern in
`lib/db.ts`).

**2. Signals.** Each is a query over capture + events. Property-level only.

| Signal | Rule | Why it converts |
|---|---|---|
| Self-managing | agent is OpenRent or another private-lister | Lost Section 21 in May, PRS register and MTD coming |
| Stale 30 / 60 / 90 | on market, listed_on older than N days | Agent is not shifting it |
| Reduced | `reduced_at` set or a rent-down event | Landlord already unhappy |
| Withdrawn unlet | status withdrawn, never let agreed | Fell out with the agent or gave up |
| Fallen through | status fallen through | Let agreed then lost; landlord exposed |
| Re-listed | same UPRN back on market within 12 months | Short tenancy or churn |
| Switched agent | same UPRN, different agent within 12 months | Proven willing to move |
| Competitor new | new to market, agent is not TLE | Long-term nurture, low priority |

**3. Prospects.** `os_radar_prospects` keyed on UPRN: address, postcode, sector, beds, rent,
current agent, active signals, score, stage (new → queued → contacted → appraisal booked →
won / not interested / do not contact), assigned_to, notes, last_action_at. The score is a
weighted sum of signals to start; weights live in one file so they can be tuned.

**4. The screen.** Tools → Prospecting → Landlord Radar. A table (reuse `DataTable` and the
column customiser from Leads) with filters for signal, sector, agent, days on market and
stage. Row actions: open the portal listing, assign, add note, change stage, and
**Book appraisal**, which creates the lead through the existing REX contacts path (gated by
`REX_ALLOW_WRITES`, same as today). The card on the Tools grid goes in `lib/tools.ts` as
status `building` until the screen is real.

**5. Daily digest.** After the sweep, an internal email (Resend, colleagues only, which
`lib/email-policy.ts` already enforces) to whoever owns the list: new signals today, by
type, with the top ten by score.

**Effort:** two to three sessions. Fits before 14 October.

---

## Phase 2 — Reach

**1. Letters.** The one clean cold channel. Two kinds:

- *To the property* addressed "To the Owner": no personal data, but it lands with the
  tenant or an empty house, so it only works for self-managing landlords who live nearby
  or check post. Cheap, fine for a first test.
- *To the owner's correspondence address* from the Land Registry title register (£7 a
  title since December 2024, by any route). This is how
  Spectre reaches absentee landlords. It is personal data, so it waits for the GDPR step
  below and is bought per prospect only when a letter is actually queued.

Fulfilment: start with a PDF batch Howard prints and posts. Move to a print API (Stannp or
Docmail, roughly £1 a letter) once volume justifies it.

**2. Sequences.** Reuse the shape in `lib/campaigns.ts`: a new audience `radar` with steps
by day offset and channel (post, call task, email where consented). Enrolment is per
prospect. Marketing writes the copy; the sequence holds at any unwritten step, as today.

**3. Tracking.** Every letter carries a QR code and short URL (the `qrcode` package is
already in the stack) that opens the rent check or compliance check with the address
pre-filled. A scan or a form is an inbound lead tied back to the signal that produced
the letter. That is the feedback loop that tells us which signals are worth the stamp.

**4. Calls.** Only to prospects who have responded, or to companies. No cold calls to
individuals without TPS screening.

**Effort:** two sessions plus copy from marketing.

---

## Phase 3 — Deeper data

All free unless marked.

**1. EPC open data** (quarterly bulk CSV, GOV.UK One Login). Filter the domestic file to
our districts and transaction type "rental (private)". Join on UPRN. Signals:
*EPC expiring within 12 months* (cannot re-let without a new one) and *EPC below C* (must
fix by October 2030). This also gives us the rented stock that is not currently listed
anywhere, which is most of it.

**2. HMO public registers** (West Northamptonshire, Luton). Parse the published register:
licence holder, address, expiry. Signal: *licence expiring*. Portfolio landlords by
definition.

**3. Land Registry CCOD and OCOD** (free monthly). Company-owned residential titles in our
districts. Companies are not data subjects, so these can be emailed and called. Companies
House API adds officers and a registered address.

**4. Our own book.** Match REX landlords and addresses against the capture by UPRN:
landlords who have other properties with a competitor, and tenant-find-only landlords to
move to full management.

**5. Owner lookup on demand.** The paid title register call from Phase 2, only ever
triggered from a queued letter.

**6. Scoring, properly.** Once outcomes exist, replace hand weights with weights learned
from which signals led to booked appraisals.

**Effort:** three to four sessions, each source independent of the others.

---

## Phase 4 — Inbound hooks

On thelettingexperts.co.uk, both driven by Homesearch calls we already make:

- **Rent check:** enter an address, see the area rent for that size and whether the
  property looks under-rented. Every submission is a prospect with an address.
- **Compliance check:** EPC rating and expiry, HMO licence likely needed, MTD and PRS
  register applicability. The most on-message thing to put in front of a self-manager
  this year.

Both create a prospect in Radar with source `inbound` and a lead in REX.

---

## GDPR, kept small

- **Phase 1 holds no personal data.** Properties, agents and prices only. Nothing to
  assess.
- **Before any owner name is stored:** a one-page legitimate interests assessment on file
  (purpose, necessity, balance), a suppression list honoured everywhere, an opt-out line
  and privacy notice reference on every letter, MPS screening for named mail, retention of
  12 months after last contact. This is standard for postal prospecting and is what
  Spectre's customers rely on.
- **No cold email or SMS to individuals.** PECR. Companies are the exception.
- **No cold calls** without TPS screening; simplest is not to.

---

## Costs

| Item | Cost |
|---|---|
| Homesearch sweep for the patch | already paid; a few dozen calls a day |
| EPC, HMO registers, CCOD/OCOD, Companies House | free |
| Title register lookup | £7 per prospect, only when a letter is queued |
| Letters | about £1 each through a print API, stamps if posted in-house |
| Spectre, for comparison | subscription per postcode sector; trial only as a benchmark |

---

## Decisions for James

1. Which districts are the patch.
2. Who works the list day to day.
3. Print in-house or through an API.
4. Sign-off on the legitimate interests assessment before Phase 2 named letters.
5. Whether Spectre gets a benchmark trial once Phase 1 is running.

---

## Status, 2 Sep 2026

**Phase 1 is built** and verified against a local Postgres with a real sweep of the
patch (James named it: NN and MK, so NN1-NN18 and MK1-MK19, and later the same day
Bedford, MK40-MK46). Anything further is `?add=`.

What exists:

- `lib/listing-capture.ts` sweeps by district as well as sector, keeps UPRN, street,
  reduction date and a property key, and writes every change to `os_listing_events`.
- `lib/radar-signals.ts` is the one place the signals, weights and stages live.
- `lib/radar.ts` sweeps the patch, derives `os_radar_prospects`, and sends the digest.
- `/api/radar/run` (cron, in MACHINE_ROUTES) and `/api/radar/prospects` (the board).
- `/tools/radar` under Tools → Prospecting, with the panel, stages, notes and
  Book appraisal (opens New lead with the address filled in).
- `.github/workflows/landlord-radar.yml` at 06:40 UTC, behind the capture.

First sweep, measured: 37 districts, 5,848 listings, 28 seconds. After tightening two
rules (withdrawn only within 60 days of listing; back-on-market and switched-agent only
on keys that name one property) it flagged 1,583 properties. OpenRent alone accounts for
177 self-managing listings on the market in the patch today.

Two things learned on the way that changed the rules:

- Homesearch keeps withdrawn listings in the feed for months. 3,087 of the 5,848 rows
  were withdrawn, some a year old. Recency has to come from the listing date.
- Six listings in ten have no UPRN, nearly all of them OpenRent. Their key is street,
  postcode and beds, which two flats can share, so any signal that compares one listing
  with an earlier one is only trusted on a UPRN or full-address key.

Switches James owns before it runs for real:

- `RADAR_DIGEST_TO` on Railway (comma-separated colleague addresses) plus Resend unlocked,
  or the run reports "no digest went out" and everything else still happens.
- The workflow needs the same `CRON_SECRET` repository secret the capture uses.

---

## Bond, 2 Sep 2026 (evening)

James: "rather than calling this Landlord Radar, make this a full prospecting app...
we're going to call it Bond." So the tool is now **Bond**, at `/tools/bond`
(`/tools/radar` redirects). It covers the OS full screen, fades its name in, then brings
the workspace up. Five rooms:

- **Today**: the figures (flagged, new today, worked this week, appraisals booked, owners
  found, postcards sent), a quick "where are you prospecting" search that opens the map
  around that address, and the activity feed (`os_bond_activity`: stage changes, notes,
  assignments, appraisals, address pins, and later owner lookups and postcards).
- **Map** and **Prospects**: RadarBoard embedded. Address-and-radius search, signal
  switches, the 150-strongest cap, the property panel.
- **Owners**: the Land Registry room. Shows lookups (`os_bond_owner_lookups`) and, until a
  provider is connected, exactly what is needed. Find the owner on a property refuses and
  says so; nothing is written.
- **Postcards**: same shape (`os_bond_postcards`, Stannp when connected).

**Which front door** (built, live): for a street-only listing (OpenRent gives street and
postcode only) Bond pulls every address in the postcode from Homesearch, asks the register
for each one's bedrooms and type, and keeps the doors that agree with the advert. The
confidence is 100 divided by the number of doors that fit, and every candidate is listed.
Measured on Harefield Road, NN3 8ES (3-bed): 40 doors in the postcode, 16 fit, 6%. A full
address from the feed pins at 95%. Stored on the prospect (`resolved_*`,
`address_confidence`, `address_candidates`). Up to forty register calls per pin, sequential,
on demand only.

**What James still owns** before the Owners and Postcards rooms do anything:
`LAND_REGISTRY_PROVIDER` + `LAND_REGISTRY_API_KEY` (HMLR Business Gateway or a reseller),
`STANNP_API_KEY`, the postcard design, and the legitimate interests note. The lookup call
itself is a stub in `lib/bond.ts` (`requestOwner`) waiting for the provider.

An AI pass over the candidates (photos in the advert against the register's build type,
floor area, EPC) is the next step for the confidence figure; not built.

---

## Company owners and the manual owner, 2 Sep 2026 (late)

**Company owners, built.** `lib/company-owners.ts` streams HM Land Registry's free monthly
files (UK companies, `ccod`; overseas companies, `ocod`) and keeps only titles whose postcode
is in a watched district, into `os_company_titles`. After every Radar refresh
`matchCompanyOwners()` stamps the company onto any flagged property whose postcode and
leading house number agree with a title, and appends the `company_owned` signal (+10). The
panel shows the company, its correspondence address, the title number and a Companies House
link. Needs `HMLR_DATA_API_KEY` from a free account on use-land-property-data.service.gov.uk
with both licences accepted; until then the Owners room says so. `/api/bond/company-sync`
(cron, MACHINE_ROUTES) starts a run and returns; progress is in `os_company_sync`.
`.github/workflows/company-owners.yml` runs it on the 4th of each month. Verified locally
against a zip in the published format: 3 rows read, the out-of-patch row skipped, 2 titles
kept, 2 flagged properties matched, the signal survives a full rescore.

Known limit: a title that leaves the file (sold to an individual) is not removed until a
full reload; and street-only listings match only after the front door is pinned.

**Manual owner, built.** "Record the owner" on the panel: name, correspondence address,
source (LandInsight, Land Registry title, Companies House, HMO register, planning, open
register, other), optional title number and note. Writes a `found` row to
`os_bond_owner_lookups` with provider `manual:<source>`, logs to Today, and shows on the
panel and in the Owners room exactly as a provider's answer would. The postcard button
stays disabled until the print house is connected.

---

## Both markets, 2 Sep 2026 (night)

The sweep now reads the Homesearch **sales** feed for every watched district as well as
lettings (same fields; statuses on market, sstc, under offer, withdrawn). Rows carry a
`market` column; sale keys are prefixed `hss:`. Measured on the first run: 21,803 sale
listings across the 37 NN and MK districts, 90 seconds for both feeds.

Three signals came out of joining the two feeds on the property:

- **Let, now for sale** (35): a let listing followed by a sale listing. 139 on day one.
- **Not selling** (20): the rental that went up for sale and is still there after 120
  days. Only fires on a property that was a rental - on its own an unsold house is not a
  lettings prospect, and there were 2,083 of those over 120 days.
- **Could not sell, now to let** (30): a sale listing followed by a let listing. 149 on day
  one, most of them OpenRent, which is about as good as a lettings lead gets.

Cross-listing matches on street-only keys are only trusted when the second listing follows
the first within a year; on a UPRN or full-address key, within two years. "Back on market"
and "switched agent" now compare lettings listings only.

The board shows an asking price instead of a rent for a property whose current listing is
a sale.

---

## Just bought, 2 Sep 2026 (late night)

`lib/sales.ts` reads HM Land Registry Price Paid Data - free, no account - keeping only the
watched districts into `os_sales`. The monthly update (about 18 MB, published on the 20th
working day) runs from `.github/workflows/price-paid.yml` on the 1st; the yearly files
(`?file=2026`, `?file=2025`) are for the first load. `/api/bond/sales-sync` (cron,
MACHINE_ROUTES) starts a read and returns; progress in `os_sales_sync`. The primary host
refused connections from the laptop but the S3 mirror answered, so both are tried in turn.

**Just bought** (35): a listing to let whose address carries the house number (and flat
number, if any) of a sale completed in the year before it went up, or up to a month after,
because the register lags completion. Measured locally: the monthly file plus the 2026 file
gave 6,925 sales in the patch, 6,666 in the last year, and 15 flagged properties matched on
day one - low because most OpenRent adverts carry no house number, and the register runs
weeks behind. Both improve on their own: pinning the front door gives the number, and each
monthly file back-fills the lag. Example: 34 Sharman Road NN5 5JZ, bought 4 June for
£180,000, to let on OpenRent from 6 June.

---

## The anniversary predictor, 3 Sep 2026

Every property whose newest lettings listing is let agreed, or has left the feed without
being withdrawn, gets a tenancy estimate on the prospect row: `tenancy_start`,
`next_anniversary`, `tenancy_basis`.

- **Observed**: the sweep saw the listing go let agreed (`let_agreed_at`); tenancy start is
  that date plus three weeks. Trusted at any age.
- **Estimated**: the listing was already let when we met it; tenancy start is the advert
  date plus five weeks. Only used for adverts under three years old, because the feed keeps
  let-agreed rows for years and a 2021 advert says nothing about who is in the house now.

The next anniversary is the first one still ahead of today, so long tenancies get a window
every year. **Anniversary due** (25) fires from 75 days before it to 14 days after. Today
shows "Anniversaries in the next 60 days"; the panel shows the tenancy block with the basis
in plain words.

Measured locally on 3 Sep: 716 tenancies estimated, 4 in the window now, and the predicted
anniversaries cluster in Aug and Sep 2027 because most of the let-agreed rows in the feed
today are this summer's lets. It is thin on purpose: it gets better every day the sweep
runs, and the observed basis takes over from the estimate as lets are actually seen.

---

## Look up any address, and Add a property, 3 Sep 2026

A **Look up** room in Bond. Type any address or postcode in the patch; the property
register returns the doors (a full postcode lists them all, narrowed to the typed house
number; anything else goes to the register's free-text search). Pick one and the dossier
is everything Bond holds about it: register facts (beds, type, tenure, council tax band,
EPC and date, UPRN), every listing the sweep has seen to let or for sale, completed sales
from the price-paid file, the company on the title if any, the tenancy estimate, and the
prospect record with its signals if it is already on the list.

**Add to the list** puts a door on the board by hand with a one-line reason - "private
lister seen in the Northampton rentals Facebook group", a board outside, a conversation.
It becomes the **Added by hand** signal (20) with the reason as its detail, kept through
every recompute until someone takes it off. That is the lawful answer to Facebook groups:
a person reads the group and types the address, and no scraping happens.

`lib/property-lookup.ts`, `/api/bond/property`. Verified locally: 78 Cyril Street NN1 5EJ
resolved from free text, dossier read, added with a reason, score 45, still there after a
rescore; a postcode-only search listed the twelve doors; the board opens filtered to the
address from the dossier.
