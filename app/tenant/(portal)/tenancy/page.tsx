import Spine from "@/components/landlord/Spine";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

/** My tenancy: one section of the tenant portal, from the same view as the home. */

export const dynamic = "force-dynamic";
const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";

export default async function Page() {
  const me = (await currentTenant())!;
  const v = await loadTenantHome(me);
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-[36px] leading-[1.05]">My tenancy</h1>
      </div>
      {v.deal ? (
        <>
          <div className={`${card} p-6`} data-search>
            <p className={eyebrow}>Your tenancy</p>
            <h2 className="mt-1 text-[26px] font-bold leading-tight">{v.deal.property}</h2>
            <p className="mt-1 text-[13.5px] text-muted">{v.deal.locality}</p>
            <div className="mt-5 grid gap-4 sm:grid-cols-3">
              <Fact label="Move-in" value={v.deal.moveIn ? new Date(v.deal.moveIn).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "To be confirmed"} />
              <Fact label="Rent" value={v.deal.rentPcm ? `£${Math.round(v.deal.rentPcm).toLocaleString("en-GB")} a month` : "To be confirmed"} />
              <Fact label="Moving in with" value={v.deal.otherTenants.length ? v.deal.otherTenants.join(", ") : "Just you"} />
            </div>
          </div>
          <div className={`${card} p-6`} data-search>
            <h2 className="text-[19px] font-bold">Where it is up to</h2>
            <div className="mt-5"><Spine stops={v.stops} /></div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-[16px] bg-accent-soft p-5"><p className={eyebrow}>Now</p><p className="mt-1.5 text-[14.5px] leading-relaxed">{v.deal.now}</p></div>
              <div className="rounded-[16px] bg-panel p-5"><p className={eyebrow}>What you can do</p><p className="mt-1.5 text-[14.5px] leading-relaxed">{v.deal.next}</p></div>
            </div>
          </div>
        </>
      ) : (
        <div className={`${card} p-6`} data-search>
          <h2 className="text-[22px] font-bold leading-tight">No tenancy yet</h2>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
            When you apply for a property with us, this page becomes your tenancy: the property, your dates, your rent, and every stage from offer to move-in day.
          </p>
          <div className="mt-6"><Spine stops={v.stops} /></div>
        </div>
      )}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className={eyebrow}>{label}</p>
      <p className="mt-1 text-[15px] font-medium">{value}</p>
    </div>
  );
}

function Row({ label, sub, href }: { label: string; sub: string; href: string | null }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        <span className="block text-[12.5px] text-muted">{sub}</span>
      </span>
      <span className="text-[12.5px] font-semibold">{href ? "Open" : "Not yet"}</span>
    </>
  );
  return (
    <li>
      {href ? (
        <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-4 py-3.5 hover:text-accent-dark">{inner}</a>
      ) : (
        <div className="flex items-center gap-4 py-3.5 text-muted">{inner}</div>
      )}
    </li>
  );
}
