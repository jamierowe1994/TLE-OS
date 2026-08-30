import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { msExchangeCode, msGetMe, msStore, MS_STATE_COOKIE } from "@/lib/microsoft";

/**
 * "Connect your email" — step two. Microsoft sends them back here.
 *
 * Three things are checked before a single token is stored, and none of them
 * is optional:
 *
 *   1. They are signed in. A callback is a GET anybody can replay.
 *   2. The state matches the cookie, constant-time.
 *   3. The state's user is the user in the session — so a nonce minted for one
 *      person cannot be spent by another.
 *
 * The mailbox they connect is recorded as whatever Microsoft says it is, NOT
 * as their OS email. Several people here have more than one Microsoft login,
 * and the address the email actually arrives from is the one worth showing on
 * the pre-launch board.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function back(req: NextRequest, params: Record<string, string>) {
  const url = new URL("/admin/pre-launch", req.nextUrl.origin);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = NextResponse.redirect(url);
  res.cookies.delete(MS_STATE_COOKIE);
  return res;
}

export async function GET(req: NextRequest) {
  const userId = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!userId) return back(req, { mail: "signin" });

  const err = req.nextUrl.searchParams.get("error_description") ?? req.nextUrl.searchParams.get("error");
  if (err) return back(req, { mail: "denied", detail: err.slice(0, 200) });

  const code = req.nextUrl.searchParams.get("code") ?? "";
  const state = req.nextUrl.searchParams.get("state") ?? "";
  const expected = req.cookies.get(MS_STATE_COOKIE)?.value ?? "";
  if (!code || !state || !expected) return back(req, { mail: "state" });

  const a = Buffer.from(state);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return back(req, { mail: "state" });
  /* The nonce carries who asked for it. Same browser, different person, is
     still the wrong person. */
  if (state.split(".")[0] !== userId) return back(req, { mail: "state" });

  try {
    const tokens = await msExchangeCode(code);
    if (!tokens.refresh_token) {
      /* No refresh token means offline_access was not granted, and the
         connection would die within the hour with no way to renew it. Better
         to refuse now than to look connected until it silently isn't. */
      return back(req, { mail: "norefresh" });
    }
    const me = await msGetMe(tokens.access_token as string);
    await msStore(userId, me.email, tokens.refresh_token);
    return back(req, { mail: "connected", as: me.email });
  } catch (e) {
    return back(req, { mail: "failed", detail: (e instanceof Error ? e.message : "").slice(0, 200) });
  }
}
