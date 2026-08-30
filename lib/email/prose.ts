import "server-only";

/**
 * An email that is just words.
 *
 * ── Why not emailShell ────────────────────────────────────────────────────
 *
 * `emailShell` takes a heading, a hero image, a button and a link. That is the
 * right shape for "confirm your account" and it is the wrong shape for an
 * agent writing to a landlord. Forcing prose through it puts a button on a
 * note that has nothing to press, and a hero image above a sentence.
 *
 * So this is deliberately plain: the wordmark, the words, and the footer. It
 * should read like an email a person sent, because one did.
 *
 * ── Tables, inline styles, and no clever CSS ──────────────────────────────
 *
 * Same constraints as the rest of the email work. Outlook renders through
 * Word: no flexbox, no grid, no external stylesheet, no rem. A table with
 * inline styles is not nostalgia, it is the only thing that survives.
 *
 * ── Escaped, then formatted ───────────────────────────────────────────────
 *
 * The body is typed by an agent into a textarea. It is escaped FIRST and
 * formatted after, so a landlord called O'Brien & Sons does not break the
 * markup, and so nothing anybody types can inject HTML into an email going out
 * under the company's name.
 */

const esc = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/** Blank lines separate paragraphs; single newlines are line breaks. */
function paragraphs(body: string): string {
  return body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 18px;font-family:'Unitext',Montserrat,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.65;color:#1c1917;">${esc(
          p
        ).replace(/\n/g, "<br />")}</p>`
    )
    .join("");
}

export function proseEmail(body: string): string {
  return `<!doctype html>
<html lang="en-GB"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light only" />
<meta name="supported-color-schemes" content="light only" />
</head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
  <tr><td align="center" style="padding:32px 16px 48px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">

      <tr><td style="padding:0 0 28px;font-family:'Unitext',Montserrat,Helvetica,Arial,sans-serif;font-size:15px;letter-spacing:0;color:#1c1917;">
        The Letting Experts
      </td></tr>

      <tr><td>${paragraphs(body)}</td></tr>

      <!-- A hairline, then the footer. Nothing louder: this is a personal
           note, and a marketing footer would undo the whole point of it. -->
      <tr><td height="1" bgcolor="#e7e5e4" style="font-size:0;line-height:0;">&nbsp;</td></tr>
      <tr><td style="padding:18px 0 0;font-family:'Unitext',Montserrat,Helvetica,Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#78716c;">
        The Letting Experts
      </td></tr>

    </table>
  </td></tr>
</table>
</body></html>`;
}
