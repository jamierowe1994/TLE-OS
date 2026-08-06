/**
 * A property's photo, with the house placeholder when REX has none.
 *
 * "No photo" is a real state, not an error — 4 of the 10 sampled rentals have
 * no image at all — so the fallback is part of the design rather than a
 * broken-image box. Every surface that shows a property should use this.
 */
export default function PropertyPhoto({
  src,
  alt = "",
  className = "",
}: {
  src?: string | null;
  alt?: string;
  className?: string;
}) {
  const url = src || "/illustrations/no-property.png";
  return (
    // The placeholder is a drawing, not a photograph: it sits on the eggshell
    // with `contain` so the house isn't cropped, where a real photo fills.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt={alt}
      aria-hidden={!alt}
      className={`${src ? "object-cover" : "bg-page object-contain p-0.5"} ${className}`}
    />
  );
}
