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

export function verifyEmailFor(link: string): VerifyEmail {
  const safe = esc(link);
  const text = [
    "Setting up your TLE OS account",
    "",
    "Open the link below to confirm this address and choose your password.",
    "",
    link,
    "",
    "The link works once and lasts an hour.",
    "",
    "We'll never email you a password, and nobody here can see the one you choose.",
    "If you weren't expecting this, ignore it — nothing happens until the link is opened.",
  ].join("\n");

  /* ── Why this is a table, and why every colour is stated twice ───────────
     MEASURED, on the first email this domain ever sent. James read it in
     Outlook dark mode and it came back half-inverted: a white band behind the
     heading, a brown block behind the bullets, dark text on dark in places.

     Outlook's dark mode does not ask permission. It rewrites colours on any
     element that has not claimed one, and the result is unpredictable rather
     than merely dark. Three things stop it, and all three are needed:

       1. `color-scheme` / `supported-color-schemes` meta — declares that this
          message is designed for light and should be left alone.
       2. A TABLE with a real `bgcolor` attribute, not a div. Outlook honours
          the attribute where it ignores the CSS.
       3. `background-color` stated on every block that has text in it. An
          element with a colour but no background is exactly what gets
          inverted, which is how you end up with #1c1917 on near-black.

     This matters more than it sounds: the verification email is the first
     thing a new starter sees, and one that arrives looking broken is one
     nobody clicks. Susan should not have to squint at a link to decide
     whether it is real. */
  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f4">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f5f5f4" style="background-color:#f5f5f4;margin:0;padding:0">
  <tr>
    <td align="center" style="padding:24px 12px">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="background-color:#ffffff;width:560px;max-width:100%;border-radius:12px;border:1px solid #e7e5e4">
        <tr>
          <td style="padding:28px 26px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1917;background-color:#ffffff">
            <p style="font-size:19px;margin:0 0 18px;color:#1c1917;background-color:#ffffff">Setting up your TLE OS account</p>
            <p style="margin:0 0 18px;color:#1c1917;background-color:#ffffff">Open the link below to confirm this address and choose your password.</p>
            <p style="margin:0 0 22px;background-color:#ffffff">
              <a href="${safe}" style="display:inline-block;background-color:#7f1d1d;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Confirm and set a password</a>
            </p>
            <p style="margin:0 0 18px;font-size:13px;color:#57534e;background-color:#ffffff">
              If the button doesn't work, paste this into your browser:<br>
              <span style="word-break:break-all;color:#57534e">${safe}</span>
            </p>
            <p style="margin:0 0 18px;font-size:13px;color:#57534e;background-color:#ffffff">The link works once and lasts an hour.</p>
            <hr style="border:none;border-top:1px solid #e7e5e4;margin:22px 0">
            <p style="margin:0;font-size:12.5px;color:#57534e;background-color:#ffffff">
              We'll never email you a password, and nobody here can see the one you choose.
              If you weren't expecting this, ignore it &mdash; nothing happens until the link is opened.
            </p>
          </td>
        </tr>
      </table>
      <p style="margin:14px 0 0;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:11.5px;color:#78716c">The Letting Experts</p>
    </td>
  </tr>
</table>
</body>
</html>`.trim();

  return { subject: "Confirm your TLE OS account", html, text };
}
