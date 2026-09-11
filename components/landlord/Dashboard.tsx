import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import AgentCard from "@/components/landlord/AgentCard";
import Spine from "@/components/landlord/Spine";
import { HeroAction, pickHero } from "@/components/landlord/StepAction";
import { fullJourney } from "@/lib/landlord-journey";
import type { LandlordView } from "@/lib/landlord-view";

/**
 * The landlord dashboard, to James's mock of 11 Sep 2026: light, airy,
 * minimal, with room around everything.
 *
 * Top: the greeting, and the agent top right. Then the property (top left)
 * beside the one next step, on a soft pink card. Then the journey - the
 * spine - across the middle, which decides what the rest of the page says.
 * Then documents, the snapshot, and what the portal becomes once the
 * property is let, on sage. The let step by step and the offers appear
 * between the spine and that row only once they exist.
 *
 * Nothing here is a button to nowhere: the next step signs through DocuSeal
 * or opens the message sheet, "Message" opens the same sheet, and the few
 * links scroll to a section on this page. Everything is derived from the
 * view; the sample and the live home feed the same shape.
 */

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
/* Sage, for things that are done and for what comes after the let. */
const SAGE_INK = "#56634a";
const SAGE_WASH = "#f1f4ec";

export default function LandlordDashboard({
  view: v,
  upload,
  managed,
}: {
  view: LandlordView;
  /** The upload control, from the page - the sample and the live home file to different places. */
  upload?: React.ReactNode;
  /** Properties we already look after, from the page. */
  managed?: React.ReactNode;
}) {
  /* The one next step: signing, when there is a contract to sign, because
     nothing else moves until it is done; otherwise the first in the stage's
     order. The rest are quiet links under it. */
  const hero = pickHero(v);
  const others = v.steps.filter((s) => s !== hero && s.href && !s.action);

  return (
    <div className="space-y-6">
      {/* ── greeting and the agent ── */}
      <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto]">
        {/* Just "Hello, Raj" - the "Good afternoon" above it read oddly (James, 11 Sep). */}
        <div className="pt-2">
          <h1 className="text-[44px] leading-[1.05]">{v.greeting}</h1>
          <p className="mt-3 max-w-xl text-[14.5px] text-muted">{v.intro}</p>
        </div>
        <AgentCard v={v} />
      </div>

      {/* ── the property, and the next step ── */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section id="property" className={`${card} p-5`} data-search>
          <div className="flex h-full flex-col gap-6 sm:flex-row">
            <div className="relative h-[200px] w-full shrink-0 overflow-hidden rounded-2xl bg-accent-soft/70 sm:h-auto sm:min-h-[210px] sm:w-[220px]">
              {v.property.image ? (
                <PropertyPhoto src={v.property.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <>
                  {/* No photograph until take-on, so the drawing stands in. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/illustrations/maintenance-house.webp" alt="" className="absolute inset-0 h-full w-full object-contain p-4" />
                  <span className="absolute bottom-3 left-3 rounded-full bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-muted">
                    Photos come at take-on
                  </span>
                </>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col py-1">
              <h2 className="text-[26px] leading-tight">{v.property.address}</h2>
              {v.property.facts.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px] text-muted">
                  <DoodleIcon name="home" size={14} />
                  {v.property.facts.map((f, i) => (
                    <span key={f} className="flex items-center gap-2.5">
                      {i > 0 && <span className="text-line">•</span>}
                      {f}
                    </span>
                  ))}
                </p>
              )}
              <div className="my-5 h-px bg-line/50" />
              <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
                <div>
                  <p className="text-[12px] text-muted">{v.property.rent.caption}</p>
                  <p className="figures mt-1 text-[30px] leading-none">
                    {v.property.rent.figure ?? "—"}
                    {v.property.rent.figure && <span className="text-[11.5px] font-normal text-muted"> {v.property.rent.unit}</span>}
                  </p>
                </div>
                {v.property.valuedOn && (
                  <div className="border-l border-line/60 pl-8">
                    <p className="text-[12px] text-muted">Valued on</p>
                    <p className="mt-1 text-[15px] font-semibold">{v.property.valuedOn}</p>
                  </div>
                )}
              </div>
              <a
                href="#snapshot"
                className="mt-6 inline-flex items-center gap-2 self-start rounded-full border border-line/70 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink/40 sm:mt-auto sm:self-end"
              >
                View property details <span aria-hidden>→</span>
              </a>
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[22px] bg-accent-soft/80 p-7" data-search>
          {/* The soft curves bottom right: the palette's clay and pink, low. */}
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -right-16 h-72 w-72 rounded-full bg-accent/15" />
          <span aria-hidden className="pointer-events-none absolute -bottom-36 right-24 h-72 w-72 rounded-full bg-white/40" />
          <p className={`${eyebrow} relative`}>Your next step</p>
          {hero ? (
            <div className="relative mt-5">
              <div className="flex items-start gap-5">
                <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-dark">
                  <DoodleIcon name={hero.icon} size={24} />
                </span>
                <div className="min-w-0">
                  <h2 className="text-[30px] leading-tight">{hero.label}</h2>
                  <p className="mt-2 max-w-md text-[14px] leading-relaxed text-muted">{hero.sub}</p>
                </div>
              </div>
              <div className="mt-7">
                <HeroAction s={hero} v={v} />
              </div>
              {others.length > 0 && (
                <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-muted">
                  <span>Also:</span>
                  {others.map((s) =>
                    s.external ? (
                      <a key={s.id} href={s.href!} target="_blank" rel="noreferrer" className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                        {s.label}
                      </a>
                    ) : (
                      <Link key={s.id} href={s.href!} className="font-semibold text-ink underline decoration-line underline-offset-4 hover:decoration-ink">
                        {s.label}
                      </Link>
                    )
                  )}
                </p>
              )}
            </div>
          ) : (
            <p className="relative mt-5 text-[14px] text-muted">Nothing needs you right now. We&rsquo;ll let you know when something does.</p>
          )}
        </section>
      </div>

      {/* ── the spine ── */}
      <section id="journey" className={`${card} p-6`} data-search>
        <h2 className="text-[18px]">Your letting journey</h2>
        <div className="mt-7">
          <Spine stops={fullJourney(v)} />
        </div>
      </section>

      {/* ── the let, step by step ──
          Kirstie's eight stages, derived the same way as her board and the
          tenant's home, in the landlord's words. Present only once a deal
          exists in Propoly. */}
      {v.progress && (
        <section className={`${card} p-6`} id="progress" data-search>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[18px]">Your let, step by step</h2>
            <span className="text-[11.5px] text-muted">
              {v.progress.tenants}
              {v.progress.moveIn ? `  •  moving in ${new Date(v.progress.moveIn).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}
              {v.progress.rentPcm != null ? `  •  £${Math.round(v.progress.rentPcm).toLocaleString("en-GB")} per month` : ""}
            </span>
          </div>
          <ol className="mt-5 flex gap-1 overflow-x-auto pb-2">
            {v.progress.stages.map((s, i) => (
              <li key={s.key} className="flex min-w-[96px] flex-1 flex-col">
                <div className="flex items-center">
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] ${
                      s.state === "done"
                        ? "border-accent-dark bg-accent-soft text-accent-dark"
                        : s.state === "current"
                          ? "border-accent-dark bg-accent-dark text-white"
                          : "border-line bg-white text-muted"
                    }`}
                  >
                    {s.state === "done" ? "✓" : i + 1}
                  </span>
                  {i < v.progress!.stages.length - 1 && <span aria-hidden className={`h-[1.5px] flex-1 ${s.state === "done" ? "bg-accent-dark/50" : "bg-line"}`} />}
                </div>
                <span className={`mt-2 pr-2 text-[11.5px] leading-tight ${s.state === "current" ? "font-semibold" : "text-muted"}`}>{s.label}</span>
              </li>
            ))}
          </ol>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl p-4" style={{ background: SAGE_WASH }}>
              <p className="text-[10.5px] font-semibold uppercase tracking-wide" style={{ color: SAGE_INK }}>Now</p>
              <p className="mt-1 text-[13px] leading-relaxed">{v.progress.now}</p>
            </div>
            <div className="rounded-2xl bg-accent-soft p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-accent-dark">What happens next</p>
              <p className="mt-1 text-[13px] leading-relaxed">{v.progress.next}</p>
            </div>
          </div>
        </section>
      )}

      {/* ── offers, once there are any ──
          Every application on the property, the accepted one first: the
          amount, who, when they want to move and what they asked for - the
          conversation the agent would otherwise have on the phone. */}
      {v.offers && v.offers.length > 0 && (
        <section className={`${card} p-6`} id="offers" data-search>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[18px]">Offers</h2>
            <span className="text-[11.5px] text-muted">
              {v.offers.length} on your property  •  your agent will talk you through them
            </span>
          </div>
          <ul className="mt-3 divide-y divide-line/60">
            {v.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3.5">
                <span className="w-36 shrink-0 text-[15px] font-semibold">{o.amount}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px]">
                    {o.applicants}
                    <span className="text-muted">  •  {o.who}</span>
                  </span>
                  <span className="block text-[11.5px] text-muted">
                    {o.moveIn ? `Wants to move in ${new Date(o.moveIn).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : "Move-in to be agreed"}
                    {o.received ? `  •  received ${new Date(o.received).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
                  </span>
                  {o.conditions && <span className="mt-1 block text-[12px]">Asked for: {o.conditions}</span>}
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    o.status === "unsuccessful" ? "bg-[#f3f3f1] text-muted line-through" : o.status === "with-you" ? "bg-accent-soft text-accent-dark" : "bg-[#f3f3f1] text-muted"
                  }`}
                  style={o.status === "accepted" ? { background: SAGE_WASH, color: SAGE_INK } : undefined}
                >
                  {o.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── documents, snapshot, and what comes after the let ──
          minmax(0,1fr) on a phone: a bare one-column grid sizes its track to
          the widest content (the upload picker), and the page scrolled
          sideways by 19px. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <section className={`${card} flex flex-col p-6`} id="documents" data-search>
          <h2 className="text-[18px]">Your documents</h2>
          <ul className="mt-4 divide-y divide-line/50">
            {v.documents.map((d) => (
              <li key={d.title} className="flex items-center gap-3 py-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/60 text-muted">
                  <DoodleIcon name={d.state === "uploaded" ? "shield" : "doc"} size={15} />
                </span>
                <span className="min-w-0 flex-1">
                  {d.href ? (
                    <a href={d.href} target="_blank" rel="noreferrer" className="block truncate text-[13.5px] font-semibold hover:underline">{d.title}</a>
                  ) : (
                    <span className="block truncate text-[13.5px] font-semibold">{d.title}</span>
                  )}
                  <span className={`block truncate text-[12px] ${d.state === "missing" ? "text-accent-dark" : "text-muted"}`}>{d.sub}</span>
                </span>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
                    d.state === "missing" ? "bg-accent-soft text-accent-dark" : d.state === "uploaded" ? "" : "bg-[#f3f3f1] text-muted"
                  }`}
                  style={d.state === "uploaded" ? { background: SAGE_WASH, color: SAGE_INK } : undefined}
                >
                  {d.state === "uploaded" ? "✓" : d.state === "missing" ? "!" : "…"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-4">{upload}</div>
        </section>

        <section className={`${card} p-6`} id="snapshot" data-search>
          <h2 className="flex items-center gap-2.5 text-[18px]">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name="home" size={14} />
            </span>
            Property snapshot
          </h2>
          <div className="mt-5 flex items-center gap-6">
            <div className="flex shrink-0 flex-col items-center">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Readiness</p>
              <Ring pct={v.snapshot.readinessPct} />
            </div>
            <dl className="min-w-0 flex-1 space-y-2.5 border-l border-line/50 pl-6">
              {v.snapshot.lines.map(([k, val]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-4 text-[12px] text-muted">{v.snapshot.note}</p>
        </section>

        {/* What the portal becomes once the property is let. Words about the
            future, on purpose: maintenance on the landlord's side is not
            built yet, so there is no button that pretends it is. */}
        <section
          id="maintenance"
          className="relative min-h-[260px] overflow-hidden rounded-[22px] p-6"
          style={{ background: SAGE_WASH }}
          data-search
        >
          <div className="relative z-[1] flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/80" style={{ color: SAGE_INK }}>
              <DoodleIcon name="setting" size={17} />
            </span>
            <h2 className="text-[18px] leading-snug">After your property is let</h2>
          </div>
          {/* Only the words beside the picture are narrowed, so the title
              keeps one line and nothing runs into the drawing. */}
          <div className="relative z-[1] max-w-[56%]">
            <p className="mt-3 text-[12.5px] leading-relaxed text-muted">This portal will also be your maintenance hub. You&rsquo;ll be able to:</p>
            <ul className="mt-3 space-y-2">
              {["Report maintenance requests", "Track ongoing works", "View certificates and compliance"].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[12.5px]">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/80 text-[10px] font-bold" style={{ color: SAGE_INK }}>
                    ✓
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/art/family-home.png" alt="" className="pointer-events-none absolute -bottom-2 -right-3 w-[40%] max-w-[200px]" />
        </section>
      </div>

      {managed}
    </div>
  );
}

/** The readiness ring, the figure inside it. */
function Ring({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mt-2 h-[100px] w-[100px]">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="var(--line)" strokeOpacity="0.45" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="var(--accent-dark)"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * c} ${c}`}
        />
      </svg>
      <p className="figures absolute inset-0 flex items-center justify-center text-[22px]">{p}%</p>
    </div>
  );
}
