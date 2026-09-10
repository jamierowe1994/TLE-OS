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
 * They are three renders rather than three recolours, so their crops differ.
 * Each is trimmed to its visible content, scaled to a common width and
 * bottom-aligned on one canvas, which is what keeps the scene the same size
 * and the ground in the same place when the accent changes.
 *
 * WebP, not PNG: these are painted scenes rather than flat line art, and as
 * PNG each one was over a megabyte for a header image. At quality 86 they are
 * 125K with the alpha intact - the same picture, an eighth of the download,
 * which matters on a phone.
 */

/**
 * width ÷ height of the shared canvas. The header needs it to size the box.
 *
 * The canvas is trimmed to what is VISIBLE, not to getbbox(): these files
 * carry a fringe of alpha-1 pixels out to their very edge, and trimming to
 * that left 12.6% of nothing under the artwork - which is why the scene
 * floated above the rule instead of standing on it, and why the three were
 * not even aligned with each other (their visible bottoms were at 0.874,
 * 0.882 and 0.950).
 */
export const HOME_SCENE_ASPECT = 1600 / 717;

export default function HomeScene({ className = "" }: { className?: string }) {
  return (
    <>
      <style>{`
        .home-scene {
          background-image: url(/illustrations/home/clay.webp);
          background-size: contain;
          background-position: right bottom;
          background-repeat: no-repeat;
        }
        :root[data-accent="blush"] .home-scene { background-image: url(/illustrations/home/blush.webp) }
        :root[data-accent="red"]   .home-scene { background-image: url(/illustrations/home/red.webp) }
      `}</style>
      <span aria-hidden className={`home-scene absolute inset-0 block ${className}`} />
    </>
  );
}
