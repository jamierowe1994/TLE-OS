import { NextRequest, NextResponse } from "next/server";
import { startVerification, VerificationError } from "@/lib/verification";
import { landlordByEmail, upsertLandlordAccount } from "@/lib/landlord-account";
import { renderLandlordSignIn } from "@/lib/email/tle-emails";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { hasDb } from "@/lib/db";
import { normaliseEmail } from "@/lib/users";

/**
 * A landlord asks for their link.
 *
 * Same shape as the password reset: one answer whatever happened, so the
 * form cannot be used to find out which addresses are landlords of ours. The
 * difference is who may ask - anyone, from any domain - and where the email
 * goes out: the public Lettings Experts sender, never the OS domain.
 *
 * ── The dev link ──────────────────────────────────────────────────────────
 *
 * Off production only, when sending is locked, the response carries the
 * link itself, so the flow can be walked on a laptop with no Resend. It is
 * gated on NODE_ENV rather than on the sending lock alone, because a
 * production environment with sending accidentally locked must not start
 * handing sign-in links to whoever typed the email.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAME_ANSWER = {
  ok: true,
  message:
    "If that address is one we hold for a landlord, your link is on its way. It works once and lasts 24 hours.",
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
  if (!email.includes("@")) return NextResponse.json(SAME_ANSWER);
  if (!ipAllowed(ip)) {
    console.warn(`[landlord/start] rate limited ip=${ip}`);
    return NextResponse.json(SAME_ANSWER);
  }
  if (!hasDb()) {
    console.error("[landlord/start] no database on this environment");
    return NextResponse.json(SAME_ANSWER);
  }

  try {
    const match = await landlordByEmail(email);
    if (!match) {
      console.warn(`[landlord/start] not a landlord we hold: ${email}`);
      return NextResponse.json(SAME_ANSWER);
    }
    await upsertLandlordAccount(match);

    const { token } = await startVerification(email, "landlord");
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const link = `${origin}/landlord/enter?token=${encodeURIComponent(token)}`;
    const firstName = match.name.split(/\s+/)[0] || "there";
    const mail = renderLandlordSignIn({ firstName, link });

    try {
      await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, audience: "customer" });
      console.info(`[landlord/start] sent to ${email}`);
    } catch (e) {
      if (e instanceof ResendBlocked && process.env.NODE_ENV !== "production") {
        console.warn(`[landlord/start] not sent (${e.message}); handing the link back because this is not production`);
        return NextResponse.json({ ...SAME_ANSWER, devLink: link, devNote: e.message });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof VerificationError || e instanceof ResendBlocked) {
      console.warn(`[landlord/start] refused for ${email}: ${e.message}`);
    } else {
      console.error(`[landlord/start] failed for ${email}:`, e);
    }
  }
  return NextResponse.json(SAME_ANSWER);
}
