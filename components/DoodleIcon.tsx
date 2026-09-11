// Hand-drawn doodle icons (licensed set, /public/icons/doodle). The SVGs are
// solid black fills, so they're rendered through a CSS mask — the icon takes
// `currentColor`, which means active/muted states are just text colour, same
// as any stroke icon. Add more by dropping SVGs into the folder and passing
// their filename as `name`.

export default function DoodleIcon({
  name,
  size = 18,
  className = "",
}: {
  /**
   * Two sets, chosen by whether the name has a folder in it:
   *
   *   "mail"        → /icons/doodle/mail.svg      the original doodle set
   *   "pack/house"  → /icons/pack/house.svg       the 250-icon Icons pack
   *
   * The pack is the preferred set — more of it, and better drawn — with the
   * doodle set as the fallback for anything it doesn't cover. Both are solid
   * ink on transparent, so both mask identically and take currentColor.
   *
   * Extensions are implied except for the PNG masks ("bed.png").
   */
  name: string;
  size?: number;
  className?: string;
}) {
  const file = name.includes(".") ? name : `${name}.svg`;
  const url = `url(/icons/${name.includes("/") ? file : `doodle/${file}`})`;
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        backgroundColor: "currentColor",
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        /* 90%, not contain: the drawings run to the very edge of their
           viewBox, and at 13px the top stroke of a head or a speech bubble
           was being lost to anti-aliasing (James, 11 Sep 2026). */
        WebkitMaskSize: "90%",
        maskSize: "90%",
        WebkitMaskPosition: "center",
        maskPosition: "center",
      }}
    />
  );
}
