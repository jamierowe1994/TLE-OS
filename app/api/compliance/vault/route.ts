import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { r2Configured } from "@/lib/r2";
import { listVault } from "@/lib/vault";

/**
 * GET /api/compliance/vault?property=<REX property id>
 *
 * Every certificate the OS holds for one property, across all its types, in
 * one read - for the Documents tab on the listing (James, 5 Sep: "they need
 * to be saved into the documentation as well"). The Compliance drawer reads
 * the same folders one certificate at a time through /api/r2/list; this is
 * the whole shelf for the property.
 *
 * Anyone signed in: a certificate is not a secret from the agent whose
 * property it is. Scoped to ONE property's folders by prefix, never wider.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  /* A REX property id, or "pending-<address>" for files waiting on one. */
  if (!/^(\d+|pending-[a-z0-9-]+)$/.test(property)) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });
  if (!r2Configured) return NextResponse.json({ ok: true, configured: false, files: [] });

  try {
    const files = await listVault(property);
    return NextResponse.json({ ok: true, configured: true, files });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the vault." }, { status: 502 });
  }
}
