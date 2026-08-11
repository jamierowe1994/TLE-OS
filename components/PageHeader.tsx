import DoodleIcon from "@/components/DoodleIcon";

/**
 * The shared page opening, in three fixed places so nothing drifts page to
 * page: the title on the left with a pop stroke off each far corner, the
 * illustration hard right standing on the rule (which dips around its feet),
 * notifications pinned to the very top right, and the search bar BELOW the
 * rule — the bell is chrome, the search belongs to the work underneath.
 */

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

/**
 * How a seated figure's shadow falls on the wall below the ledge.
 *
 * `side` and `drop` are how far it lands from him — small, because he is sat
 * ON the ledge, not hovering in front of it, so the shadow stays tight to the
 * legs. `rake` is the shear, which reads as how high the light is.
 *
 * `cut` trims the sides to the LEGS alone. His braced hands rest on the ledge
 * either side of him, and they sat inside the clip — the shadow has to start a
 * few pixels above the seat so that, once dropped, its top edge lands on the
 * rule, and those few pixels are exactly where the hands are. Measured off the
 * artwork: below the seat his legs occupy 19%–75% of the width, and his hands
 * everything outside that.
 */
const SHADOW = { side: 7, drop: 6, rake: 5, cutLeft: 18, cutRight: 24 };

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
  /**
   * For a figure who SITS on the rule rather than standing on it: where their
   * seat is, as a fraction of the artwork's height (measured off the file —
   * for the sitting man, the row where his braced hands stop, 0.554).
   *
   * The figure is dropped by the rest of their height so that line lands under
   * them, and their legs hang below into the page. The search row is pushed
   * clear of the feet by exactly that much at each breakpoint, so nothing ever
   * lands on a dangling shoe.
   */
  seat,
  /** Pin the figure hard into the corner instead of the standard inset —
   *  the dashboard's window lives in the corner of the room. */
  flushRight = false,
  /** The search bar under the rule. On by default; pages that aren't about
   *  finding things (the profile) turn it off. */
  search = true,
  /** Wire the bar up: pages that filter pass value + onSearch, and THIS
   *  becomes the page's one and only search — never a second one below. */
  searchValue = "",
  onSearch,
  searchPlaceholder = "Search properties, tenants…",
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
  seat?: number;
  flushRight?: boolean;
  search?: boolean;
  searchValue?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}) {
  const hasArt = Boolean(illustration || illustrationNode);
  const dipWidth = Math.round(illustrationHeight * (lineBreak === "sink" ? 0.82 : 0.66));

  const seated = typeof seat === "number";
  const legs = seated ? illustrationHeight * (1 - seat) : 0;
  /* The figure is scaled down at each breakpoint, so the legs hang shorter
     there too and the clearance has to follow. Written as real CSS because the
     numbers are computed — Tailwind can only see class names it was built
     with. Keyed by the numbers themselves, so two identical headers share one
     rule and two different ones never collide. */
  const seatClass = `seat-${Math.round(illustrationHeight)}-${Math.round((seat ?? 0) * 1000)}`;
  /* From sm up, a seated figure is set in far enough to clear the page's
     action button, so the search row only has to clear his SHINS — his shoes
     hang past it into empty space, which is what dangling legs do. The rule
     itself then sits where it does on every other page. Below sm there is no
     room to set him in beside the search box, so there the row clears his feet
     completely (factor 1) and he stays in the corner. */
  const clearance = [
    [0.5, 1],
    [0.68, 1],
    [0.88, 0.55],
    [1, 0.55],
  ].map(([scale, factor]) => Math.round(legs * scale * factor) + 20);

  return (
    <>
      {seated && (
        <style>{`
          .${seatClass} { margin-top: ${clearance[0]}px }
          @media (min-width: 640px) { .${seatClass} { margin-top: ${clearance[1]}px } }
          @media (min-width: 1024px) { .${seatClass} { margin-top: ${clearance[2]}px } }
          @media (min-width: 1280px) { .${seatClass} { margin-top: ${clearance[3]}px } }
        `}</style>
      )}
      {/* 232, not 212: at 212 the notification button sat ON the top of the
          dashboard's window frame. The figure hangs off the rule, so giving the
          masthead 20px more height is what buys the air above its head. */}
      <div className="fade-up relative flex min-h-[232px] items-end justify-between gap-6 border-b border-line/80 pt-8">
        {/* The right padding is the figure's footprint reserved in advance.
            The figure is absolutely positioned, so it can't push the text out
            of its way — without this the blurb runs underneath it the moment
            the window narrows. Each step matches the scale below. */}
        <div
          className={`mb-2 pb-9 pl-2 pt-8 ${
            !hasArt
              ? ""
              : seated
                ? /* A seated figure is set in from the corner from lg up, so
                     his footprint starts further left and the blurb has to
                     stop sooner or it runs under his arm. */
                  "pr-[120px] sm:pr-[165px] lg:pr-[290px] xl:pr-[315px]"
                : "pr-[120px] sm:pr-[165px] lg:pr-[220px] xl:pr-[250px]"
          }`}
        >
          {/* Flick strokes used to frame the title's corners; retired
              (James, 8 Aug 2026) — the hand face carries the voice alone. */}
          <h1 className="text-[30px] leading-tight">{title}</h1>
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
            className={`pointer-events-none absolute bottom-0 origin-bottom-right scale-[0.5] sm:scale-[0.68] lg:scale-[0.88] xl:scale-100 ${
              flushRight
                ? "right-0"
                : seated
                  ? /* Set in past the page's action button, so the dangling
                       feet land in the empty middle of the search row rather
                       than on top of it. Below sm it stays at the standard
                       inset — there is no room between the search box and the
                       button at that width, so the row clears his feet
                       instead. */
                    "right-5 sm:right-8 lg:right-[158px] xl:right-[166px]"
                  : "right-5 sm:right-8 lg:right-12 xl:right-14"
            }`}
            style={{ height: illustrationHeight }}
          >
            <div className="relative h-full">
              <LineDip width={dipWidth} mode={lineBreak} />
              {illustrationNode ? (
                /* EXPLICIT width, not aspect-square: at least one browser in
                   the field sized the ratio box wrong and the figure drifted
                   ~300px off the corner while the bell (plain right-0 in the
                   same container) sat true. Pixels can't be misread. */
                <div className="relative h-full" style={{ width: illustrationHeight }}>
                  {illustrationNode}
                </div>
              ) : (
                <span className="relative block h-full">
                  {seated && (
                    /*
                     * The shadow his legs throw on the wall below the ledge.
                     *
                     * It is HIS OWN SILHOUETTE, not a blur under him: the
                     * artwork masks this layer, so the shape is exactly his
                     * legs, then it is sheared and dropped so it falls away
                     * from him — off the inside of his left leg and out past
                     * his right.
                     *
                     * Clipped to start at the seat: above the line he is sat
                     * against thin air, so his top half throws nothing. The
                     * clip is applied in the element's own box BEFORE the
                     * transform, so it has to be lifted by the drop or the
                     * shadow starts that far under the rule and floats. A
                     * shear leaves horizontal lines horizontal, so once
                     * lifted the top edge lands exactly on the line.
                     */
                    <span
                      aria-hidden
                      className="fig-shadow absolute inset-0"
                      style={{
                        WebkitMaskImage: `url(${illustration})`,
                        maskImage: `url(${illustration})`,
                        clipPath: `inset(${Math.round(illustrationHeight * (seat ?? 0)) - SHADOW.drop}px ${SHADOW.cutRight}% 0 ${SHADOW.cutLeft}%)`,
                        transform: `translateY(${Math.round(legs)}px) translate(${-SHADOW.side}px, ${SHADOW.drop}px) skewX(${-SHADOW.rake}deg)`,
                      }}
                    />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={illustration}
                    alt=""
                    aria-hidden
                    className="art relative h-full w-auto"
                    /* Seated: drop them by everything below their seat, so the
                       rule passes under them and the legs hang free. */
                    style={seated ? { transform: `translateY(${Math.round(legs)}px)` } : undefined}
                  />
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Search sits UNDER the rule, in the same column it always did — it
          belongs to the work below, not to the masthead above. */}
      {(search || actions) && (
        <div className={`flex flex-wrap items-center justify-between gap-3 ${seated ? seatClass : "mt-5"}`}>
          {search && (
            <label className="flex w-full max-w-xs items-center gap-2.5 rounded-full border border-line/80 px-4 py-2.5 transition-colors focus-within:border-ink">
              <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
              <input
                type="text"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={onSearch ? (e) => onSearch(e.target.value) : undefined}
                readOnly={!onSearch}
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-muted/70"
              />
            </label>
          )}
          {actions}
        </div>
      )}
    </>
  );
}
