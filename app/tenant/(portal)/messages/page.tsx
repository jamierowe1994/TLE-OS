import Spine from "@/components/landlord/Spine";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

/** Messages: one section of the tenant portal, from the same view as the home. */

export const dynamic = "force-dynamic";
const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";

export default async function Page() {
  const me = (await currentTenant())!;
  const v = await loadTenantHome(me);
  return (
    <div className="space-y-5">
      <div className="pt-2">
        <h1 className="text-[36px] leading-[1.05]">Messages</h1>
      </div>
      <div className={`${card} p-6`} data-search>
        {v.agent ? (
          <>
            <p className={eyebrow}>Your letting agent</p>
            <h2 className="mt-1 text-[22px] font-bold leading-tight">{v.agent.name}</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
              Messages here are on their way. For now, email reaches {v.agent.name.split(/\s+/)[0]} directly and is answered the same day.
            </p>
            {v.agent.email && (
              <a href={`mailto:${v.agent.email}`} className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">Email {v.agent.name.split(/\s+/)[0]}</a>
            )}
          </>
        ) : (
          <>
            <h2 className="text-[22px] font-bold leading-tight">Your agent appears here</h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">Once you apply for a property, the agent looking after it is here to message.</p>
          </>
        )}
      </div>
      <div className={`${card} p-6`} data-search>
        <h2 className="text-[19px] font-bold">Recent activity</h2>
        <ul className="mt-4 space-y-3">
          {v.activity.map((a, k) => (
            <li key={k} className="flex gap-3 text-[13.5px]"><span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${a.tone === "done" ? "bg-[#56634a]" : a.tone === "live" ? "bg-accent-dark" : "bg-line"}`} /><span className="flex-1">{a.label}{a.sub ? <span className="text-muted"> · {a.sub}</span> : null}</span>{a.when && <span className="text-[12px] text-muted">{a.when}</span>}</li>
          ))}
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
