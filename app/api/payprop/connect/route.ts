import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { requireCapability } from "@/lib/admin";
import { payPropAuthorizeUrl, payPropClient, type PayPropAccountId } from "@/lib/business/payprop";
import { publicOrigin } from "@/lib/origin";
import { payPropGet } from "@/lib/payprop";

/**
 * What we ask PayProp for (28 Sep 2026). Left blank, PayProp grants the
 * client's defaults, which for E&W came to 13 permissions and did not include
 * reading a property's files - so the clean sweep could read Scotland's PRTs
 * and deposit certificates (API key, 40 permissions) but not England's. We ask
 * for whatever the connection already has, plus these. All read only.
 */
const WANTED_SCOPES = ["read:attachment:list", "read:attachment:download"];

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
  const current = req.nextUrl.searchParams.get("files") === "1" ? await payPropGet(account, "meta/me").catch(() => null) : null;
  const had = ((current?.result as { scopes?: string[] } | null)?.scopes ?? []).filter((x) => typeof x === "string");
  /* Only on request (?files=1), and only when we know what is held already:
     asking for two scopes alone would narrow the connection to them. PayProp
     refuses the whole connect ("client lacks scope") when the client is not
     allowed a scope, as the E&W client was on 28 Sep, so the everyday Connect
     asks for PayProp's defaults, as it always did. */
  const wantFiles = req.nextUrl.searchParams.get("files") === "1";
  const scope = wantFiles && had.length ? [...new Set([...had, ...WANTED_SCOPES])].join(" ") : undefined;
  const res = NextResponse.redirect(payPropAuthorizeUrl({ clientId: creds.id, redirectUri, state, scope }));
  res.cookies.set("payprop_oauth", JSON.stringify({ state, account }), {
    httpOnly: true,
    sameSite: "lax",
    secure: true,
    path: "/",
    maxAge: 10 * 60,
  });
  return res;
}
