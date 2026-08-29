/**
 * The verification email itself.
 *
 * Composed here as data rather than as a string inside a route, for the same
 * reason the pre-appraisal is: the wording is one file to change, and it can
 * be previewed without sending.
 *
 * ── What this email must not do ───────────────────────────────────────────
 *
 * It must not carry a password, a temporary password, or anything that could
 * be mistaken for one. The link proves the address; the password is chosen on
 * the far side of it, by its owner, and nobody else ever knows it.
 *
 * It must not be alarming when it arrives unrequested. Somebody who did not
 * ask for this should read it, understand that ignoring it is safe and
 * sufficient, and get on with their day.
 */

export interface VerifyEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Where the pictures live.
 *
 * Absolute, always. A relative src in an email resolves against the mail
 * client's own origin and simply never loads — there is no page for it to be
 * relative to.
 */
const ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

/**
 * Asset version. BUMP THIS whenever the wordmark or the animation changes.
 *
 * Gmail does not fetch an image from us — it proxies it through
 * googleusercontent and CACHES it against the URL. So a corrected file at the
 * same address is never seen: the old copy is served from the proxy, and
 * re-sending the email changes nothing because the URL has not changed.
 *
 * That is exactly what happened on 29 Aug. The GIF's off-white plate was fixed,
 * deployed, and verified live byte-for-byte — and the box was still there in
 * the inbox, because the proxy had already kept the previous one.
 *
 * A query string is part of the cache key, so bumping this is enough. It costs
 * nothing and it is the difference between "fixed" and "fixed where anyone can
 * see it".
 */
const ASSET_V = "2";

/**
 * The shell both account emails sit in.
 *
 * ── Why it looks like this ────────────────────────────────────────────────
 *
 * James, 29 Aug, pointing at Anthropic's own sign-in email: "very simple, very
 * clean, and very to the point... I also quite enjoy the hierarchy." So:
 * centred, one column, a wordmark, a picture, one big line, one small line,
 * one button, and nothing else competing with it.
 *
 * ── Three things email cannot do, and what happens instead ────────────────
 *
 * 1. WEBFONTS. Gmail and Outlook strip @font-face, so the handwriting face
 *    cannot be delivered. The wordmark asks for Shantell Sans and falls
 *    through a stack of script faces that are actually installed — Bradley
 *    Hand on Mac and iPhone, Segoe Script on Windows — then to cursive. It
 *    will look right on Apple Mail and merely tidy elsewhere. The only way to
 *    guarantee it everywhere is a PNG of the words, which is worth doing once
 *    the wordmark is drawn properly.
 * 2. ANIMATION. CSS keyframes do not run, and Outlook shows only the first
 *    frame of a GIF. A still line drawing is the honest version of "a little
 *    animation" here; anything else looks broken in the client that matters
 *    most to a new starter opening it on a work laptop.
 * 3. SVG. Outlook will not render it at all, so every image is a PNG.
 *
 * ── The dark-mode fixes are not decoration ────────────────────────────────
 *
 * MEASURED, on the first email this domain ever sent. James read it in Outlook
 * dark mode and it came back half-inverted: a white band behind the heading, a
 * brown block behind the bullets, dark text on dark in places.
 *
 * Outlook's dark mode does not ask permission. It rewrites colours on any
 * element that has not claimed one, and the result is unpredictable rather
 * than merely dark. Three things stop it, and all three are still needed:
 *
 *   1. `color-scheme` / `supported-color-schemes` meta.
 *   2. A TABLE with a real `bgcolor` attribute, not a div. Outlook honours the
 *      attribute where it ignores the CSS.
 *   3. `background-color` stated on every block that has text in it. An
 *      element with a colour but no background is exactly what gets inverted.
 *
 * This is the first thing a new starter sees. One that arrives looking broken
 * is one nobody clicks.
 */
