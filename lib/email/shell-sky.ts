import { ASSET_V, type ShellRow } from "@/lib/email/shell";

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


/** Everything above the first visible row. Same in both shapes. */
function head(): string {
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
    /* The badge goes on a phone. It says the same thing as the line under
       the address - "12 days", "expires in 12 days" - and at 320px it costs
       half the width to repeat it. */
    .sky-badge { display:none !important; }
    /* Three columns become three lines. At 330px each reassurance was four
       words over four lines, which is slower to read than the paragraph it
       replaced. The dividers between them go with the columns. */
    .sky-say { display:block !important; width:100% !important; padding:12px 8px !important; box-sizing:border-box !important; }
    /* The aside's glyph gives up most of its column on a phone: at 330px it
       was taking a third of the width off four-word lines. */
  }
</style>
</head>`;
}

/** The house and the wordmark in one drawing, as everywhere else in the OS.
 *  The alt text carries it for the many people who read with images off. */
function logo(bg: string): string {
  return `<img src="${ORIGIN}/brand/tle-os-logo.png?v=${ASSET_V}" width="138" alt="TLE OS"
                 style="display:block;margin:0 auto;width:138px;max-width:46%;height:auto;border:0;outline:none;text-decoration:none;font-family:Manrope,Helvetica,Arial,sans-serif;font-size:20px;font-weight:800;color:#1c1917;background-color:${bg}">`;
}

function footer(): string {
  return `
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px">
        <tr>
          <!-- The last thing in the mail, so the name carries a little more
               than the links above it. James, 14 Sep 2026: the mail should
               finish here and fit in one column, without the spacing being
               squeezed to do it. -->
          <td align="center" style="padding:22px 34px 0">
            <p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;letter-spacing:0.04em;color:#a8a29e">
              Instagram &nbsp;·&nbsp; Facebook &nbsp;·&nbsp; LinkedIn
            </p>
            <p style="margin:10px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:600;letter-spacing:0.01em;color:#57534e">The Letting Experts</p>
          </td>
        </tr>
      </table>`;
}

/** The one thing to press, as a table so Outlook gives it a real background. */
function pressable(label: string, href: string, ink: string): string {
  return `
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:0 auto">
                    <tr>
                      <td bgcolor="${ink}" style="background-color:${ink};border-radius:30px">
                        <a href="${href}" style="display:inline-block;padding:15px 34px;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;background-color:${ink};border-radius:30px">${esc(label)} &nbsp;&rarr;</a>
                      </td>
                    </tr>
                  </table>`;
}

export function skyShell(o: SkyOpts): string {
  const safe = esc(o.link);
  const img = (f: string) => `${ORIGIN}/email/sky/${f}?v=${ASSET_V}`;
  return `${head()}
<body style="margin:0;padding:0;background-color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:34px 12px 28px">

      <!-- THE CARD. 600 is the width every client agrees on; the band and the
           clouds were all drawn to it. -->
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${PAPER}" style="background-color:${PAPER};width:100%;max-width:600px;border-radius:18px">

        <tr>
          <td align="center" class="sky-pad" style="padding:54px 40px 0;background-color:${PAPER}">
            ${logo(PAPER)}
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

                  <div style="height:32px;line-height:32px;font-size:0">&nbsp;</div>
${pressable(o.button, safe, CLAY)}
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

${footer()}

    </td>
  </tr>
