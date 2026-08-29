/**
 * The shell every account and pre-launch email sits in.
 *
 * ── Why it looks like this ────────────────────────────────────────────────
 *
 * James, 29 Aug, pointing at Anthropic's own sign-in email: "very simple, very
 * clean, and very to the point... I also quite enjoy the hierarchy." So:
 * centred, one column, a wordmark, a picture, one big line, one small line,
 * one button, and nothing else competing with it.
 *
 * Lifted out of lib/verify-email.ts once the pilot invitation wanted the same
 * thing. Two copies of a layout diverge on the first tweak that only gets made
 * to one of them, and the whole point is that these read as one product.
 *
 * ── Three things email cannot do, and what happens instead ────────────────
 *
 * 1. WEBFONTS. Gmail and Outlook strip @font-face, so the handwriting face
 *    cannot be delivered as text. The wordmark is a PNG for that reason, with
 *    alt text that matters: Outlook blocks images until somebody presses
 *    "download pictures", so a fair number of people only ever read the words.
 * 2. ANIMATION. Animated GIF works — Gmail, Apple Mail, iOS, most webmail.
 *    Outlook on Windows renders only the FIRST frame, because it draws HTML
 *    with Word's engine. So every animation here leads on its finished state
 *    and rests there, rather than starting blank or erasing itself. CSS
 *    keyframes, SVG animation and video genuinely never work.
 * 3. SVG. Outlook will not render it at all, so every image is PNG or GIF, at
 *    an ABSOLUTE url — a relative src resolves against the mail client and
 *    never loads.
 *
 * ── The dark-mode fixes are not decoration ────────────────────────────────
 *
 * MEASURED, on the first email this domain ever sent. James read it in Outlook
 * dark mode and it came back half-inverted: a white band behind the heading, a
 * brown block behind the bullets, dark text on dark in places.
 *
 * Outlook's dark mode does not ask permission. It rewrites colours on any
 * element that has not claimed one. Three things stop it, and all three are
 * still needed even now that everything is white:
 *
 *   1. `color-scheme` / `supported-color-schemes` meta.
 *   2. A TABLE with a real `bgcolor` attribute, not a div. Outlook honours the
 *      attribute where it ignores the CSS.
 *   3. `background-color` stated on every block that has text in it.
 *
 * This is the first thing a new starter sees. One that arrives looking broken
 * is one nobody clicks.
 */

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Absolute, always — see note 3 above. */
const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

/**
 * Asset version. BUMP THIS whenever the wordmark or an animation changes.
 *
 * Gmail does not fetch our images. It proxies them through googleusercontent
 * and CACHES them against the URL, so a corrected file at the same address is
 * never seen and re-sending changes nothing.
 *
 * That happened on 29 Aug: a GIF's off-white plate was fixed, deployed, and
 * verified live byte-for-byte, and the old one was still in the inbox. Every
 * check on our side passed. The only wrong thing was in somebody else's cache.
 */
export const ASSET_V = "3";

export interface ShellOpts {
  heading: string;
  intro: string;
  button: string;
  link: string;
  /** Path under /public, e.g. "illustrations/sign-in.gif". */
  image: string;
  /** The quiet paragraph under the button. Omitted entirely when absent. */
  footnote?: string;
}

export function emailShell(opts: ShellOpts): string {
  const safe = esc(opts.link);
  return `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:40px 12px">
      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;width:520px;max-width:100%">
        <tr>
          <td align="center" style="padding:38px 34px 34px;background-color:#ffffff">

            <img src="${ORIGIN}/brand/tle-os-wordmark.png?v=${ASSET_V}" width="160" alt="TLE OS"
                 style="display:block;margin:0 auto;width:160px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;font-family:'Bradley Hand','Segoe Script',cursive;font-size:26px;color:#1c1917">

            <img src="${ORIGIN}/${opts.image}?v=${ASSET_V}" width="260" alt=""
                 style="display:block;margin:24px auto 0;width:260px;max-width:78%;height:auto;border:0;outline:none;text-decoration:none">

            <p style="margin:30px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:23px;line-height:1.25;font-weight:700;color:#1c1917;background-color:#ffffff">${esc(opts.heading)}</p>

            <p style="margin:12px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.55;color:#57534e;background-color:#ffffff">${esc(opts.intro)}</p>

            <!-- Black, not the brand red: it is the only thing to press. -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="margin:26px auto 0">
              <tr>
                <td bgcolor="#000000" style="background-color:#000000;border-radius:9px">
                  <a href="${safe}" style="display:inline-block;padding:13px 30px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14.5px;font-weight:600;color:#ffffff;text-decoration:none;background-color:#000000;border-radius:9px">${esc(opts.button)}</a>
                </td>
              </tr>
            </table>
${
  opts.footnote
    ? `
            <p style="margin:26px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#78716c;background-color:#ffffff">${esc(opts.footnote)}</p>`
    : ""
}

          </td>
        </tr>
      </table>

      <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" style="width:520px;max-width:100%">
        <tr>
          <td align="center" style="padding:22px 34px 0">
            <p style="margin:0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;letter-spacing:0.04em;color:#a8a29e">
              Instagram &nbsp;·&nbsp; Facebook &nbsp;·&nbsp; LinkedIn
            </p>
            <p style="margin:12px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;color:#78716c">The Lettings Experts</p>
          </td>
        </tr>
      </table>

    </td>
  </tr>
</table>
</body>
</html>`.trim();
}
