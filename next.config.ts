import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway deploys via standalone output for a smaller image
  output: "standalone",
  // A build and a dev server share .next by default, so verifying a change
  // with `next build` while `next dev` is up deletes the chunks the running
  // preview is serving — the page keeps rendering but silently stops
  // hydrating, which looks exactly like a broken feature. NEXT_DIST_DIR gives
  // the check its own directory. Railway sets nothing and builds to .next.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Pin the workspace root — a stray lockfile in the user home directory
  // otherwise makes Next trace files from the wrong root.
  outputFileTracingRoot: __dirname,
  // The build stamp, worn in the profile footer. Ends the "is this screen
  // even running the new code?" conversation for good: a stale tab says an
  // old name, and that's the whole diagnosis. Railway provides the sha.
  env: {
    NEXT_PUBLIC_BUILD: (process.env.RAILWAY_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev",
    // Where our own assets can be fetched FROM, absolutely — an email is
    // opened somewhere else entirely, so the logo in it needs a full URL.
    // Resolved at build time so the server and the browser always agree:
    // computing it from window.location would differ between the two and
    // React would keep the server's answer, which is a logo that never
    // appears. Railway provides the domain; locally it's the dev server.
    NEXT_PUBLIC_OS_ORIGIN:
      process.env.OS_ORIGIN ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "http://localhost:3200"),
  },
};

export default nextConfig;
