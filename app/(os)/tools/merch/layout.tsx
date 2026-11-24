import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { lookFor } from "@/lib/new-look-store";

/**
 * Merch is locked until James releases it (lib/tools `look`, the "merch"
 * switch). The Tools card only stops the click; this stops the address, so a
 * typed or bookmarked /tools/merch sends anyone the switch does not cover back
 * to Tools. Decided on the signed-in person, never a view-as subject.
 */

export const dynamic = "force-dynamic";

export default async function MerchGate({ children }: { children: React.ReactNode }) {
  const id = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  const me = id ? await findUserById(id).catch(() => null) : null;
  if (!me || me.locked) redirect("/tools");
  const on = await lookFor(me).catch(() => null);
  if (!on?.merch) redirect("/tools");
  return <>{children}</>;
}
