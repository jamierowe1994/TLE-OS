import "server-only";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById, type OsUser } from "@/lib/users";

/**
 * Who is asking, for the automations routes. Owners (James, Howard) and the
 * super admin (Susan) see everyone's and can switch anyone's off; everybody
 * else sees and changes their own only.
 */
export async function caller(req: NextRequest): Promise<{ me: OsUser; owner: boolean } | null> {
  const id = verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const me = await findUserById(id).catch(() => null);
  if (!me || me.locked) return null;
  return { me, owner: me.role === "owner" || me.role === "super_admin" };
}
