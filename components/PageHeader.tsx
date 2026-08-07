import DoodleIcon from "@/components/DoodleIcon";

/**
 * Every page opens on the same ledge: a rule right across, the title sat on
 * it with a pop stroke off its top-left and another off its bottom-right, the
 * search and bell to the right, and the illustration standing ON the line —
 * which dips around its feet, so the figure is in the page rather than on it.
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
 * The dip in the rule beneath the illustration.
 *
 * The header's own border-bottom is hidden behind a page-coloured plate here,
 * and redrawn as a path that eases down into a shallow trough and back up. The
 * figure then stands IN the line instead of on top of an unbroken one — the
 * same trick as a notch, but softened so it reads as the ground giving a
 * little under their weight.
 */
function LineDip({ width }: { width: number }) {
  const h = 26;
  const y = 1; // the rule sits at the top of this strip
  const drop = 11;
  return (
    <svg
      aria-hidden
      viewBox={`0 0 ${width} ${h}`}
      preserveAspectRatio="none"
      className="pointer-events-none absolute bottom-0 h-[26px]"
      style={{ width, left: "50%", transform: "translateX(-50%)" }}
    >
      {/* Cover the straight border across this span… */}
      <rect x="0" y="0" width={width} height={h} fill="var(--page)" />
      {/* …then draw it again, dipping through the middle. */}
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
  /** How far in from the right the illustration sits — clear of the search. */
  illustrationRight = 330,
  /** Illustration height. The header grows to hold it: the figure stands on
   *  the rule and reaches most of the way up, stopping short of the top. */
  illustrationHeight = 216,
}: {
  title: string;
  blurb: string;
  illustration?: string;
  /** A live illustration (e.g. the window scene) in place of a static file. */
  illustrationNode?: React.ReactNode;
  illustrationRight?: number;
  illustrationHeight?: number;
}) {
  const hasArt = Boolean(illustration || illustrationNode);
  // The dip spans a little less than the figure — a trough under their feet,
  // not a canyon across the page.
  const dipWidth = Math.round(illustrationHeight * 0.72);

  return (
    // min-h so the illustration has somewhere to stand even on a short title.
    // min-h leaves headroom above the figure so it reaches high without
    // spilling off the top of the page.
    <div className="fade-up relative flex min-h-[248px] items-end justify-between gap-6 border-b border-line/80 pt-10">
      <div className="mb-2 pb-9 pl-2 pt-8">
        {/* The strokes belong to the TITLE, not the block — one off its
            top-left, its mirror off its bottom-right. */}
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

      <div className="flex shrink-0 items-end gap-3 self-end pb-9">
        <label className="hidden w-60 items-center gap-2.5 rounded-full border border-line/80 px-4 py-2.5 transition-colors focus-within:border-ink sm:flex">
          <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
          <input
            type="text"
            placeholder="Search properties, tenants…"
            className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
          />
        </label>
        <button
          type="button"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line/80"
          title="Notifications (wireframe)"
        >
          <DoodleIcon name="bell" size={17} className="text-ink" />
          <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-accent" />
        </button>
      </div>

      {/* The figure stands on the rule and overflows upward — an absolutely
          positioned child adds nothing to layout, so the header keeps its
          height however tall the art gets. */}
      {hasArt && (
        <div
          className="pointer-events-none absolute bottom-0 hidden xl:block"
          style={{ right: illustrationRight, height: illustrationHeight }}
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
  );
}
