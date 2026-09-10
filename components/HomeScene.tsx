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

/** width ÷ height of the artwork. The header needs it to size the box. */
export const HOME_SCENE_ASPECT = 1374 / 1066;

/**
 * How much of the scene sits BELOW the rule, as a fraction of the canvas.
 *
 * The line goes under the DOG - he is lying on the sill and that is what the
 * drawing rests on. Below him the sofa front and the man's trailing leg carry
 * on for another 5.7%, and those pass under the line rather than stopping at
 * it, which is what James asked for.
 *
 * The scene is dropped by this so the dog meets the rule.
 */
const BELOW_RULE = 1 - 0.943;

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
      {/* Dropped so the DOG lands on the rule. The scene is deliberately
          taller than the header: the window runs off the top and is cut by
          the window edge, which is the whole point of this artwork. */}
      <span
        aria-hidden
        className={`home-scene absolute left-0 right-0 block h-full ${className}`}
        style={{ top: `${BELOW_RULE * 100}%` }}
      />
    </>
  );
}
