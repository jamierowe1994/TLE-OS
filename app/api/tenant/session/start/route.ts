import { NextRequest, NextResponse } from "next/server";
import { startVerification, VerificationError } from "@/lib/verification";
import { tenantByEmail, upsertTenantAccount } from "@/lib/tenant-account";
import { renderTenantSignIn } from "@/lib/email/tle-emails";
import { sendEmail, ResendBlocked } from "@/lib/resend";
import { hasDb } from "@/lib/db";
import { normaliseEmail } from "@/lib/users";

/**
 * POST { email } → a sign-in link, if the address is a tenant on a Propoly
 * deal. The landlord flow, for tenants: the same answer on screen whether or
 * not the email is one we hold, the same rate limit, the same dev-only
 * hand-back of the link when nothing can send.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SAME_ANSWER = {
  ok: true,
  message: "If that address is one we hold for a tenant, your link is on its way. It works once and lasts 24 hours.",
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
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  let email = "";
  try {
    const body = (await req.json()) as { email?: string };
    email = normaliseEmail(body.email ?? "");
  } catch {
    return NextResponse.json(SAME_ANSWER);
  }
  if (!email.includes("@")) return NextResponse.json(SAME_ANSWER);
  if (!ipAllowed(ip)) {
    console.warn(`[tenant/start] rate limited ip=${ip}`);
    return NextResponse.json(SAME_ANSWER);
  }
  if (!hasDb()) {
    console.error("[tenant/start] no database on this environment");
    return NextResponse.json(SAME_ANSWER);
  }

  try {
    const match = await tenantByEmail(email);
    if (!match) {
      console.warn(`[tenant/start] not a tenant we hold: ${email}`);
      return NextResponse.json(SAME_ANSWER);
    }
    await upsertTenantAccount(match);
    const { token } = await startVerification(email, "tenant");
    const origin = process.env.OS_ORIGIN?.replace(/\/+$/, "") || req.nextUrl.origin;
    const link = `${origin}/tenant/enter?token=${encodeURIComponent(token)}`;
    const firstName = match.name.split(/\s+/)[0] || "there";
    const mail = renderTenantSignIn({ firstName, link });
    try {
      await sendEmail({ to: email, subject: mail.subject, html: mail.html, text: mail.text, audience: "customer" });
      console.info(`[tenant/start] sent to ${email}`);
    } catch (e) {
      if (e instanceof ResendBlocked && process.env.NODE_ENV !== "production") {
        console.warn(`[tenant/start] not sent (${e.message}); handing the link back because this is not production`);
        return NextResponse.json({ ...SAME_ANSWER, devLink: link, devNote: e.message });
      }
      throw e;
    }
  } catch (e) {
    if (e instanceof VerificationError || e instanceof ResendBlocked) {
      console.warn(`[tenant/start] refused for ${email}: ${e.message}`);
    } else {
      console.error(`[tenant/start] failed for ${email}:`, e);
    }
  }
  return NextResponse.json(SAME_ANSWER);
}
