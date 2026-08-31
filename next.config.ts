import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `output: "standalone"` USED to be here, and was removed on 31 Aug because
   * nothing was using it.
   *
   * Standalone packs a minimal server into `.next/standalone`, and running it
   * is a different start command. Railway starts this service with the
   * package.json `start` script, which is `next start` - so the standalone
   * bundle was built on every deploy, never run, and Next printed a warning on
   * every boot saying exactly that.
   *
   * Two ways to end the disagreement: run the standalone server, or stop
   * asking for it. James picked the second, and it is the right trade here -
   * the win was a smaller image and a slightly faster boot, and the cost of
   * getting it wrong is that `next build` does NOT copy `.next/static` or
   * `public/` into the bundle, so a switch that missed that step serves every
   * page with no CSS and no images at all.
   *
   * If it is ever worth revisiting: add a build step copying those two
   * directories in, change `start` to `node .next/standalone/server.js`, and
   * prove the stylesheets load before it goes anywhere near the live site.
   */
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
  /**
   * The three personal workspaces moved out of /admin on 30 Aug.
   *
   * Temporary rather than permanent (308): a permanent redirect is cached by
   * the browser forever, and if one of these ever needs to come back — or is
   * mistyped here — nobody can undo it on their own machine without knowing to
   * clear it. There is no SEO to protect on a signed-in internal OS, so the
   * only thing permanence buys is a trap.
   */
  async redirects() {
    return [
      { source: "/admin/business", destination: "/company-figures", permanent: false },
      { source: "/admin/business/:path*", destination: "/company-figures/:path*", permanent: false },
      { source: "/admin/pre-tenancy", destination: "/pre-tenancy", permanent: false },
      { source: "/admin/pre-tenancy/:path*", destination: "/pre-tenancy/:path*", permanent: false },
      { source: "/admin/marketing", destination: "/marketing-hub", permanent: false },
      { source: "/admin/marketing/:path*", destination: "/marketing-hub/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
