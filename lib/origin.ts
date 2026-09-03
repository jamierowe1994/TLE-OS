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
  return configured || req.nextUrl.origin;
}
