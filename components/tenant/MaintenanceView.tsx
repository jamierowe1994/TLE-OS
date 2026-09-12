import Spine from "@/components/landlord/Spine";
import type { TenantHome } from "@/lib/tenant-home-view";

/** Maintenance: one section of the tenant portal, drawn from the home view. Shared with the sample. */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";

export default function MaintenanceView({ v }: { v: TenantHome }) {
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-[36px] leading-[1.05]">Maintenance</h1>
      </div>
      <div className={`${card} p-6`} data-search>
        <h2 className="text-[22px] font-bold leading-tight">Need something fixed?</h2>
        <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
          {v.deal
            ? "Tell us what is wrong and we will take care of it. For now, message your agent and it is logged the same day; reporting from this page comes with your move-in."
            : "Once you have moved in, report anything here - a boiler, a leak, a lock - and we will take care of it. Until then there is nothing to report."}
        </p>
        {v.agent?.email && (
          <a href={`mailto:${v.agent.email}?subject=Maintenance`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">
            Message {v.agent.name.split(/\s+/)[0]}
          </a>
        )}
      </div>
      <div className={`${card} p-6`} data-search>
        <h2 className="text-[19px] font-bold">Your requests</h2>
        <p className="mt-2 text-[13.5px] text-muted">None yet.</p>
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
