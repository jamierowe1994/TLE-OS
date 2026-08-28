# TEG Team Hub → TLE OS

The Hub is the group's register of people. TLE OS reads it for three things:
**partner package**, **bio**, and **headshot**. It never writes back.

Base44 app `TEG Team Hub`, id `6a5a0c9323fcfe1cea328b81`.
TLE Brand record: `6a5a0cdedd301a4a660bf0d0`, named "The Letting Experts" (singular).

## What James needs to set

Two variables, on Railway and in `.env.local`:

| Variable | Value |
|---|---|
| `TEG_HUB_API_BASE` | Optional. The **full endpoint**, including the path — defaults to `https://teg-team-hub.base44.app/functions/dbApi`. Only set it if the app moves. |
| `TEG_HUB_API_SECRET` | A secret configured on the Base44 side. `TEG_HUB_SECRET` also works — the client accepts either. |

**These may already be set.** `lib/business/teg-hub.ts` predates this work and
uses the same two variables for the live Agent Headcount, so check Railway
before adding anything.

The Hub's `dbApi` accepts three named secrets. Measured 28 Aug 2026 by sending a
deliberately wrong one — its 401 body names which are configured:

- `DB_API_SECRET` — **set**
- `TEAMHUB_DB_API_SECRET` — **set**
- `ASCENDIA_DB_API_SECRET` — **not set**

Cleanest is a fourth named key for TLE OS, so it can be rotated without
breaking F&C Pipeline or Ascendia. That needs one line added to `SECRET_KEYS`
in the Hub's `base44/functions/dbApi/entry.ts` plus a dashboard value — **a
change to a shared app that three other products depend on, so it is James's
call to authorise, not something to do quietly.**

Until both are set, bios and packages render blank. That is deliberate: an
unconfigured Hub looks exactly like a person nobody has filled in yet, and the
OS already draws that state correctly. Nothing errors.

## The ping

```
POST https://<tle-os>/api/teg/sync
  -H "x-cron-secret: $CRON_SECRET"
```

Pulls every TLE person and upserts them. Safe to call as often as you like —
it is one HTTP call for ~49 people.

The response is a progress report, not just an OK:

```json
{
  "ok": true, "pulled": 49, "written": 49,
  "withBio": 8, "withPhoto": 0, "withPackage": 31,
  "missingBio": ["Lorna Fieldson", "Tiffany Harrison", ...],
  "missingPhoto": [...],
  "missingPackage": [...]
}
```

Those lists are the point. They are the worklist for filling the Hub in, and
they shrink as James works through it.

`GET /api/teg/sync` returns the same counts for what's currently held, plus
`lastSync` and whether the Hub is reachable — no network call to the Hub.

## Two traps, both already handled in code

**Never filter TLE people by email domain.** Several TLE partners aren't on the
TLE domain — Zilvinas, Rovena and Bernadine sit on `@thepropertyexperts.co.uk`,
Cherise on `@theexpertsgroup.co.uk`. Brand membership is `primary_brand_id` or
`sub_brands`, never the address. Six people carry TLE as a *sub*-brand while
their primary is TPE or Prestige; they are TLE partners and the query includes
them.

**Never compare emails raw.** The Hub's uniqueness is case-INSENSITIVE and its
stored data genuinely mixes case — `Amrit.Bhogal@TheLettingExperts.co.uk` sits
beside `sean.mcmahon@thelettingexperts.co.uk`. Everything is lower-cased on
both sides.

## Two contract details that will bite

**Always POST.** On GET the function builds a flat string map from the query
string and never JSON-parses `query`. A `search` sent over GET hands the raw
string to the filter, matches nothing, and returns a perfectly successful empty
list. The Hub's own docs say GET works "if you pass query as a JSON string";
the code has no parse step. There is no GET path in our client on purpose.

**`sub_brands` needs `$in`, not equality.** It is an array of Brand relations.
`{ sub_brands: "<id>" }` matches nothing and would silently drop the six people
whose primary brand is TPE or Prestige but who trade as TLE.

Also: the endpoint's default `limit` is **50**. Passing `limit: 500` is not
optional or the roster truncates to a third of its size.

## The join

`rex_id` where it exists, `email` otherwise. rex_id is numeric and case-proof
and is already how TLE OS thinks about agents, but only the ~20 records that
came in via the Rex sync carry one — the rest arrived through M365 discovery or
by hand.

## State of the data (measured 28 Aug 2026)

- **49 TLE people** — 43 by primary brand, 6 more by sub-brand
- **Partner package: 31 of 36 partners.** Basic 16 · Pro 14 · Academy 1.
  The 7 Support Team correctly have none.
- **Bio: 8 of 43.** And a caveat that matters — several of the eight are sales
  copy naming the *wrong brand*. Shane Yu's mentions The Property Experts;
  Zilvinas's is about property sales and rent-to-rent. They are wired through
  but should be reviewed before they face a landlord or tenant.
- **Headshot: 0 of 43.** `photo_url` is empty for every TLE person. Keep
  sourcing headshots from REX's public CDN until this fills in; the OS prefers
  the Hub's when present and falls back.

## Read-only, and enforced

`lib/business/teg-hub.ts` only ever issues `list` and `search`. The Hub's
`dbApi` also exposes `create`, `update`, `updateMany`, `delete` and
`deleteMany`, and **the secret bypasses row-level security entirely** (the
handler uses `asServiceRole`) — a mistake would rewrite the staff register for
every brand in the group, not just TLE, including bank details and HMRC UTRs.
There is no write path in that file. Keep it that way.

`/api/teg/me` takes no id parameter for the same reason: an endpoint that
accepts an email is one missing check away from being a staff-directory dump.
It returns four public-facing fields and nothing else.

## Files

| File | Does |
|---|---|
| `lib/business/teg-hub.ts` | The connection and the secret. Predates this work; `fetchTleRoster()` was added to it rather than starting a second client. `server-only`. |
| `lib/teg-people.ts` | The local store — readers and the upsert. No network, safe to import anywhere. |
| `app/api/teg/sync/route.ts` | The ping target. |
| `app/api/teg/me/route.ts` | The signed-in person's own record. No id parameter, on purpose. |
| `os_teg_people` (in `lib/db.ts`) | The table. Keyed on lower-cased email; `payload` keeps the whole record so a new field needs no migration. |
