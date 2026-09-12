import { NextResponse, type NextRequest } from "next/server";
import { DEMO_STAGE_COOKIE, isStage } from "@/lib/tenant-journey";

/** The harness: /tenant/demo/stage?to=viewing puts Sophie at that stage and
 *  goes back to wherever the switch was pressed. */
export function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  const back = req.nextUrl.searchParams.get("back") || "/tenant/demo";
  const res = NextResponse.redirect(new URL(back.startsWith("/tenant/demo") ? back : "/tenant/demo", req.nextUrl.origin), 303);
  if (isStage(to)) res.cookies.set(DEMO_STAGE_COOKIE, to, { path: "/tenant/demo", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  return res;
}
