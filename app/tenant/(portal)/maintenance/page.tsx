import MaintenanceView from "@/components/tenant/MaintenanceView";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = (await currentTenant())!;
  const v = await loadTenantHome(me);
  return <MaintenanceView v={v} />;
}
