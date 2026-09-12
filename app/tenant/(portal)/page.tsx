import HomeView from "@/components/tenant/HomeView";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

/** The tenant's home, live. The view is drawn in components/tenant/HomeView,
 *  shared with the sample; this file only loads it. */

export const dynamic = "force-dynamic";

export default async function TenantHomePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = (await currentTenant())!;
  const [v, sp] = await Promise.all([loadTenantHome(me), searchParams]);
  return <HomeView v={v} welcome={sp.welcome === "1"} base="/tenant" />;
}
