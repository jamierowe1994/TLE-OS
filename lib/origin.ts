import type { NextRequest } from "next/server";

/**
 * The address this OS is reached at, for links that leave the building.
 *
 * NOT the request's own origin. Behind Railway's proxy `req.nextUrl.origin`
 * is the internal host - a redirect built from it went to localhost:8080,
 * and a link in an email went to the *.up.railway.app domain (both measured
 * 3 Sep 2026). OS_ORIGIN is set on the service and wins; the request origin
 * is only the fallback for a laptop with nothing configured.
 */
export function publicOrigin(req: NextRequest): string {
  const configured = (process.env.OS_ORIGIN ?? process.env.NEXT_PUBLIC_OS_ORIGIN ?? "")
    .trim()
    .replace(/\/+$/, "");
  /* In development the request wins. next.config defaults the public origin
     to localhost:3200 for the brand assets, and with four dev servers on
     this machine a deck minted on :3230 was linking to :3200 - another
     chat's server, with no database - and "not found" (James, 12 Sep 2026).
     Production keeps the configured origin, which is the whole point of it:
     links in emails must not depend on which host the request came in on. */
  if (process.env.NODE_ENV !== "production") return req.nextUrl.origin;
  return configured || req.nextUrl.origin;
}