</table>
</body>
</html>`.trim();
}

/* ════════════════════════════════════════════════════════════════════════
   THE LIST SHAPE
   ════════════════════════════════════════════════════════════════════════

   James, 13 Sep 2026, with a second drawing - the certificate chase. Same
   family as the card above (same logo, same clay pill, same type), different
   job: a picture at the top, then a panel of things that need doing, each
   with a marker, a badge and somewhere to go.

   It is WHITE rather than pink, and that is the point of having two. A
   welcome can afford a coloured page; a list of overdue certificates is
   read at half past eight on a Monday and wants to be legible before it is
   pretty. The pink is kept for the picture and the panel.
*/

/* James, 13 Sep 2026: the list of properties in WHITE with a thin grey
   outline rather than a pink fill. It is the part of the mail that gets read
   like a table, and a tint behind a table is decoration on top of work. */
const PANEL = "#ffffff";
const PANEL_EDGE = "#e8e3e1";
const SAY_RULE = "#efe6e3";
const HAIR = "#efeae8";
const TIP_BG = "#edf1e7";
/* The chocolate brown from the palette (--pal-brown), not the clay. */
const BROWN = "#56423e";

export interface SkyListOpts {
  heading: string;
  /** The paragraph under the heading. */
  intro?: string;
  button: string;
  link: string;
  /** A file in /email/sky - the drawing and its pink shape, already one
   *  picture. Left out when there isn't a drawing for this one yet: better a
   *  mail that looks deliberately plain than one with a broken box at the top. */
  hero?: string;
  rows?: ShellRow[];
  /** The small line above the list - "3 properties on your book". */
  rowsLead?: string;
  /**
   * Where a row goes when it is pressed. One destination for all of them for
   * now: the chase routes hand these over as formatted STRINGS, so there is
   * no property id here to link to. Worth fixing at the source rather than
   * guessing one from an address.
   */
  rowHref?: string;
  /**
   * Three short reassurances in a row under the button, each with a disc.
   * `icon` is a file in /email/sky. For the doorway mails, where what stops
   * somebody pressing the button is a worry rather than a question.
   */
  assurances?: { icon: string; text: string }[];
  /** The aside at the foot. */
  tip?: string;
  /**
   * A single line sits as plain grey text; anything longer gets the sage
   * panel. A one-line aside in a full panel reads as a warning rather than
   * an afterthought, which is the opposite of what an aside is for.
   */
  tipQuiet?: boolean;
}

/** One row: marker, words, badge, chevron. Four cells, because there is no
 *  other way to put four things on a line that Outlook will agree to. */
function listRow(r: ShellRow, href: string | undefined, last: boolean): string {
  const urgent = r.pillTone !== "calm";
  /* The marker follows the row's own state first and its timing second:
     something already done is a tick, something gone is an exclamation, and
     only the rest get the clock. A row with no badge at all - a single
     "what happens next" - would otherwise have taken the exclamation by
     default and read as a problem. */
  const disc =
    r.tone === "good" ? "disc-good.png" : r.tone === "attention" || urgent ? "disc-attention.png" : "disc-ok.png";
  const title = esc(r.title);
  const words = `
                    <p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.3;font-weight:700;color:#1c1917;background-color:${PANEL}">${
                      href ? `<a href="${esc(href)}" style="color:#1c1917;text-decoration:none">${title}</a>` : title
                    }</p>${
                      r.detail
                        ? `
                    <p style="margin:4px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13.5px;line-height:1.45;color:${r.tone === "attention" ? "#b3655b" : "#7d736e"};background-color:${PANEL}">${esc(r.detail)}</p>`
                        : ""
                    }`;
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${PANEL}" style="background-color:${PANEL};width:100%">
                <tr>
                  <td width="56" valign="middle" style="width:56px;padding:16px 0;background-color:${PANEL}">
                    <img src="${ORIGIN}/email/sky/${disc}?v=${ASSET_V}" width="42" height="42" alt=""
                         style="display:block;width:42px;height:42px;border:0;outline:none;text-decoration:none">
                  </td>
                  <td valign="middle" align="left" style="padding:16px 10px 16px 0;text-align:left;background-color:${PANEL}">${words}
                  </td>${
                    r.pill
                      ? `
                  <td valign="middle" align="right" class="sky-badge" style="padding:16px 0;background-color:${PANEL}">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="right">
                      <tr>
                        <td bgcolor="${urgent ? "#fbe3de" : "#e7ecdf"}" style="background-color:${urgent ? "#fbe3de" : "#e7ecdf"};border-radius:20px;padding:6px 13px;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;font-weight:700;white-space:nowrap;color:${urgent ? "#a85a51" : "#5f6b52"}">${esc(r.pill)}</td>
                      </tr>
                    </table>
                  </td>`
                      : ""
                  }
${
                    href
                      ? `
                  <td width="22" valign="middle" align="right" style="width:22px;padding:16px 0;background-color:${PANEL};font-family:Inter,Helvetica,Arial,sans-serif;font-size:19px;line-height:1;color:#cbb7b0"><a href="${esc(href)}" style="color:#cbb7b0;text-decoration:none">&rsaquo;</a></td>`
                      : ""
                  }
                </tr>
              </table>${
                last
                  ? ""
                  : `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%"><tr><td height="1" bgcolor="${HAIR}" style="background-color:${HAIR};height:1px;line-height:1px;font-size:0">&nbsp;</td></tr></table>`
              }`;
}

export function skyListShell(o: SkyListOpts): string {
  const safe = esc(o.link);
  const rows = o.rows ?? [];
  return `${head()}
<body style="margin:0;padding:0;background-color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:34px 12px 28px">

      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;width:100%;max-width:600px">

        <tr>
          <td align="center" class="sky-pad" style="padding:10px 40px 0;background-color:#ffffff">
            ${logo("#ffffff")}
          </td>
        </tr>

