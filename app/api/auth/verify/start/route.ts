import { NextRequest, NextResponse } from "next/server";
import { startVerification, VerificationError } from "@/lib/verification";
import { verifyEmailFor } from "@/lib/verify-email";
import { sendEmail, ResendBlocked, resendConfigured } from "@/lib/resend";
import { isFoundingOwner, ExternalRecipientRefused } from "@/lib/email-policy";
import { findUserByEmail, normaliseEmail } from "@/lib/users";

/**
 * "Send me a link so I can set up my account."
 *
 * ── The same answer, always ───────────────────────────────────────────────
 *
 * Whatever happens — unknown address, already registered, not on the
 * allowlist, rate limited — this returns the SAME thing: "if that address can
 * have an account, a link is on its way."
 *
 * Different answers turn this form into a staff directory. Anyone with the
 * office code could otherwise sit here and learn who works at TLE, which of
 * them have accounts, and which addresses are real. The cost is that a
 * genuine typo gets no feedback; the fix for that is a person, not a
 * disclosure.
 *
 * The refusals are still REAL — they happen, they are logged server-side, and
 * no email goes out. They are simply not narrated back to the caller.
 *
 * ── Two rate limits, doing different jobs ─────────────────────────────────
 *
 * Per ADDRESS (60s, enforced in the database): stops somebody using our
 * sending domain to repeatedly mail one person. Survives a restart, which an
 * in-memory limit would not.
 *
 * Per IP (10 per 10 minutes, in memory): stops a script walking a list of
 * addresses. In memory is acceptable here because the failure mode of losing
 * it on deploy is one wasted window, not an open door — the per-address limit
 * still holds.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Always this, whatever actually happened. See the header. */
const SAME_ANSWER = {
  ok: true,
  message: "If that address can have an account, a link is on its way. It lasts an hour.",
};

/* Per-IP window. Deliberately generous — the point is to stop a script, not to
   catch out somebody who mistyped their address three times. */
const IP_MAX = 10;
const IP_WINDOW_MS = 10 * 60 * 1000;
const ipHits = new Map<string, number[]>();

function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  /* Unbounded growth would be a slow memory leak on a long-lived process, so
     the map is swept whenever it gets large rather than on a timer. */
  if (ipHits.size > 5_000) {
    for (const [k, v] of ipHits) if (!v.some((t) => now - t < IP_WINDOW_MS)) ipHits.delete(k);
  }
  return hits.length <= IP_MAX;
}

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  let email = "";
  try {
    const body = (await req.json()) as { email?: string };
    email = normaliseEmail(body.email ?? "");
  } catch {
    return NextResponse.json(SAME_ANSWER);
  }

  if (!ipAllowed(ip)) {
    console.warn(`[verify/start] rate limited ip=${ip}`);
    return NextResponse.json(SAME_ANSWER);
  }

  try {
    /* Who may have an account at all. Today that is the two founding
       addresses; when the invite flow lands this becomes "is there a pending
       invite for this address". Everything else about the route stays. */
    if (!isFoundingOwner(email)) {
      console.warn(`[verify/start] not on the allowlist: ${email}`);
      return NextResponse.json(SAME_ANSWER);
    }
    if (await findUserByEmail(email)) {
      // Already has an account — they want "forgot password", not this.
      console.warn(`[verify/start] already registered: ${email}`);
      return NextResponse.json(SAME_ANSWER);
    }
    if (!resendConfigured()) {
      console.error("[verify/start] Resend isn't configured — RESEND_API_KEY / RESEND_FROM");
      return NextResponse.json(SAME_ANSWER);
    }

    const { token } = await startVerification(email);

    /* The origin is taken from the request, not from a variable, so the link
       works on whichever domain the person actually used. OS_ORIGIN overrides
       it for the case where we are behind a proxy that rewrites Host. */
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const mail = verifyEmailFor(`${origin}/join?token=${encodeURIComponent(token)}`);

    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    console.info(`[verify/start] sent to ${email}`);
  } catch (e) {
    /* Every one of these is a real refusal that already stopped the send. It
       is logged for us and swallowed for the caller — see the header. */
    if (e instanceof VerificationError || e instanceof ResendBlocked || e instanceof ExternalRecipientRefused) {
      console.warn(`[verify/start] refused for ${email}: ${e.message}`);
    } else {
      console.error(`[verify/start] failed for ${email}:`, e);
    }
  }

  return NextResponse.json(SAME_ANSWER);
}
