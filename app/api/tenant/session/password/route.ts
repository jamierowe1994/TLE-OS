import { NextRequest, NextResponse } from "next/server";
import { hasDb } from "@/lib/db";
import { tenantByPassword } from "@/lib/tenant-account";
import { createPortalToken, TENANT_COOKIE, portalCookieOptions } from "@/lib/auth";

/** Email and password, for tenants who made their account at the end of a
 *  passport. One answer for every failure, so nothing leaks about which
 *  emails we hold. */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Guessing, slowed down (18 Sep 2026): this route became reachable from the
   internet the day the tenant session routes were let past the staff door,
   and a password form with no limit is an invitation. Ten tries per ten
   minutes from one connection, and ten per email address from anywhere -
   the second stops a guesser who rotates addresses. Per process, like the
   magic-link route's; a restart forgets, which is fine for a speed bump. */
const MAX = 10;
const WINDOW_MS = 10 * 60 * 1000;
const hits = new Map<string, number[]>();
function allowed(key: string): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5_000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return list.length <= MAX;
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  let body: { email?: string; password?: string } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    /* falls through */
  }
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!allowed(`ip:${ip}`) || !allowed(`email:${email}`)) {
    return NextResponse.json({ ok: false, error: "Too many tries. Wait ten minutes, or use Email me a link instead." }, { status: 429 });
  }
  const account = await tenantByPassword(String(body.email ?? ""), String(body.password ?? "")).catch(() => null);
  if (!account) return NextResponse.json({ ok: false, error: "That email and password don't match." }, { status: 401 });
  const res = NextResponse.json({ ok: true, name: account.name });
  res.cookies.set(TENANT_COOKIE, createPortalToken("tenant", account.id), portalCookieOptions());
  return res;
}
