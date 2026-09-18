import HomesBrowser from "@/components/tenant/HomesBrowser";
import { homesOnMarket } from "@/lib/tenant-homes";
import { originFromText } from "@/lib/tenant-find";
import { SOPHIE_PASSPORT } from "@/lib/tenant-sample";

/** Find a home in the sample: the REAL homes on the market, searched from
 *  Sophie's sample address. Alerts and enquiries play through and send nothing. */

export const dynamic = "force-dynamic";

export default async function TenantDemoHomes({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const sp = await searchParams;
  const [market, home] = await Promise.all([homesOnMarket(), originFromText(SOPHIE_PASSPORT.currentAddress)]);
  return (
    <HomesBrowser
      homes={market.ok ? market.homes : null}
      error={market.ok ? null : market.error}
      home={home ? { ...home, label: "NG1" } : null}
      base="/tenant/demo"
      q={sp.from === "admin" ? "?from=admin" : ""}
      sample
      alert={null}
      askedAbout={null}
    />
  );
}
