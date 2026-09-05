import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { payPropAuthorizeUrl, payPropClient, type PayPropAccountId } from "@/lib/business/payprop";
import { publicOrigin } from "@/lib/origin";

/**
 * GET /api/payprop/connect?account=uk → off to PayProp to authorise.
 *
 * The OS owns the PayProp connection now (5 Sep). The portal used to hold
 * it and lend the OS short-lived tokens; the portal is going, and its client
 * settings were found blank. So the two doorways move here: this one sends
 * an owner to PayProp with a one-time state, and /api/payprop/callback
 * exchanges the code PayProp sends back for the refresh token, stored in the
 * shared payprop_tokens row both products read.
 *
 * Owner-gated (manage:switches), the same gate as arming a send: connecting
 * a money system is not an admin's everyday click.
 *
 * PayProp matches the redirect URI byte for byte against the one registered
 * on the client, so this must be https://tle-os.co.uk/api/payprop/callback
 * on their side before it will work.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return NextResponse.json({ ok: false, error: "Owner only." }, { status: 403 });

  const raw = (req.nextUrl.searchParams.get("account") ?? "uk").trim().toLowerCase();
  const account = (raw === "scotland" ? "scotland" : "uk") as PayPropAccountId;
  const creds = payPropClient(account);
  if (!creds) {
    return NextResponse.json(
      {
        ok: false,
        error: `No PayProp client credentials for ${account} on this service. Set PAYPROP_CLIENT_ID and PAYPROP_CLIENT_SECRET (or the _${account.toUpperCase()} pair) on TLE-OS, then try again.`,
      },
      { status: 503 }
    );
  }
  const origin = publicOrigin(req).replace(/\/+$/, "");
  if (!origin.startsWith("https://")) {
    return NextResponse.json(
      { ok: false, error: "PayProp only accepts https redirect URIs, so connect from tle-os.co.uk rather than localhost." },
      { status: 400 }
    );
  }
  const state = crypto.randomBytes(16).toString("hex");
  const redirectUri = `${origin}/api/payprop/callback`;
  const res = NextResponse.redirect(payPropAuthorizeUrl({ clientId: creds.id, redirectUri, state }));
  res.cookies.set("payprop_oauth", JSON.stringify({ state, account }), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
