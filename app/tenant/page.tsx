import Link from "next/link";
import { redirect } from "next/navigation";
import { currentTenant, tenantDealViews, tenantPassportPath, type TenantDealView } from "@/lib/tenant-account";

/**
 * The tenant's home: where their tenancy is up to, in their words.
 *
 * One card per deal, nearest move-in first. The eight stages are the same
 * eight Kirstie's board derives (lib/business/deal-stage), so the tenant is
 * never told something the board would contradict; the labels and the two
 * sentences under them are written for the person moving in rather than the
 * person progressing the file.
 *
 * The sample portal with Sophie lives at /tenant/demo. This page shows a
 * real tenant their real deal, or sends them to sign in.
 */

export const dynamic = "force-dynamic";

const RED = "#e31f36";

const money = (n: number | null) => (n == null ? null : `£${Math.round(n).toLocaleString("en-GB")}`);
const longDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : null;

function DealCard({ d, passport }: { d: TenantDealView; passport: string | null }) {
  const at = d.stages.findIndex((s) => s.state === "current");
  return (
    <section className="rounded-2xl border border-black/10 bg-white p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">Your tenancy</p>
          <h2 className="mt-1 text-[24px] font-semibold leading-tight">{d.property}</h2>
          <p className="mt-1 text-[13px] text-black/60">
            {[d.locality, money(d.rentPcm) ? `${money(d.rentPcm)} per month` : null, d.otherTenants.length ? `with ${d.otherTenants.join(", ")}` : null]
              .filter(Boolean)
              .join("  •  ")}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">Move-in</p>
          <p className="mt-1 text-[15px] font-semibold">{longDate(d.moveIn) ?? "To be confirmed"}</p>
        </div>
      </div>

      {/* The journey, left to right. Done, here, next. */}
      <ol className="mt-6 flex gap-1 overflow-x-auto pb-2">
        {d.stages.map((s, i) => (
          <li key={s.key} className="flex min-w-[96px] flex-1 flex-col">
            <div className="flex items-center">
              <span
                className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] font-semibold"
                style={
                  s.state === "done"
                    ? { borderColor: RED, color: RED, background: "#fdecee" }
                    : s.state === "current"
                      ? { borderColor: RED, background: RED, color: "#fff" }
                      : { borderColor: "rgba(0,0,0,0.15)", color: "rgba(0,0,0,0.4)" }
                }
              >
                {s.state === "done" ? "✓" : i + 1}
              </span>
              {i < d.stages.length - 1 && (
                <span aria-hidden className="h-[1.5px] flex-1" style={{ background: s.state === "done" ? "rgba(227,31,54,0.4)" : "rgba(0,0,0,0.12)" }} />
              )}
            </div>
            <span className={`mt-2 pr-2 text-[11.5px] leading-tight ${s.state === "current" ? "font-semibold" : "text-black/50"}`}>{s.label}</span>
          </li>
        ))}
      </ol>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <div className="rounded-xl bg-[#fafafa] p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-black/50">
            Now{at >= 0 ? `  •  step ${at + 1} of ${d.stages.length}` : ""}
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed">{d.now}</p>
        </div>
        <div className="rounded-xl p-4" style={{ background: "#fdecee" }}>
          <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: RED }}>
            What you can do
          </p>
          <p className="mt-1.5 text-[13.5px] leading-relaxed">{d.next}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3 text-[12.5px]">
        {d.agent.name && (
          <span className="text-black/60">
            Your agent: <span className="font-semibold text-black">{d.agent.name}</span>
            {d.agent.email && (
              <>
                {" "}
                <a href={`mailto:${d.agent.email}`} className="underline">
                  {d.agent.email}
                </a>
              </>
            )}
          </span>
        )}
        {d.flatfair && <span className="rounded-full border border-black/10 px-2.5 py-1 text-[11.5px] text-black/60">Deposit alternative: Flatfair</span>}
        {passport && (
          <Link href={passport} className="ml-auto rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-white" style={{ background: RED }}>
            Your passport
          </Link>
        )}
      </div>
    </section>
  );
}

export default async function TenantHome() {
  const me = await currentTenant();
  if (!me) redirect("/tenant/sign-in");
  const [deals, passport] = await Promise.all([tenantDealViews(me), tenantPassportPath(me.email)]);
  const first = me.name.split(/\s+/)[0] || me.name;

  return (
    <div className="space-y-5 pt-8">
      <div>
        <h1 className="text-[32px] font-semibold leading-none">Hello, {first}</h1>
        <p className="mt-2 text-[13.5px] text-black/60">
          {deals.length ? "Where your tenancy is up to, and what happens next." : "We don't have a tenancy against this address right now."}
        </p>
      </div>
      {deals.map((d) => (
        <DealCard key={d.id} d={d} passport={passport} />
      ))}
      {!deals.length && (
        <div className="rounded-2xl border border-black/10 bg-[#fafafa] p-5 text-[13px] leading-relaxed text-black/60">
          If you have applied for a property with us and it is not showing, the application may be held against a
          different email address. Your agent can put that right.
          {passport && (
            <>
              {" "}
              Your passport is still here:{" "}
              <Link href={passport} className="font-semibold text-black underline">
                open it
              </Link>
              .
            </>
          )}
        </div>
      )}
    </div>
  );
}
