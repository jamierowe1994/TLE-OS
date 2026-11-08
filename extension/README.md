# TLE OS for Propoly (Chrome extension)

Phase 1, 8 Nov 2026. On any deal page in Propoly (`tle.propoly.com/deals/<id>`), a card in
the bottom-left corner says whether the deal is in TLE OS, with its stage, tenants, move-in,
agent, whether it was pushed from TLE OS, and an **Open in TLE OS** button.

- It reads the address bar on Propoly and nothing else, and never presses anything there.
- It asks `GET /api/extension/deal?id=<uuid>` on TLE OS with the agent's own sign-in, so
  agents see their own deals and the office sees every deal, the same as the let page.
- The deal comes from TLE OS's saved copy of Propoly, so a deal started in the last few
  minutes shows "Not in TLE OS Yet" until the watcher next reads Propoly.

## Install it for testing (no Web Store)

1. In Chrome, go to `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose this `extension` folder.
4. Sign in to TLE OS in the same Chrome, then open a deal in Propoly.

The toolbar button shows who you're signed in as. "For testing" in that pop-up points the
extension at a local TLE OS (for example `http://127.0.0.1:3873`). Leave it blank for live.

## Later phases

2. Steve in a Chrome side panel beside Propoly, working through the "Now, in Propoly" list.
3. Pointing guides on Propoly's own buttons.
4. The last few Propoly steps attached to a ticket automatically.

A Chrome Web Store listing goes to James for sign-off before anything is published.
