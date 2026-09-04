import * as React from "react";
import type { PresentStyle, SlideId } from "@/lib/present";

/**
 * The deck's shared parts — colours, the reveal, the slide shell, the icons.
 *
 * Lifted out of PresentDeck.tsx when the market-appraisal structure landed and
 * the slide count went from six to thirty. Two files now render slides
 * (PresentDeck for the ones that read live deck data, PresentSlides for the
 * standing-copy ones) and both need these, so they live in neither. Nothing
 * here changed in the move except the word `export`.
 */

/**
 * Straight out of TLE Branding 3 — no approximations, no eyedroppered guesses.
 *
 *   Expert Red      #E31F36   the brand
 *   Expert Grey     #3B3B3C   type on light
 *   Anti Flash White #F1F1F1  the quiet surface
 *   Warm Clay       #DE968F   the darker of the two pinks — the banner
 *   Mist            #FFE4DF   the lighter pink
 *
 * The guidelines list "White #000000", which is a typo in the deck rather
 * than an instruction; white is white.
 */
export const RED = "#e31f36";
export const INK = "#3b3b3c";

/**
 * ── THE COLOURWAY SWITCH ────────────────────────────────────────────────────
 *
 * The deck was first built on the guidelines' warm colourway — Warm Clay
 * banners and Mist cards. It looked good and read FEMININE (James, 13 Aug),
 * which for a landlord audience is the wrong signal however pretty it is.
 *
 * So it now runs on the guidelines' other sanctioned pairing: Expert Red ×
 * White, grounded on Anti Flash White. Same brand, different temperature —
 * the pinks were doing all the softening, and red does none of it.
 *
 * Both sets are kept side by side rather than one being deleted, because
 * this is a judgement about tone that may well be revisited. Swapping the
 * two blocks below puts the warm version back in one edit.
 */
export const CLAY = RED;
/** WAS Warm Clay #de968f — the entrance banner, the chips, the card badges. */
export const MIST = "#f1f1f1";
/** WAS Mist #ffe4df — the appointment card and the footer band. */
/** Deep enough to carry white type, still in the clay family rather than grey.
 *  Used only for the scrim over the hero photograph. */
export const DEEP = "#4a3a35";

/**
 * The flourish hand — see app/layout.tsx for why a script is here at all when
 * the guidelines name Lora Italic. One display word, never body copy.
 */
export const FLOW = "var(--font-script), 'Snell Roundhand', cursive";

/** Lora — the guidelines' own serif, carrying the display headings. */
export const DISPLAY = "var(--font-display), Georgia, serif";

/** The interior page ground. Neutral now rather than warm-cast: a grey card
 *  on pink paper reads as a mistake, and the paper was half the softness. */
export const PAPER = "#fbfbfb";
/** The step badges. Red at a whisper — enough to hold an icon, not enough to
 *  compete with the card. */
export const BADGE = "#fdeaec";

/* ── The entrance screen's own palette ──────────────────────────────────────
 *
 * James's mock-up of 4 Sep moves the opening slide off the photograph and onto
 * a warm off-white with the hand-drawn illustration beside it. That is not a
 * decoration change, it is the OS's own house style — the same Notioly line
 * and the same eggshell the rest of TLE-OS runs on — arriving on the deck.
 *
 * These are kept separate from the tokens above rather than replacing them,
 * because at the moment exactly one slide uses them. The other twenty-nine
 * still run on Expert Red and white, and a half-converted deck is worse than
 * either whole one, so the rest follow slide by slide.
 */

/* ── THE THEME, as CSS variables ────────────────────────────────────────────
 *
 * James, 4 Sep: the team are split on the drawn style, so the deck offers
 * three looks and the room picks one. See PresentStyle in lib/present.
 *
 * The mechanism matters more than it looks. These four constants are used 121
 * times across the three slide files - `fontFamily: HAND`, `color: CORAL`,
 * `background: TINTS[0]` - and making each of those read a theme object would
 * have meant a hook in thirty components and a diff nobody could review.
 *
 * As CSS variables they cost nothing: the deck root stamps a value, every
 * existing usage picks it up, and not one slide has to know a choice exists.
 * It also means the theme can change on a click with no remount, which is what
 * makes the picker on /present/sample worth having.
 *
 * The names stay HAND and CORAL rather than becoming DISPLAY and ACCENT. They
 * were named after the thing they were, the rename would touch every line they
 * appear on, and a 121-line diff that changes nothing is a worse artefact than
 * two slightly historical names.
 */

