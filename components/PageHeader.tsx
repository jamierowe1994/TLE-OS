import DoodleIcon from "@/components/DoodleIcon";

/**
 * The shared page opening, in three fixed places so nothing drifts page to
 * page: the title on the left with a pop stroke off each far corner, the
 * illustration hard right standing on the rule (which dips around its feet),
 * notifications pinned to the very top right, and the search bar BELOW the
 * rule — the bell is chrome, the search belongs to the work underneath.
 */

/** The pop strokes off the title's corners. */
function Pop({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`h-8 w-8 text-ink ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      <path d="M3 15 L9 10" />
      <path d="M9 4 L12 11" />
      <path d="M18 3 L16 10" />
    </svg>
  );
}

/**
 * The dip in the rule beneath the illustration — the header's border is
 * masked across this span and redrawn easing down into a shallow trough, so
 * the figure stands IN the line rather than on an unbroken one.
 */
function LineDip({ width }: { width: number }) {
  const h = 26;
  const y = 1;
  const drop = 11;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute bottom-0 h-[26px]"
      style={{ width, left: "50%", transform: "translateX(-50%)" }}
    >
      <rect x="0" y="0" width={width} height={h} fill="var(--page)" />
      <path
        d={`M 0 ${y}
            L ${width * 0.16} ${y}
            C ${width * 0.3} ${y}, ${width * 0.3} ${y + drop}, ${width * 0.5} ${y + drop}
            C ${width * 0.7} ${y + drop}, ${width * 0.7} ${y}, ${width * 0.84} ${y}
            L ${width} ${y}`}
        fill="none"
        stroke="var(--line)"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
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
  illustrationHeight = 216,
  /** Actions that belong to the page, sitting on the search row. */
  actions,
}: {
  title: string;
  blurb: string;
  illustration?: string;
  /** A live illustration (e.g. the window scene) in place of a static file. */
  illustrationNode?: React.ReactNode;
  illustrationHeight?: number;
  actions?: React.ReactNode;
}) {
  const hasArt = Boolean(illustration || illustrationNode);
  const dipWidth = Math.round(illustrationHeight * 0.72);

  return (
    <>
      <div className="fade-up relative flex min-h-[240px] items-end justify-between gap-6 border-b border-line/80 pt-10">
        <div className="mb-2 pb-9 pl-2 pt-8">
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
          className="absolute right-0 top-6 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80"
          title="Notifications (wireframe)"
        >
          <DoodleIcon name="bell" size={17} className="text-ink" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
        </button>

        {/* The figure, hard right, standing on the rule. */}
        {hasArt && (
          <div
            className="pointer-events-none absolute bottom-0 right-0 hidden xl:block"
            style={{ height: illustrationHeight }}
          >
            <div className="relative h-full">
              <LineDip width={dipWidth} />
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
