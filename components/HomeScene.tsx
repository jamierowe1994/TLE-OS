/**
 * The dashboard's illustration, in the accent the person picked.
 *
 * ── Why CSS and not React ────────────────────────────────────────────────
 *
 * The accent is already stamped on <html> as `data-accent` by lib/accents,
 * before paint. Choosing the file in CSS off that attribute means the right
 * one is the only one the browser ever fetches, it is correct on the very
 * first frame, and there is no state here to disagree with the server and
 * flash the wrong colour on the way in. Reading the accent in JavaScript
 * would give all three of those problems back for nothing.
 *
 * Clay is the default and clears the attribute rather than setting it - so
 * it is the bare rule, and the other two override it.
 *
 * ── The three files ──────────────────────────────────────────────────────
 *
 * They are three renders rather than three recolours, so their crops differ
 * (2.170 wide for red against 1.798 for clay). They were scaled to a common
 * width and bottom-aligned on one canvas, which is what keeps the scene the
 * same size and the ground in the same place when the accent changes.
 */

/** width ÷ height of the shared canvas. The header needs it to size the box. */
export const HOME_SCENE_ASPECT = 1600 / 890;

export default function HomeScene({ className = "" }: { className?: string }) {
  return (
    <>
      <style>{`
        .home-scene {
          background-image: url(/illustrations/home/clay.png);
          background-size: contain;
          background-position: right bottom;
          background-repeat: no-repeat;
        }
        :root[data-accent="blush"] .home-scene { background-image: url(/illustrations/home/blush.png) }
        :root[data-accent="red"]   .home-scene { background-image: url(/illustrations/home/red.png) }
      `}</style>
      <span aria-hidden className={`home-scene absolute inset-0 block ${className}`} />
    </>
  );
}
