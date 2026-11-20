import { NextRequest, NextResponse } from "next/server";
import { createSessionToken, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";
import { demoMode } from "@/lib/demo/mode";
import { demoWorld } from "@/lib/demo/world";
import { hasDb, q } from "@/lib/db";

/**
 * Walk straight into the demo copy, no sign-in (James, 20 Nov 2026: "we don't
 * need a login screen for this"). Reviewers are sent a link and land on the
 * screen, signed in as one of the demo's invented people.
 *
 *   /api/demo/enter                     the Scottish agent, on their homes
 *   /api/demo/enter?as=office           the office (sees Michael's desk too)
 *   &to=/compliance-desk/rent-reviews   any page on the demo to land on
 *
 * ONLY ON THE DEMO COPY. Without DEMO_MODE=1 this is a 404, so it cannot sign
 * anybody in on the live system. The demo copy holds no real people or homes,
 * refuses to start with a live key (lib/demo/net-guard), and sends nothing.
 * It signs in only the seeded demo users (ids demo-<world id>), never a real
 * person's DEMO_EXTRA_LOGINS account and never an owner.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A path on this site only: an open redirect would be a phishing door. */
function safePath(to: string | null, fallback: string): string {
  if (!to || !to.startsWith("/") || to.startsWith("//") || to.startsWith("/\\") || to.startsWith("/api/")) return fallback;
  return to.slice(0, 500);
}

export async function GET(req: NextRequest) {
  if (!demoMode() || !hasDb()) return new NextResponse(null, { status: 404 });
  const as = req.nextUrl.searchParams.get("as") === "office" ? "office" : "agent";
  const users = demoWorld().users;
  const who = as === "office"
    ? users.find((u) => u.role === "office")
    : users.find((u) => u.role === "agent" && u.scotland) ?? users.find((u) => u.role === "agent");
  if (!who) return new NextResponse("The demo hasn't finished setting up. Try again in a minute.", { status: 503 });
  const id = `demo-${who.id}`;
  const row = await q<{ id: string }>(`SELECT id FROM os_users WHERE id = $1 AND locked_at IS NULL`, [id]).catch(() => []);
  if (!row.length) return new NextResponse("The demo hasn't finished setting up. Try again in a minute.", { status: 503 });

  const to = safePath(req.nextUrl.searchParams.get("to"), as === "office" ? "/compliance-desk/rent-reviews" : "/portfolio");
  /* A relative Location, never new URL(to, req.url): behind Railway req.url is
     the container's own localhost:8080, so an absolute redirect would leave
     the demo's address and the session cookie with it. */
  const res = new NextResponse(null, { status: 307, headers: { Location: to, "Cache-Control": "no-store" } });
  res.cookies.set(SESSION_COOKIE, createSessionToken(id), sessionCookieOptions(false));
  return res;
}
