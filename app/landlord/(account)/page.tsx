import PropertyPhoto from "@/components/PropertyPhoto";
import { currentLandlord, landlordProperties } from "@/lib/landlord-account";
import type { ManagedProperty } from "@/lib/portfolio-types";

const RED = "#e31f36";

const money = (n: number | null) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const day = (iso: string | null) =>
  iso
    ? new Date(`${iso}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    : "—";

/**
 * A landlord's home, live.
 *
 * What REX can say today about a landlord's managed properties: the address,
 * the rent, the service they are on, who is in, since when, and which of our
 * agents looks after it. Everything else the sample page shows - offers,
 * certificates, upkeep, documents - is still to come, and this page does not
 * pretend otherwise: it shows what is real and says what is next.
 */
export default async function LandlordHome() {
  const me = (await currentLandlord())!;
  const properties = await landlordProperties(me);
  const first = me.name.split(/\s+/)[0] || me.name;
  const agents = [...new Map(properties.filter((p) => p.agent).map((p) => [p.agent!.id, p.agent!.name])).values()];

  return (
    <div className="py-10">
      <h1 className="text-[24px] font-bold leading-tight">Hello, {first}</h1>
      <p className="mt-1 text-[13.5px] text-black/60">
        {properties.length === 0
          ? "We don't have a managed property against this address yet."
          : properties.length === 1
            ? "Your property with us, and everything we hold on it."
            : `Your ${properties.length} properties with us, and everything we hold on them.`}
        {agents.length > 0 && (
          <>
            {" "}
            Looked after by <span className="font-semibold text-black/80">{agents.join(" and ")}</span>.
          </>
        )}
      </p>

      {properties.length === 0 && (
        <div className="mt-8 rounded-xl border border-black/10 bg-[#fafafa] p-5 text-[13px] leading-relaxed text-black/60">
          If you have a property with us that is not showing, it may be held against a different
          email address, or still be on the market rather than let. Your agent can put that right.
        </div>
      )}

      <div className="mt-8 space-y-5">
        {properties.map((p) => (
          <Property key={p.listingId} p={p} />
        ))}
      </div>

      {properties.length > 0 && (
        <div className="mt-8 rounded-xl border border-black/10 p-5">
          <p className="text-[13px] font-bold">Coming to your file</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-black/60">
            Your safety certificates and when they are due, offers when a property is being let,
            approvals for repairs, and your documents both ways. We are building it in that order.
          </p>
        </div>
      )}
    </div>
  );
}

function Property({ p }: { p: ManagedProperty }) {
  const tenant = p.tenants[0];
  return (
    <section className="overflow-hidden rounded-xl border border-black/10">
      <div className="flex flex-wrap items-center gap-4 border-b border-black/10 bg-[#fafafa] p-4">
        <PropertyPhoto src={p.image} className="h-16 w-24 shrink-0 rounded-lg object-cover" />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold">{p.name}</p>
          <p className="text-[12px] text-black/50">
            {p.locality}
            {p.service ? ` · ${p.service}` : ""}
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-bold text-white"
          style={{ backgroundColor: tenant ? "#16181d" : RED }}
        >
          {tenant ? "Tenanted" : "Let"}
        </span>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-3">
        <Fact label="Rent" value={p.rent == null ? "Not set" : `${money(p.rent)} ${p.rentPeriod === "week" ? "a week" : "a month"}`} />
        <Fact label="Let since" value={day(p.letSince)} />
        <Fact label="Let type" value={p.letType ?? "—"} />
        <Fact
          label={p.tenants.length > 1 ? "Tenants" : "Tenant"}
          value={p.tenants.length ? p.tenants.map((t) => t.name).join(", ") : "Not on our record"}
        />
        <Fact label="Your agent" value={p.agent?.name ?? "—"} />
        <Fact label="Service" value={p.service ?? "Not set"} />
      </div>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-black/40">{label}</p>
      <p className="mt-0.5 text-[13px]">{value}</p>
    </div>
  );
}