function shell(opts: {
  heading: string;
  intro: string;
  button: string;
  link: string;
  /** The quiet paragraph under the button. */
  footnote: string;
}): string {
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

            <!-- Wordmark, drawn as a PNG so the handwriting face arrives
                 everywhere rather than only on Apple Mail. Rendered from
                 Shantell Sans at 3x for retina.

                 On WHITE, not transparent, and that is the point: Outlook's
                 dark mode can invert the cell behind an image but never the
                 image itself, and dark ink on a transparent ground over an
                 inverted cell is simply invisible. A white plate matches the
                 card exactly in light mode and stays readable if the card
                 flips.

                 The alt text carries real weight — Outlook blocks images by
                 default until somebody presses "download pictures", so a good
                 number of people will only ever see these two words. -->
            <img src="${ORIGIN}/brand/tle-os-wordmark.png?v=${ASSET_V}" width="160" alt="TLE OS"
                 style="display:block;margin:0 auto;width:160px;max-width:60%;height:auto;border:0;outline:none;text-decoration:none;font-family:'Bradley Hand','Segoe Script',cursive;font-size:26px;color:#1c1917">

            <!-- James's line drawing, from his Sign-in Loop. An animated GIF,
                 which IS the one moving format email supports — Gmail, Apple
                 Mail, iOS and most webmail play it.

                 RE-TIMED, not redrawn. The source loop starts blank, draws
                 itself in, and erases back to blank. Both of those ends are
                 wrong here for the same reason:

                   · Outlook on Windows renders only the FIRST frame, because
                     it draws HTML with Word's engine. A blank first frame is
                     an empty space where the picture should be, for everyone
                     on a Windows laptop — which is most of a working day.
                   · An animation that erases itself has no resting state, so
                     in a list of unread mail it is caught mid-stroke, looking
                     half-finished rather than deliberate.

                 So it leads on the completed drawing, draws in, and comes to
                 rest on the completed drawing again. Outlook shows a finished
                 picture; everyone else watches it arrive.

                 Not SVG (Outlook draws none) and not CSS (stripped). -->
            <img src="${ORIGIN}/illustrations/sign-in.gif?v=${ASSET_V}" width="260" alt=""
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

            <p style="margin:26px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#78716c;background-color:#ffffff">${esc(opts.footnote)}</p>

            <!-- The raw link. Kept because a button that does not survive a
                 corporate mail rewriter leaves somebody with nothing. -->
            <p style="margin:14px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.5;color:#a8a29e;background-color:#ffffff;word-break:break-all">${safe}</p>

          </td>
        </tr>
      </table>

      <!-- Footer, outside the card. -->
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

export function verifyEmailFor(link: string): VerifyEmail {
  const text = [
    "Set up your TLE OS account",
    "",
    "Open the link below to confirm this address and choose your password.",
    "",
    link,
    "",
    "The link works once and lasts 24 hours.",
    "",
    "We'll never email you a password, and nobody here can see the one you choose.",
    "If you weren't expecting this, ignore it — nothing happens until the link is opened.",
  ].join("\n");

  return {
    subject: "Confirm your TLE OS account",
    text,
    html: shell({
      heading: "Set up your account",
      intro:
        "Click the button below to confirm this address and choose your password. The link works once and lasts 24 hours.",
      button: "Set your password",
      link,
      footnote:
        "We'll never email you a password, and nobody here can see the one you choose. If you weren't expecting this, you can safely ignore it — nothing happens until the link is opened.",
    }),
  };
}

export function resetEmailFor(link: string): VerifyEmail {
  const text = [
    "Setting a new TLE OS password",
    "",
    "Open the link below to choose a new password.",
    "",
    link,
    "",
    "The link works once and lasts an hour.",
    "",
    "If you didn't ask for this, ignore it. Your password has not changed and",
    "nothing happens until the link is opened.",
  ].join("\n");

  return {
    subject: "Set a new TLE OS password",
    text,
    /* Same shell, different words. A reset arriving unrequested is the one
       that makes somebody think they have been hacked, so the quiet line says
       plainly that nothing has changed yet and that ignoring it is enough. */
    html: shell({
      heading: "Set a new password",
      intro:
        "Click the button below to choose a new password. The link works once and lasts an hour.",
      button: "Choose a new password",
      link,
      footnote:
        "If you didn't ask for this, you can safely ignore it. Your password has not changed, and nothing happens until the link is opened.",
    }),
  };
}
