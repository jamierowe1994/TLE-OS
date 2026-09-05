import { NextRequest, NextResponse } from "next/server";
import { ListObjectsV2Command } from "@aws-sdk/client-s3";
import { whoIs } from "@/lib/admin";
import { R2_BUCKET, r2Configured, safeName, withR2 } from "@/lib/r2";

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

const LABEL: Record<string, string> = {
  gas: "Gas safety (CP12)",
  eicr: "EICR",
  epc: "EPC",
  licence: "HMO licence",
  legionella: "Legionella risk assessment",
  pat: "PAT",
  alarms: "Smoke and CO alarms",
  fire: "Fire safety",
};

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const property = (req.nextUrl.searchParams.get("property") ?? "").trim();
  if (!/^\d+$/.test(property)) return NextResponse.json({ ok: false, error: "Which property?" }, { status: 400 });
  if (!r2Configured) return NextResponse.json({ ok: true, configured: false, files: [] });

  const prefix = `documents/${safeName(`compliance-${property}-`)}`;
  try {
    const out = await withR2((client) => client.send(new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: prefix, MaxKeys: 200 })));
    const files = (out.Contents ?? [])
      .filter((o) => o.Key && !o.Key.endsWith("/"))
      .map((o) => {
        const key = o.Key as string;
        const rest = key.slice(prefix.length); // "<certKey>/<timestamp>-<name>"
        const slash = rest.indexOf("/");
        const certKey = slash > 0 ? rest.slice(0, slash) : "";
        const name = rest.slice(slash + 1).replace(/^\d+-/, "");
        return {
          key,
          certKey,
          label: LABEL[certKey] ?? certKey,
          name,
          size: o.Size ?? 0,
          uploadedAt: o.LastModified ? new Date(o.LastModified).toISOString() : null,
          open: `/api/r2/file?key=${encodeURIComponent(key)}`,
        };
      })
      .sort((a, b) => (b.uploadedAt ?? "").localeCompare(a.uploadedAt ?? ""));
    return NextResponse.json({ ok: true, configured: true, files });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not read the vault." }, { status: 502 });
  }
}
