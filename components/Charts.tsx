/**
 * Small, hand-rolled visuals — pure CSS/SVG so the wireframe stays light and
 * every chart takes the clay accent from the tokens. Variety is the point:
 * the dashboard should read as a page of different little instruments, not
 * one chart component stamped six times.
 */

/** A week of little bars, the last one (today) in full clay. */
export function MiniBars({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values);
  return (
    // No items-end on the row: the columns must STRETCH to the full h-24 so
    // the inner flex-1 has height for the bars to stand in — with items-end
    // each column collapses to its label and the bars render 0px tall.
    <div className="flex h-24 gap-2">
      {values.map((v, i) => {
        const today = i === values.length - 1;
        return (
          <div key={i} className="flex h-full flex-1 flex-col items-center gap-1.5">
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-md"
                style={{
                  height: `${Math.max((v / max) * 100, v > 0 ? 10 : 4)}%`,
                  backgroundColor: today ? "var(--accent)" : "var(--accent-soft)",
                }}
              />
            </div>
            <span
              className={`text-[10px] font-medium ${today ? "text-accent-dark" : "text-muted"}`}
            >
              {labels[i]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** A donut for a single share-of-whole figure. */
export function Donut({ pct, label }: { pct: number; label: string }) {
  const R = 34;
  const C = 2 * Math.PI * R;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 84 84" className="h-24 w-24 shrink-0 -rotate-90">
        <circle cx="42" cy="42" r={R} fill="none" stroke="var(--accent-soft)" strokeWidth="11" />
        <circle
          cx="42"
          cy="42"
          r={R}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="11"
          strokeLinecap="round"
          strokeDasharray={`${(pct / 100) * C} ${C}`}
        />
      </svg>
      <div>
        <p className="figures text-[30px] font-semibold leading-none">{pct}%</p>
        <p className="mt-1.5 text-xs leading-snug text-muted">{label}</p>
      </div>
    </div>
  );
}

/** A dotted progress path — steps done along a route, like a walk. */
export function StepPath({ done, total }: { done: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className="h-2.5 flex-1 rounded-full"
          style={{
            backgroundColor: i < done ? "var(--accent)" : "var(--accent-soft)",
          }}
        />
      ))}
    </div>
  );
}
