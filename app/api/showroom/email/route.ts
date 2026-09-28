import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { isShowroomEmail, renderShowroomEmail, showroomEmailMeta } from "@/lib/showroom/emails";

/**
 * GET /api/showroom/email?ids=a,b,c   → what each is and when it goes
 * GET /api/showroom/email?id=a        → that one, rendered with the sample tenant
 *
 * Any signed-in member of staff, and only the Showroom's own emails
 * (lib/showroom). Read only.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LIVE_ORIGIN = (process.env.OS_ORIGIN ?? "https://tle-os.co.uk").replace(/\/+$/, "");

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!isShowroomEmail(id)) return NextResponse.json({ ok: false, error: "No such email here." }, { status: 404 });
    try {
      const out = await renderShowroomEmail(id);
      if (!out) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });
      /* Pictures from this site, not the live one, so a preview shows what is on disk (as /api/admin/emails). */
      return NextResponse.json({ ok: true, id, subject: out.subject, html: out.html.replaceAll(LIVE_ORIGIN, req.nextUrl.origin) });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `That email did not render: ${e instanceof Error ? e.message : "unknown"}` }, { status: 500 });
    }
  }

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(isShowroomEmail);
  return NextResponse.json({ ok: true, emails: ids.map(showroomEmailMeta).filter(Boolean) });
}
