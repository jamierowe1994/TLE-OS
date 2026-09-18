import HomeDetail from "@/components/tenant/HomeDetail";
import GoneHome from "@/components/tenant/GoneHome";
import { homeOnMarket } from "@/lib/tenant-homes";
import { originFromText } from "@/lib/tenant-find";
import { SOPHIE_PASSPORT } from "@/lib/tenant-sample";

export const dynamic = "force-dynamic";

export default async function TenantDemoHome({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const q = sp.from === "admin" ? "?from=admin" : "";
  const [h, home] = await Promise.all([homeOnMarket(id), originFromText(SOPHIE_PASSPORT.currentAddress)]);
  if (!h) return <GoneHome base="/tenant/demo" q={q} />;
  return <HomeDetail h={h} home={home} base="/tenant/demo" q={q} sample asked={null} first="Sophie" phone={SOPHIE_PASSPORT.mobile} />;
}
