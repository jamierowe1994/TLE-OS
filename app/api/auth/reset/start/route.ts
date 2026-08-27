import { NextRequest, NextResponse } from "next/server";
import { startVerification, VerificationError } from "@/lib/verification";
import { resetEmailFor } from "@/lib/verify-email";
import { sendEmail, ResendBlocked, resendConfigured } from "@/lib/resend";
import { ExternalRecipientRefused } from "@/lib/email-policy";
import { findUserByEmail, normaliseEmail } from "@/lib/users";

/**
 * "I've forgotten my password."
 *
 * The mirror image of /verify/start: that one refuses an address that ALREADY
 * has an account, this one refuses one that does not. Same silence either way —
 * the answer never reveals which case you are in, or the pair of endpoints
 * together would be a perfect account-existence oracle.
 *
 * Reaching for a reset is not proof of anything, so this does not check the
 * founding allowlist. Whoever has an account may reset it; who is allowed an
 * account in the first place is /join's question.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAME_ANSWER = {
  ok: true,
  message: "If there's an account on that address, a reset link is on its way. It lasts an hour.",
};

const IP_MAX = 10;
const IP_WINDOW_MS = 10 * 60 * 1000;
const ipHits = new Map<string, number[]>();
function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < IP_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
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
    console.warn(`[reset/start] rate limited ip=${ip}`);
    return NextResponse.json(SAME_ANSWER);
  }

  try {
    const user = await findUserByEmail(email);
    if (!user) {
      console.warn(`[reset/start] no account: ${email}`);
      return NextResponse.json(SAME_ANSWER);
    }
    if (!resendConfigured()) {
      console.error("[reset/start] Resend isn't configured");
      return NextResponse.json(SAME_ANSWER);
    }

    const { token } = await startVerification(email, "reset");
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const mail = resetEmailFor(`${origin}/reset?token=${encodeURIComponent(token)}`);
    await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text });
    console.info(`[reset/start] sent to ${email}`);
  } catch (e) {
    if (e instanceof VerificationError || e instanceof ResendBlocked || e instanceof ExternalRecipientRefused) {
      console.warn(`[reset/start] refused for ${email}: ${e.message}`);
    } else {
      console.error(`[reset/start] failed for ${email}:`, e);
    }
  }
  return NextResponse.json(SAME_ANSWER);
}
