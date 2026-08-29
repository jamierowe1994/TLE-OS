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
 * afterwards. html2canvas renders whatever the DOM says, so a password typed
 * into a visible input would otherwise be legible in the picture — and a
 * screenshot is exactly the kind of thing that gets forwarded.
 *
 * ── It must never stop a report being sent ────────────────────────────────
 *
 * The picture is the nice-to-have; the words are the point. Every failure path
 * returns null and the report goes without it. An agent who has just hit a bug
 * should not then hit a second one trying to tell us about the first.
 */

/** Longest edge, in CSS pixels. Enough to read a screen, small enough to store. */
const MAX_EDGE = 1400;
/** JPEG rather than PNG: a screenshot of a UI compresses to roughly a tenth. */
const QUALITY = 0.72;

export async function captureScreen(): Promise<string | null> {
  if (typeof window === "undefined") return null;

  /* Blank anything secret BEFORE drawing, and restore it after. Kept in a list
     rather than done in place so the restore runs even if the draw throws. */
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

    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(document.body, {
      /* Only what they can actually see. Capturing the full scroll height of a
         long board turns a screenshot into a poster and tells you less about
         where they were. */
      windowWidth: document.documentElement.clientWidth,
      windowHeight: document.documentElement.clientHeight,
      x: window.scrollX,
      y: window.scrollY,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      scale: 1,
      useCORS: true,
      /* A missing remote image must not take the picture down with it. */
      logging: false,
      backgroundColor: "#ffffff",
    });

    const scale = Math.min(1, MAX_EDGE / Math.max(canvas.width, canvas.height));
    if (scale === 1) return canvas.toDataURL("image/jpeg", QUALITY);

    const out = document.createElement("canvas");
    out.width = Math.round(canvas.width * scale);
    out.height = Math.round(canvas.height * scale);
    const ctx = out.getContext("2d");
    if (!ctx) return canvas.toDataURL("image/jpeg", QUALITY);
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out.toDataURL("image/jpeg", QUALITY);
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
