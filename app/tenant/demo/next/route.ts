import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { nextHarnessStage } from "@/lib/tenant-journey";
import { demoStage, setDemoStage } from "@/lib/tenant-demo";

/**
 * The sample's own "next step" button lands here: it moves Sophie one stop
 * along, so the walkthrough reads as the real thing would. The real portal
 * never links here - its buttons open the booking, the feedback, the offer.
 */
export async function GET(req: NextRequest) {
  const now = await demoStage();
  const to = nextHarnessStage(now) ?? now;
  const res = NextResponse.redirect(new URL("/tenant/demo", publicOrigin(req)), 303);
  setDemoStage(res, req, to);
  return res;
}
