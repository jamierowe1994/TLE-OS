import { NextRequest, NextResponse } from "next/server";

/**
 * The whole site sits behind one shared access code (OS_ACCESS_CODE on
 * Railway). This is a private preview for Susan and Howard, not a user
 * system — the portal's real auth arrives when the two products merge.
 *
 * The cookie stores a SHA-256 of the code, never the code itself, so a
 * leaked cookie value can't be typed into the key screen.
 *
 * With OS_ACCESS_CODE unset (local dev) the gate stands open.
 */

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const code = process.env.OS_ACCESS_CODE;
  if (!code) return NextResponse.next();

  const cookie = req.cookies.get("os-key")?.value;
  if (cookie && cookie === (await sha256(code))) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/key";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except the key screen itself, its API, static assets — and
  // the TENANT portal, which is customer-facing: tenants get their own
  // magic-link + password door, never the office access code.
  //
  // `brand` is exempt for a reason worth keeping: the logo in an email is
  // fetched by the landlord's mail client, which has no cookie and never
  // will. Behind the gate it would redirect to /key and every email would
  // arrive with a broken image where the logo should be.
  matcher: [
    "/((?!key|api/key|tenant|landlord|_next|icons|illustrations|brand|favicon.ico|robots.txt).*)",
  ],
};
