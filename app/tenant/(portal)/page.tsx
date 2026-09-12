import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import Spine from "@/components/landlord/Spine";
import { currentTenant } from "@/lib/tenant-account";
import { loadTenantHome } from "@/lib/tenant-home-view";

/**
 * The tenant's home, to James's mock of 12 Sep 2026.
 *
 * Top: the greeting, and the agent top right. Then the property beside the
 * one next step on a soft pink card. Then the tenancy at a glance - the
 * spine. Then four tiles: rent and payments, documents, maintenance, recent
 * activity. Everything comes from the view (lib/tenant-home-view); where we
 * do not hold something yet, the tile says what it will show and when.
 *
 * ?welcome=1 is the first arrival from the passport: the greeting says
 * welcome, and the blocks rise in one after another.
 */

export const dynamic = "force-dynamic";

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const money = (n: number | null) => (n == null ? null : `£${Math.round(n).toLocaleString("en-GB")}`);
const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

export default async function TenantHome({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const me = (await currentTenant())!;
  const [v, sp] = await Promise.all([loadTenantHome(me), searchParams]);
  const welcome = sp.welcome === "1";
  const rise = (i: number) => (welcome ? { animation: "riseIn 520ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${100 + i * 110}ms` } : undefined);
  const d = v.deal;

  return (
    <div className="space-y-6">
      {/* ── greeting and the agent ── */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]" style={rise(0)}>
        <div className="pt-2">
          <p className={eyebrow}>{welcome ? "Welcome" : v.daypart}</p>
          <h1 className="mt-2 text-[44px] leading-[1.05]">{welcome ? `Welcome in, ${v.first}` : `Hello, ${v.first}`}</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-muted">
            {welcome ? "Your passport is made and your details are in. This is where your tenancy will live." : "We're glad you're here. Everything for your tenancy is on this page."}
          </p>
        </div>
        {v.agent && (
          <div className={`${card} flex flex-wrap items-center gap-4 px-5 py-4`} data-search>
            {v.agent.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.agent.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[24px] font-semibold text-accent-dark">{v.agent.name[0]}</span>
            )}
            <div className="min-w-0">
              <p className="text-[11.5px] text-muted">Your letting agent</p>
              <p className="text-[19px] font-bold leading-tight">{v.agent.name}</p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-muted">
                {v.agent.phone && (
                  <a href={`tel:${v.agent.phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 hover:text-ink"><DoodleIcon name="call" size={13} />{v.agent.phone}</a>
                )}
                {v.agent.email && (
                  <a href={`mailto:${v.agent.email}`} className="flex items-center gap-1.5 hover:text-ink"><DoodleIcon name="mail" size={13} />{v.agent.email}</a>
                )}
              </p>
            </div>
            {v.agent.email && (
              <a href={`mailto:${v.agent.email}`} className="flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white lg:ml-4">
                <DoodleIcon name="message" size={15} className="invert" />
                Message your agent
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── the property, and the one next step ── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${card} flex gap-5 p-4`} data-search style={rise(1)}>
          <PropertyPhoto src={null} alt="" className="h-[200px] w-[220px] shrink-0 rounded-[16px] object-cover" />
          <div className="min-w-0 flex-1 py-1">
            {d ? (
              <>
                <h2 className="text-[24px] font-bold leading-tight">{d.property}</h2>
                <p className="mt-1 text-[13px] text-muted">{d.locality}</p>
                <p className={`${eyebrow} mt-5`}>Your tenancy</p>
                <p className="mt-1 text-[15px]">
                  {d.moveIn ? `From ${longDate(d.moveIn)}` : "Start date to be confirmed"}
                  {money(d.rentPcm) ? ` · ${money(d.rentPcm)} a month` : ""}
                </p>
                {d.otherTenants.length > 0 && <p className="mt-1 text-[13px] text-muted">With {d.otherTenants.join(", ")}</p>}
                <Link href="/tenant/tenancy" className="mt-5 inline-flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[13px] font-semibold transition-colors hover:border-ink">
                  View property details <DoodleIcon name="trend-up" size={13} />
                </Link>
              </>
            ) : (
              <>
                <h2 className="text-[24px] font-bold leading-tight">Your next home goes here</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  You have not applied for a property with us yet. When you do, it appears here with your tenancy dates, your rent and everything about it.
                </p>
                <a href="https://thelettingexperts.co.uk" target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[13px] font-semibold transition-colors hover:border-ink">
                  See properties to rent <DoodleIcon name="trend-up" size={13} />
                </a>
              </>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] bg-accent-soft p-6 sm:p-7" data-search style={rise(2)}>
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent-dark/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-accent-dark/5" />
          <p className={eyebrow}>Your next step</p>
          <div className="mt-3 flex gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-dark">
              <DoodleIcon name="checklist" size={28} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[26px] font-bold leading-tight">{v.next.title}</h2>
              <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink/70">{v.next.blurb}</p>
            </div>
          </div>
          {v.next.href.startsWith("http") ? (
            <a href={v.next.href} target="_blank" rel="noreferrer" className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[14px] font-semibold text-white">
              {v.next.cta} <DoodleIcon name="trend-up" size={14} className="invert" />
            </a>
          ) : (
            <Link href={v.next.href} className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[14px] font-semibold text-white">
              {v.next.cta} <DoodleIcon name="trend-up" size={14} className="invert" />
            </Link>
          )}
        </div>
      </div>

      {/* ── the tenancy at a glance ── */}
      <div className={`${card} px-6 py-5`} data-search style={rise(3)}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[19px] font-bold">{d ? "Your tenancy at a glance" : "Your journey at a glance"}</h2>
          <Link href="/tenant/tenancy" className="rounded-full border border-line/80 px-4 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-ink">
            View full tenancy
          </Link>
        </div>
        <div className="mt-5">
          <Spine stops={v.stops} />
        </div>
      </div>

      {/* ── the four tiles ── */}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Tile icon="wallet" title="Rent & payments" href="/tenant/payments" action="View all" i={4} rise={rise}>
          {d && money(d.rentPcm) ? (
            <>
              <p className="text-[34px] font-bold leading-none">{money(d.rentPcm)} <span className="text-[14px] font-normal text-muted">/ month</span></p>
              <p className="mt-4 text-[13px] text-muted">First payment when your agreement is signed. Your standing order is set up then.</p>
            </>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">Your rent, what is due and when, once you have a tenancy with us.</p>
          )}
        </Tile>
        <Tile icon="doc" title="Documents" href="/tenant/documents" action="View all" i={5} rise={rise}>
          <ul className="space-y-2.5">
            <Doc label="Your tenant passport" sub={v.passport.done === v.passport.total ? "Complete" : `${v.passport.done} of ${v.passport.total} sections`} href={v.passport.path} ok={v.passport.done === v.passport.total} />
            <Doc label="How to rent guide" sub="From the government" href="https://www.gov.uk/government/publications/how-to-rent" ok />
            <Doc label="Tenancy agreement" sub={d ? "Sent for signing when it is drawn up" : "Once you have a tenancy"} href={null} ok={false} />
          </ul>
        </Tile>
        <Tile icon="setting" title="Maintenance" href="/tenant/maintenance" action={d ? "New request" : null} i={6} rise={rise}>
          <div className="text-center">
            <p className="text-[15px] font-semibold">Need something fixed?</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{d ? "Report a maintenance issue and we'll take care of it." : "Once you have moved in, report anything here and we'll take care of it."}</p>
            <Link href="/tenant/maintenance" className="mt-4 inline-flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink">
              Report a maintenance issue <DoodleIcon name="trend-up" size={12} />
            </Link>
          </div>
        </Tile>
        <Tile icon="clock" title="Recent activity" href="/tenant/messages" action="View all" i={7} rise={rise}>
          <ul className="space-y-3">
            {v.activity.map((a, k) => (
              <li key={k} className="flex gap-3">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.tone === "done" ? "bg-[#56634a]" : a.tone === "live" ? "bg-accent-dark" : "bg-line"}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium leading-snug">{a.label}</p>
                  {a.sub && <p className="text-[12px] text-muted">{a.sub}</p>}
                </div>
                {a.when && <span className="shrink-0 text-[11.5px] text-muted">{a.when}</span>}
              </li>
            ))}
            {!v.activity.length && <li className="text-[13px] text-muted">Nothing yet.</li>}
          </ul>
        </Tile>
      </div>
    </div>
  );
}

function Tile({ icon, title, href, action, i, rise, children }: { icon: string; title: string; href: string; action: string | null; i: number; rise: (i: number) => React.CSSProperties | undefined; children: React.ReactNode }) {
  return (
    <section className={`${card} flex flex-col p-5`} data-search style={rise(i)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[15px] font-bold">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={15} /></span>
          {title}
        </h3>
        {action && (
          <Link href={href} className="rounded-full border border-line/80 px-3 py-1 text-[12px] font-semibold transition-colors hover:border-ink">
            {action}
          </Link>
        )}
      </div>
      <div className="mt-5 flex-1">{children}</div>
    </section>
  );
}

function Doc({ label, sub, href, ok }: { label: string; sub: string; href: string | null; ok: boolean }) {
  const inner = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-panel text-muted"><DoodleIcon name="doc" size={15} /></span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{label}</span>
        <span className="block text-[11.5px] text-muted">{sub}</span>
      </span>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${ok ? "bg-[#f1f4ec] text-[#56634a]" : "bg-panel text-muted"}`}>{ok ? "✓" : "·"}</span>
    </>
  );
  return <li>{href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer" className="flex items-center gap-3 rounded-xl px-1 py-1 transition-colors hover:bg-panel">{inner}</a> : <div className="flex items-center gap-3 px-1 py-1">{inner}</div>}</li>;
}