/** The page. */
export const CREAM = "var(--p-ground)";
/** The one accent: the script word, the figures, the bars, the buttons. */
export const CORAL = "var(--p-accent)";
/** The display face - the headline on every slide. */
export const HAND = "var(--p-display)";
/** The emphasised word inside a headline. */
export const FLOW_EM = "var(--p-script)";
/** The soft fill: badges, blobs, the "on all three levels" panel. */
export const TINTS = ["var(--p-tint)", "var(--p-tint-2)", "var(--p-tint-3)"] as const;

/**
 * The accent as a real hex, for the one place a CSS variable cannot go: Flow's
 * embed takes its accent as a query-string colour, and `var(--p-accent)` in a
 * URL is just a broken parameter.
 */
export const ACCENT_HEX: Record<PresentStyle, string> = {
  hand: "#e08a73",
  brand: "#e31f36",
  photo: "#e31f36",
};

/**
 * What each look is made of.
 *
 * `brand` and `photo` share their typography and differ only in artwork, which
 * is exactly what James asked for: the halfway house keeps the illustrations,
 * the fully branded one swaps them for photographs.
 *
 * The type comes from TLE Branding 3, which specifies Unitext Bold for titles
 * and subheadings, Unitext for body and Lora Italic for supporting text.
 * Unitext is licensed and not on any machine here; James chose Inter in its
 * place (4 Sep) rather than shipping a fallback that pretends to be it.
 * Lora Italic is the guidelines' own supporting face and carries the
 * emphasised word, which is the nearest brand-sanctioned thing to the script.
 */
export type DeckTheme = {
  ground: string;
  accent: string;
  tint: string;
  tint2: string;
  tint3: string;
  display: string;
  script: string;
  /** Drawn illustrations, or photographs where we have them. */
  art: "drawn" | "photo";
};

const INTER = "var(--font-inter), system-ui, -apple-system, sans-serif";
const LORA_IT = "var(--font-display), Georgia, serif";

export const THEMES: Record<PresentStyle, DeckTheme> = {
  /* Untouched, deliberately. This is the one somebody already likes, and the
     whole point of adding the other two was to avoid changing it. */
  hand: {
    ground: "#faf7f3",
    accent: "#e08a73",
    tint: "#fbe7e2",
    tint2: "#e9eee4",
    tint3: "#fdf2da",
    display: "var(--font-shantell), 'Trebuchet MS', sans-serif",
    script: "var(--font-script), 'Snell Roundhand', cursive",
    art: "drawn",
  },
  /* Anti Flash White and Expert Red - a colourway the guidelines name, so the
     halfway house is not a compromise anybody has to defend. */
  brand: {
    ground: "#f4f4f3",
    accent: "#e31f36",
    tint: "#ffe4df",
    tint2: "#eceeea",
    tint3: "#f7f1e4",
    display: INTER,
    script: LORA_IT,
    art: "drawn",
  },
  photo: {
    ground: "#ffffff",
    accent: "#e31f36",
    tint: "#ffe4df",
    tint2: "#f1f1f1",
    tint3: "#f7f1e4",
    display: INTER,
    script: LORA_IT,
    art: "photo",
  },
};

/** The variables a theme stamps. Spread onto the deck root's `style`. */
export function themeVars(style: PresentStyle): React.CSSProperties {
  const t = THEMES[style] ?? THEMES.hand;
  return {
    ["--p-ground" as string]: t.ground,
    ["--p-accent" as string]: t.accent,
    ["--p-tint" as string]: t.tint,
    ["--p-tint-2" as string]: t.tint2,
    ["--p-tint-3" as string]: t.tint3,
    ["--p-display" as string]: t.display,
    ["--p-script" as string]: t.script,
  };
}

