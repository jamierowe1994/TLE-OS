/**
 * A picture of the screen, taken at the moment somebody reports a problem.
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * James, 29 Aug: Susan opened the OS, saw somebody else's details, and the
 * next thing that had to happen was "can you send me a screenshot?" — a round
 * trip, on a working day, to learn something the browser already knew.
 *
 * A report that arrives with the screen attached removes that entirely. It is
 * also the honest answer to "can I take over their window": you cannot drive
 * somebody's browser from a web page, but you can see what they were looking
 * at when they gave up.
 *
 * ── What it deliberately does NOT capture ─────────────────────────────────
 *
 * Password fields are blanked before the canvas is drawn, and put back
 * afterwards. The drawing renders whatever the DOM says, so a password typed
 * into a visible input would otherwise be legible in the picture — and a
 * screenshot is exactly the kind of thing that gets forwarded.
 *
 * ── It must never stop a report being sent ────────────────────────────────
 *
 * The picture is the nice-to-have; the words are the point. Every failure path
 * returns null and the report goes without it. An agent who has just hit a bug
 * should not then hit a second one trying to tell us about the first.
 *
 * That includes taking too long. html2canvas, which did this until 14 Sep
 * 2026, re-implements layout in JavaScript: on these screens it held the one
 * browser thread so long that it never came back at all, no picture was ever
 * stored, and the report sat unsent behind it. modern-screenshot draws the
 * DOM into an SVG foreignObject instead, which the browser itself renders.
 *
 * Belt and braces on top: the draw is raced against a clock, and the report
 * is posted BEFORE the picture is taken (see CrashScreen), so the words never
 * wait on it again.
 */

/** Longest edge, in CSS pixels. Enough to read a screen, small enough to store. */
const MAX_EDGE = 1400;
/** JPEG rather than PNG: a screenshot of a UI compresses to roughly a tenth. */
const QUALITY = 0.72;

/** Longer than a draw should ever take, shorter than somebody's patience. */
const GIVE_UP_AFTER = 6000;

export async function captureScreen(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  /* Blank anything secret BEFORE drawing, and restore it after. Kept in a list
     rather than done in place so the restore runs even if the draw throws -
     or never finishes, which is why the restore is out here and not inside
     the draw: an abandoned draw must not leave the panel invisible. */
  const masked: Array<[HTMLInputElement, string]> = [];
  const hidden: Array<[HTMLElement, string]> = [];
  try {
    document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((el) => {
      masked.push([el, el.value]);
      el.value = "";
    });

    /* Hide the reporting panel itself. It is open at the moment somebody
       presses send, and it sits over the middle of the screen — so without
       this the picture reliably obscures the very thing being reported. */
    document.querySelectorAll<HTMLElement>("[data-hide-from-shot]").forEach((el) => {
      hidden.push([el, el.style.visibility]);
      el.style.visibility = "hidden";
    });

    return await Promise.race([
      draw(),
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), GIVE_UP_AFTER)),
    ]);
  } catch {
    /* The words are the report. The picture is a bonus. */
    return null;
  } finally {
    masked.forEach(([el, v]) => {
      el.value = v;
    });
    hidden.forEach(([el, v]) => {
      el.style.visibility = v;
    });
  }
}

/** The draw itself. Everything it touches is put back by its caller. */
async function draw(): Promise<string | null> {
  try {
    const { domToJpeg } = await import("modern-screenshot");
    const w = document.documentElement.clientWidth;
    const h = document.documentElement.clientHeight;
    const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
    return await domToJpeg(document.body, {
      /* Only what they can actually see. Capturing the full scroll height of a
         long board turns a screenshot into a poster and tells you less about
         where they were. */
      width: w,
      height: h,
      scale,
      quality: QUALITY,
      backgroundColor: "#ffffff",
      /* A font or an image that will not load must not take the picture down
         with it, and must not hold it up either. */
      timeout: 4000,
      style: { transform: `translate(${-window.scrollX}px, ${-window.scrollY}px)` },
    });
  } catch {
    /* The words are the report. The picture is a bonus. */
    return null;
  }
}
