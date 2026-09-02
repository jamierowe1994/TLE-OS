import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import PropertyMap from "@/components/landlord/PropertyMap";
import AskAgent from "@/components/landlord/AskAgent";
import type { LandlordView, ViewAction } from "@/lib/landlord-view";

/**
 * The landlord dashboard. See lib/landlord-view.ts for the shape and the
 * reference it was drawn from. White, three columns, everything in panels
 * with a hairline and no fill except the property itself, which sits on a
 * light wash so it reads as the thing the page is about.
 */
export default function LandlordDashboard({ view: v }: { view: LandlordView }) {
  const done = v.todos.filter((t) => t.done).length;
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_1.35fr]">
      {/* ── LEFT: location and actions ── */}
      {/* min-w-0 on every column: a grid track defaults to min-width auto,
          and the no-wrap beats row would otherwise hold the whole grid wider
          than a phone, cutting every panel off at the right edge. */}
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Location" data-search icon="search" className="min-h-[340px]">
          <div className="mt-3 h-[280px]">
            <PropertyMap
              lat={v.property.lat}
              lng={v.property.lng}
              address={v.property.address}
              postcode={v.property.postcode}
              line={v.property.subtitle}
            />
          </div>
        </Panel>

        <div className="grid grid-cols-3 gap-3" data-search>
          {v.actions.map((a) => (
            <ActionTile key={a.label} a={a} />
          ))}
        </div>

        {v.agent && (v.agent.phone || v.agent.email) && (
          <div className="flex items-center gap-3 rounded-2xl border border-line/70 bg-white p-4" data-search>
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line/70 text-accent-dark">
              <DoodleIcon name="call" size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">Something urgent?</p>
              <p className="truncate text-[11.5px] text-muted">
                Ring {v.agent.name.split(/\s+/)[0]}
                {v.agent.phone ? ` on ${v.agent.phone}` : ""}
              </p>
            </div>
            {v.agent.phone && (
              <a href={`tel:${v.agent.phone.replace(/\s+/g, "")}`} className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-white">
                Call
              </a>
            )}
          </div>
        )}
      </div>

      {/* ── MIDDLE: to do, ask, the presentation ── */}
      <div className="flex min-w-0 flex-col gap-4">
        <Panel title="Things to do" sub={v.todos.length ? `${done} of ${v.todos.length} done` : "Nothing waiting on you"} icon="checklist" data-search>
          <ul className="mt-3 space-y-2">
            {v.todos.map((t) => {
              const inner = (
                <>
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${t.done ? "bg-ink text-white" : "border border-line/70 text-ink"}`}>
                    <DoodleIcon name={t.done ? "checklist" : t.icon} size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-[13px] font-semibold ${t.done ? "text-muted line-through" : ""}`}>{t.title}</span>
                    {t.sub && <span className="block truncate text-[11.5px] text-muted">{t.sub}</span>}
                  </span>
                  {!t.done && t.href && <DoodleIcon name="link" size={13} className="text-muted" />}
                </>
              );
              const cls = "flex items-center gap-3 rounded-2xl bg-box px-3.5 py-3";
              return (
                <li key={t.title}>
                  {t.href && !t.done ? (
                    <Link href={t.href} className={`${cls} transition-colors hover:bg-line/30`}>{inner}</Link>
                  ) : (
                    <div className={cls}>{inner}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Panel>

        <AskAgent to={v.agent?.email ?? null} name={v.agent?.name ?? null} property={v.property.address} />

        {v.deck && (
          <div className="rounded-2xl border border-line/70 bg-white p-4" data-search>
            <div className="relative h-[150px] overflow-hidden rounded-xl bg-[#f4f4f2]">
              <PropertyPhoto src={v.deck.image} alt="" className="h-full w-full object-cover" />
              <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink">
                Presentation
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-[13.5px] font-semibold">{v.deck.title}</p>
                <p className="truncate text-[11.5px] text-muted">{v.deck.sub}</p>
              </div>
              {v.deck.href ? (
                <a href={v.deck.href} target="_blank" rel="noreferrer" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
                  <DoodleIcon name="link" size={14} className="text-white" />
                </a>
              ) : (
                <span className="text-[11.5px] text-muted">Coming</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── RIGHT: the property ── */}
      <div className="min-w-0 rounded-2xl bg-[var(--art-wash)] p-5" data-search>
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] font-semibold">Property details</p>
          <span className="rounded-full bg-white px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{v.property.state}</span>
        </div>

        <div className="mt-6 text-center">
          <h2 className="text-[28px] leading-tight">{v.property.address}</h2>
          <p className="mt-1 text-[13px] text-muted">{v.property.subtitle}</p>
        </div>

        <div className="mt-5 overflow-hidden rounded-2xl">
          <PropertyPhoto src={v.property.image} alt="" className="h-[240px] w-full object-cover sm:h-[280px]" />
        </div>

        {/* The journey as a segmented control, the current beat filled. */}
        <div className="mt-5 flex min-w-0 gap-1 overflow-x-auto rounded-full bg-white p-1">
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

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-white p-4">
            <p className="text-[13px] font-semibold">Valuation</p>
            <p className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted">{v.valuation.caption}</p>
            <p className="figures mt-4 text-[34px] leading-none">
              {v.valuation.figure ?? "—"}
              {v.valuation.figure && <span className="text-[12px] font-normal text-muted"> {v.valuation.unit}</span>}
            </p>
            <dl className="mt-4 space-y-1.5">
              {v.valuation.lines.map(([k, val]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 text-[11.5px]">
                  <dt className="uppercase tracking-wide text-muted">{k}</dt>
                  <dd className="text-right font-semibold">{val}</dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="rounded-2xl bg-white p-4">
            <p className="text-[13px] font-semibold">{v.readiness.title}</p>
            <Gauge pct={v.readiness.pct} />
            <p className="mt-2 text-center text-[11.5px] text-muted">{v.readiness.note}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Panel({
  title, sub, icon, className = "", children, ...rest
}: {
  title: string;
  sub?: string;
  icon?: string;
  className?: string;
  children: React.ReactNode;
  "data-search"?: boolean;
}) {
  return (
    <section className={`rounded-2xl border border-line/70 bg-white p-4 ${className}`} {...rest}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold">{title}</p>
          {sub && <p className="text-[11.5px] text-muted">{sub}</p>}
        </div>
        {icon && <DoodleIcon name={icon} size={15} className="text-muted" />}
      </div>
      {children}
    </section>
  );
}

function ActionTile({ a }: { a: ViewAction }) {
  const dark = a.tone === "dark";
  const cls = `flex aspect-square flex-col items-center justify-center gap-2 rounded-2xl p-3 text-center transition-transform hover:scale-[1.02] ${
    dark ? "bg-ink text-white" : "border border-line/70 bg-white text-ink"
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

/** A half-ring, the figure inside it. Accent for the done part, line for the rest. */
function Gauge({ pct }: { pct: number }) {
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const r = 44;
  const half = Math.PI * r;
  return (
    <div className="relative mx-auto mt-3 w-[132px]">
      <svg viewBox="0 0 120 70" className="w-full">
        <path d="M16 62 A44 44 0 0 1 104 62" fill="none" stroke="var(--line)" strokeOpacity="0.5" strokeWidth="10" strokeLinecap="round" />
        <path
          d="M16 62 A44 44 0 0 1 104 62"
          fill="none"
          stroke="var(--accent-dark)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${(p / 100) * half} ${half}`}
        />
      </svg>
      <p className="figures absolute inset-x-0 bottom-0 text-center text-[26px] leading-none">{p}%</p>
    </div>
  );
}
