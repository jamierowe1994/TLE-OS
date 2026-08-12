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
    // appears.
    //
    // localhost ONLY outside production. Railway's domain variables aren't
    // reliably present during the build, and a production build that quietly
    // fell back to localhost would put http://localhost:3200/brand/… in a
    // landlord's inbox — a broken image on every email, visible to them and
    // to nobody here. Empty is the safe miss: the renderer falls back to the
    // wordmark. Set OS_ORIGIN on Railway to get the logo.
    NEXT_PUBLIC_OS_ORIGIN:
      process.env.OS_ORIGIN ||
      (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "") ||
      (process.env.NODE_ENV === "production" ? "" : "http://localhost:3200"),
  },
};

export default nextConfig;
