import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * The door to the public website's feed.
 *
 * The website (thelettingexperts.co.uk, its own Next app) reads the OS's
 * cached book, the agents and this month's lets from here instead of walking
 * REX itself. One shared secret, WEBSITE_API_TOKEN, carried as a bearer
 * header; the website holds the same value as OS_API_TOKEN.
 *
 * Fails SHUT. With no token configured the route answers 503 rather than
 * opening - the precondition for being on the middleware's MACHINE_ROUTES
 * list, which lets these paths past the sign-in redirect. Compared in
 * constant time over digests so neither length nor content leaks by timing.
 */
export function websiteAuth(req: NextRequest): NextResponse | null {
  const want = (process.env.WEBSITE_API_TOKEN ?? "").trim();
  if (!want) {
    return NextResponse.json(
      { ok: false, error: "WEBSITE_API_TOKEN is not set on this server." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  const got = (m?.[1] ?? "").trim();
  const a = createHash("sha256").update(got).digest();
  const b = createHash("sha256").update(want).digest();
  if (!got || !timingSafeEqual(a, b)) {
    return NextResponse.json(
      { ok: false, error: "Unauthorised." },
      { status: 401, headers: { "Cache-Control": "no-store", "WWW-Authenticate": "Bearer" } }
    );
  }
  return null;
}

/** Two minutes fresh at any shared cache, ten more served while it refreshes. */
export const WEBSITE_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=120, stale-while-revalidate=600",
  Vary: "Authorization",
};

export function websiteJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: status === 200 ? WEBSITE_CACHE_HEADERS : { "Cache-Control": "no-store" },
  });
}

/** What a failed read says. Never a stale number dressed as a live one. */
export function websiteError(err: unknown, status = 502) {
  const message = err instanceof Error ? err.message : String(err);
  return websiteJson({ ok: false, error: message }, status);
}
