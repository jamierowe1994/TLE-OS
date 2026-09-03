import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PropertyHero from "@/components/landlord/PropertyHero";
import PropertyMap from "@/components/landlord/PropertyMap";
import AskAgent from "@/components/landlord/AskAgent";
import type { LandlordView, ViewAction } from "@/lib/landlord-view";

/**
 * The landlord dashboard. See lib/landlord-view.ts for the shape and the
 * reference it was drawn from, and for why it got simpler.
 *
 * ── The rows line up ─────────────────────────────────────────────────────
 *
 * Two grid rows. The property panel on the right spans both; the map and
 * the agent fill row one and stretch to the same height; the three tiles
 * and the presentation sit in row two. So every horizontal edge meets its
 * neighbour, which the first version's free-stacking columns never did.
 */
export default function LandlordDashboard({
  view: v,
  documents,
}: {
  view: LandlordView;
  /** The upload, from the page - the sample and the live home file to different places. */
  documents?: React.ReactNode;
}) {
  const left = v.needs.filter((n) => !n.done);
  const done = v.needs.length - left.length;

  return (
    <>
      {/* ── the one next step ── */}
      <div className="flex flex-wrap items-center gap-4 rounded-[20px] bg-ink px-5 py-4 text-white" data-search>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10">
          <DoodleIcon name="rocket" size={16} className="text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-white/60">Next</p>
          <p className="text-[15px] font-semibold leading-tight">{v.next.label}</p>
          {v.next.hint && <p className="text-[12px] text-white/60">{v.next.hint}</p>}
        </div>
        {v.next.href ? (
          v.next.external ? (
            <a href={v.next.href} target="_blank" rel="noreferrer" className="rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-ink">
              Open
            </a>
          ) : (
            <Link href={v.next.href} className="rounded-full bg-white px-4 py-2 text-[12.5px] font-semibold text-ink">
              Open
            </Link>
          )
        ) : (
          <span className="text-[12px] text-white/60">Nothing to press yet</span>
        )}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr_1.35fr] lg:grid-rows-[minmax(0,1fr)_auto]">
        {/* ── row 1, left: the map ── */}
        <section className="flex min-w-0 flex-col rounded-[20px] bg-white p-4" data-search>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold">Location</p>
            <DoodleIcon name="search" size={15} className="text-muted" />
          </div>
          <div className="mt-3 min-h-[260px] flex-1">
            <PropertyMap lat={v.property.lat} lng={v.property.lng} address={v.property.address} postcode={v.property.postcode} line={v.property.subtitle} />
          </div>
        </section>

        {/* ── row 1, middle: the agent, properly ── */}
        <section className="flex min-w-0 flex-col rounded-[20px] bg-white p-4" data-search>
          <p className="text-[13px] font-semibold">Looking after you</p>
          {v.agent ? (
            <div className="mt-4 flex items-start gap-4">
              {v.agent.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.agent.photo} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" />
              ) : (
                <span className="hand flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[#f3f3f1] text-[24px] text-muted">
                  {v.agent.name[0]}
                </span>
              )}
              <div className="min-w-0">
                <p className="text-[16px] font-semibold leading-tight">{v.agent.name}</p>
                {v.agent.title && <p className="text-[12px] text-muted">{v.agent.title}</p>}
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {v.agent.phone && (
                    <a href={`tel:${v.agent.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f3f1] px-3 py-1.5 text-[12px] font-semibold">
                      <DoodleIcon name="call" size={12} /> {v.agent.phone}
                    </a>
                  )}
                  {v.agent.email && (
                    <a href={`mailto:${v.agent.email}`} className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f3f1] px-3 py-1.5 text-[12px] font-semibold">
                      <DoodleIcon name="mail" size={12} /> Email
                    </a>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[13px] text-muted">Your agent will be in touch.</p>
          )}
          {v.agent?.bio && (
            <p className="mt-4 text-[12.5px] leading-relaxed text-muted">{v.agent.bio}</p>
          )}
          <div className="mt-auto pt-4">
            <AskAgent to={v.agent?.email ?? null} name={v.agent?.name ?? null} property={v.property.address} />
          </div>
        </section>

        {/* ── both rows, right: the property ── */}
        <div className="min-w-0 rounded-[20px] bg-white p-5 lg:row-span-2" data-search>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[13px] font-semibold">Property details</p>
            <span className="rounded-full bg-[#f3f3f1] px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{v.property.state}</span>
          </div>

          <div className="mt-5 text-center">
            <h2 className="text-[28px] leading-tight">{v.property.address}</h2>
            <p className="mt-1 text-[13px] text-muted">{v.property.subtitle}</p>
          </div>

          <div className="mt-5 overflow-hidden rounded-2xl bg-[#f3f3f1]">
            <PropertyHero image={v.property.image} lat={v.property.lat} lng={v.property.lng} className="h-[240px] w-full object-cover sm:h-[300px]" />
          </div>

          <div className="mt-5 flex min-w-0 gap-1 overflow-x-auto rounded-full bg-[#f3f3f1] p-1">
            {v.beats.map((b, i) => (
              <span
                key={b}
                className={`flex-1 whitespace-nowrap rounded-full px-3 py-2 text-center text-[11.5px] ${
                  i === v.at ? "bg-ink font-semibold text-white" : i < v.at ? "text-ink" : "text-muted"
                }`}
              >
                {b}
              </span>
            ))}
          </div>
          <p className="mt-3 text-center text-[12.5px] text-muted">{v.status}</p>

          <div className="mt-5 rounded-2xl bg-[#f3f3f1] p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold">Valuation</p>
                <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{v.valuation.caption}</p>
                <p className="figures mt-3 text-[36px] leading-none">
                  {v.valuation.figure ?? "—"}
                  {v.valuation.figure && <span className="text-[12px] font-normal text-muted"> {v.valuation.unit}</span>}
                </p>
              </div>
              <dl className="space-y-1.5">
                {v.valuation.lines.map(([k, val]) => (
                  <div key={k} className="flex items-baseline justify-between gap-6 text-[11.5px]">
                    <dt className="uppercase tracking-wide text-muted">{k}</dt>
                    <dd className="font-semibold">{val}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
          {v.needs.length > 0 && (
            <p className="mt-3 text-center text-[12px] text-muted">
              {left.length === 0 ? "Everything we need is in." : `${done} of ${v.needs.length} things done · ${left.length} still to do, listed below`}
            </p>
          )}
        </div>

        {/* ── row 2, left: three tiles ── */}
        <div className="grid grid-cols-3 gap-2.5" data-search>
          {v.actions.slice(0, 3).map((a) => (
            <ActionTile key={a.label} a={a} />
          ))}
        </div>

        {/* ── row 2, middle: the presentation ── */}
        {v.deck ? (
          <div className="flex min-w-0 items-center gap-4 rounded-[20px] bg-white p-4" data-search>
            <div className="h-[92px] w-[132px] shrink-0 overflow-hidden rounded-2xl bg-[#f3f3f1]">
              <PropertyPhoto src={v.deck.image} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Presentation</p>
              <p className="mt-0.5 truncate text-[13.5px] font-semibold">{v.deck.title}</p>
              <p className="truncate text-[11.5px] text-muted">{v.deck.sub}</p>
            </div>
            {v.deck.href ? (
              <a href={v.deck.href} target="_blank" rel="noreferrer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                <DoodleIcon name="link" size={14} className="text-white" />
              </a>
            ) : (
              <span className="text-[11.5px] text-muted">Coming</span>
            )}
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-4 rounded-[20px] bg-white p-4 text-[12.5px] text-muted" data-search>
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#f3f3f1]"><DoodleIcon name="doc" size={15} /></span>
            Your presentation lands here before the visit.
          </div>
        )}
      </div>

      {/* ── what we need, the only place documents are asked for ── */}
      {(v.needs.length > 0 || documents) && (
        <section id="ready" className="mt-3 rounded-[20px] bg-white p-5" data-search>
          <div className="flex items-center gap-2.5">
            <DoodleIcon name="shield" size={16} className="text-accent-dark" />
            <h2 className="text-[19px]">What we need from you</h2>
          </div>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            <ul className="space-y-2">
              {v.needs.map((n) => (
                <li key={n.title} className="flex items-center gap-3 rounded-2xl bg-[#f3f3f1] px-3.5 py-3">
                  <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl ${n.done ? "bg-ink text-white" : "bg-white text-ink"}`}>
                    <DoodleIcon name={n.done ? "checklist" : "doc"} size={13} />
                  </span>
                  <span className="min-w-0">
                    <span className={`block text-[13px] font-semibold ${n.done ? "text-muted line-through" : ""}`}>{n.title}</span>
                    {n.sub && <span className="block text-[11.5px] text-muted">{n.sub}</span>}
                  </span>
                </li>
              ))}
            </ul>
            <div>{documents}</div>
          </div>
        </section>
      )}
    </>
  );
}

function ActionTile({ a }: { a: ViewAction }) {
  const dark = a.tone === "dark";
  const cls = `flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[20px] p-3 text-center transition-transform hover:scale-[1.02] ${
    dark ? "bg-ink text-white" : "bg-white text-ink"
  } ${a.href ? "" : "opacity-60"}`;
  const inner = (
    <>
      <DoodleIcon name={a.icon} size={20} className={dark ? "text-white" : "text-ink"} />
      <span className="text-[12px] font-semibold leading-tight">{a.label}</span>
      {a.hint && <span className={`text-[10px] leading-tight ${dark ? "text-white/60" : "text-muted"}`}>{a.hint}</span>}
    </>
  );
  if (!a.href) return <div className={cls}>{inner}</div>;
  return a.external ? (
    <a href={a.href} target="_blank" rel="noreferrer" className={cls}>{inner}</a>
  ) : (
    <Link href={a.href} className={cls}>{inner}</Link>
  );
}
