import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { recordDelivery } from "@/lib/newsletter-track";

/**
 * Resend telling us what happened to an email (1 Oct 2026): delivered,
 * bounced or marked as spam. Our Resend key can only send, so this is the
 * only way the OS learns whether a newsletter actually arrived.
 *
 * Signed by Resend (Svix): the secret is RESEND_WEBHOOK_SECRET, the "whsec_"
 * value Resend shows when the webhook is added. Unsigned or wrongly signed
 * calls are refused. Events for emails that are not newsletters are fine and
 * simply match nothing.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verified(body: string, id: string, ts: string, sigs: string): boolean {
  const secret = (process.env.RESEND_WEBHOOK_SECRET ?? "").trim();
  if (!secret || !id || !ts || !sigs) return false;
  /* Five minutes either way, so an old captured call cannot be replayed. */
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const want = createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64");
  return sigs.split(" ").some((part) => {
    const got = part.split(",")[1] ?? "";
    const a = Buffer.from(got);
    const b = Buffer.from(want);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}

export async function POST(req: NextRequest) {
  if (!(process.env.RESEND_WEBHOOK_SECRET ?? "").trim()) {
    return NextResponse.json({ ok: false, error: "RESEND_WEBHOOK_SECRET isn't set." }, { status: 503 });
  }
  const body = await req.text();
  if (!verified(body, req.headers.get("svix-id") ?? "", req.headers.get("svix-timestamp") ?? "", req.headers.get("svix-signature") ?? "")) {
    return NextResponse.json({ ok: false, error: "Not signed by Resend." }, { status: 401 });
  }
  let evt: { type?: string; data?: { email_id?: string; bounce?: { message?: string } } } = {};
  try {
    evt = JSON.parse(body);
  } catch {
    return NextResponse.json({ ok: false, error: "Not JSON." }, { status: 400 });
  }
  const matched = await recordDelivery(evt.data?.email_id ?? "", evt.type ?? "", evt.data?.bounce?.message).catch(() => false);
  return NextResponse.json({ ok: true, matched });
}
