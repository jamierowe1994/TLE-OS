import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { payPropClient, type PayPropAccountId } from "@/lib/business/payprop";
import { savePayPropTokens } from "@/lib/business/payprop-tokens";
import { publicOrigin } from "@/lib/origin";

/**
 * GET /api/payprop/callback?code=…&state=… → PayProp sends the owner back.
 *
 * The code is exchanged for a refresh token and stored in the shared
 * payprop_tokens row. From then on every PayProp read on this service, and
 * on the portal while it lasts, refreshes from that row. Back to Wiring with
 * a word either way.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return NextResponse.json({ ok: false, error: "Owner only." }, { status: 403 });

  const origin = publicOrigin(req).replace(/\/+$/, "");
  const done = (msg: string, ok = false) =>
    NextResponse.redirect(`${origin}/admin/connections?payprop=${ok ? "connected" : "failed"}&detail=${encodeURIComponent(msg)}`);

  const params = req.nextUrl.searchParams;
  const error = params.get("error");
  if (error) return done(params.get("error_description") ?? error);
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return done("PayProp didn't return a code.");

  let pending: { state?: string; account?: PayPropAccountId } = {};
  try {
    pending = JSON.parse(req.cookies.get("payprop_oauth")?.value ?? "{}");
  } catch {
    /* a mismatch, below */
  }
  if (!pending.state || pending.state !== state) return done("That connection link has expired. Start again from Wiring.");
  const account = pending.account ?? "uk";
  const creds = payPropClient(account);
  if (!creds) return done("PayProp client credentials aren't set on this service.");

  const res = await fetch(process.env.PAYPROP_TOKEN_URL ?? "https://uk.payprop.com/api/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: creds.id,
      client_secret: creds.secret,
      redirect_uri: `${origin}/api/payprop/callback`,
    }),
    cache: "no-store",
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { refresh_token?: string; scopes?: string; error_description?: string } | null;
  if (!res?.ok || !data?.refresh_token) return done(data?.error_description ?? "PayProp wouldn't issue a token.");

  await savePayPropTokens(account, {
    refreshToken: data.refresh_token,
    connectedBy: me.email,
    connectedAt: new Date().toISOString(),
    scopes: data.scopes ?? null,
  });
  const out = done(`${account === "uk" ? "England & Wales" : "Scotland"} connected by ${me.name || me.email}.`, true);
  out.cookies.delete("payprop_oauth");
  return out;
}