${
  o.hero
    ? `
        <tr>
          <!-- The drawing and the pink shape behind it are one flat picture:
               there is no layering in an inbox. -->
          <td style="padding:22px 0 0;font-size:0;line-height:0;background-color:#ffffff">
            <img src="${ORIGIN}/email/sky/${o.hero}?v=${ASSET_V}" width="600" alt=""
                 style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none">
          </td>
        </tr>`
    : ""
}

        <tr>
          <td align="center" class="sky-pad" style="padding:28px 46px 0;text-align:center;background-color:#ffffff">
            <p class="sky-head" style="margin:0;font-family:Manrope,Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:31px;line-height:1.22;font-weight:800;letter-spacing:-0.02em;color:#1c1917;background-color:#ffffff">${esc(o.heading)}</p>${
              o.intro
                ? `
            <p style="margin:18px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.62;color:#57534e;background-color:#ffffff">${esc(o.intro)}</p>`
                : ""
            }
          </td>
        </tr>
${
  rows.length
    ? `
        <tr>
          <td class="sky-pad" style="padding:32px 30px 0;background-color:#ffffff">
            <!-- The radius goes on the CELL, not the table. A td with its own
                 background paints square corners straight over a rounded
                 table, which is why the first version of this looked like a
                 box with the corners filled in. The 24px of padding is also
                 doing work: it keeps the rows inside the 20px arc, so they
                 cannot square it off from within either. -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
              <tr>
                <td bgcolor="${PANEL}" style="padding:22px 24px 24px;background-color:${PANEL};border:1px solid ${PANEL_EDGE};border-radius:20px">${
                  o.rowsLead
                    ? `
                  <p style="margin:0 0 10px;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11px;line-height:1.4;letter-spacing:0.09em;text-transform:uppercase;font-weight:700;color:#a8a29e;background-color:${PANEL}">${esc(o.rowsLead)}</p>`
                    : ""
                }${rows.map((r, i) => listRow(r, o.rowHref, i === rows.length - 1)).join("")}
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : ""
}

        <tr>
          <td align="center" style="padding:34px 0 0;background-color:#ffffff">
${pressable(o.button, safe, BROWN)}
          </td>
        </tr>
${
  o.assurances && o.assurances.length
    ? `
        <tr>
          <td class="sky-pad" style="padding:34px 30px 0;background-color:#ffffff">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
              <tr>
                <!-- No panel behind them, James 14 Sep 2026. The discs and
                     the dividers carry it, and a tint here put a second box
                     directly under the white one the lists use. -->
                <td bgcolor="#ffffff" style="padding:10px 10px 4px;background-color:#ffffff">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
                    <tr>${o.assurances
                      .map(
                        (a, i) => `${
                          i
                            ? `
                      <!-- The divider between them is a one-pixel CELL, not a
                           border: Outlook draws a border on a div as a whole
                           box or not at all. -->
                      <td width="1" bgcolor="${SAY_RULE}" class="sky-badge" style="width:1px;background-color:${SAY_RULE};font-size:0;line-height:0">&nbsp;</td>`
                            : ""
                        }
                      <td width="33%" valign="top" align="center" class="sky-say" style="width:33%;padding:0 14px;text-align:center;background-color:#ffffff">
                        <img src="${ORIGIN}/email/sky/${a.icon}?v=${ASSET_V}" width="40" height="40" alt=""
                             style="display:block;margin:0 auto;width:40px;height:40px;border:0;outline:none;text-decoration:none">
                        <p style="margin:12px 0 0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.5;color:#6b625e;background-color:#ffffff">${esc(a.text)}</p>
                      </td>`
                      )
                      .join("")}
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : ""
}
${
  o.tip && o.tipQuiet
    ? `
        <tr>
          <td align="center" class="sky-pad" style="padding:26px 46px 0;text-align:center;background-color:#ffffff">
            <p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a817c;background-color:#ffffff">${esc(o.tip)}</p>
          </td>
        </tr>`
    : ""
}${
  o.tip && !o.tipQuiet
    ? `
        <tr>
          <td class="sky-pad" style="padding:34px 30px 0;background-color:#ffffff">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
              <tr>
                <td bgcolor="${TIP_BG}" style="padding:19px;background-color:${TIP_BG};border-radius:18px">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%">
                    <tr>
                      <td width="56" valign="middle" align="left" style="width:56px;background-color:${TIP_BG}">
                        <img src="${ORIGIN}/email/sky/disc-tip.png?v=${ASSET_V}" width="38" height="38" alt=""
                             style="display:block;width:38px;height:38px;border:0;outline:none;text-decoration:none">
                      </td>
                      <td valign="middle" align="left" style="padding-left:4px;text-align:left;background-color:${TIP_BG}">
                        <p style="margin:0;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:#5c6352;background-color:${TIP_BG}">${esc(o.tip)}</p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
    : ""
}
      </table>
${footer()}

    </td>
  </tr>
</table>
</body>
</html>`.trim();
}
