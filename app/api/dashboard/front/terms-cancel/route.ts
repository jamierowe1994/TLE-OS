import { NextRequest, NextResponse } from "next/server";
import { frontCtx, termInScope } from "@/lib/front-dash-reads";
import { publicError } from "@/lib/public-error";
import { cancelTermsHere } from "@/lib/terms-cancelled";
import { cancelTerms } from "@/lib/terms/flow";
import { getTerms } from "@/lib/terms/store";
import { assertNotViewingAs, ViewingAsRefused, VIEW_AS_COOKIE } from "@/lib/view-as";

/**
 * POST /api/dashboard/front/terms-cancel { id, why } - cancel one set of terms
 * from the dashboard's Terms out list (Lorna Fieldson, 28 Oct 2026, 15 Egton
 * Street: the landlord withdrew on 25 Sep and the terms still counted).
 *
 * Only a set in the person's own list. Our own terms page (page:) is withdrawn
 * the way the listing does it: the links stop working. The others
 * (docuseal:, esign:) stop counting and chasing here, nothing more - see
 * lib/terms-cancelled. Nobody is emailed either way.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const no = (error: string, status = 400) => NextResponse.json({ ok: false, error }, { status });

export async function POST(req: NextRequest) {
  try {
    assertNotViewingAs(req.cookies.get(VIEW_AS_COOKIE)?.value);
  } catch (e) {
    if (e instanceof ViewingAsRefused) return no(e.message, 423);
    throw e;
  }
  const ctx = await frontCtx(req);
  const me = ctx?.who.actor;
  if (!ctx || !me) return no("Sign in first.", 401);
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; why?: unknown };
  const id = typeof b.id === "string" ? b.id : "";
  const [kind, ref] = id.split(/:(.*)/s);
  if (!ref || !["page", "docuseal", "esign"].includes(kind)) return no("Which terms?");
  const why = typeof b.why === "string" ? b.why : "";

  try {
    if (!(await termInScope(ctx, id))) return no("Those terms aren't in your list any more.", 404);
    const by = me.name || me.email;
    if (kind === "page") {
      const t = await getTerms(ref);
      if (!t || t.status !== "sent") return no("Those terms aren't out any more.", 409);
      if (t.agentId !== me.id && me.role !== "owner" && me.role !== "super_admin") return no("Only the agent who sent these can cancel them.", 403);
      await cancelTerms(ref);
    } else {
      await cancelTermsHere(id, why, by);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return no(publicError(e, "They couldn't be cancelled just now. Try again in a minute."), 502);
  }
}
