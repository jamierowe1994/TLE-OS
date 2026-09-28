import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { sendEmail } from "@/lib/resend";
import { record } from "@/lib/audit";
import { isShowroomEmail, renderShowroomEmail } from "@/lib/showroom/emails";

/**
 * POST { id } → that Showroom email, with the sample tenant's details, to the
 * person pressing the button and nobody else: the address is the session's,
 * never the request's. So an agent can see it in a real inbox, on their own
 * phone, without making a test tenant (James, 28 Sep 2026: "they're going to
 * have to send everything to themselves"). Staff addresses only, which the
 * send path enforces too.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!isShowroomEmail(id)) return NextResponse.json({ ok: false, error: "No such email here." }, { status: 404 });

  let out: { subject: string; html: string } | null;
  try {
    out = await renderShowroomEmail(id);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `That email did not render: ${e instanceof Error ? e.message : "unknown"}` });
  }
  if (!out) return NextResponse.json({ ok: false, error: "No such email." }, { status: 404 });

  try {
    /* On the public Letting Experts sender, as the tenant would get it; a
       staff address is let through with customer email switched off. */
    await sendEmail({ to: actor.email, subject: `[Showroom] ${out.subject}`, html: out.html, audience: "customer" });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That did not send." });
  }
  await record({ kind: "email_test_sent", actorId: actor.id, actorEmail: actor.email, subjectEmail: actor.email, detail: `Showroom: ${id}` }).catch(() => null);
  return NextResponse.json({ ok: true, to: actor.email });
}
