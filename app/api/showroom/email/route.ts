import { sameSite } from "@/lib/email/preview-origin";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
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


export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (id) {
    if (!isShowroomEmail(id)) return NextResponse.json({ ok: false, error: "No such email here." }, { status: 404 });
    try {
      const out = await renderShowroomEmail(id);
      if (!out) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });
      /* Pictures from this site's own public address (lib/origin): the files
         on disk on a laptop, the live site on Railway. NOT the request's
         origin - behind Railway that is localhost:8080, and every picture in
         every preview pointed there and showed as a broken box (James, 28 Sep
         2026). */
      return NextResponse.json({ ok: true, id, subject: out.subject, html: sameSite(out.html, publicOrigin(req)) });
    } catch (e) {
      return NextResponse.json({ ok: false, error: `That email did not render: ${publicError(e, "unknown")}` }, { status: 500 });
    }
  }

  const ids = (req.nextUrl.searchParams.get("ids") ?? "").split(",").filter(isShowroomEmail);
  return NextResponse.json({ ok: true, emails: ids.map(showroomEmailMeta).filter(Boolean) });
}
