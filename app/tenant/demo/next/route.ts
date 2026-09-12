import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { DEMO_STAGE_COOKIE, isStage, nextHarnessStage } from "@/lib/tenant-journey";

/**
 * The sample's own "next step" button lands here: it moves Sophie one stop
 * along, so the walkthrough reads as the real thing would. The real portal
 * never links here - its buttons open the booking, the feedback, the offer.
 */
export async function GET(req: NextRequest) {
  const c = (await cookies()).get(DEMO_STAGE_COOKIE)?.value;
  const now = isStage(c) ? c : "referencing";
  const to = nextHarnessStage(now) ?? now;
  const res = NextResponse.redirect(new URL("/tenant/demo", req.nextUrl.origin), 303);
  res.cookies.set(DEMO_STAGE_COOKIE, to, { path: "/tenant/demo", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
