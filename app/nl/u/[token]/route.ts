import { NextRequest, NextResponse } from "next/server";
import { emailFromToken, isOptedOut, optBackIn, optOut } from "@/lib/mail-optout";

/**
 * UNSUBSCRIBE (James, 14 Nov 2026). The link at the foot of every marketing
 * mail-out, and the address a mail app's own Unsubscribe button posts to.
 *
 *   GET   a page that asks. Opening it changes nothing, because mail scanners
 *         and link previews open every link in an email before a person does.
 *   POST  does it. From the page's own button, or from Gmail, Outlook or Apple
 *         Mail's one-click button (a POST with no page in front of it).
 *
 * No sign-in: the link is the person's address, signed (lib/mail-optout), so
 * it only ever works for the address it was sent to. Under `nl`, which the
 * middleware already lets through for the open pixel and the link clicks.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ token: string }> };

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** j***@example.com: enough to recognise your own address, not enough to read someone else's. */
function masked(email: string): string {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 1)}${"*".repeat(Math.max(2, Math.min(6, name.length - 1)))}@${domain}`;
}

function page(title: string, body: string, status = 200): NextResponse {
  const html = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>${esc(title)} - The Letting Experts</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; background: #F5EFE6; color: #56423E; font: 16px/1.55 Inter, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; }
  main { width: 100%; max-width: 480px; background: #F8F7F4; border: 1px solid #E3D9CC; padding: 36px 28px; }
  .brand { font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; color: #A85A51; margin: 0 0 20px; }
  h1 { font-size: 26px; line-height: 1.2; font-weight: 500; letter-spacing: 0; margin: 0 0 12px; }
  p { margin: 0 0 14px; }
  .who { font-weight: 600; overflow-wrap: anywhere; }
  .small { font-size: 13.5px; color: #7A6A64; }
  form { margin: 22px 0 0; }
  button { appearance: none; border: 0; border-radius: 0; background: #56423E; color: #fff; font: inherit; font-weight: 600; padding: 13px 22px; cursor: pointer; width: 100%; }
  button.quiet { background: transparent; color: #56423E; border: 1px solid #56423E; }
  button:focus-visible { outline: 2px solid #A85A51; outline-offset: 3px; }
</style>
</head>
<body><main><p class="brand">The Letting Experts</p>${body}</main></body>
</html>`;
  return new NextResponse(html, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}

const broken = () =>
  page(
    "That Link Is Not Complete",
    `<h1>That Link Is Not Complete</h1><p>Open the Unsubscribe link from the foot of the email again. If it still does not work, reply to the email and we will take you off the list ourselves.</p>`,
    400
  );

const done = (email: string, token: string) =>
  page(
    "You Are Unsubscribed",
    `<h1>You Are Unsubscribed</h1>
     <p><span class="who">${esc(masked(email))}</span> will not get news or offers from us by email again.</p>
     <p class="small">We will still email you about your own tenancy or property when we need to, such as a repair, a certificate or your rent.</p>
     <form method="post" action="/nl/u/${esc(token)}"><input type="hidden" name="action" value="resubscribe" /><button class="quiet" type="submit">That Was a Mistake, Keep Me Subscribed</button></form>`
  );

export async function GET(_req: NextRequest, { params }: Ctx) {
  const token = (await params).token;
  const email = emailFromToken(token);
  if (!email) return broken();
  if (await isOptedOut(email).catch(() => false)) return done(email, token);
  return page(
    "Unsubscribe",
    `<h1>Unsubscribe From Our Emails</h1>
     <p>Stop news and offers from The Letting Experts going to <span class="who">${esc(masked(email))}</span>?</p>
     <p class="small">We will still email you about your own tenancy or property when we need to, such as a repair, a certificate or your rent.</p>
     <form method="post" action="/nl/u/${esc(token)}"><input type="hidden" name="action" value="unsubscribe" /><button type="submit">Unsubscribe</button></form>`
  );
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const token = (await params).token;
  const email = emailFromToken(token);
  if (!email) return broken();
  const form = await req.formData().catch(() => null);
  const action = String(form?.get("action") ?? "");
  const newsletterId = req.nextUrl.searchParams.get("n");
  if (action === "resubscribe") {
    await optBackIn(email);
    return page("You Are Subscribed", `<h1>You Are Still Subscribed</h1><p>Nothing has changed. <span class="who">${esc(masked(email))}</span> stays on our list.</p>`);
  }
  /* A mail app's one-click button posts "List-Unsubscribe=One-Click" and no action. */
  await optOut(email, action === "unsubscribe" ? "link" : "one-click", newsletterId);
  return done(email, token);
}
