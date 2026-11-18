import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { lookFor, lookRows } from "@/lib/new-look-store";
import { findUserById } from "@/lib/users";

/**
 * Whether the landlord and tenant portals draw in the house style (the
 * "portals" row in Admin > Switches > The New Look).
 *
 *  - A pin wins: `?look=new|old` on any portal page sets the PIN cookie
 *    (components/PortalLookPin), `?look=auto` clears it. It only changes what
 *    that browser draws.
 *  - At Everyone, every landlord and tenant gets it.
 *  - Below that, only a signed-in member of staff the level covers - a
 *    customer is never signed in to the OS, so lookFor(null) would answer off
 *    for every row. That is how James sees it on the sample portals first.
 *  - Off, an unknown level, or a database that does not answer: today's look.
 */
export const PORTAL_LOOK_PIN = "os-portal-look";

export async function portalLookOn(): Promise<boolean> {
  const jar = await cookies();
  const pin = jar.get(PORTAL_LOOK_PIN)?.value;
  if (pin === "new") return true;
  if (pin === "old") return false;
  const row = (await lookRows().catch(() => [])).find((r) => r.id === "portals");
  if (!row || row.level === "off") return false;
  if (row.level === "everyone") return true;
  const id = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  const me = id ? await findUserById(id).catch(() => null) : null;
  if (!me || me.locked) return false;
  return (await lookFor(me).catch(() => null))?.portals === true;
}
