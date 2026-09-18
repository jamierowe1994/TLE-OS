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

  return lookup(req);
}
