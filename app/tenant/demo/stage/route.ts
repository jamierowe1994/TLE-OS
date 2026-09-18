import { NextResponse, type NextRequest } from "next/server";
import { publicOrigin } from "@/lib/origin";
import { DEMO_STAGE_COOKIE, isStage } from "@/lib/tenant-journey";

/** The harness: /tenant/demo/stage?to=viewing puts Sophie at that stage and
 *  goes back to wherever the switch was pressed.
 *
 *  Back to OUR address (lib/origin), not the request's: behind Railway the
 *  request's origin is localhost:8080, and every stage James chose on the
 *  live sample landed on a dead page (18 Sep 2026) - the same trap
 *  lib/origin was written for on 3 Sep. */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const back = req.nextUrl.searchParams.get("back") || "/tenant/demo";
  const res = NextResponse.redirect(new URL(back.startsWith("/tenant/demo") ? back : "/tenant/demo", publicOrigin(req)), 303);
  if (isStage(to)) res.cookies.set(DEMO_STAGE_COOKIE, to, { path: "/tenant/demo", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
