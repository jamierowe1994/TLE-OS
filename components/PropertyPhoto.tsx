/**
 * A property's photo, with the house placeholder when REX has none.
 *
 * "No photo" is a real state, not an error — 4 of the 10 sampled rentals have
 * no image at all — so the fallback is part of the design rather than a
 * broken-image box. It is NOT inverted in dark mode: unlike the line-art
 * illustrations it carries fills, and it stands in for a photograph — which
 * stays light whatever the theme. Every surface that shows a property should use this.
 */
export default function PropertyPhoto({
  src,
  alt = "",
  className = "",
  loading = "lazy",
  width = 800,
  height = 600,
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
}) {
  const url = src || "/illustrations/no-property.png";
  return (
    // The placeholder is a drawing, not a photograph: it sits on the eggshell
    // with `contain` so the house isn't cropped, where a real photo fills.
    //
    // Lazy and decoded off the main thread (2 Oct 2026): the Listings board
    // draws ~270 of these, and every one was fetched and decoded on open,
    // including the two hundred below the fold.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      aria-hidden={!alt}
      loading={loading}
      decoding="async"
      width={width}
      height={height}
      className={`${src ? "object-cover" : "bg-page object-contain p-0.5"} ${className}`}
    />
  );
}
