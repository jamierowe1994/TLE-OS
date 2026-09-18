import { NextRequest, NextResponse } from "next/server";
import { stopAlert, stopSignatureOk } from "@/lib/tenant-find";

/**
 * The one-click stop at the foot of every new-home alert. No sign-in: the
 * link is signed for that one address (lib/tenant-find stopLink), so it
 * stops their alerts and nobody else's. Answers with a plain page, since it
 * is opened from an email.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const page = (title: string, line: string) =>
  new NextResponse(
    `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head>
<body style="margin:0;padding:0 16px;background:#fdf2ef;font-family:Inter,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:#1c1917">
<div style="max-width:440px;margin:12vh auto;padding:32px 28px;background:#fff;border-radius:22px;text-align:center">
<img src="/brand/tle-logo.png" alt="The Letting Experts" style="height:44px;width:auto">
<h1 style="font-family:Manrope,Helvetica,Arial,sans-serif;font-size:24px;margin:22px 0 8px">${title}</h1>
<p style="font-size:14.5px;line-height:1.6;color:#57534e;margin:0">${line}</p>
<a href="/tenant/homes" style="display:inline-block;margin-top:22px;padding:12px 22px;border-radius:30px;background:#56423e;color:#fff;font-weight:600;font-size:14px;text-decoration:none">Find a home</a>
</div></body></html>`,
    { headers: { "content-type": "text/html; charset=utf-8" } }
  );

export async function GET(req: NextRequest) {
  const email = (req.nextUrl.searchParams.get("e") ?? "").trim().toLowerCase();
  if (!email || !stopSignatureOk(email, req.nextUrl.searchParams.get("s"))) {
    return page("That Link Has Not Worked", "It may have been cut short by your email. Sign in to your tenant area and stop the alerts from Find a home.");
  }
  await stopAlert(email).catch(() => null);
  return page("Your Alerts Are Stopped", "We won't email you about new homes any more. You can turn them back on from Find a home in your tenant area whenever you like.");
}
