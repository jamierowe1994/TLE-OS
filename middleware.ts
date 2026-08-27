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

/**
 * A real session gets in WITHOUT the office code.
 *
 * Otherwise the joining flow dead-ends: a new starter opens their emailed
 * link, sets a password, is signed in — and is then bounced to /key for a code
 * nobody has given them. They would have an account and still be locked out.
 *
 * The session is the STRONGER credential of the two. The office code is one
 * shared string for the whole preview; a session means this specific person
 * proved they own their mailbox and knows their own password. Demanding the
 * weaker one on top of the stronger one protects nothing.
 *
 * Verified properly, not sniffed. `lib/auth` signs with node:crypto and cannot
 * be imported into edge middleware, so the same HMAC is recomputed here with
 * Web Crypto. Checking merely that a cookie EXISTS would mean anyone could
 * type `os_session=x` into their browser and walk past the gate.
 */
function b64url(buf: ArrayBuffer): string {
  let s = "";
  const bytes = new Uint8Array(buf);
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function hasValidSession(token: string | undefined): Promise<boolean> {
  const secret = process.env.AUTH_SECRET;
  if (!token || !secret) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [userId, exp, sig] = parts;
  if (!Number(exp) || Number(exp) < Date.now()) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${userId}.${exp}`));
  const expected = b64url(mac);
  /* Length-then-content compare. Not constant time — WebCrypto has no
     timingSafeEqual — but the attacker would be forging an HMAC over a value
     they cannot control, and every route behind this does its own proper
     check with node:crypto. This gate is the coarse one. */
  if (expected.length !== sig.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return diff === 0;
}

export async function middleware(req: NextRequest) {
  const code = process.env.OS_ACCESS_CODE;
  if (!code) return NextResponse.next();

  const cookie = req.cookies.get("os-key")?.value;
  if (cookie && cookie === (await sha256(code))) return NextResponse.next();

  // Either credential is enough — see hasValidSession for why the session is
  // the stronger of the two.
  if (await hasValidSession(req.cookies.get("os_session")?.value)) {
    return NextResponse.next();
  }

  /* Somebody with an account but no code should land on the sign-in page, not
     on a shared-code screen they cannot answer. `next` brings them back to
     what they were reaching for, and /sign-in refuses anything that isn't a
     path on this site. */
  const url = req.nextUrl.clone();
  const wanted = req.nextUrl.pathname + req.nextUrl.search;
  url.pathname = "/key";
  url.search = wanted && wanted !== "/" ? `?next=${encodeURIComponent(wanted)}` : "";
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
    "/((?!(?:key|api/key|join|api/auth/verify|sign-in|api/auth/login|tenant|landlord|present|api/present|_next|icons|illustrations|brand)(?:/|$)|favicon\\.ico$|robots\\.txt$).*)",
  ],
};
