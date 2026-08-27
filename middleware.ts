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
  // `present` is exempt for the same reason as the tenant portal: the
  // pre-appraisal deck goes to a landlord who has no account and never will.
  // Its own random token is the credential. `api/present` goes with it — the
  // viewer calls it to record that the deck was opened.
  //
  // ⚠️ EACH ALTERNATIVE IS ANCHORED TO A WHOLE PATH SEGMENT — `(?:/|$)`.
  //
  // They used to be bare prefixes, which meant an exemption leaked to every
  // path that merely STARTED with one. `api/key` exempted `/api/keys` — the
  // REX key register, which key sets exist for which properties — and it was
  // reachable on the public internet with no code at all. `present` did the
  // same for `/api/presentations`. `tenant` and `landlord` would have done it
  // to `/tenants` and `/landlords` the day either was added.
  //
  // Anchored, `api/key` matches `/api/key` and `/api/key/anything` but NOT
  // `/api/keys`. The two file exemptions are pinned with `$` because they are
  // exact files, not prefixes.
  // `join` and `api/auth/verify` are exempt for the same reason as `present`:
  // THE EMAILED TOKEN IS THE CREDENTIAL. A new starter confirming their address
  // has no office access code — that is the entire point of sending them a
  // link — and bouncing them to /key would mean the code has to be passed
  // around in chat before anyone can join, which is how it leaked the first
  // time.
  //
  // What guards these two instead, and it is more than the code offered:
  //   · the address must be on the founding allowlist
  //   · the token is 32 random bytes, hashed at rest, single use, one hour
  //   · /start answers identically whatever happens, so it cannot be used to
  //     discover who works here
  //   · rate limited per address (in the database) and per IP
  //
  // Anchored with (?:/|$) like everything else here. Unanchored, `join` would
  // exempt any future /joins or /joinery, and `api/auth/verify` would leak to
  // a sibling like /api/auth/verify-phone the day somebody adds one.
  matcher: [
    "/((?!(?:key|api/key|join|api/auth/verify|tenant|landlord|present|api/present|_next|icons|illustrations|brand)(?:/|$)|favicon\\.ico$|robots\\.txt$).*)",
  ],
};
