import HomeDetail from "@/components/tenant/HomeDetail";
import GoneHome from "@/components/tenant/GoneHome";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homeOnMarket } from "@/lib/tenant-homes";
import { latestEnquiry, originFromPassport } from "@/lib/tenant-find";

export const dynamic = "force-dynamic";

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long" });

export default async function TenantHomePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = (await currentTenant())!;
  const record = await tenantPassport(me.email).catch(() => null);
  const [h, home, asked] = await Promise.all([homeOnMarket(id), originFromPassport(record), latestEnquiry(me.email).catch(() => null)]);
  if (!h) return <GoneHome base="/tenant" />;
  return (
    <HomeDetail
      h={h}
      home={home}
      base="/tenant"
      asked={asked?.listingId === h.id ? day(asked.at) : null}
      first={me.name.split(/\s+/)[0] || me.name}
      phone={record?.data?.mobile ?? ""}
    />
  );
}
