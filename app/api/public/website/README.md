# The public website's feed

Three read-only GET routes for thelettingexperts.co.uk (the Next app at
`~/tle website`), so the website reads the OS's cached book instead of walking
REX itself. Each checks `Authorization: Bearer <WEBSITE_API_TOKEN>` in constant
time: 401 without a matching token, 503 with none configured. The website holds
the same value as `OS_API_TOKEN` and the OS origin as `OS_API_URL`
(`http://localhost:3200` in dev, the Railway URL in production).

Every 200 carries `Cache-Control: public, s-maxage=120, stale-while-revalidate=600`.
A failed read with nothing held is a 502 `{ ok: false, error }`, never a stale
number dressed as live. The middleware lets these three exact paths past the
sign-in redirect (MACHINE_ROUTES); the token is the guard.

## GET /api/public/website/listings

The published residential rental book from `lib/listings-cache.ts` (everyone's
book, `bookFor(null)`), published only, never drafts. Shaped field for field as
the website's `lib/listing-shape.ts` Listing.

```
{
  ok: true,
  listings: [{
    id, slug, propertyId, name, town, postcode, district, locality,
    lat, lng, rent, rentPeriod ("month" | "week" | null),
    rentMonthly (sorting and banding only, never display),
    deposit, letAgreed, availableFrom, epcRating, councilTaxIncluded,
    minimumTermMonths, propertyType, serviceType, publishedAt, daysOnMarket,
    image, images[], imageCount, heading, body, highlights[],
    agent: { id, name, email, phone, position, photo } | null
  }],
  counts: { published, available, letAgreed, withPhoto, weekly },
  pulledAt,            // when the book was last read from REX
  stale, ageMs,        // past the book's fresh window; age of what was served
  extras: "fresh" | "stale" | "missing"
}
```

`extras` is the agent / town / deposit / highlights index
(`_lib/listing-extras.ts`): the OS book does not carry those, so this is one
light REX walk of the published rentals, held on the book's clock. "missing"
means REX refused and nothing was held; the listings still answer, with
`agent: null` on each.

## GET /api/public/website/agents

TLE's active agents on the TLE domain (`lib/rex-agents.ts lettingsAgents`)
plus anyone named listing agent on a published rental. Biography and the
uploaded headshot come from the OS profile (`os_user_prefs` key
`tle-profile-v1`, via `lib/agent-profile.ts`), found through the OS account
linked to the REX user (`os_users.rex_user_id`, else the same email). REX's
`profile_bio` is null for every user, so the OS is the only source of bios.

```
{
  ok: true,
  agents: [{
    id (REX user id), slug, name, firstName, email, position, phone,
    photo,          // OS upload (data URL) where set, else REX 700x875 portrait, else null
    bio,            // OS profile, or null
    listingCount,   // published rentals naming them as listing agent
    source: { bio: "os" | null, photo: "os" | "rex" | null }
  }],
  pulledAt,
  extras: "fresh" | "stale" | "missing"
}
```

Sorted by listingCount, then name. Two people with one name: the second
carries the id on the slug. Bios and OS photos need DATABASE_URL, so locally
(no database) they are null and on Railway they are read.

## GET /api/public/website/figures

This month's lets from REX's `leased` residential rentals with
`state_date >= first of the current month`, no month literal, rolls over on
its own. Held fifteen minutes fresh, six hours at most, keyed by month.

```
{
  ok: true,
  month: "October", monthStart: "2026-10-01",
  letThisMonth,
  avgDaysToLet,     // null with fewer than four lets carrying both timestamps
  daysToLetSample,  // how many lets the average is over
  computedAt, stale, ageMs
}
```

## Trying it

```
curl -H "Authorization: Bearer $WEBSITE_API_TOKEN" http://localhost:3200/api/public/website/figures
```