/**
 * Which slides have been converted to the cream style.
 *
 * ONE LIST, read by the slides themselves and by the deck chrome, because the
 * chrome has to know what ground it is sitting on to pick its own colours. A
 * slide converted in one place and not the other gets a red progress bar on a
 * cream page, which is exactly the sort of thing that ships.
 *
 * Converting a slide is: build it on `CreamSlide`, add its id here. The rest
 * of the deck is still Expert Red on white and stays that way until its turn.
 */
export const CREAM_SLIDES: SlideId[] = ["welcome", "agenda", "agent", "approach", "property", "material", "listings", "comparables", "market", "history", "marketing", "offer", "maxprice", "video", "compliance", "legal", "screening", "management", "levels", "collection", "protection", "rentlegal", "regulated", "brochure", "portals", "social", "network", "why", "testimonial", "valuation", "fees", "terms", "questions"];

export const isCream = (id: SlideId | undefined) => !!id && CREAM_SLIDES.includes(id);

/* ───────────────────────── the reveal ───────────────────────── */

/**
 * Slides don't arrive, they surface.
 *
 * James's note: landing on a slide "feels like getting jolted into a bunch of
 * information". True, and it was structural rather than cosmetic — every
 * element of a slide painted at the same instant, so a heading, four numbered
 * steps and a card all demanded attention simultaneously and the eye had
 * nowhere to start.
 *
 * So each block rises in turn, top down, and the order IS the reading order.
 * Roughly 90ms apart: enough to feel choreographed, not enough that anyone
 * waits for it.
 *
 * Two details that matter more than they look:
 *
 *  • The easing is a strong ease-OUT (fast, then settling). Anything with
 *    acceleration in it reads as a slide transition; this reads as focus.
 *
 *  • It respects prefers-reduced-motion — for some people this kind of thing
 *    is genuinely unpleasant, and a landlord can't ask us to turn it off.
 */
export function Rise({
  show,
  i = 0,
  className = "",
  style,
  children,
}: {
  show: boolean;
  /** Position in the stagger, not in the DOM. */
  i?: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`present-rise ${className}`}
      style={{
        ...style,
        opacity: show ? 1 : 0,
        transform: show ? "none" : "translateY(18px)",
        transitionDelay: `${i * 90}ms`,
      }}
    >
      {children}
    </div>
  );
}

/* ───────────────────────── small parts ───────────────────────── */

export function Eyebrow({ children, on = "light" }: { children: React.ReactNode; on?: "light" | "dark" }) {
  return (
    <span
      className="block text-[10px] font-semibold uppercase tracking-[0.22em]"
      style={{ color: on === "dark" ? "rgba(255,255,255,0.72)" : RED }}
    >
      {children}
    </span>
  );
}

/** The wordmark. Two files exist because one of them has to sit on red. */
export function Mark({ on = "light", className = "h-9" }: { on?: "light" | "dark"; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={on === "dark" ? "/brand/tle-logo-white.png" : "/brand/tle-logo.png"}
      alt="The Letting Experts"
      className={`${className} w-auto`}
    />
  );
}

/**
 * A slide. `dark` flips the whole thing to red, which is used exactly twice —
 * the opening and the closing — so the deck has a shape rather than a rhythm
 * of alternating panels nobody asked for.
 */
export function Slide({
  id,
  dark = false,
  children,
}: {
  id: SlideId;
  dark?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      data-slide={id}
      // min-h rather than h, and no overflow-hidden on the section itself.
      //
      // This was h-[100dvh] with the overflow clipped, which is the right
      // shape for a deck and the wrong one for a phone: the appointment slide
      // is genuinely taller than 812px, and clipping meant the heading was
      // cut off the top and the calendar button off the bottom with nothing
      // to say so. A slide that quietly loses half its content is worse than
      // one that scrolls.
      //
      // pb-28 keeps the last line clear of the bottom bar, which is now a
      // solid strip on every width rather than a fade on phones only.
      //
      // The old `lg:pr-48` is gone with the contents rail it was reserving
      // room for. It was measured against a rail that reached 188px in; there
      // is nothing floating over the right of a slide any more, and holding
      // the reserve back would leave every slide's measure short of the page
      // for no reason. pt-20 replaces pt-16 for the same trade at the top:
      // the counter now sits up there.
      className="relative flex min-h-full w-full shrink-0 flex-col justify-center px-6 pb-28 pt-20 sm:px-10 lg:px-20 lg:pb-24"
      style={{ background: dark ? RED : "#ffffff", color: dark ? "#ffffff" : INK }}
    >
      {children}
    </section>
  );
}

