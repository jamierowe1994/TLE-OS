import { ASSET_V } from "@/lib/email/shell";

/**
 * THE SKY SHELL - the look every TLE OS email is moving onto.
 *
 * James, 13 Sep 2026, with a drawing: a pink sky, the house at the foot of
 * the page standing in its garden, clouds drifting in the margins, the logo
 * small at the top and room to breathe around everything. "Get rid of the
 * green boxes in the top right, get rid of the squiggly line, and add the
 * TLE OS logo. Make it a bit smaller and add some more padding as a whole."
 *
 * It sits beside the white `emailShell` rather than replacing it: nine other
 * emails are on that one and they come across one at a time, each looked at
 * on its own. Both are kept until the last one has moved.
 *
 * ── What email will and will not do, and what that forced here ────────────
 *
 * 1. NO CSS ANIMATION, EVER. Keyframes, transitions, SVG animation and video
 *    are all stripped. An animated GIF is the only thing that moves in an
 *    inbox, so the clouds are GIFs - and because Outlook on Windows draws
 *    only the FIRST frame, frame zero of each is the cloud at rest in the
 *    middle of its drift. Where it cannot float it simply sits.
 * 2. NO TRANSPARENCY WORTH HAVING. GIF alpha is one bit, and a watercolour
 *    edge on a one-bit mask fringes. So the pink is BAKED INTO the clouds and
 *    into the bottom band, and PAPER below must stay exactly the pink they
 *    were drawn on or a seam appears where they meet.
 * 3. NO POSITIONING. There is no absolute, no overlap, no background-image
 *    that Outlook respects. Clouds in the margins are therefore real table
 *    cells either side of the words - a 96px gutter left and right - and the
 *    house is a full-width band in its own row at the foot.
 * 4. NO ROUNDED CORNERS in Outlook. The button is a pill everywhere else and
 *    a clean rectangle there, which is a fair trade for not using an image.
 *
 * The dark-mode rules from the white shell still apply in full: a real
 * `bgcolor` attribute on every table, `background-color` restated on every
 * block that holds text, and the colour-scheme meta. Outlook recolours
 * anything that has not claimed a colour, and a pink email half-inverted is
 * worse than a plain one.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Absolute, always - a relative src resolves against the mail client. */
const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

/** The pink the clouds and the band were drawn on. Change one, change all. */
export const PAPER = "#fdf2ef";
/** The brand clay. The only strong colour in the mail, so only the button. */
const CLAY = "#a85a51";

export interface SkyOpts {
  heading: string;
  intro: string;
  button: string;
  link: string;
  /** The quiet line under the button. Omitted entirely when absent. */
  footnote?: string;
}

export function skyShell(o: SkyOpts): string {
  const safe = esc(o.link);
  const img = (f: string) => `${ORIGIN}/email/sky/${f}?v=${ASSET_V}`;
  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Manrope:wght@600..800&display=swap" rel="stylesheet">
<!-- Phones. Every width below is a PERCENTAGE so the card shrinks on its own
     in the clients that ignore this block; all this does is take the heading
     down a size and pull the side padding in, which percentages cannot. -->
<style>
  @media only screen and (max-width:620px) {
    .sky-head { font-size:25px !important; }
    .sky-pad { padding-left:16px !important; padding-right:16px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:34px 12px 28px">

      <!-- THE CARD. 600 is the width every client agrees on; the band and the
           clouds were all drawn to it. -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};width:100%;max-width:600px;border-radius:18px">

        <tr>
          <td align="center" class="sky-pad" style="padding:54px 40px 0;background-color:${PAPER}">
            <!-- The house and the wordmark in one drawing, as everywhere else
                 in the OS. Alt text carries it for the many people who read
                 with images off. -->
            <img src="${ORIGIN}/brand/tle-os-logo.png?v=${ASSET_V}" width="138" alt="TLE OS"
                 style="display:block;margin:0 auto;width:138px;max-width:46%;height:auto;border:0;outline:none;text-decoration:none;font-family:Manrope,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#1c1917">
          </td>
        </tr>

        <tr>
          <td style="padding:0;background-color:${PAPER}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};width:100%">
              <tr>
                <!-- The margins are where the weather lives. Fixed-width cells
                     because there is no other way to hold something beside a
                     column of words in an inbox. -->
                <td width="16%" valign="top" align="left" style="width:16%;background-color:${PAPER}">
                  <img src="${img("cloud-left.gif")}" width="86" alt=""
                       style="display:block;width:100%;max-width:86px;height:auto;border:0;outline:none;text-decoration:none">
                </td>

                <td width="68%" align="center" style="width:68%;background-color:${PAPER}">

                  <p class="sky-head" style="margin:36px 0 0;font-family:Manrope,Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:31px;line-height:1.22;font-weight:800;letter-spacing:-0.02em;color:#1c1917;background-color:${PAPER}">${esc(o.heading)}</p>

                  <p style="margin:18px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.62;color:#57534e;background-color:${PAPER}">${esc(o.intro)}</p>

                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:32px auto 0">
                    <tr>
                      <td bgcolor="${CLAY}" style="background-color:${CLAY};border-radius:30px">
                        <a href="${safe}" style="display:inline-block;padding:15px 34px;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;background-color:${CLAY};border-radius:30px">${esc(o.button)} &nbsp;&rarr;</a>
                      </td>
                    </tr>
                  </table>
${
  o.footnote
    ? `
                  <p style="margin:26px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.65;color:#8a817c;background-color:${PAPER}">${esc(o.footnote)}</p>`
    : ""
}
                  <div style="height:34px;line-height:34px;font-size:0">&nbsp;</div>
                </td>

                <td width="16%" valign="bottom" align="right" style="width:16%;background-color:${PAPER}">
                  <img src="${img("cloud-right.gif")}" width="92" alt=""
                       style="display:block;width:100%;max-width:92px;height:auto;border:0;outline:none;text-decoration:none">
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <!-- The house, edge to edge, standing on the foot of the mail. One
               flat image: the hill, the garden and the sky are all drawn into
               it so nothing has to line up at send time. -->
          <td style="padding:0;font-size:0;line-height:0;background-color:${PAPER}">
            <img src="${img("band.png")}" width="600" alt=""
                 style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;border-radius:0 0 18px 18px">
          </td>
        </tr>
      </table>

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <td align="center" style="padding:26px 34px 0">
            <p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;letter-spacing:0.04em;color:#a8a29e">
              Instagram &nbsp;·&nbsp; Facebook &nbsp;·&nbsp; LinkedIn
            </p>
            <p style="margin:11px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#78716c">The Letting Experts</p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`.trim();
}
