import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { hasDb, q } from "@/lib/db";
import { keyIsOurs, R2_BUCKET, r2Configured, withR2 } from "@/lib/r2";
import { presentationExpiry } from "@/lib/present-store";
import { guideIn } from "@/lib/rm-guide";

/**
 * THE LANDLORD'S RIGHTMOVE PRICE GUIDE.
 *
 * The landlord has no account, so /api/r2/file (which asks who is signed in)
 * cannot hand them the file. This route is the deck's own door to it, and
 * it opens exactly one file: the guide on a presentation that is still open.
 *
 *   - Found by the guide's OWN random id, never by the presentation token or
 *     the R2 key, so the URL in the page is not a credential for anything
 *     else (the same reasoning as the welcome video's key).
 *   - Refused once the presentation has expired, like the deck itself.
 *   - Signed for five minutes and redirected, like /api/r2/file: a link
 *     copied out of the address bar is worthless by the time it travels.
 *
 * Public by middleware (api/present is on the exempt list).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const TTL_SECONDS = 300;

const gone = (msg: string, status = 404) => NextResponse.json({ ok: false, error: msg }, { status });

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[\w-]{16,64}$/.test(id ?? "")) return gone("That price guide isn't available.");
  if (!hasDb()) return gone("That price guide isn't available.", 503);

  const rows = await q<{ ref: string; created_at: Date | string; guide: unknown }>(
    `SELECT ref, created_at, deck -> 'rmGuide' AS guide
       FROM os_presentations
      WHERE deck -> 'rmGuide' ->> 'id' = $1
      ORDER BY created_at DESC LIMIT 1`,
    [id]
  ).catch(() => []);
  const row = rows[0];
  const guide = row ? guideIn(row.guide) : null;
  if (!row || !guide) return gone("That price guide isn't available.");

  const expiry = await presentationExpiry({ ref: row.ref, createdAt: new Date(row.created_at).toISOString() });
  if (expiry.getTime() < Date.now()) return gone("This presentation has expired, and the price guide with it.", 410);

  if (guide.kind === "url") return NextResponse.redirect(guide.url, { status: 302 });

  if (!keyIsOurs(guide.key)) return gone("That price guide isn't available.");
  if (!r2Configured) return gone("Storage isn't configured.", 503);
  try {
    const url = await withR2((client) =>
      getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: guide.key,
          ResponseContentType: "application/pdf",
          ResponseContentDisposition: `inline; filename="${guide.name.replace(/[^\x20-\x7e]|["\\]/g, "")}"`,
        }),
        { expiresIn: TTL_SECONDS }
      )
    );
    return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "private, max-age=60" } });
  } catch (e) {
    const err = e as { name?: string; message?: string };
    console.error("rm-guide signing failed", err.name, err.message);
    return gone("Couldn't open the price guide just now.", 502);
  }
}
