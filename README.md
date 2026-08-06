# TLE OS

The operations overlay for The Lettings Experts. Phase 1 is a wireframe of the
whole system in the TLE OS style — a private preview for Susan and Howard,
kept entirely separate from the TLE portal until the portal has shipped.

## The architecture in one paragraph

Nothing talks to each other today, so the OS becomes the front door and the
source of action: create a customer, a listing, a property **here**, and the
OS pushes it into REX. REX stays the system of record and does what it's good
at (storage, portal syndication). When Rightmove sends leads back into REX,
the OS pulls them forward into one inbox. Every dashed box in the wireframe
carries a tag naming the system it reads from or writes to.

## Running it

```
npm install
npm run dev        # http://localhost:3200
```

With no `OS_ACCESS_CODE` set, the gate stands open (local dev).

## Deploying on Railway (separate project, separate URL)

1. Push this repo to GitHub as its own repository (e.g. `TLE-OS`).
2. In Railway: **New Project → Deploy from GitHub repo** → pick `TLE-OS`.
   A separate project, not a service inside the portal's project — nothing
   shared, no way to cross the streams.
3. In the service → **Variables**, add `OS_ACCESS_CODE` = the code you'll text
   to Susan and Howard. Pick something typeable; it's a shared key, not a
   password system.
4. **Settings → Networking → Generate Domain** for a `*.up.railway.app` URL.
5. Send Susan and Howard the URL and the code. Done — agents never see it.

The build needs no other configuration: standalone output is already set in
`next.config.ts`, and Railway detects Next.js on its own.

## Phase plan

- **Phase 1 (this)** — wireframe every area in the OS style; agree the shape.
- **Phase 2** — read paths: REX leads/listings/compliance in, PayProp money in
  (the reconciliation engine already exists in the TLE portal).
- **Phase 3** — write paths: create listings/customers here, push to REX.
- **Phase 4** — fold into the TLE portal as new tabs; retire this URL.
