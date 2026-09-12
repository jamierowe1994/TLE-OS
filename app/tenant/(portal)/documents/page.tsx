import Spine from "@/components/landlord/Spine";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

/** Documents: one section of the tenant portal, from the same view as the home. */

export const dynamic = "force-dynamic";
const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";

export default async function Page() {
  const me = (await currentTenant())!;
  const v = await loadTenantHome(me);
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-[36px] leading-[1.05]">Documents</h1>
      </div>
      <div className={`${card} p-6`} data-search>
        <h2 className="text-[19px] font-bold">Yours</h2>
        <ul className="mt-4 divide-y divide-line/60">
          <Row label="Your tenant passport" sub={v.passport.done === v.passport.total ? "Complete - reused for every application" : `${v.passport.done} of ${v.passport.total} sections done`} href={v.passport.path} />
          <Row label="How to rent: the checklist for renting in England" sub="The government's guide, which every tenant is given" href="https://www.gov.uk/government/publications/how-to-rent" />
        </ul>
      </div>
      <div className={`${card} p-6`} data-search>
        <h2 className="text-[19px] font-bold">With your tenancy</h2>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
          {v.deal ? "These arrive here as your tenancy is set up." : "Once you have a tenancy with us, these appear here."}
        </p>
        <ul className="mt-4 divide-y divide-line/60">
          <Row label="Tenancy agreement" sub="Sent for signing when it is drawn up" href={null} />
          <Row label="Deposit protection certificate" sub="After your deposit is registered" href={null} />
          <Row label="Gas safety certificate and EPC" sub="The property's certificates, before you move in" href={null} />
          <Row label="Inventory and check-in report" sub="From move-in day" href={null} />
        </ul>
      </div>
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
