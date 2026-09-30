import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { NewsletterError, publishNewsletter, unpublishNewsletter } from "@/lib/newsletters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** Publish: { sendAt } as an ISO time, or nothing for "now" (the next run, within five minutes). */
export async function POST(req: NextRequest, { params }: Ctx) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return new NextResponse(null, { status: 404 });
  const { sendAt } = (await req.json().catch(() => ({}))) as { sendAt?: string | null };
  try {
    const n = await publishNewsletter((await params).id, sendAt ? new Date(sendAt) : new Date(), me.name || me.email);
    return NextResponse.json({ ok: true, newsletter: n });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof NewsletterError ? e.message : "It didn't publish." }, { status: 400 });
  }
}

/** Unpublish: back to a draft, if nothing has gone yet. */
export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  try {
    return NextResponse.json({ ok: true, newsletter: await unpublishNewsletter((await params).id) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof NewsletterError ? e.message : "It didn't unpublish." }, { status: 400 });
  }
}
