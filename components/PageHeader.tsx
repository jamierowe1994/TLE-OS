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
 * How far the rule drops at the bottom of each kind of trough.
 *
 * The figure has to come down by the same amount. Anchoring them to the rule's
 * flat height leaves them holding — or standing on — thin air a few pixels
 * above the line they are supposed to be bending.
 */
const DROP: Record<LineBreak, number> = { none: 0, dip: 9, sink: 17 };

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
  /* The baseline sits 2.5px down in a box that hangs mostly BELOW the rule, so
     the trough drops into the space under it. It used to be a 34px box pinned
     bottom-0 with the baseline at its top — which drew the whole thing 32px
     ABOVE the rule and left a stray curve floating over the real line on every
     page that asked for a dip.

     The half pixel is the whole trick to a clean join. The header's border
     occupies the pixel below the wrapper, so its centre is half a pixel down;
     a 1px stroke straddles its own path. Land the path anywhere else and the
     redrawn line meets the real one a pixel out — which reads as a nick in the
     rule at each end of the trough. */
  const y = 2.5;
  const drop = DROP[mode];
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
      className="pointer-events-none absolute"
      style={{ width, height: h, left: "50%", bottom: -(h - y + 0.5), transform: "translateX(-50%)" }}
    >
      {/* Just deep enough to swallow the real border and give the trough clean
          paper to be drawn on — any taller and it masks the page underneath. */}
      <rect x="0" y="0" width={width} height={y + drop + 3} fill="var(--page)" />
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
  /** Trim the shadow's sides. Only needed when something of theirs RESTS on
   *  the line and must not cast — the seated man's braced hands. */
  seatCut,
  /**
   * For a figure who HANGS off the rule instead of sitting on it: where their
   * grip is, as a fraction of the artwork's height (for the hanging woman, her
   * raised fist, 0.05).
   *
   * Same anchoring as `seat` — the rule passes through that point — but no room
   * is made underneath. She is meant to dangle in front of the page, so she
   * overlays whatever is below and never pushes it down.
   */
  grip,
  /**
   * An animated figure, as a vertical strip of frames rather than a video.
   *
   * A strip plus `steps()` is a fraction of the weight of the same motion as a
   * clip, and CSS can play it out and back with `alternate` — so half the
   * frames are stored and the loop has no seam, which matters because a
   * generated clip never comes back to its own first frame.
   */
  sprite,
  /**
   * Cast a shadow off a figure who is not seated — someone STANDING on the
   * rule. Same silhouette-masked shadow the seated man gets, but uncut: he is
   * cropped to his legs because his hands rest on the ledge and his top half
   * has nothing behind it, where someone stood on the line is against the wall
   * head to foot.
   */
  shadow = false,
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
  seatCut?: { left: number; right: number };
  grip?: number;
  sprite?: { src: string; frames: number; aspect: number; fps?: number };
  shadow?: boolean;
  flushRight?: boolean;
  search?: boolean;
  searchValue?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}) {
  const hasArt = Boolean(illustration || illustrationNode || sprite);
  const dipWidth = Math.round(illustrationHeight * (lineBreak === "sink" ? 0.82 : 0.66));

  const seated = typeof seat === "number";
  const hanging = typeof grip === "number";
  /* Where the rule crosses the artwork, and therefore how far the figure has
     to drop for that point to land on it. A seated figure is cut roughly in
     half by it; someone hanging by their fist is barely cut at all, and nearly
     all of them ends up below the line. */
  const cross = seated ? seat : hanging ? grip : 1;
  /* Plus the trough: where a figure bends the rule, the line at their own
     position is DROP lower than its flat height, so they have to come down
     with it or they hold on to nothing. Applies to anyone meeting the line —
     a hanging fist, a seat, or a pair of feet. */
  const below = illustrationHeight * (1 - cross) + DROP[lineBreak];
  const legs = seated ? illustrationHeight * (1 - cross) : 0;
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

  /* The strip is scaled to the element's width, so each frame ends up exactly
     illustrationHeight tall and the run is that times the frame count. Stepping
     to the full run rather than one frame short is deliberate: steps() never
     reaches its end value, so 30 steps land on frames 0…29 and none is skipped
     or held twice. `alternate` then walks back down, which is what makes a
     pendulum out of a clip that never returned to where it started. */
  const spriteClass = sprite
    ? `swing-${sprite.frames}-${Math.round(illustrationHeight)}`
    : "";
  const spriteRun = sprite ? sprite.frames * illustrationHeight : 0;
  const spriteSecs = sprite ? sprite.frames / (sprite.fps ?? 12) : 0;

  return (
    <>
      {sprite && (
        <style>{`
          @keyframes ${spriteClass} {
            from { background-position: 0 0 }
            to { background-position: 0 -${spriteRun}px }
          }
          .${spriteClass} {
            background-image: url(${sprite.src});
            background-size: 100% auto;
            background-repeat: no-repeat;
            animation: ${spriteClass} ${spriteSecs}s steps(${sprite.frames}) infinite alternate;
          }
          @media (prefers-reduced-motion: reduce) {
            .${spriteClass} { animation: none }
          }
        `}</style>
      )}
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
              {sprite ? (
                /* The frames are a background, not an <img>, because only a
                   background can be stepped through. .art still inverts it for
                   the dark theme, exactly as it does the still drawings. */
                <span
                  aria-hidden
                  className={`art relative block h-full ${spriteClass}`}
                  style={{
                    width: Math.round(illustrationHeight * sprite.aspect),
                    transform: `translateY(${Math.round(below)}px)`,
                  }}
                />
              ) : illustrationNode ? (
                /* EXPLICIT width, not aspect-square: at least one browser in
                   the field sized the ratio box wrong and the figure drifted
                   ~300px off the corner while the bell (plain right-0 in the
                   same container) sat true. Pixels can't be misread. */
                <div className="relative h-full" style={{ width: illustrationHeight }}>
                  {illustrationNode}
                </div>
              ) : (
                <span className="relative block h-full">
                  {(seated || shadow) && (
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
                        /* Standing: the whole figure throws, so no clip and no
                           side trim — those exist to keep the seated man's
                           hands, which rest ON the ledge, from casting. */
                        clipPath: seated
                          ? `inset(${Math.round(illustrationHeight * (seat ?? 0)) - SHADOW.drop}px ${seatCut?.right ?? 0}% 0 ${seatCut?.left ?? 0}%)`
                          : undefined,
                        transform: `translateY(${Math.round(below)}px) translate(${-SHADOW.side}px, ${SHADOW.drop}px) skewX(${-SHADOW.rake}deg)`,
                      }}
                    />
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={illustration}
                    alt=""
                    aria-hidden
                    className="art relative h-full w-auto"
                    /* Seated or hanging: drop them by everything below the
                       point the rule crosses, so it passes exactly through the
                       seat — or through the gripping fist. */
                    style={
                      below ? { transform: `translateY(${Math.round(below)}px)` } : undefined
                    }
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
