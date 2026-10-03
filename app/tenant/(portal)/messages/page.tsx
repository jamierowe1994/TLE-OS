import MessagesView from "@/components/tenant/MessagesView";
import TenantThread from "@/components/tenant/TenantThread";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

export const dynamic = "force-dynamic";

export default async function Page() {
  const me = (await currentTenant())!;
  const v = await loadTenantHome(me);
  /* The real conversation with their agent (3 Oct 2026). */
  return <MessagesView v={v} thread={<TenantThread agentFirst={v.agent ? v.agent.name.split(/\s+/)[0] : null} />} />;
}
