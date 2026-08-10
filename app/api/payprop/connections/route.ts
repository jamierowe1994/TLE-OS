import { NextResponse } from "next/server";
import { hasDb, q } from "@/lib/db";
import { diagnosticsBlocked } from "@/lib/diagnostics";
import { payPropKeyFor } from "@/lib/payprop";

/**
 * WHICH PayProp accounts are actually connected, and how.
 *
 * The question this answers: is the portal's OAuth connection one agency or
 * both? The portal models Scotland and "uk" as separate accounts, but the
 * consent flow is a single client (TheLettingExpress) against a single
 * redirect — so whether that yields one book or two is a fact to read, not
 * assume, before anything is built on top of it.
 *
 * Reads the PORTAL's payprop_tokens table (allowed — the OS may read what
 * it may not write) and reports metadata ONLY. The refresh token itself is
 * never returned, only whether one exists and how long it is.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const blocked = diagnosticsBlocked();
  if (blocked) return blocked;
  if (!hasDb()) return NextResponse.json({ ok: true, rows: [], note: "No database here." });

  try {
    const rows = await q<{
      account: string;
      connected_by: string;
      connected_at: Date;
      scopes: string | null;
      refresh_token: string;
    }>("SELECT account, connected_by, connected_at, scopes, refresh_token FROM payprop_tokens");

    return NextResponse.json({
      ok: true,
      oauthConnections: rows.map((r) => ({
        account: r.account,
        connectedBy: r.connected_by,
        connectedAt: new Date(r.connected_at).toISOString(),
        scopes: r.scopes,
        // Presence and shape only — never the credential.
        hasRefreshToken: Boolean(r.refresh_token),
        tokenLength: r.refresh_token?.length ?? 0,
      })),
      apiKeys: {
        scotland: Boolean(payPropKeyFor("scotland")),
        uk: Boolean(payPropKeyFor("uk")),
      },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Could not read the token store." },
      { status: 502 }
    );
  }
}
