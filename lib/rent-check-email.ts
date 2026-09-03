import "server-only";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import type { LandingPage } from "@/lib/bond-qr";

/**
 * The rent check, in the landlord's inbox.
 *
 * They asked for it on the page, so this is the thing they asked for, not
 * marketing: it goes whether or not they ticked the updates box. The
 * figures are the page's figures, word for word, and it says "advertised"
 * the same way. One button: book the free valuation, which lands back on
 * the page and tells the office.
 *
 * Plain HTML in a table, inline styles, no images but the pin: the way
 * email still has to be written. No em dashes. UK English.
 */

const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const monthName = (ym: string) => (ym ? new Date(`${ym}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : "");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const HEADLINE: Record<string, (addr: string) => string> = {
  anniversary: (a) => `A year on at ${a}: is the rent still right?`,
  just_bought: (a) => `Congratulations on ${a}. Here is what it could let for.`,
  self_managing: (a) => `Letting ${a} yourself? Here is where the rent sits.`,
  custom: (a) => `Your free rent check for ${a}`,
};

export function rentCheckSubject(page: LandingPage): string {
  return `Your rent check for ${page.link.address.split(",")[0]}`;
}

export function rentCheckHtml(page: LandingPage, opts: { firstName: string; origin: string }): string {
  const { link, check, beds, property_type } = page;
  const short = link.address.split(",")[0];
  const bookUrl = `${opts.origin}/r/${link.token}?book=1`;
  const logo = `${opts.origin}/brand/tle-logo.png`;
  const muted = "color:#6b6b70;";
  const body = "font-family:Montserrat,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1a1a1a;";

  const figure = check.estimate
    ? `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;${muted}">Similar homes nearby are advertised at</p>
       <p style="margin:0;font-size:40px;line-height:1;color:#1a1a1a;">${pounds(check.estimate.median)} <span style="font-size:15px;${muted}">pcm</span></p>
       <p style="margin:10px 0 0;font-size:14px;${muted}">Most sit between ${pounds(check.estimate.low)} and ${pounds(check.estimate.high)}. Based on ${esc(check.basis)}.</p>`
    : `<p style="margin:0 0 6px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;${muted}">Your rent check</p>
       <p style="margin:0;font-size:15px;">${esc(check.basis)} One of the team is putting a figure together by hand and will be in touch.</p>`;

  const comps = check.comparables.length
    ? `<h2 style="margin:28px 0 8px;font-size:18px;font-weight:600;">What is letting near you</h2>
       <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
         ${check.comparables
           .map(
             (c) => `<tr>
               <td style="padding:9px 0;border-top:1px solid #e6e3dd;font-size:14px;">${esc(c.street)}, ${esc(c.area)}<br><span style="font-size:12px;${muted}">${c.beds != null ? `${c.beds} bed` : ""}${c.type ? ` ${esc(c.type.toLowerCase())}` : ""} · ${c.status}${c.when ? ` ${monthName(c.when)}` : ""}</span></td>
               <td align="right" style="padding:9px 0;border-top:1px solid #e6e3dd;font-size:14px;white-space:nowrap;">${pounds(c.rent)} pcm</td>
             </tr>`
           )
           .join("")}
       </table>`
    : "";

  return `<!doctype html>
<html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(rentCheckSubject(page))}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;">
<tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;${body}">
  <tr><td style="padding:0 0 22px;">
    <img src="${logo}" width="19" height="32" alt="" style="vertical-align:middle;margin-right:12px;">
    <span style="font-size:12px;font-weight:600;letter-spacing:0.28em;text-transform:uppercase;vertical-align:middle;">The Letting Experts</span>
  </td></tr>
  <tr><td>
    <p style="margin:0 0 6px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;${muted}">Your rent check</p>
    <h1 style="margin:0 0 8px;font-size:26px;line-height:1.25;font-weight:600;">${esc((HEADLINE[link.reason] ?? HEADLINE.custom)(short))}</h1>
    <p style="margin:0 0 20px;font-size:14px;${muted}">${esc(link.address)}${beds != null ? ` · ${beds} bed` : ""}${property_type ? ` ${esc(property_type.toLowerCase())}` : ""}</p>
    <p style="margin:0 0 20px;">Hello ${esc(opts.firstName)}, thank you for asking. Here is where similar homes near you are being advertised, from our daily read of the local market.</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:22px;border:1px solid #e6e3dd;border-radius:18px;background:#fbfbfa;">${figure}</td></tr></table>
    ${comps}
    <h2 style="margin:28px 0 8px;font-size:18px;font-weight:600;">The full figure, in person</h2>
    <p style="margin:0 0 16px;">Advertised rents are a starting point. A free valuation gives you a figure for your home as it is, what we would do to get it, and what we charge. It takes twenty minutes and there is no obligation.</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:999px;background:#1a1a1a;">
      <a href="${bookUrl}" style="display:inline-block;padding:13px 24px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">Book my free valuation</a>
    </td></tr></table>
    <p style="margin:24px 0 0;">Or simply reply to this email and we will call you.</p>
    <p style="margin:24px 0 0;">Kind regards,<br>The Letting Experts</p>
    <p style="margin:32px 0 0;font-size:11px;line-height:1.5;${muted}">You asked for this rent check by scanning one of our cards. Advertised rents are what similar homes were marketed at, not what was agreed. The Letting Experts, part of The Experts Group.</p>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function rentCheckText(page: LandingPage, opts: { firstName: string; origin: string }): string {
  const { link, check } = page;
  const lines = [
    `Hello ${opts.firstName}, thank you for asking. Here is your rent check for ${link.address}.`,
    "",
    check.estimate
      ? `Similar homes nearby are advertised at ${pounds(check.estimate.median)} pcm. Most sit between ${pounds(check.estimate.low)} and ${pounds(check.estimate.high)}. Based on ${check.basis}.`
      : `${check.basis} One of the team is putting a figure together by hand and will be in touch.`,
    "",
    ...check.comparables.map((c) => `${c.street}, ${c.area}: ${pounds(c.rent)} pcm (${c.status}${c.when ? ` ${monthName(c.when)}` : ""})`),
    "",
    `Book your free valuation: ${opts.origin}/r/${link.token}?book=1`,
    "Or reply to this email and we will call you.",
    "",
    "The Letting Experts",
  ];
  return lines.join("\n");
}

/** Send it. Throws ResendBlocked with a plain reason when the door is shut. */
export async function sendRentCheck(page: LandingPage, to: { email: string; firstName: string }, origin: string): Promise<{ id: string }> {
  return sendEmail({
    to: to.email,
    subject: rentCheckSubject(page),
    html: rentCheckHtml(page, { firstName: to.firstName, origin }),
    text: rentCheckText(page, { firstName: to.firstName, origin }),
    audience: "customer",
    replyTo: (process.env.TLE_REPLY_TO ?? "").trim() || undefined,
  });
}

export { ResendBlocked };
