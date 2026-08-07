/**
 * The wireframe grammar. Three rules keep the pitch honest:
 *
 *  1. Solid white cards = designed UI that will exist as drawn.
 *  2. Dashed boxes = a promise — a space where live data will land.
 *  3. Every data-bearing block wears a FlowTag naming the system it reads
 *     from or pushes to, so the architecture is visible on the page itself.
 */

/** Where a block's data comes from / goes to. The visible architecture. */
export function FlowTag({
  from,
  to,
}: {
  /** e.g. "REX", "Rightmove → REX" */
  from?: string;
  /** e.g. "REX" — for blocks that WRITE into the source of truth */
  to?: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-page px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted">
      {from && <>{from} → here</>}
      {from && to && <span className="text-line">·</span>}
      {to && <>here → {to}</>}
    </span>
  );
}

export function PageHead({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="fade-up mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-xl">
        <h1 className="text-4xl">{title}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{blurb}</p>
      </div>
      {children}
    </div>
  );
}

/** A finished-looking white card. */
export function Card({
  title,
  tag,
  className = "",
  children,
}: {
  title?: string;
  tag?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    // No background: the boxes sit ON the eggshell, outline only — white
    // slabs were louder than their contents and the reference doesn't use them.
    <section className={`fade-up rounded-2xl border border-line/80 bg-panel p-5 ${className}`}>
      {(title || tag) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {tag}
        </div>
      )}
      {children}
    </section>
  );
}

/** A dashed promise: feature named, not yet built. */
export function Ghost({
  label,
  detail,
  tag,
  className = "",
}: {
  label: string;
  detail?: string;
  tag?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`wire-dashed fade-up flex min-h-28 flex-col items-center justify-center gap-1.5 p-5 text-center ${className}`}
    >
      <p className="text-sm font-semibold text-muted">{label}</p>
      {detail && <p className="max-w-xs text-xs leading-relaxed text-muted/80">{detail}</p>}
      {tag && <div className="mt-1">{tag}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="fade-up rounded-2xl border border-line/80 bg-panel p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </p>
      <p className="figures mt-2 text-[32px] font-semibold leading-none tracking-tight">
        {value}
      </p>
      {hint && <p className="mt-2 text-[11px] text-muted">{hint}</p>}
    </div>
  );
}

export function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "accent" | "good";
}) {
  const tones = {
    neutral: "bg-page text-muted",
    // Deepened clay for the text — the accent itself is too soft at 11px.
    accent: "bg-accent-soft text-accent-dark",
    good: "bg-[#e8f5ec] text-[#1e7a3c]",
  } as const;
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** A plain data table in the OS style. */
export function Table({
  cols,
  rows,
}: {
  cols: string[];
  rows: React.ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line/70">
            {cols.map((c) => (
              <th
                key={c}
                className="pb-2.5 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/40 last:border-0">
              {r.map((cell, j) => (
                <td key={j} className="py-3 pr-4 align-middle">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
