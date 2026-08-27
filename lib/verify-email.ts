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

  /* Inline styles and a table-free layout: Outlook is the client that matters
     here and it discards a <style> block. No images either — an internal
     verification email that renders as a broken picture in a locked-down
     client is one somebody rings up about. */
  const html = `
<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1c1917;max-width:560px;margin:0 auto;padding:28px 24px">
  <p style="font-size:19px;margin:0 0 18px">Setting up your TLE OS account</p>
  <p style="margin:0 0 18px">Open the link below to confirm this address and choose your password.</p>
  <p style="margin:0 0 22px">
    <a href="${safe}" style="display:inline-block;background:#7f1d1d;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">Confirm and set a password</a>
  </p>
  <p style="margin:0 0 18px;font-size:13px;color:#57534e">
    If the button doesn't work, paste this into your browser:<br>
    <span style="word-break:break-all">${safe}</span>
  </p>
  <p style="margin:0 0 18px;font-size:13px;color:#57534e">The link works once and lasts an hour.</p>
  <hr style="border:none;border-top:1px solid #e7e5e4;margin:22px 0">
  <p style="margin:0;font-size:12.5px;color:#57534e">
    We'll never email you a password, and nobody here can see the one you choose.
    If you weren't expecting this, ignore it — nothing happens until the link is opened.
  </p>
</div>`.trim();

  return { subject: "Confirm your TLE OS account", html, text };
}
