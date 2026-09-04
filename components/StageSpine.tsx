/**
 * A journey, left to right.
 *
 * Lifted from the appraisal file, where James asked for it across rather
 * than down (28 Aug): "a spine is a journey, and a journey reads left to
 * right." The same shape now sits on an application, so an agent reads the
 * pre-tenancy the way Kirstie does, and the two never disagree about where
 * a deal is.
 *
 * Each stop can carry one line of evidence under it - the coloured-dot
 * sentence Kirstie's Progression uses: green for "seen it", amber for
 * "worth a look", grey for "no source says". It scrolls sideways rather than
 * wrapping: twelve stops on two rows would put "Move day" under "Received"
 * and undo the reading order the shape is for.
 */

export interface SpineStop {
  id: string;
  label: string;
  /** One sentence of evidence: a date, an amount, what is missing. */
  sub?: string | null;
  tone?: "ok" | "warn" | "none";
  state: "done" | "current" | "upcoming" | "off";
}

export default function StageSpine({
  stops,
  compact = false,
}: {
  stops: SpineStop[];
  /** Tighter stops for a drawer; the appraisal file uses the roomier default. */
  compact?: boolean;
}) {
  return (
    <ol className={`-mx-1 flex gap-1 overflow-x-auto px-1 pb-2 ${compact ? "mt-3" : "mt-4"}`}>
      {stops.map((s, i, arr) => {
        const done = s.state === "done";
        const here = s.state === "current";
        const off = s.state === "off";
        return (
          <li key={s.id} className={`flex flex-1 shrink-0 flex-col ${compact ? "min-w-[104px]" : "min-w-[132px]"}`}>
            <div className="flex items-center">
              <span
                className={`flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px] ${
                  done
                    ? "border-accent-dark bg-accent-soft text-accent-dark"
                    : here
                      ? "border-accent-dark bg-accent-dark text-white"
                      : off
                        ? "border-line bg-line/40 text-muted line-through"
                        : "border-line bg-panel text-muted"
                }`}
              >
                {done ? "✓" : off ? "–" : i + 1}
              </span>
              {i < arr.length - 1 && (
                <span aria-hidden className={`h-[1.5px] flex-1 ${done ? "bg-accent-dark/50" : "bg-line"}`} />
              )}
            </div>
            <span className={`mt-2 pr-3 text-[12px] leading-tight ${here ? "font-semibold" : "text-muted"}`}>
              {s.label}
            </span>
            {s.sub && (
              <span className="mt-1 flex items-start gap-1.5 pr-3 text-[10.5px] leading-snug text-muted">
                <span
                  aria-hidden
                  className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                    s.tone === "ok" ? "bg-emerald-600" : s.tone === "warn" ? "bg-amber-500" : "bg-line"
                  }`}
                />
                <span className="min-w-0">{s.sub}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
