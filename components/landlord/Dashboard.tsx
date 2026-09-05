import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyHero from "@/components/landlord/PropertyHero";
import SignTile from "@/components/landlord/SignTile";
import MessageTile from "@/components/landlord/MessageTile";
import type { LandlordView, ViewStep } from "@/lib/landlord-view";

/**
 * The landlord dashboard, to James's reference of 2 Sep.
 *
 * Top: the greeting, and the agent top right. Then the property beside the
 * next steps. Then the journey - the spine - across the middle, which is the
 * thing that decides what the rest of the page says. Then documents, the
 * snapshot and recent activity. Everything is derived from the view; the
 * sample and the live home feed the same shape.
 */

const panel = "rounded-[20px] border border-line/70 bg-panel p-5";
const label = "text-[10.5px] font-semibold uppercase tracking-wide text-muted";

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
  const first = v.greeting;
  const agentFirst = v.agent?.name.split(/\s+/)[0] ?? "your agent";

  return (
    <div className="space-y-4">
      {/* ── greeting and the agent ── */}
      <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
        <div className="px-1 pt-1">
          <h1 className="text-[36px] leading-none">{first}</h1>
          <p className="mt-2 text-[13.5px] text-muted">{v.intro}</p>
        </div>
        {v.agent && (
          <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-line/70 bg-panel px-4 py-3 lg:self-start" data-search>
            {v.agent.photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={v.agent.photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
            ) : (
              <span className="hand flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[20px] text-accent-dark">
                {v.agent.name[0]}
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="whitespace-nowrap text-[13.5px] leading-tight">
                <span className="text-muted">Your letting agent</span>{" "}
                <span className="font-semibold">{v.agent.name}</span>
              </p>
              <p className="mt-0.5 truncate text-[10.5px] text-muted">
                {[v.agent.email, v.agent.phone].filter(Boolean).join("  •  ")}
              </p>
            </div>
            {v.agent.email && (
              <a
                href={`mailto:${v.agent.email}?subject=${encodeURIComponent(`About ${v.property.address}`)}`}
                className="inline-flex shrink-0 items-center gap-2 rounded-full border border-line/70 px-3.5 py-1.5 text-[12px] font-semibold transition-colors hover:border-ink/40"
              >
                Message {agentFirst}
                <DoodleIcon name="message" size={12} />
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── the property, and the next steps ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.55fr)]">
        <section className={`${panel} flex min-w-0 flex-col`} data-search>
          {/* The address keeps at least 60% of the row, so on a phone the
              drawing drops beneath it rather than squeezing it into one word
              a line. */}
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-[60%] flex-1">
              <span className="inline-block rounded-full bg-accent-soft px-3 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-accent-dark">
                {v.property.state}
              </span>
              <h2 className="mt-3 text-[28px] leading-tight">{v.property.address}</h2>
              {v.property.facts.length > 0 && (
                <p className="mt-2.5 flex flex-wrap items-center gap-x-2 text-[12.5px] text-muted">
                  <DoodleIcon name="home" size={14} />
                  {v.property.facts.map((f, i) => (
                    <span key={f} className="flex items-center gap-2">
                      {i > 0 && <span className="text-line">•</span>}
                      {f}
                    </span>
                  ))}
                </p>
              )}
            </div>
            <div className="flex h-[128px] w-[128px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent-soft/60">
              <PropertyHero image={v.property.image} lat={v.property.lat} lng={v.property.lng} className="h-full w-full object-cover" />
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-end gap-x-8 gap-y-4">
            <div>
              <p className={label}>{v.property.rent.caption}</p>
              <p className="figures mt-1 text-[28px] leading-none">
                {v.property.rent.figure ?? "—"}
                {v.property.rent.figure && <span className="text-[11px] font-normal text-muted"> {v.property.rent.unit}</span>}
              </p>
            </div>
            {v.property.valuedOn && (
              <div className="border-l border-line/60 pl-8">
                <p className={label}>Valued on</p>
                <p className="mt-1 text-[15px] font-semibold">{v.property.valuedOn}</p>
              </div>
            )}
            <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-line/70 px-4 py-2 text-[12.5px] font-semibold text-muted">
              View property details <span className="text-[11px]">›</span>
            </span>
          </div>
        </section>

        <section className="rounded-[20px] border border-line/70 bg-panel p-5" data-search>
          <h2 className="text-[17px]">Next steps</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
            {v.steps.map((s) =>
              s.action === "sign" && v.appraisalId ? (
                <SignTile key={s.id} appraisalId={v.appraisalId} label={s.label} sub={s.sub} icon={s.icon} />
              ) : s.action === "message" ? (
                <MessageTile
                  key={s.id}
                  appraisalId={v.appraisalId ?? null}
                  agentName={v.agent?.name ?? null}
                  messages={v.messages ?? []}
                  label={s.label}
                  sub={s.sub}
                  icon={s.icon}
                />
              ) : (
                <StepTile key={s.id} s={s} />
              )
            )}
          </div>
        </section>
      </div>

      {/* ── the spine ── */}
      <section className={panel} data-search>
        <h2 className="text-[17px]">Your letting journey</h2>
        <ol className="mt-6 grid grid-cols-3 gap-y-6 sm:grid-cols-6">
          {v.journey.map((s, i) => {
            const prevDone = i > 0 && v.journey[i - 1].state === "done";
            return (
              <li key={s.id} className="relative flex flex-col items-center text-center">
                {/* The line into this stop. None into the first, and none
                    into the first of the second row on a phone, where three
                    stops sit per row and a line would run in from nowhere. */}
                {i > 0 && (
                  <span
                    className={`absolute left-[-50%] right-[50%] top-[13px] ${i === 3 ? "hidden sm:block" : ""} ${
                      prevDone && s.state !== "upcoming" ? "h-0.5 bg-accent-dark" : "h-0 border-t-2 border-dashed border-line"
                    }`}
                  />
                )}
                <span
                  className={`relative z-[1] flex h-7 w-7 items-center justify-center rounded-full ${
                    s.state === "done"
                      ? "bg-accent-dark text-white"
                      : s.state === "current"
                        ? "border-[3px] border-accent-dark bg-panel"
                        : "border-2 border-dashed border-line bg-panel"
                  }`}
                >
                  {s.state === "done" && <DoodleIcon name="checklist" size={12} className="text-white" />}
                  {s.state === "current" && <span className="h-2.5 w-2.5 rounded-full bg-accent-dark" />}
                </span>
                <p className={`mt-2.5 text-[12px] ${s.state === "upcoming" ? "text-muted" : "font-semibold"}`}>{s.label}</p>
                <p className="text-[11px] text-muted">{s.sub}</p>
              </li>
            );
          })}
        </ol>
      </section>

      {/* ── the let, step by step ──
          Kirstie's eight stages, derived the same way as her board and the
          tenant's home, in the landlord's words. Present only once a deal
          exists in Propoly. */}
      {v.progress && (
        <section className={panel} id="progress" data-search>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-[17px]">Your let, step by step</h2>
            <span className="text-[11.5px] text-muted">
              {v.progress.tenants}
              {v.progress.moveIn ? `  •  moving in ${new Date(v.progress.moveIn).toLocaleDateString("en-GB", { day: "numeric", month: "long" })}` : ""}
              {v.progress.rentPcm != null ? `  •  £${Math.round(v.progress.rentPcm).toLocaleString("en-GB")} per month` : ""}
            </span>
          </div>
          <ol className="mt-4 flex gap-1 overflow-x-auto pb-2">
            {v.progress.stages.map((s, i) => (
              <li key={s.key} className="flex min-w-[96px] flex-1 flex-col">
                <div className="flex items-center">
                  <span
                    className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] ${
                      s.state === "done"
                        ? "border-accent-dark bg-accent-soft text-accent-dark"
                        : s.state === "current"
                          ? "border-accent-dark bg-accent-dark text-white"
                          : "border-line bg-panel text-muted"
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
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl bg-box p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Now</p>
              <p className="mt-1 text-[13px] leading-relaxed">{v.progress.now}</p>
            </div>
            <div className="rounded-xl bg-accent-soft p-4">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-accent-dark">What happens next</p>
              <p className="mt-1 text-[13px] leading-relaxed">{v.progress.next}</p>
            </div>
          </div>
        </section>
      )}

      {/* ── offers, once there are any ──
          Every application on the property, the accepted one first. The
          landlord reads the amount, who, when they want to move and what they
          asked for - which is the conversation the agent would otherwise have
          on the phone, with nothing to look back at. */}
      {v.offers && v.offers.length > 0 && (
        <section className={panel} id="offers" data-search>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[17px]">Offers</h2>
            <span className="text-[11.5px] text-muted">
              {v.offers.length} on your property  •  your agent will talk you through them
            </span>
          </div>
          <ul className="mt-3 divide-y divide-line/60">
            {v.offers.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 py-3">
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
                    o.status === "accepted"
                      ? "bg-[#e8f5ec] text-[#1e7a3c]"
                      : o.status === "with-you"
                        ? "bg-[#fff1e6] text-[#b4610d]"
                        : o.status === "unsuccessful"
                          ? "bg-[#f3f3f1] text-muted line-through"
                          : "bg-[#f3f3f1] text-muted"
                  }`}
                >
                  {o.statusLabel}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── documents, snapshot, activity ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${panel} flex flex-col`} id="documents" data-search>
          <h2 className="text-[17px]">Documents</h2>
          <ul className="mt-3 space-y-2.5">
            {v.documents.map((d) => (
              <li key={d.title} className="flex items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-line/60 bg-white text-muted">
                  <DoodleIcon name={d.state === "uploaded" ? "shield" : "doc"} size={13} />
                </span>
                <span className="min-w-0 flex-1">
                  {d.href ? (
                    <a href={d.href} target="_blank" rel="noreferrer" className="block truncate text-[13px] font-semibold hover:underline">{d.title}</a>
                  ) : (
                    <span className="block truncate text-[13px] font-semibold">{d.title}</span>
                  )}
                  <span className="block truncate text-[11.5px] text-muted">{d.sub}</span>
                </span>
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] ${
                    d.state === "uploaded" ? "bg-[#e8f5ec] text-[#1e7a3c]" : d.state === "missing" ? "bg-[#fff1e6] text-[#b4610d]" : "bg-[#f3f3f1] text-muted"
                  }`}
                >
                  {d.state === "uploaded" ? "✓" : d.state === "missing" ? "!" : "…"}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-auto pt-4">{upload}</div>
        </section>

        <section className={panel} data-search>
          <h2 className="text-[17px]">Property snapshot</h2>
          <div className="mt-3 flex items-center gap-6">
            <div className="flex shrink-0 flex-col items-center">
              <p className={label}>Readiness</p>
              <Ring pct={v.snapshot.readinessPct} />
            </div>
            <dl className="min-w-0 flex-1 space-y-2">
              {v.snapshot.lines.map(([k, val]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <dt className="text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="mt-3 text-[12px] text-muted">{v.snapshot.note}</p>
        </section>

        <section className={panel} data-search>
          <h2 className="text-[17px]">Recent activity</h2>
          {v.activity.length ? (
            <ol className="mt-3 space-y-3">
              {v.activity.map((a, i) => (
                <li key={`${a.title}-${i}`} className="relative flex gap-3">
                  {i < v.activity.length - 1 && <span className="absolute left-[15px] top-8 h-[calc(100%-8px)] w-px bg-line/60" />}
                  <span className="relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                    <DoodleIcon name={a.icon} size={13} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{a.title}</span>
                    <span className="block text-[11.5px] text-muted">{a.sub}</span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{a.date}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-4 text-[12.5px] text-muted">Nothing yet. What happens on the property shows up here.</p>
          )}
        </section>
      </div>

      {managed}
    </div>
  );
}

function StepTile({ s }: { s: ViewStep }) {
  const cls = `flex flex-col items-center rounded-2xl border border-line/60 bg-white px-3 py-4 text-center transition-colors ${
    s.href ? "hover:border-ink/40" : "opacity-50"
  }`;
  const inner = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
        <DoodleIcon name={s.icon} size={18} />
      </span>
      <span className="mt-3 text-[13px] font-semibold leading-tight">{s.label}</span>
      <span className="mt-1 text-[11.5px] leading-snug text-muted">{s.sub}</span>
      <span className="mt-2.5 text-[13px] text-muted">›</span>
    </>
  );
  if (!s.href) return <div className={cls}>{inner}</div>;
  return s.external ? (
    <a href={s.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
  ) : (
    <Link href={s.href} className={cls}>{inner}</Link>
  );
}

/** The readiness ring, the figure inside it. */
function Ring({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 40;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mt-1.5 h-[96px] w-[96px]">
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
