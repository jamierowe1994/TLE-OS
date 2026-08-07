import DoodleIcon from "@/components/DoodleIcon";

/**
 * The shared page opening, in three fixed places so nothing drifts page to
 * page: the title on the left with a pop stroke off each far corner, the
 * illustration hard right standing on the rule (which dips around its feet),
 * notifications pinned to the very top right, and the search bar BELOW the
 * rule — the bell is chrome, the search belongs to the work underneath.
 */

/**
 * The pop strokes off the title's corners.
 *
 * Scribble 28 from the licensed set, not the three hand-plotted line segments
 * that were here before — real tapered marker strokes, and vector, so they
 * hold their shape at any size. Drawn through a CSS mask like the doodle icons
 * because the source is a solid fill: that way it takes currentColor and the
 * dark-mode flip is free.
 */
function Pop({ className = "" }: { className?: string }) {
  const url = "url(/scribbles/flick.svg)";
  return (
    <span
      aria-hidden
      className={`block h-9 w-9 bg-ink ${className}`}
      style={{
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}

/**
 * How the figure meets the rule.
 *
 *   "none" — the line runs straight through. For anyone WALKING along it or
 *            framed by it: there's no weight bearing down, so nothing bends.
 *   "dip"  — a shallow trough. For someone STANDING on it: the line gives a
 *            little but never parts.
 *   "sink" — a deep trough with the line actually BROKEN where they sit. For
 *            anyone whose weight is on it — the original line is removed and
 *            redrawn around them, so they're in the line, not on top of it.
 *
 * The plate behind is page-coloured, which is what hides the header's own
 * border-bottom across the span so the redrawn path can take its place.
 */
export type LineBreak = "none" | "dip" | "sink";

function LineDip({ width, mode }: { width: number; mode: LineBreak }) {
  if (mode === "none") return null;

  const h = 34;
  const y = 1;
  const drop = mode === "sink" ? 17 : 9;
  // The gap is what makes "sink" read as broken rather than merely bent.
  const gap = mode === "sink" ? 0.2 : 0;

  const left = `M 0 ${y}
    L ${width * 0.14} ${y}
    C ${width * 0.28} ${y}, ${width * (0.32 - gap / 2)} ${y + drop}, ${width * (0.5 - gap / 2)} ${y + drop}`;
  const right = `M ${width * (0.5 + gap / 2)} ${y + drop}
    C ${width * (0.68 + gap / 2)} ${y + drop}, ${width * 0.72} ${y}, ${width * 0.86} ${y}
    L ${width} ${y}`;

  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute bottom-0"
      style={{ width, height: h, left: "50%", transform: "translateX(-50%)" }}
    >
      <rect x="0" y="0" width={width} height={h} fill="var(--page)" />
      <path d={left} fill="none" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      <path d={right} fill="none" stroke="var(--line)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export default function PageHeader({
  title,
  blurb,
  illustration,
  illustrationNode,
  /** Illustration height — it stands on the rule and reaches most of the way
   *  up, stopping short of the top. */
  illustrationHeight = 190,
  /** How the rule behaves where the figure meets it. */
  lineBreak = "dip",
  /** Actions that belong to the page, sitting on the search row. */
  actions,
}: {
  title: string;
  blurb: string;
  illustration?: string;
  /** A live illustration (e.g. the window scene) in place of a static file. */
  illustrationNode?: React.ReactNode;
  illustrationHeight?: number;
  lineBreak?: LineBreak;
  actions?: React.ReactNode;
}) {
  const hasArt = Boolean(illustration || illustrationNode);
  const dipWidth = Math.round(illustrationHeight * (lineBreak === "sink" ? 0.82 : 0.66));

  return (
    <>
      <div className="fade-up relative flex min-h-[212px] items-end justify-between gap-6 border-b border-line/80 pt-8">
        {/* The right padding is the figure's footprint reserved in advance.
            The figure is absolutely positioned, so it can't push the text out
            of its way — without this the blurb runs underneath it the moment
            the window narrows. Each step matches the scale below. */}
        <div
          className={`mb-2 pb-9 pl-2 pt-8 ${
            hasArt ? "pr-[120px] sm:pr-[165px] lg:pr-[220px] xl:pr-[250px]" : ""
          }`}
        >
          {/* The strokes belong to the TITLE, not the block. */}
          <div className="relative inline-block">
            <span className="absolute -left-9 -top-5">
              <Pop />
            </span>
            <span className="absolute -bottom-1 -right-10 rotate-180">
              <Pop />
            </span>
            <h1 className="text-[30px] leading-tight">{title}</h1>
          </div>
          <p className="mt-2.5 max-w-md text-[13px] text-muted">{blurb}</p>
        </div>

        {/* Notifications, top right and nothing else up there. */}
        <button
          type="button"
          className="absolute right-0 top-0 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80"
          title="Notifications (wireframe)"
        >
          <DoodleIcon name="bell" size={17} className="text-ink" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
        </button>

        {/* The figure, hard right, standing on the rule.

            Pinned to the bottom-right corner at EVERY width — it used to
            vanish below 1280px, which meant most laptops never saw it.

            Inset rather than flush: at right-0 the notification bell sat on
            top of its head, and the inset is what the padding buys.

            It shrinks by scaling the whole wrapper from the bottom-right
            corner, so the figure and the dip in the rule scale together and
            stay aligned — scaling the image alone would leave the trough
            drawn for a figure that is no longer that size. */}
        {hasArt && (
          <div
            className="pointer-events-none absolute bottom-0 right-5 origin-bottom-right scale-[0.5] sm:right-8 sm:scale-[0.68] lg:right-12 lg:scale-[0.88] xl:right-14 xl:scale-100"
            style={{ height: illustrationHeight }}
          >
            <div className="relative h-full">
              <LineDip width={dipWidth} mode={lineBreak} />
              {illustrationNode ? (
                <div className="relative aspect-square h-full">{illustrationNode}</div>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={illustration}
                  alt=""
                  aria-hidden
                  className="art relative h-full w-auto"
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search sits UNDER the rule, in the same column it always did — it
          belongs to the work below, not to the masthead above. */}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <label className="flex w-full max-w-xs items-center gap-2.5 rounded-full border border-line/80 px-4 py-2.5 transition-colors focus-within:border-ink">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input
            type="text"
            placeholder="Search properties, tenants…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
        </label>
        {actions}
      </div>
    </>
  );
}
