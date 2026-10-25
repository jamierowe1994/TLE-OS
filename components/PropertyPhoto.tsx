/**
 * A property's photo, with a drawn tile when the book has none.
 *
 * "No photo" is a real state, not an error — 4 of the 10 sampled rentals have
 * no image at all — so the fallback is part of the design rather than a
 * broken-image box. Every surface that shows a property should use this.
 *
 * The tile (James, 25 Oct 2026, from the design's cards): a soft colour from
 * the palette - brown, coral, green or dark sage - with a line drawing of a
 * house, a block of flats or a terrace. Give it a `seed` (the home's id) so a
 * board of them isn't one colour, and a `kind` (its type, or its name) so a
 * flat looks like a flat. Like a photograph, it stays light in dark mode.
 */

/* Soft, as the design's cards have them, the drawing a deeper shade of each. */
const TILES = [
  { bg: "#e0d8cc", ink: "#6b5f55" }, // brown
  { bg: "#f1ddd2", ink: "#8f5a48" }, // coral
  { bg: "#e3e3d3", ink: "#5d6b55" }, // green
  { bg: "#cfd3c0", ink: "#4a5444" }, // dark sage
] as const;

/* FNV-1a, so neighbouring ids (851755, 851757) land on different colours. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

type Shape = "house" | "flats" | "terrace";

/** What to draw, from a property type or failing that the address. */
function shapeOf(kind: string): Shape {
  const k = kind.toLowerCase();
  if (/flat|apartment|maisonette|studio|penthouse|block|\d+\s*\/\s*\d+/.test(k)) return "flats";
  if (/terrace|semi|town\s*house|end of|mews|cottage row/.test(k)) return "terrace";
  return "house";
}

function Drawing({ shape }: { shape: Shape }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (shape === "flats") {
    return (
      <svg viewBox="0 0 72 48" {...common} aria-hidden>
        <path d="M4 46h64M12 46V6h24v40M36 46V20h18v26" />
        <path d="M18 14h4M26 14h4M18 22h4M26 22h4M18 30h4M26 30h4M42 28h6M42 36h6" />
      </svg>
    );
  }
  if (shape === "terrace") {
    return (
      <svg viewBox="0 0 72 48" {...common} aria-hidden>
        <path d="M4 46h64M10 46V24l13-10 13 10 13-10 13 10v22M36 24v22" />
        <path d="M18 46V36h7v10M45 46V36h7v10" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 72 48" {...common} aria-hidden>
      <path d="M4 46h64M16 46V22L36 6l20 16v24" />
      <path d="M32 46V35h8v11" />
    </svg>
  );
}

export default function PropertyPhoto({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  width = 800,
  height = 600,
  seed = "",
  kind = "",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
  /** "eager" for a photo that is on screen the moment the page opens (a hero). */
  loading?: "lazy" | "eager";
  /** Intrinsic size, for the browser's aspect ratio before the file arrives.
   *  REX's thumbnails are 800x600; the drawn size still comes from className. */
  width?: number;
  height?: number;
  /** No photo: which of the four colours, kept the same for the same home. */
  seed?: string | number;
  /** No photo: the property type, or its name, to choose the drawing. */
  kind?: string | null;
}) {
  if (!src) {
    const t = TILES[hash(String(seed || kind || "")) % TILES.length];
    return (
      <span
        role={alt ? "img" : undefined}
        aria-label={alt || undefined}
        aria-hidden={!alt}
        className={`pp-tile ${className}`}
        style={{ background: t.bg, color: t.ink }}
      >
        <Drawing shape={shapeOf(kind ?? "")} />
      </span>
    );
  }
  return (
    // Lazy and decoded off the main thread (2 Oct 2026): the Listings board
    // draws ~270 of these, and every one was fetched and decoded on open,
    // including the two hundred below the fold.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      aria-hidden={!alt}
      loading={loading}
      decoding="async"
      width={width}
      height={height}
      className={`object-cover ${className}`}
    />
  );
}
