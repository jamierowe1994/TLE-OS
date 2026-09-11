/**
 * Three arcs in a card's far corner, cut off by it.
 *
 * James, 11 Sep 2026, on the leads board's filter row: "obviously it's
 * going to get cut off, but if we can add some swell marks or something,
 * or some lines... right at the other side of the corner." The appraisal
 * hero does this with one big white curve; here it is three hairlines in
 * the palette - blush, sage, clay - swelling out of the top-right corner
 * behind the controls. The card only needs to be `relative`: the clipping
 * happens HERE, on a layer that copies the card's own radius, so a menu
 * dropping out of the card (the customiser, the tags) is never cut off by
 * the same clip that trims the arcs. Takes no clicks.
 */
export default function CornerSwell({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}>
    <svg
      viewBox="0 0 320 160"
      preserveAspectRatio="xMaxYMin slice"
      className="absolute right-0 top-0 h-[160px] w-[320px]"
    >
      <circle cx="320" cy="0" r="70" fill="none" stroke="var(--accent-soft)" strokeWidth="14" />
      <circle cx="320" cy="0" r="112" fill="none" stroke="var(--accent)" strokeWidth="1.5" opacity="0.55" />
      <circle cx="320" cy="0" r="150" fill="none" stroke="var(--sage)" strokeWidth="1.5" opacity="0.8" />
      <circle cx="320" cy="0" r="196" fill="none" stroke="var(--accent-soft)" strokeWidth="1.5" />
    </svg>
    </div>
  );
}
