import { NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/newsletter-track";

/**
 * A link in a newsletter was clicked (lib/newsletter-track). Counted, then on
 * to the real address. The link is signed: one that was never in the email
 * goes to the company website instead of wherever somebody pointed it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const token = (await params).token;
  const u = req.nextUrl.searchParams.get("u") ?? "";
  const s = req.nextUrl.searchParams.get("s") ?? "";
  const to = await recordClick(token, u, s).catch(() => null);
  return NextResponse.redirect(to && /^https?:\/\//i.test(to) ? to : "https://thelettingexperts.co.uk", 302);
}
