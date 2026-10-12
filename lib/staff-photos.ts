import "server-only";
import { hasDb, q } from "@/lib/db";

/**
 * Staff headshots waiting for their account (James, 12 Oct 2026: "for anyone
 * that doesn't have an account yet, when they make an account, they'll
 * automatically pull through").
 *
 * os_staff_photos holds one head-and-shoulders photo per Letting Expert,
 * taken from the TEG Team Hub's headshot (the master, where it has one) or
 * the photo on thelettingexperts.co.uk/staff, as a 400px JPEG data: URL - the
 * same form a photo uploaded on Profile takes. createUser (lib/users) asks
 * here when an account is made.
 *
 * Matched on any of the person's emails, then on first and last name: the
 * same person is on @thepropertyexperts.co.uk in one place and
 * @thelettingexperts.co.uk in another, and "Lianna Jane Denholm" is "Lianna
 * Denholm" on the website.
 */

/** "Lianna Jane Denholm" -> "lianna denholm": first and last word, letters only. */
export function nameKey(name: string): string {
  const words = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z\s-]/g, "")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (!words.length) return "";
  return words.length === 1 ? words[0]! : `${words[0]} ${words[words.length - 1]}`;
}

export async function staffPhotoFor(email: string, name: string): Promise<string | null> {
  if (!hasDb()) return null;
  const rows = await q<{ photo: string }>(
    `SELECT photo FROM os_staff_photos
      WHERE lower($1) = ANY(emails) OR name_key = $2
      ORDER BY (lower($1) = ANY(emails)) DESC
      LIMIT 1`,
    [email.trim().toLowerCase(), nameKey(name)]
  );
  return rows[0]?.photo ?? null;
}