/* ───────────────────────── the slides ───────────────────────── */

/**
 * The line icons.
 *
 * Inline SVG rather than a font or a sprite: the deck must render with no
 * network beyond its own page, because a landlord opens this standing in a
 * kitchen on one bar of signal, and an icon set that arrives late is worse
 * than one that never existed.
 *
 * One stroke weight, one grid, currentColor throughout — so a badge sets the
 * colour once and every icon inside it obeys.
 */
export type IconName =
  | "people"
  | "shield"
  | "trend"
  | "home"
  | "chart"
  | "star"
  | "calendar"
  | "pin"
  | "person"
  | "check"
  | "phone"
  | "chat"
  | "heart"
  | "whatsapp"
  | "mail";

/** Which icon belongs to which beat of the visit, in order. */
export const STEP_ICONS: IconName[] = ["home", "chart", "people", "star"];

const PATHS: Record<IconName, React.ReactNode> = {
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
      <path d="M16 5.5a3 3 0 0 1 0 5.6M17 14.4a5.5 5.5 0 0 1 3.5 4.6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3l7 3v5.5c0 4.3-2.9 7.9-7 9.5-4.1-1.6-7-5.2-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  trend: (
    <>
      <path d="M3 17l5.5-5.5 3.5 3.5L21 6" />
      <path d="M15.5 6H21v5.5" />
    </>
  ),
  home: (
    <>
      <path d="M4 10.5L12 4l8 6.5" />
      <path d="M6 9.8V20h12V9.8" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20V12M10 20V6M15 20v-5M20 20v-9" />
    </>
  ),
  star: (
    <path d="M12 4l2.5 5.1 5.5.8-4 3.9.9 5.6-4.9-2.6-4.9 2.6.9-5.6-4-3.9 5.5-.8z" />
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3.5v3M16 3.5v3" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.8 7-11a7 7 0 1 0-14 0c0 5.2 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  person: (
    <>
      <circle cx="12" cy="8.5" r="3.4" />
      <path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </>
  ),
  check: <path d="M4 12.5l5 5L20 6.5" />,
  phone: (
    <path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 0 0 6.1 6.1l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.5 5.7 2 2 0 0 1 6.5 3.5z" />
  ),
  chat: (
    <path d="M20 12.5a7 7 0 0 1-7 7H8l-4 2.5.9-3.6A7 7 0 0 1 4 12.5a7 7 0 0 1 7-7h2a7 7 0 0 1 7 7z" />
  ),
  heart: (
    <path d="M12 20s-7-4.4-7-9.3A4 4 0 0 1 12 8a4 4 0 0 1 7-2.7c0 4.9-7 14.7-7 14.7z" />
  ),
  whatsapp: (
    <>
      <path d="M20 11.6a8 8 0 0 1-11.9 7L3.5 20.5l2-4.5A8 8 0 1 1 20 11.6z" />
      <path d="M9 8.7c.3-.1.6 0 .8.3l.7 1.2c.1.3.1.6-.1.8l-.5.5a5.4 5.4 0 0 0 2.6 2.6l.5-.5c.2-.2.5-.2.8-.1l1.2.7c.3.2.4.5.3.8-.2.7-.9 1.2-1.7 1.1a7.6 7.6 0 0 1-5.7-5.7c-.1-.8.4-1.5 1.1-1.7z" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="M3.6 7L12 13l8.4-6" />
    </>
  ),
};

