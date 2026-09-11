import LandlordDashboard from "@/components/landlord/Dashboard";
import LandlordDocuments from "@/components/LandlordDocuments";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import { currentLandlord, type LandlordCompliance } from "@/lib/landlord-account";
import { loadLandlordHome, money } from "@/lib/landlord-home-view";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * The landlord's home, live. The view is built in lib/landlord-home-view
 * (shared with the journey page); this file only lays it out.
 */
export default async function LandlordHome() {
  const me = (await currentLandlord())!;
  const { view, open, rest, compliance, docs, first } = await loadLandlordHome(me);

  if (!view) {
    return (
      <div className="space-y-4">
        <div className="px-2 pt-4">
          <h1 className="text-[40px] leading-none">Hello, {first}</h1>
          <p className="mt-3 text-[13.5px] text-muted">We don&rsquo;t have a property against this address yet.</p>
        </div>
        <div className="rounded-[20px] border border-line/70 bg-panel p-5 text-[13px] leading-relaxed text-muted">
          If you have a property with us that is not showing, it may be held against a different
          email address. Your agent can put that right.
        </div>
      </div>
    );
  }

  return (
    <LandlordDashboard
      view={view}
      upload={
        open[0] ? (
          <LandlordDocuments
            appraisalId={open[0].appraisal.id}
            wanted={(["id", "ownership", "gas", "eicr", "epc"] as const).filter((k) => !docs.some((d) => d.kind === k))}
          />
        ) : undefined
      }
      managed={
        rest.length > 0 ? (
          <section className="rounded-[20px] border border-line/70 bg-panel p-5" data-search>
            <h2 className="text-[17px]">{open[0] ? "Already looked after" : "Your other properties"}</h2>
            <div className="mt-4 space-y-3">
              {rest.map((p) => (
                <ManagedRow key={p.listingId} p={p} compliance={compliance.get(p.propertyId ?? "") ?? null} />
              ))}
            </div>
          </section>
        ) : undefined
      }
    />
  );
}

function ManagedRow({ p, compliance }: { p: ManagedProperty; compliance: LandlordCompliance | null }) {
  const tenant = p.tenants[0];
  return (
    <div className="flex flex-wrap items-center gap-4 [&>div]:min-w-[55%]">
      <span className="flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-line/60 bg-white">
        <PropertyPhoto src={p.image} className="h-full w-full object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-[17px]">{p.name}</h3>
        <p className="text-[12px] text-muted">
          {[p.locality, p.service, p.rent != null ? `${money(p.rent)} ${p.rentPeriod === "week" ? "per week" : "per month"}` : null, tenant?.name]
            .filter(Boolean)
            .join("  •  ")}
        </p>
      </div>
      {compliance && !compliance.allInDate && <Pill tone="accent">{compliance.headline}</Pill>}
      <Pill tone={tenant ? "good" : "accent"}>{tenant ? "Tenanted" : "Let"}</Pill>
    </div>
  );
}
