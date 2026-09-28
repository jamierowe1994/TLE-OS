import { SITE } from "@/lib/email/tle-documents";
import { assetOrigin } from "@/lib/campaign-mail";

/**
 * An email previewed on a screen points its pictures and links at the site the
 * screen is on.
 *
 * An email is written with absolute addresses, because that is all an inbox
 * understands. Up to three different ones: the site (SITE), the pictures
 * (assetOrigin, set when the site is built) and the configured public origin.
 * On the live site they are all https://tle-os.co.uk and this changes nothing
 * that matters; on a laptop the pictures default to another local server, and
 * the preview showed broken boxes. Both previews (Admin > Emails and the
 * Showroom) pass the page's own public origin (lib/origin) - never the
 * request's, which behind Railway is localhost:8080 and broke every picture
 * on the live site (James, 28 Sep 2026).
 */
export function sameSite(html: string, origin: string): string {
  const live = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");
  let out = html;
  for (const from of new Set([SITE, assetOrigin(), live])) {
    if (from && from !== origin) out = out.replaceAll(from, origin);
  }
  return out;
}