export function Line({
  name,
  size = 24,
  filled = false,
}: {
  name: IconName;
  size?: number;
  /** Solid rather than outlined. Only the star needs it, and it needs it
   *  badly: five outlined stars beside a five-star review read as five EMPTY
   *  stars, which says the opposite of what the slide is for. */
  filled?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}

/* ───────────────────────── the cream style ───────────────────────── */

/**
 * A slide on the warm ground, in the marker hand.
 *
 * The shell only — padding, ground, and the room the fixed chrome needs at the
 * top and bottom. Everything above the fold on these slides is composed per
 * slide, because the whole point of the style is that each one looks drawn
 * rather than filled in.
 */
export function CreamSlide({
  id,
  children,
}: {
  id: SlideId;
  children: React.ReactNode;
}) {
  return (
    <section
      data-slide={id}
      className="relative flex min-h-full w-full shrink-0 flex-col justify-center px-6 pb-28 pt-20 sm:px-10 lg:px-14 lg:pb-24 lg:pt-14"
      style={{ background: CREAM, color: INK }}
    >
      {children}
    </section>
  );
}

/**
 * The word a headline turns on.
 *
 * Script rather than marker, coral rather than ink, and underlined by hand —
 * three signals that this is the point of the sentence. The rule is an SVG
 * path rather than a border because a straight line under a handwritten word
 * looks like a mistake in the type, and it DRAWS rather than appearing, so the
 * emphasis lands a beat after the word it emphasises.
 *
 * `HAND_WORDS` carries pen paths for "welcome" and "lets" only, so this cannot
 * be a written HandWord. The underline carries the hand instead.
 */
export function Emphasis({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <span className="relative inline-block">
      <span
        className="relative"
        style={{
          fontFamily: FLOW_EM,
          color: CORAL,
          fontSize: "1.22em",
          lineHeight: 1,
          paddingRight: "0.06em",
        }}
      >
        {children}
      </span>
      <svg
        viewBox="0 0 200 14"
        preserveAspectRatio="none"
        aria-hidden
        className="absolute inset-x-0 -bottom-[0.06em] h-[0.16em] w-full overflow-visible"
      >
        <path
          d="M3 9.5C34 4.5 74 3 104 4.2C134 5.4 168 8 197 5"
          fill="none"
          stroke={CORAL}
          strokeWidth={4}
          strokeLinecap="round"
          pathLength={1}
          style={{
            strokeDasharray: 1,
            strokeDashoffset: show ? 0 : 1,
            transition: "stroke-dashoffset 700ms cubic-bezier(0.22,1,0.36,1) 520ms",
          }}
        />
      </svg>
    </span>
  );
}

/**
 * Eyebrow and headline, in the cream style.
 *
 * The size is set by the LONGEST line rather than by what looks biggest —
 * measured on the entrance, where the first size that let the headline wrap to
 * a fourth line pushed the content below it under the bottom bar. `lines` lets
 * a slide say how many its headline breaks to, so a two-line heading can run
 * larger than a three-line one without either being hand-tuned per width.
 */
export function HandHead({
  eyebrow,
  show,
  lines = 3,
  className = "",
  children,
}: {
  eyebrow: string;
  show: boolean;
  lines?: 2 | 3;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <Rise show={show} i={0}>
        <span className="block text-[11px] font-semibold uppercase tracking-[0.3em] text-black/40">
          {eyebrow}
        </span>
      </Rise>
      <Rise show={show} i={1}>
        <h2
          className={`mt-4 leading-[1.04] tracking-[-0.015em] ${className}`}
          style={{
            fontFamily: HAND,
            fontWeight: 700,
            fontSize: lines === 2 ? "clamp(32px, 3.6vw, 54px)" : "clamp(34px, 4.35vw, 66px)",
          }}
        >
          {children}
        </h2>
      </Rise>
    </>
  );
}

/* ───────────────────────── the property detail ───────────────────────── */

/**
 * What a landlord sees when they tap a comparable.
 *
 * James, 4 Sep: the comparison slides were "just listing out some random
 * properties with nothing attached to them", and he wanted photographs, the
 * agent, the price and the rest behind a click. He is right, and the reason is
 * sharper than "it looks better": a landlord cannot judge whether the flat at
 * £1,150 is better or worse than theirs from an address and a number. With the
 * photographs they can, and judging it is the entire job of the slide.
 *
 * ── An overlay rather than a slide of its own ──────────────────────────────
 *
 * Twelve comparables cannot each have a slide, and a deck that grows a slide
 * per property stops being a deck. This is the standard answer - the list
 * stays the argument, the detail is available on demand, and closing it puts
 * you back exactly where you were rather than somewhere further along.
 *
 * ── Three things it must not do ────────────────────────────────────────────
 *
 *  • NEVER open on a row with no photographs. A gallery that opens empty is
 *    worse than a row that does not respond: the first looks broken, the
 *    second looks like a list. The caller checks before it offers the click.
 *  • Never trap anybody. Escape, the backdrop and a visible close button, and
 *    the arrow keys page the photographs rather than the deck while it is up.
 *  • Never scroll the deck underneath. The slide behind it holds still.
 */
export function PropertyDetail({
  open,
  onClose,
  title,
  locality,
  rent,
  photos,
  facts,
  advert,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  locality: string;
  rent: string;
  photos: string[];
  /** Short pairs - beds, type, status, how long, who it is with. */
  facts: { label: string; value: string }[];
  advert?: string | null;
}) {
  const [at, setAt] = React.useState(0);
  const count = photos.length;

  /* Back to the first photograph whenever a DIFFERENT property is opened.
     Keyed on the title rather than on `open`, so re-opening the same one where
     you left it is deliberate and opening the next one is not confusing. */
  React.useEffect(() => setAt(0), [title]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      /* The arrows belong to the GALLERY while this is up. Without stopping
         them the deck moves sideways behind the overlay, and closing it lands
         the landlord on a slide they never chose. */
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        e.stopPropagation();
        if (count > 1) {
          setAt((i) => (e.key === "ArrowRight" ? (i + 1) % count : (i - 1 + count) % count));
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose, count]);

  if (!open || count === 0) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      style={{ background: "rgba(32,28,26,0.55)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className="relative flex max-h-full w-full max-w-[860px] flex-col overflow-hidden rounded-[20px]"
        style={{ background: CREAM }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative bg-black/5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={photos[at]}
            alt={title}
            className="max-h-[52vh] w-full object-cover"
            style={{ aspectRatio: "3 / 2" }}
          />

          {count > 1 && (
            <>
              <button
                type="button"
                onClick={() => setAt((i) => (i - 1 + count) % count)}
                aria-label="Previous photograph"
                className="absolute left-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 transition-opacity hover:opacity-100"
                style={{ color: INK }}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ transform: "scaleX(-1)" }}>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => setAt((i) => (i + 1) % count)}
                aria-label="Next photograph"
                className="absolute right-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-white/90"
                style={{ color: INK }}
              >
                <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>
              <span
                className="absolute bottom-3 right-3 rounded-full px-2.5 py-1 text-[11px] tabular-nums text-white"
                style={{ background: "rgba(0,0,0,0.45)" }}
              >
                {at + 1} / {count}
              </span>
            </>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-[18px] leading-none"
            style={{ color: INK }}
          >
            &times;
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 sm:px-7">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
            <h3 className="text-[19px] leading-snug" style={{ fontFamily: HAND, fontWeight: 700 }}>
              {title}
            </h3>
            <span className="text-[20px]" style={{ fontFamily: HAND, fontWeight: 700, color: CORAL }}>
              {rent}
            </span>
          </div>
          {locality && <p className="mt-0.5 text-[12.5px] font-light text-black/50">{locality}</p>}

          {facts.length > 0 && (
            <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 border-t border-black/10 pt-3.5">
              {facts.map((f) => (
                <div key={f.label}>
                  <dt className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-black/40">
                    {f.label}
                  </dt>
                  <dd className="mt-0.5 text-[13.5px]">{f.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {advert && (
            <a
              href={advert}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-block text-[12.5px] underline"
              style={{ color: CORAL }}
            >
              See the full advert
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
