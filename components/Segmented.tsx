"use client";

/**
 * A choice of two or three, where the marker SLIDES.
 *
 * ── Why it slides ─────────────────────────────────────────────────────────
 *
 * The old view toggle repainted: the accent left one button and appeared on
 * the other in the same frame, which reads as two separate things blinking
 * rather than one marker moving. A control that shows where you are should
 * travel to where you have gone (James, 10 Sep 2026: "they need to bubble
 * over, not just pop in from the next side").
 *
 * So the marker is ONE element behind the labels, moved by transform. Nothing
 * about the buttons changes except their colour, and the marker carries the
 * whole movement - which is also why it cannot get out of step with them.
 *
 * ── Why the track is measured in fractions ────────────────────────────────
 *
 * Every option is the same width by construction (`flex-1` with a `basis-0`),
 * so the marker is 1/n of the track and travels by its own width. No
 * measuring, no ResizeObserver, and nothing to go wrong when a label is
 * longer than its neighbour.
 *
 * That holds only while every option can actually SHRINK to 1/n. A button's
 * padding cannot shrink, so a long label plus wide padding sets a floor, and
 * one option wider than its neighbours puts the marker permanently out of step
 * with the thing it is marking - by 6px on Steve's four tabs, which is exactly
 * the kind of fault that reads as "slightly wrong" and never gets reported.
 *
 * So the padding narrows once there are four. It is the only number here that
 * has to give, and a strip of four in a 392px speech bubble wants tighter
 * padding in any case.
 */
export default function Segmented<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: { id: T; label?: string; icon?: React.ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const i = Math.max(0, options.findIndex((o) => o.id === value));
  const n = options.length;

  return (
    <div
      className={`relative flex items-center rounded-full border border-line/60 bg-white p-1 ${className}`}
      role="tablist"
    >
      {/* The marker. inset-1 matches the track's padding, so it sits inside
          the border rather than on it. */}
      <span
        aria-hidden
        className="absolute bottom-1 left-1 top-1 rounded-full bg-accent-dark transition-transform duration-[280ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ width: `calc((100% - 0.5rem) / ${n})`, transform: `translateX(${i * 100}%)` }}
      />
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={o.id === value}
          title={o.title}
          onClick={() => onChange(o.id)}
          className={`relative z-[1] flex min-w-0 flex-1 basis-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full ${
            n >= 4 ? "px-2.5" : "px-4"
          } py-1.5 text-[12.5px] transition-colors duration-200 ${
            o.id === value ? "font-semibold text-page" : "text-muted hover:text-ink"
          }`}
        >
          {o.icon}
          {o.label}
        </button>
      ))}
    </div>
  );
}
