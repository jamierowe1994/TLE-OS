import { redirect } from "next/navigation";
import PortalShell from "@/components/tenant/PortalShell";
import { currentTenant } from "@/lib/tenant-account";
import { tenantStage } from "@/lib/tenant-home-view";

/**
 * The door. Everything in this group is a signed-in tenant's own, so the
 * check is made once here. The shell itself is shared with the sample.
 */
export default async function TenantPortalLayout({ children }: { children: React.ReactNode }) {
  const me = await currentTenant();
  if (!me) redirect("/tenant/sign-in");
  const stage = await tenantStage(me);
  return <PortalShell name={me.name} base="/tenant" stage={stage}>{children}</PortalShell>;
}
