import type { Stop } from "@/lib/landlord-journey";

/**
 * The journey spine: done in brown with a tick, the current stop ringed,
 * upcoming dashed. One row of seven; on a phone it scrolls sideways rather
 * than wrapping, so the line never runs in from nowhere.
 */
export default function Spine({ stops }: { stops: Stop[] }) {
  return (
    <div className="overflow-x-auto pb-1">
      <ol className="grid min-w-[640px]" style={{ gridTemplateColumns: `repeat(${stops.length}, minmax(0, 1fr))` }}>
        {stops.map((s, i) => {
          const prevDone = i > 0 && stops[i - 1].state === "done";
          return (
            <li key={s.id} className="relative flex flex-col items-center px-1 text-center">
              {i > 0 && (
                <span
                  className={`absolute left-[-50%] right-[50%] top-[14px] ${
                    prevDone && s.state !== "upcoming" ? "h-0.5 bg-accent-dark" : "h-0 border-t-2 border-dashed border-line"
                  }`}
                />
              )}
              <span
                className={`relative z-[1] flex h-[30px] w-[30px] items-center justify-center rounded-full ${
                  s.state === "done"
                    ? "bg-accent-dark text-white"
                    : s.state === "current"
                      ? "border-[3px] border-accent-dark bg-white"
                      : "border-2 border-line bg-white"
                }`}
              >
                {s.state === "done" && <span className="text-[13px] leading-none">✓</span>}
                {s.state === "current" && <span className="h-2.5 w-2.5 rounded-full bg-accent-dark" />}
              </span>
              <p className={`mt-3 text-[12.5px] ${s.state === "upcoming" ? "text-muted" : "font-semibold"}`}>{s.label}</p>
              <p className="mt-0.5 text-[11.5px] text-muted">{s.sub}</p>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
