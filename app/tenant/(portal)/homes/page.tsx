import HomesBrowser from "@/components/tenant/HomesBrowser";
import { currentTenant, tenantPassport } from "@/lib/tenant-account";
import { homesOnMarket } from "@/lib/tenant-homes";
import { alertFor, latestEnquiry, originFromPassport } from "@/lib/tenant-find";

/** Find a home, live: every home on the market, searched from the tenant's
 *  own house (their passport address). The page is components/tenant/HomesBrowser. */

export const dynamic = "force-dynamic";

export default async function TenantHomesPage() {
  const me = (await currentTenant())!;
  const record = await tenantPassport(me.email).catch(() => null);
  const [market, home, alert, asked] = await Promise.all([
    homesOnMarket(),
    originFromPassport(record),
    alertFor(me.email).catch(() => null),
    latestEnquiry(me.email).catch(() => null),
  ]);
  return (
    <HomesBrowser
      homes={market.ok ? market.homes : null}
      error={market.ok ? null : market.error}
      home={home}
      base="/tenant"
      alert={alert}
      askedAbout={asked?.listingId ?? null}
    />
  );
}
