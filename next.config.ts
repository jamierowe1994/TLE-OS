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
};

export default nextConfig;
