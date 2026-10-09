import { NextRequest, NextResponse } from "next/server";
import { GET as lookup } from "@/app/api/address/route";
import { getPassport } from "@/lib/passport";

/**
 * Address lookup for the tenant passport.
 *
 * The same handler as /api/address, reached on a path the session gate lets
 * through: a tenant filling in their passport has a token and no session,
 * and the middleware exempts everything under api/tenant/passport. The key
 * stays on the server either way; see app/api/address/route.ts for the two
 * providers and the history of the key trap.
 *
 * THE TOKEN IS THE TICKET (18 Sep 2026). This was a bare re-export, so anybody
 * on the internet could run address and geocode lookups on our paid keys with
 * no cookie, no token and no limit. It now wants a real passport token, does
 * not geocode (the form never asks it to), and counts calls per token.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const WINDOW_MS = 10 * 60 * 1000;
const MAX = 120;
const calls = new Map<string, number[]>();

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const token = (sp.get("token") ?? "").trim();
  if (!token || sp.has("geocode")) return NextResponse.json({ ok: false, error: "Not available." }, { status: 401 });
  const passport = await getPassport(token).catch(() => null);
  if (!passport) return NextResponse.json({ ok: false, error: "Not available." }, { status: 401 });

  const now = Date.now();
  const recent = (calls.get(token) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  calls.set(token, recent);
  if (calls.size > 5_000) for (const [k, v] of calls) if (!v.some((t) => now - t < WINDOW_MS)) calls.delete(k);
  if (recent.length > MAX) return NextResponse.json({ ok: false, error: "Too many lookups. Try again in a few minutes." }, { status: 429 });

  /* "Use my location" on the phone passport (James, 9 Oct 2026): where they
     are now, as the nearest postcode, which the field then looks up like a
     typed one so they pick their own door from the list. postcodes.io is the
     free ONS lookup - no key, and only a pair of numbers leaves us, asked by
     our server rather than the tenant's browser. */
  const near = sp.get("near");
  if (near) {
    const [lat, lng] = near.split(",").map(Number);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return NextResponse.json({ ok: false, error: "That location could not be read." }, { status: 400 });
    }
    try {
      const r = await fetch(`https://api.postcodes.io/postcodes?lon=${lng}&lat=${lat}&limit=1&radius=200`, { cache: "no-store", signal: AbortSignal.timeout(4_000) });
      const j = (await r.json().catch(() => null)) as { result?: { postcode?: string }[] | null } | null;
      const postcode = j?.result?.[0]?.postcode ?? null;
      if (!postcode) return NextResponse.json({ ok: false, error: "We couldn't find a postcode where you are. Type yours instead." });
      return NextResponse.json({ ok: true, postcode });
    } catch {
      return NextResponse.json({ ok: false, error: "We couldn't find where you are. Type your postcode instead." });
    }
  }

  return lookup(req);
}
