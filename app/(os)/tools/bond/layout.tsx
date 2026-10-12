import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth";
import { findUserById } from "@/lib/users";
import { can } from "@/lib/roles";
import { TOOLS } from "@/lib/tools";

/**
 * Bond is locked for agents and open to admins as a preview (lib/tools,
 * adminPreview). The Tools card only stops the click; this stops the address,
 * so a typed or bookmarked /tools/bond sends an agent back to Tools.
 *
 * Decided on the signed-in person's own role, never a view-as subject, so an
 * owner viewing as an agent can still open it.
 */

export const dynamic = "force-dynamic";

export default async function BondGate({ children }: { children: React.ReactNode }) {
  const bond = TOOLS.find((t) => t.key === "bond");
  if (bond?.status === "locked") {
    const id = verifySessionToken((await cookies()).get(SESSION_COOKIE)?.value);
    const me = id ? await findUserById(id).catch(() => null) : null;
    if (!me || me.locked || !bond.adminPreview || !can(me.role, "admin:open")) redirect("/tools");
  }
  return <>{children}</>;
}
