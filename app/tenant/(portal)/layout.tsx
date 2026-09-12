import { redirect } from "next/navigation";
import PortalShell from "@/components/tenant/PortalShell";
import { currentTenant } from "@/lib/tenant-account";

/**
 * The door. Everything in this group is a signed-in tenant's own, so the
 * check is made once here. The shell itself is shared with the sample.
 */
export default async function TenantPortalLayout({ children }: { children: React.ReactNode }) {
  const me = await currentTenant();
  if (!me) redirect("/tenant/sign-in");
  return <PortalShell name={me.name} base="/tenant">{children}</PortalShell>;
}
