import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { sameSite } from "@/lib/email/preview-origin";
import { publicOrigin } from "@/lib/origin";
import { publicError } from "@/lib/public-error";
import { LEARNING_EMAIL_IDS } from "@/lib/learning/systems";
import { renderShowroomEmail } from "@/lib/showroom/emails";

/**
 * GET /api/tools/learning/email?id=a → that email, rendered with its sample
 * customer, for the Systems tour (Tools > Learning > Systems).
 *
 * Any signed-in member of staff, and only the emails the tour lists
 * (LEARNING_EMAIL_IDS in lib/learning/systems). Rendered the way the Showroom
 * renders them (lib/showroom/emails): the catalogue's own sample with any
 * edits made in the email builder laid on top, so what an agent reads here is
 * what the customer gets. Read only: nothing is ever sent.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id || !LEARNING_EMAIL_IDS.has(id)) return NextResponse.json({ ok: false, error: "No such email here." }, { status: 404 });

  try {
    const out = await renderShowroomEmail(id);
    if (!out) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });
    /* Pictures from this site's own public address, not the request's origin
       (behind Railway that is localhost:8080): see app/api/showroom/email. */
    return NextResponse.json({ ok: true, id, subject: out.subject, html: sameSite(out.html, publicOrigin(req)) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: `That email did not render: ${publicError(e, "unknown")}` }, { status: 500 });
  }
}
