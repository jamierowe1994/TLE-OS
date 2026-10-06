import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { whoIs } from "@/lib/admin";
import { readListingDetails } from "@/lib/listing-details";
import { listingIsTheirs } from "@/lib/listing-gate";
import { AGENT_RECORD_PAPERS, recordFiles } from "@/lib/listing-record";
import { FIELD_BY_KEY } from "@/lib/property-facts";
import { R2_BUCKET, withR2 } from "@/lib/r2";

/**
 * THE HOME'S FILED PAPERS ON ITS LISTING (James, 6 Oct 2026).
 *
 *   GET ?id=<listing>            -> { files: [{ field, label, name, url }] }
 *   GET ?id=<listing>&key=<key>  -> 302 to a five-minute signed link
 *
 * 6 Ruskin Place's landlord registration evidence and terms were on the OS
 * property record (the clean sweep) and nowhere on the listing. The office
 * sees every paper; an agent sees only AGENT_RECORD_PAPERS, and only on a
 * listing that is theirs. Files are opened through here, not /api/r2/file,
 * because that route refuses every property- key to an agent - rightly, for
 * the ID and AML papers that sit beside these.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STAFF = new Set(["owner", "super_admin", "developer", "support", "pretenancy", "compliance", "marketing"]);

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const id = Number(req.nextUrl.searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: true, files: [] });
  const notTheirs = await listingIsTheirs(actor, id);
  if (notTheirs) return NextResponse.json({ ok: false, error: notTheirs }, { status: 403 });

  try {
    const details = await readListingDetails(id, { cached: true });
    const osId = details.record.osPropertyId;
    if (!osId) return NextResponse.json({ ok: true, files: [] });
    const staff = STAFF.has(actor.role);
    const files = (await recordFiles(osId)).filter((f) => staff || AGENT_RECORD_PAPERS.has(f.field));

    const wanted = req.nextUrl.searchParams.get("key");
    if (wanted) {
      /* Only a key this listing's own list just offered this person. */
      const file = files.find((f) => f.key === wanted);
      if (!file) return NextResponse.json({ ok: false, error: "That paper is held by the office." }, { status: 403 });
      const url = await withR2((c) => getSignedUrl(c, new GetObjectCommand({ Bucket: R2_BUCKET, Key: file.key }), { expiresIn: 300 }));
      return NextResponse.redirect(url, 302);
    }

    return NextResponse.json(
      {
        ok: true,
        files: files.map((f) => ({
          field: f.field,
          label: FIELD_BY_KEY.get(f.field)?.label ?? "Document",
          name: f.name,
          url: `/api/listings/record-files?id=${id}&key=${encodeURIComponent(f.key)}`,
        })),
      },
      { headers: { "cache-control": "private, no-store" } }
    );
  } catch {
    return NextResponse.json({ ok: false, error: "The property record's papers did not load. Try again in a minute." }, { status: 502 });
  }
}
