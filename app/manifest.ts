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
 * start_url opens on the feed, not the dashboard, because the feed is the
 * whole reason to install it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "TLE OS - What moved",
    short_name: "TLE OS",
    description: "Every deal Propoly moved, as it happens.",
    start_url: "/pre-tenancy/feed?app=1",
    scope: "/",
    display: "standalone",
    background_color: "#fbfaf7",
    theme_color: "#fbfaf7",
    icons: [
      { src: "/icons/app/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/app/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
