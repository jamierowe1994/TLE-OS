import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { record } from "@/lib/audit";
import { readListingDetails } from "@/lib/listing-details";
import { gateListingWrite } from "@/lib/listing-gate";
import { invalidateListingBook } from "@/lib/listings-cache";
import { R2_BUCKET, withR2 } from "@/lib/r2";
import { rexCall, rexConfigured, RexWriteBlocked } from "@/lib/rex";
import { rexTokenFor } from "@/lib/rex-user";

/**
 * A photo or a floor plan, from the OS into the REX listing (15 Sep 2026).
 *
 *   POST { id, kind: "photo" | "floorplan", key }
 *
 * The file is already in R2 (the drop zone put it there). REX fetches it from
 * a short-lived signed address with Upload/uploadFileFromUrl, which hands
 * back a temporary uri, and the listing takes that uri as a new row in
 * listing_images or listing_floorplans.
 *
 * The same two calls that file a certificate into a listing's Documents
 * (lib/plc-rex attachCertificateToListing, live since 5 Sep), pointed at the
 * image and floor-plan collections instead. New rows go to the END; the main
 * photo is chosen by reordering, on the Marketing tab.
 *
 * Needs Upload/uploadFileFromUrl and Listings/update on REX_ALLOW_WRITES -
 * both already open. Switch: "Edit the advert into REX".
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const REX_LIMIT = { photo: 50, floorplan: 5 } as const;

export async function POST(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "REX isn't connected on this environment." }, { status: 503 });
  const gate = await gateListingWrite(req, "listing-edit");
  if ("refuse" in gate) return gate.refuse;
  const { actor } = gate;

  const b = (await req.json().catch(() => ({}))) as { id?: unknown; kind?: unknown; key?: unknown };
  const id = Number(b.id);
  const kind = b.kind === "photo" || b.kind === "floorplan" ? b.kind : null;
  const key = typeof b.key === "string" ? b.key : "";
  if (!Number.isInteger(id) || id <= 0 || !kind) return NextResponse.json({ ok: false, error: "Which listing, and a photo or a floor plan?" }, { status: 400 });
  /* Only a file the drop zone put under THIS listing. A key from anywhere
     else in the bucket - a tenant's ID, a signed contract - must never be
     one request away from a public advert. */
  if (!key.startsWith(`photos/listing-${id}/`) || key.includes("..")) {
    return NextResponse.json({ ok: false, error: "That file was not uploaded against this listing." }, { status: 400 });
  }

  try {
    const now = await readListingDetails(id);
    const held = kind === "photo" ? now.images : now.floorplans;
    if (held.length >= REX_LIMIT[kind]) {
      return NextResponse.json({ ok: false, error: `REX takes ${REX_LIMIT[kind]} ${kind === "photo" ? "photos" : "floor plans"} on a listing, and this one has them all.` }, { status: 409 });
    }

    const { getSignedUrl } = await import("@aws-sdk/s3-request-presigner");
    const url = await withR2((client) => getSignedUrl(client, new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }), { expiresIn: 900 }));
    const up = await rexCall("Upload", "uploadFileFromUrl", { url });
    const uri = (up.result as { uri?: string } | undefined)?.uri;
    if (!up.ok || !uri) return NextResponse.json({ ok: false, error: `REX would not take the file: ${up.error ?? "no uri came back"}` }, { status: 502 });

    const token = await rexTokenFor(actor.id);
    const collection = kind === "photo" ? "listing_images" : "listing_floorplans";
    const priority = (held.at(-1)?.priority ?? held.length) + 1;
    const res = await rexCall("Listings", "update", { data: { id, related: { [collection]: [{ uri, priority }] } } }, token);
    if (!res.ok) return NextResponse.json({ ok: false, error: `REX refused it: ${res.error ?? res.status}` }, { status: 502 });

    await invalidateListingBook();
    await record({ kind: "listing_edited", actorId: actor.id, actorEmail: actor.email, detail: `${id}: ${kind} added from ${key}` });
    const details = await readListingDetails(id).catch(() => null);
    return NextResponse.json({ ok: true, id, kind, details });
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return NextResponse.json({ ok: false, locked: true, error: "Locked here: REX_ALLOW_WRITES needs Upload/uploadFileFromUrl and Listings/update." }, { status: 423 });
    }
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "REX did not answer." }, { status: 502 });
  }
}
