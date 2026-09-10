import NotificationBell from "@/components/NotificationBell";
import GlobalSearch from "@/components/GlobalSearch";
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
  /**
   * width ÷ height of the artwork, for art that is WIDER than the roughly
   * 0.7 this header has always assumed.
   *
   * The text block reserves the figure's footprint as right-padding, in fixed
   * steps that were measured against tall, narrow line drawings. A wide piece
   * — the seated lady is 1.145, half as wide again as she is tall — overruns
   * that reserve and the blurb runs under her. Given the aspect, the reserve
   * is computed from the real width instead of assumed, at every breakpoint.
   *
   * Only ever widens. Pages that do not pass it keep the measured steps
   * exactly as they were.
   */
  illustrationAspect,
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
   *
   * Left undefined it follows the seat: a seated figure casts, anyone else
   * does not. Pass it explicitly to overrule that either way — `false` on a
   * seated figure whose artwork carries a painted background, because the
   * mask is the file's ALPHA and a coloured wash would throw the shape of
   * the wash rather than the shape of a person.
   */
  shadow,
  /** Pin the figure hard into the corner instead of the standard inset —
   *  the dashboard's window lives in the corner of the room. */
  flushRight = false,
  /**
   * How deep the masthead is, before the rule.
   *
   * ONE number, everywhere. Measured across the pages rather than picked:
   * they were landing between 232 and 270 depending on how long the blurb ran
   * and whether the page had its own controls, so the rule sat somewhere
   * different on every screen. 268 clears the tallest of them, so they all
   * hit the floor rather than their own content height (James, 10 Sep 2026).
   */
  minHeight = 268,
  /**
   * The title's size.
   *
   * 42 EVERYWHERE. It was 30, with the dashboard alone at 42, and a masthead
   * that is one size on the home screen and another on the other forty-five
   * is the kind of drift that makes an app feel assembled rather than
   * designed (James, 10 Sep 2026). The prop stays so a page CAN differ, but
   * nothing should without a reason worth writing down.
   */
  titleSize = 42,
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
  illustrationAspect?: number;
  lineBreak?: LineBreak;
  seat?: number;
  seatCut?: { left: number; right: number };
  grip?: number;
  sprite?: { src: string; frames: number; aspect: number; fps?: number };
  shadow?: boolean;
  flushRight?: boolean;
  minHeight?: number;
  titleSize?: number;
  search?: boolean;
  searchValue?: string;
  onSearch?: (v: string) => void;
  searchPlaceholder?: string;
  actions?: React.ReactNode;
}) {
  const hasArt = Boolean(illustration || illustrationNode || sprite);
  const dipWidth = Math.round(illustrationHeight * (lineBreak === "sink" ? 0.82 : 0.66));

  const seated = typeof seat === "number";
  /* Undefined means "follow the seat"; an explicit value wins. */
  const castsShadow = shadow ?? seated;

  /* The figure's own footprint, at each breakpoint's scale, plus how far it
     is inset from the right and a little air. Written as real CSS for the
     same reason the seat clearance is: the numbers are computed, and Tailwind
     can only see class names it was built with. */
  const SCALES = [0.5, 0.68, 0.88, 1];
  /* Told the aspect, work the room out from it - narrow art as much as wide.
     The fixed steps were measured against roughly 0.7, and the seated lady at
     0.73 is wider than that: at the fixed 315 the blurb ran 78px under her. */
  const wideArt = typeof illustrationAspect === "number";
  const artClass = wideArt ? `art-room-${Math.round(illustrationHeight)}-${Math.round(illustrationAspect * 1000)}` : "";
  /* flushRight pins the art to the very corner, so there is no inset to
     reserve. Getting this wrong reserves room that is not there and stops the
     title a breakpoint's worth of space short of the artwork. */
  const inset = flushRight ? [0, 0, 0, 0] : seated ? [20, 32, 158, 166] : [20, 32, 48, 56];
  const reserve = SCALES.map((sc, i) => Math.round(illustrationHeight * (illustrationAspect ?? 0.7) * sc) + inset[i] + 14);
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
  /*
   * ── Room for the legs ────────────────────────────────────────────────────
   *
   * A seated figure hangs below the rule, and whatever comes next paints its
   * own background straight across the feet - which is how the man on Leads
   * ended up sitting on the line with his trainers cut off (James, 10 Sep
   * 2026). The masthead carries a bottom margin as deep as the part of the
   * figure that hangs past it, plus a little air so the shoes are not
   * touching the card either.
   *
   * This used to be spread across the search row's own margins either side of
   * a row height that had to be guessed at 42px. That row has moved to the
   * top of the page, so the margin belongs to the masthead now, and it is one
   * measured number instead of three estimated ones.
   */
  const gap = SCALES.map((sc) => (seated ? Math.round(legs * sc) + 14 : 20));

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
            /* Sized to the run EXACTLY, not "100% auto": with auto the frame
               height came out of the rounded width, a third of a pixel short
               at 230, and by frame 29 the next frame's feet were showing at
               the bottom as a stray mark. Stretching the strip to the whole
               run makes every step land on a frame edge. */
            background-size: 100% ${spriteRun}px;
            background-repeat: no-repeat;
            animation: ${spriteClass} ${spriteSecs}s steps(${sprite.frames}) infinite alternate;
          }
          @media (prefers-reduced-motion: reduce) {
            .${spriteClass} { animation: none }
          }
        `}</style>
      )}
      {wideArt && (
        <style>{`
          .${artClass} { padding-right: ${reserve[0]}px }
          @media (min-width: 640px) { .${artClass} { padding-right: ${reserve[1]}px } }
          @media (min-width: 1024px) { .${artClass} { padding-right: ${reserve[2]}px } }
          @media (min-width: 1280px) { .${artClass} { padding-right: ${reserve[3]}px } }
        `}</style>
      )}
      {seated && (
        <style>{`
          .${seatClass} { margin-bottom: ${gap[0]}px }
          @media (min-width: 640px) { .${seatClass} { margin-bottom: ${gap[1]}px } }
          @media (min-width: 1024px) { .${seatClass} { margin-bottom: ${gap[2]}px } }
          @media (min-width: 1280px) { .${seatClass} { margin-bottom: ${gap[3]}px } }
        `}</style>
      )}
      {/* ── The top bar ──────────────────────────────────────────────────
          Search on the left, notifications hard right, above everything.

          It used to sit UNDER the rule, which cost a whole row of height
          directly below the masthead - and that row was what the artwork had
          to be shrunk to make space for. Up here it takes no height from the
          scene at all, and the masthead below can be shallower for it.

          z-30 because the illustration deliberately overflows the masthead
          upwards and would otherwise paint straight over both of them. */}
      {(search || true) && (
        <div className="relative z-30 mb-1 flex items-center justify-between gap-3">
          {search ? (
            onSearch ? (
              /* A page that filters its own list (Listings, Leads) passes
                 onSearch and keeps its own bar. Everywhere else the bar is
                 the one search: any property, lead, application or deal,
                 opened on its screen. */
              <label className="flex w-full max-w-sm items-center gap-2.5 rounded-full border border-line/80 px-4 py-2 transition-colors focus-within:border-ink">
                <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onChange={(e) => onSearch(e.target.value)}
                  className="w-full bg-transparent text-[12.5px] outline-none placeholder:text-muted/70"
                />
              </label>
            ) : (
              <GlobalSearch placeholder={searchPlaceholder} />
            )
          ) : (
            <span />
          )}
          {/* Notifications and nothing else. The page's own actions used to
              sit here, which put a different set of controls in the same
              place on every screen - the one thing this bar exists not to
              do. They live in the masthead now, on the page they belong to. */}
          <NotificationBell compact />
        </div>
      )}

      {/* 232, not 212: at 212 the notification button sat ON the top of the
          dashboard's window frame. The figure hangs off the rule, so giving the
          masthead 20px more height is what buys the air above its head. */}
      {/* ── The frame, and the block inside it ──────────────────────────
          The frame is STATIC and owns the rule. The block inside it is what
          moves: on the way out it falls and the frame's clip swallows it at
          the line, on the way in it rises back through. If the rule lived on
          the moving element the line itself would slide down the page, which
          is the one thing that must not happen.

          The clip is animated rather than applied: at rest it has to be open,
          because a seated figure's legs hang BELOW the rule on purpose and a
          standing clip would cut her feet off. */}
      <div
        className={`os-mast-frame fade-up relative border-b border-line/80 ${seated ? seatClass : "mb-5"}`}
        style={{ minHeight }}
      >
      <div
        className="os-mast flex h-full items-end justify-between gap-6 pt-8"
        style={{ minHeight }}
      >
        {/* The right padding is the figure's footprint reserved in advance.
            The figure is absolutely positioned, so it can't push the text out
            of its way — without this the blurb runs underneath it the moment
            the window narrows. Each step matches the scale below. */}
        <div
          className={`flex flex-col self-stretch pb-4 pl-2 pt-[26px] ${
            !hasArt
              ? ""
              : wideArt
                ? artClass
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
          {/* The title is pinned to a fixed distance from the top, not the
              rule. It used to hang off the bottom, so a one-line blurb put it
              40px lower than a three-line one and every page started
              somewhere different (James, 6 Sep 2026). The blurb now flows
              down from it and the rule stays where it is. */}
          {/* balance, so a greeting that will not fit on one line breaks into
              two even ones rather than leaving a single orphaned word. */}
          <h1 className="text-balance leading-tight" style={{ fontSize: titleSize }}>{title}</h1>
          <p className="mt-2.5 max-w-md text-[13px] text-muted">{blurb}</p>
          {/* The page's own controls, in the gap between the blurb and the
              rule - pushed down to sit just above the line rather than
              floating in the middle of it. Same place on every screen. */}
          {actions && <div className="mt-auto flex flex-wrap items-center gap-2.5 pt-6">{actions}</div>}
        </div>

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
                   background can be stepped through. She is a FILLED figure —
                   white face, white top — so she carries .art-figure and is not
                   inverted, or dark mode gives her a black face. */
                <span
                  aria-hidden
                  className={`art art-figure relative block h-full ${spriteClass}`}
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
                /* Square unless the scene says otherwise. A layered scene
                   needs its box to be the artwork's real shape, or the
                   percentage offsets inside it are measured against the
                   wrong width. */
                <div
                  className="relative h-full"
                  style={{ width: Math.round(illustrationHeight * (illustrationAspect ?? 1)) }}
                >
                  {illustrationNode}
                </div>
              ) : (
                <span className="relative block h-full">
                  {castsShadow && (
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
                    className={`art relative h-full w-auto${
                      /* Filled figure art must not be inverted — see .art-figure */
                      illustration?.endsWith(".png") ? " art-figure" : ""
                    }`}
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
      </div>

    </>
  );
}
