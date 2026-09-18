import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import Spine from "@/components/landlord/Spine";
import type { TenantHome, TenantProperty } from "@/lib/tenant-home-view";
import { locksFor, phaseOf } from "@/lib/tenant-journey";

/**
 * The tenant's home. Its shape follows where they are (lib/tenant-journey):
 *
 * FINDING - passport made, then an enquiry, a viewing, an offer. The world
 * is the home they are after: the property beside the one next step, the
 * road to a tenancy, what else is on the market, and a tile for the moment
 * (before you view, how was it, your offer). Nothing about rent, repairs or
 * agreements, because none of that exists yet and it would only crowd the
 * one thing that matters (James, 12 Sep 2026: "if they're at the stage of
 * looking for a property, then it should all be around property ... not
 * overwhelm them").
 *
 * TENANCY - the offer is accepted and the deal is running: the property,
 * the current stage as the next step, the eight-stop spine, then rent,
 * documents, maintenance (waiting for the keys) and activity.
 *
 * LIVING - moved in: the home, nothing needed unless something needs
 * fixing, and the same four tiles with maintenance open.
 *
 * Everything comes from the view (lib/tenant-home-view, or the sample);
 * where we do not hold something yet, the tile says what it will show and
 * when. ?welcome=1 is the first arrival from the passport: the greeting says
 * welcome, and the blocks rise in one after another. The sample rises in on
 * every stage switch for the same reason.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const pill = "inline-flex items-center gap-2 rounded-full border border-line/80 px-4 py-2 text-[13px] font-semibold transition-colors hover:border-ink";
const money = (n: number | null) => (n == null ? null : `£${Math.round(n).toLocaleString("en-GB")}`);
const longDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);
const dayTime = (iso: string) => {
  const d = new Date(iso);
  const day = d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
  const t = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true }).replace(" ", "").toLowerCase();
  return `${day}, ${t}`;
};

export default function HomeView({ v, welcome, base, q = "", sample = false }: { v: TenantHome; welcome: boolean; base: string; q?: string; sample?: boolean }) {
  const to = (path: string) => `${base}${path}${q}`;
  /* A view-relative href: "/tenant/x" becomes the sample's or the real
     portal's own page; anchors and outside links pass through. */
  const href = (h: string) => (h.startsWith("/tenant/") ? to(h.slice("/tenant".length)) : h);
  const animate = welcome || sample;
  const rise = (i: number) => (animate ? { animation: "riseIn 520ms cubic-bezier(0.22,1,0.36,1) both", animationDelay: `${100 + i * 110}ms` } : undefined);
  const d = v.deal;
  const phase = phaseOf(v.stage);
  const locks = locksFor(v.stage);
  const first = v.agent?.name.split(/\s+/)[0] ?? "your agent";
  const home = d ? { property: d.property, locality: d.locality, rentPcm: d.rentPcm, beds: v.enquiry?.beds ?? null, photo: v.enquiry?.photo ?? null, href: v.enquiry?.href ?? null } : v.enquiry;

  const lead = welcome
    ? "Your passport is made and your details are in. This is where your tenancy will live."
    : phase === "finding"
      ? v.enquiry
        ? `Everything about ${v.enquiry.property} is on this page, and ${first} is a message away.`
        : "Your passport is ready. This page fills in around the home you find."
      : phase === "living"
        ? "Everything for your home is on this page."
        : "We're glad you're here. Everything for your tenancy is on this page.";

  return (
    <div className="space-y-6">
      {/* ── greeting and the agent ── */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]" style={rise(0)}>
        <div className="pt-2">
          <p className={eyebrow}>{welcome ? "Welcome" : v.daypart}</p>
          <h1 className="mt-2 text-[44px] leading-[1.05]">{welcome ? `Welcome in, ${v.first}` : `Hello, ${v.first}`}</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-muted">{lead}</p>
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
                Message {first}
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── the property, and the one next step ── */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={`${card} flex flex-col gap-4 p-4 sm:flex-row sm:gap-5`} data-search style={rise(1)}>
          {/* On a phone the photo goes across the top; the text beside it was
              a column of single words. */}
          <PropertyPhoto src={home?.photo ?? null} alt="" className="h-[180px] w-full shrink-0 rounded-[16px] object-cover sm:h-[200px] sm:w-[220px]" />
          <div className="min-w-0 flex-1 py-1">
            {home ? (
              <>
                <p className={eyebrow}>{phase === "living" ? "Your home" : phase === "tenancy" ? "Your tenancy" : v.stage === "declined" ? "Not this one" : v.offer ? "Your offer is in" : v.viewing ? (v.viewing.status === "done" ? "You viewed it" : "Your viewing") : "You asked about"}</p>
                <h2 className="mt-1 text-[24px] font-bold leading-tight">{home.property}</h2>
                <p className="mt-1 text-[13px] text-muted">{home.locality}</p>
                <p className="mt-4 text-[15px]">
                  {d ? (
                    <>
                      {phase === "living" ? `Since ${longDate(d.moveIn)}` : d.moveIn ? `From ${longDate(d.moveIn)}` : "Start date to be confirmed"}
                      {money(d.rentPcm) ? ` · ${money(d.rentPcm)} a month` : ""}
                    </>
                  ) : (
                    <>
                      {money(home.rentPcm) ? `${money(home.rentPcm)} a month` : ""}
                      {home.beds ? ` · ${home.beds} bed` : ""}
                    </>
                  )}
                </p>
                {d && d.otherTenants.length > 0 && <p className="mt-1 text-[13px] text-muted">With {d.otherTenants.join(", ")}</p>}
                {!d && v.viewing && (
                  <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted"><DoodleIcon name="calendar" size={13} />{v.viewing.status === "done" ? "Viewed" : "Viewing"} {dayTime(v.viewing.when)}</p>
                )}
                {!d && !v.viewing && v.enquiry?.enquiredOn && <p className="mt-1 text-[13px] text-muted">Enquired {longDate(v.enquiry.enquiredOn)}</p>}
                {d ? (
                  <Link href={to("/tenancy")} className={`${pill} mt-5`}>
                    {phase === "living" ? "About your home" : "View property details"} <DoodleIcon name="trend-up" size={13} />
                  </Link>
                ) : home.href ? (
                  <Link href={href(home.href)} className={`${pill} mt-5`}>
                    See the home <DoodleIcon name="trend-up" size={13} />
                  </Link>
                ) : null}
              </>
            ) : (
              <>
                <h2 className="text-[24px] font-bold leading-tight">Your next home goes here</h2>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted">
                  When you ask about a property with us, it appears here with your viewing, your offer and then your tenancy.
                </p>
                <Link href={to("/homes")} className={`${pill} mt-5`}>
                  See properties to rent <DoodleIcon name="trend-up" size={13} />
                </Link>
              </>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-[22px] bg-accent-soft p-6 sm:p-7" data-search style={rise(2)}>
          <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent-dark/10" />
          <div aria-hidden className="pointer-events-none absolute -bottom-32 right-24 h-64 w-64 rounded-full bg-accent-dark/5" />
          <p className={eyebrow}>{phase === "living" ? "Right now" : "Your next step"}</p>
          <div className="mt-3 flex gap-5">
            <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-dark">
              <DoodleIcon name={nextIcon(v)} size={28} />
            </span>
            <div className="min-w-0">
              <h2 className="text-[26px] font-bold leading-tight">{v.next.title}</h2>
              <p className="mt-2 max-w-md text-[14.5px] leading-relaxed text-ink/70">{v.next.blurb}</p>
            </div>
          </div>
          <div className="relative mt-6 flex flex-wrap items-center gap-x-5 gap-y-3">
            {v.next.href.startsWith("http") ? (
              <a href={v.next.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[14px] font-semibold text-white">
                {v.next.cta} <DoodleIcon name="trend-up" size={14} className="invert" />
              </a>
            ) : v.next.href.startsWith("#") ? (
              <a href={v.next.href} className="inline-flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[14px] font-semibold text-white">
                {v.next.cta} <DoodleIcon name="trend-up" size={14} className="invert" />
              </a>
            ) : (
              <Link href={href(v.next.href)} className="inline-flex items-center gap-2 rounded-full bg-accent-dark px-6 py-3 text-[14px] font-semibold text-white">
                {v.next.cta} <DoodleIcon name="trend-up" size={14} className="invert" />
              </Link>
            )}
            <Also v={v} first={first} homes={to("/homes")} />
          </div>
        </div>
      </div>

      {/* ── the journey at a glance ── */}
      <div className={`${card} px-6 py-5`} data-search style={rise(3)}>
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-[19px] font-bold">{d ? "Your tenancy at a glance" : "Your journey at a glance"}</h2>
          {d && !locks.tenancy && (
            <Link href={to("/tenancy")} className="rounded-full border border-line/80 px-4 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-ink">
              View full tenancy
            </Link>
          )}
        </div>
        <div className="mt-5">
          <Spine stops={v.stops} />
        </div>
      </div>

      {/* ── what else is on, while they are looking ── */}
      {phase === "finding" && v.stage !== "offer" && v.market.length > 0 && (
        <section id="market" className="scroll-mt-6" style={rise(4)}>
          <div className="flex items-end justify-between gap-4 px-1">
            <div>
              <h2 className="text-[19px] font-bold">{v.enquiry ? "Also on the market" : "On the market now"}</h2>
              <p className="mt-0.5 text-[13px] text-muted">{v.enquiry ? "More homes near you." : "Homes near you. Ask about any of them and it appears above."}</p>
            </div>
            <Link href={to("/homes")} className="shrink-0 rounded-full border border-line/80 px-4 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-ink">
              See them all
            </Link>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {v.market.map((m) => (
              <MarketCard key={m.property} m={m} href={m.href ? href(m.href) : to("/homes")} />
            ))}
          </div>
        </section>
      )}

      {/* ── the tiles ── */}
      <div className={`grid gap-4 md:grid-cols-2 ${phase === "finding" ? "xl:grid-cols-3" : "xl:grid-cols-4"}`}>
        {phase === "finding" ? (
          <MomentTile v={v} first={first} href={href} i={5} rise={rise} />
        ) : (
          <Tile icon="wallet" title="Rent" href={to("/payments")} action={locks.payments ? null : "View all"} i={4} rise={rise}>
            {d && money(d.rentPcm) ? (
              <>
                <p className="text-[34px] font-bold leading-none">{money(d.rentPcm)} <span className="text-[14px] font-normal text-muted">/ month</span></p>
                <p className="mt-4 text-[13px] text-muted">
                  {phase === "living" ? "Goes out on the 1st by standing order. Next: 1 November." : "First payment when your agreement is signed. Your standing order is set up then."}
                </p>
              </>
            ) : (
              <p className="text-[13px] leading-relaxed text-muted">Your rent, what is due and when, once you have a tenancy with us.</p>
            )}
          </Tile>
        )}
        <Tile icon="doc" title="Documents" href={to("/documents")} action="View all" i={5} rise={rise}>
          <ul className="space-y-2.5">
            <Doc label="Your tenant passport" sub={v.passport.done === v.passport.total ? "Complete" : `${v.passport.done} of ${v.passport.total} sections`} href={v.passport.path} ok={v.passport.done === v.passport.total} />
            <Doc label="How to rent guide" sub="From the government" href="https://www.gov.uk/government/publications/how-to-rent" ok />
            {phase === "finding" ? (
              <Doc label="Your right to rent" sub="Checked from your passport" href={null} ok={Boolean(v.passport.data?.hasBritishPassport)} />
            ) : (
              <Doc label="Tenancy agreement" sub={phase === "living" ? "Signed" : v.stage === "rent_payment" || v.stage === "move_day" ? "Signed" : "Sent for signing when it is drawn up"} href={null} ok={phase === "living" || v.stage === "rent_payment" || v.stage === "move_day"} />
            )}
          </ul>
        </Tile>
        {phase !== "finding" && (
          <Tile icon="setting" title="Maintenance" href={to("/maintenance")} action={locks.maintenance ? null : "Report"} i={6} rise={rise}>
            <div className="text-center">
              {locks.maintenance ? (
                <>
                  <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-panel text-muted"><DoodleIcon name="lock" size={16} /></span>
                  <p className="mt-3 text-[15px] font-semibold">Opens on move-in day</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Once you have the keys, report anything here and we&apos;ll take care of it.</p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-semibold">Need something fixed?</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-muted">Report a maintenance issue and we&apos;ll take care of it.</p>
                  <Link href={to("/maintenance")} className={`${pill} mt-4 text-[12.5px]`}>
                    Report a maintenance issue <DoodleIcon name="trend-up" size={12} />
                  </Link>
                </>
              )}
            </div>
          </Tile>
        )}
        <Tile icon="clock" title="Recent activity" href={to("/messages")} action="View all" i={7} rise={rise}>
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

/** The icon on the next-step card, for the moment. */
function nextIcon(v: TenantHome): string {
  switch (v.stage) {
    case "passport": return "search";
    case "enquired": return "calendar";
    case "viewing": return "calendar";
    case "viewed": return "star";
    case "offer": return "key";
    case "tenancy_agreement": return "pencil";
    case "move_day": return "key";
    case "living": return "home";
    default: return "checklist";
  }
}

/** The quiet second link beside the next step: the other thing they might
 *  want at this moment. */
function Also({ v, first, homes }: { v: TenantHome; first: string; homes: string }) {
  const mail = v.agent?.email ? `mailto:${v.agent.email}` : null;
  const link = (text: string, h: string, blank = false) => (
    <a href={h} target={blank ? "_blank" : undefined} rel={blank ? "noreferrer" : undefined} className="text-[13px] font-semibold text-ink/70 underline decoration-ink/30 underline-offset-4 hover:text-ink">
      {text}
    </a>
  );
  switch (v.stage) {
    case "enquired": return link("See other homes", homes);
    case "viewing": return mail ? link("Can't make it?", `${mail}?subject=My viewing`) : null;
    case "viewed": return link("Not for you? See what else is on", homes);
    case "offer": return mail ? link(`Message ${first}`, mail) : null;
    case "referencing": return mail ? link("Been asked for something?", mail) : null;
    default: return null;
  }
}

/** A home on the market: photo, address, rent, beds. Opens on Find a home. */
function MarketCard({ m, href }: { m: TenantProperty; href: string }) {
  return (
    <Link href={href} className={`${card} block p-3 transition-colors hover:border-ink/40`} data-search>
      <PropertyPhoto src={m.photo} alt="" className="h-[150px] w-full rounded-[14px] object-cover" />
      <div className="px-1 pb-1 pt-3">
        <p className="text-[15px] font-bold leading-tight">{m.property}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{m.locality}</p>
        <p className="mt-2 text-[13.5px]">
          {money(m.rentPcm) ? <span className="font-semibold">{money(m.rentPcm)} a month</span> : null}
          {m.beds ? <span className="text-muted"> · {m.beds} bed</span> : null}
        </p>
      </div>
    </Link>
  );
}

/** The tile for the moment, in the finding phase: how it works, before you
 *  view, how was it, your offer. */
function MomentTile({ v, first, href, i, rise }: { v: TenantHome; first: string; href: (h: string) => string; i: number; rise: (i: number) => React.CSSProperties | undefined }) {
  const mail = v.agent?.email ?? "";
  switch (v.stage) {
    case "passport":
      return (
        <Tile icon="key" title="How it works" href={href("/tenant/homes")} action={null} i={i} rise={rise}>
          <Steps items={[
            ["Ask about a home", "From Find a home here, or by messaging " + first + "."],
            ["View it", "Pick a time that suits you. " + first + " meets you there."],
            ["Make your offer", "One tap. Your passport is your application."],
            ["Move in", "Referencing, agreement, keys. We walk you through each."],
          ]} />
        </Tile>
      );
    case "enquired":
      return (
        <Tile icon="calendar" title="Before you view" href={href("/tenant/next")} action={null} i={i} rise={rise}>
          <Steps items={[
            ["Pick a time", "Viewings take about twenty minutes."],
            ["Bring some ID", "A passport or driving licence."],
            ["Write down your questions", first.charAt(0).toUpperCase() + first.slice(1) + " will know the property and the landlord."],
          ]} />
        </Tile>
      );
    case "viewing":
      return (
        <Tile icon="calendar" title="Your viewing" href={mail ? `mailto:${mail}?subject=My viewing` : "#"} action="Change it" i={i} rise={rise}>
          {v.viewing && (
            <>
              <p className="text-[20px] font-bold leading-tight">{dayTime(v.viewing.when)}</p>
              <p className="mt-1 text-[13px] text-muted">With {v.viewing.withName} at the property. About twenty minutes.</p>
            </>
          )}
          <div className="mt-4">
            <Steps items={[
              ["Bring some ID", "A passport or driving licence."],
              ["Ask anything", "Bills, the landlord, the neighbours, the boiler."],
            ]} />
          </div>
        </Tile>
      );
    case "viewed":
      return (
        <Tile icon="star" title="How was it?" href={href("/tenant/next")} action={null} i={i} rise={rise}>
          <p className="text-[13px] leading-relaxed text-muted">Tell {first} what you thought. It helps even if it is not the one.</p>
          <div className="mt-4 grid gap-2">
            <Link href={href("/tenant/next")} className="flex items-center justify-between rounded-xl border border-accent-dark bg-accent-dark px-4 py-2.5 text-[13px] font-semibold text-white">
              It&apos;s the one, make an offer <DoodleIcon name="trend-up" size={13} className="invert" />
            </Link>
            <a href={mail ? `mailto:${mail}?subject=8 Recreation Terrace: some thoughts` : "#"} className="flex items-center justify-between rounded-xl border border-line/80 px-4 py-2.5 text-[13px] font-semibold transition-colors hover:border-ink">
              I liked it, but I have questions <DoodleIcon name="message" size={13} />
            </a>
            <a href={mail ? `mailto:${mail}?subject=8 Recreation Terrace: not for me` : "#"} className="flex items-center justify-between rounded-xl border border-line/80 px-4 py-2.5 text-[13px] font-semibold transition-colors hover:border-ink">
              Not for me <DoodleIcon name="cross" size={12} />
            </a>
          </div>
        </Tile>
      );
    case "offer":
      return (
        <Tile icon="key" title="Your offer" href={href("/tenant/next")} action={null} i={i} rise={rise}>
          {v.offer && (
            <>
              <p className="text-[34px] font-bold leading-none">{money(v.offer.amount)} <span className="text-[14px] font-normal text-muted">/ month</span></p>
              <p className="mt-2 text-[13px] text-muted">Made {longDate(v.offer.madeOn)} · with the landlord</p>
            </>
          )}
          <div className="mt-4">
            <Steps items={[
              ["The landlord decides", "Usually within a day. We tell you either way."],
              ["Holding fee", "One week's rent takes it off the market."],
              ["Referencing starts", "Your passport has most of it already."],
            ]} />
          </div>
        </Tile>
      );
    default:
      return null;
  }
}

function Steps({ items }: { items: [string, string][] }) {
  return (
    <ol className="space-y-2.5">
      {items.map(([t, s], k) => (
        <li key={t} className="flex gap-3">
          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-dark">{k + 1}</span>
          <div className="min-w-0">
            <p className="text-[13px] font-medium leading-snug">{t}</p>
            <p className="text-[12px] leading-snug text-muted">{s}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Tile({ icon, title, href, action, i, rise, children }: { icon: string; title: string; href: string; action: string | null; i: number; rise: (i: number) => React.CSSProperties | undefined; children: React.ReactNode }) {
  return (
    <section className={`${card} flex flex-col p-5`} data-search style={rise(i)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex min-w-0 items-center gap-2.5 text-[15px] font-bold">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name={icon} size={15} /></span>
          <span className="truncate">{title}</span>
        </h3>
        {action && (
          <Link href={href} className="shrink-0 whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[12px] font-semibold transition-colors hover:border-ink">
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
