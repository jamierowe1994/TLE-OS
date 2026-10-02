import type { MetadataRoute } from "next";

/**
 * The web app manifest, so the OS can be installed as its own window.
 *
 * Kirstie asked (4 Sep) for something on her desktop that shows the feed
 * live, so she stops opening files to see what changed. James's first
 * thought was a downloadable app, with the "this is unsecure" warning an
 * unsigned download brings or the developer fee that removes it. This is the
 * same thing without either: Chrome and Edge install a manifest page as an
 * app in its own window with its own dock icon; Safari adds it to the Dock.
 * The feed page then asks for notification permission once and pings her
 * whenever the watcher records a move.
 *
 * start_url opened on the feed until 5 Sep. James's call that day: her first
 * screen is a dashboard of her own, with the feed, the packs, the stages
 * and the move-ins on it - so the installed window opens there, and the
 * feed is one card away or a pop-out.
 *
 * A plain route since 2 Oct 2026, at the same address. As app/manifest.ts it
 * was stamped onto every page with no way for a section to name its own, and
 * the agents' phone screens (app/m) need theirs, so saving them to a home
 * screen opens the phone and not this dashboard.
 */
const MANIFEST: MetadataRoute.Manifest = {
  name: "TLE OS - Pre-tenancy",
  short_name: "TLE OS",
  description: "What moved, the packs with compliance, and who is moving in.",
  start_url: "/pre-tenancy/dashboard?app=1",
  scope: "/",
  display: "standalone",
  background_color: "#fbfaf7",
  theme_color: "#fbfaf7",
  icons: [
    { src: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png" },
  ],
};

export function GET() {
  return Response.json(MANIFEST, { headers: { "content-type": "application/manifest+json" } });
}
