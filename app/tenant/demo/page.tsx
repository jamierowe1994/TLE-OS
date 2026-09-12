import HomeView from "@/components/tenant/HomeView";
import { SOPHIE } from "@/lib/tenant-sample";

export default async function TenantDemoHome({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  return <HomeView v={SOPHIE} welcome={false} base="/tenant/demo" q={sp.from === "admin" ? "?from=admin" : ""} />;
}
