import "server-only";
import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";
import { whoIs } from "@/lib/admin";

/**
 * Who may READ a scheduler route's status (10 Oct 2026, bug P-006).
 *
 * These routes skip the sign-in door (middleware MACHINE_ROUTES) so a Railway
 * cron service can reach them. Their POSTs check the cron key; their GETs did
 * not, and on the live site anybody could read Landlord Radar's last runs
 * (James's address in the digest line, the districts we prospect), the
 * lettings sweep's watched sectors and the Bond syncs' counts.
 *
 * Now a GET needs the cron key (x-cron-key, or a Bearer token) or somebody
 * signed in to the OS - the Bond screens read these as the person using them.
 * Never open because a secret is unset: with no CRON_SECRET only a signed-in
 * person gets in.
 */
export async function machineReadAllowed(req: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET ?? "";
  const given = req.headers.get("x-cron-key") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (secret && given) {
    const a = Buffer.from(secret);
    const b = Buffer.from(given);
    if (a.length === b.length && timingSafeEqual(a, b)) return true;
  }
  const { actor } = await whoIs(req).catch(() => ({ actor: null }));
  return Boolean(actor);
}
