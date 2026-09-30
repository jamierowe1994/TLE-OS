import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { deleteNewsletter, getNewsletter, NewsletterError, renderNewsletter, updateNewsletter } from "@/lib/newsletters";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** One email, with a preview rendered as the person asking would get it. */
export async function GET(req: NextRequest, { params }: Ctx) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return new NextResponse(null, { status: 404 });
  const n = await getNewsletter((await params).id);
  if (!n) return NextResponse.json({ ok: false, error: "That email no longer exists." }, { status: 404 });
  const preview = renderNewsletter(n, { email: me.email, name: me.name || "" });
  return NextResponse.json({ ok: true, newsletter: n, preview: preview.html });
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    const n = await updateNewsletter((await params).id, {
      name: typeof body.name === "string" ? body.name.slice(0, 200) : undefined,
      subject: typeof body.subject === "string" ? body.subject.slice(0, 300) : undefined,
      preheader: typeof body.preheader === "string" ? body.preheader.slice(0, 300) : undefined,
      blocks: Array.isArray(body.blocks) ? (body.blocks as Record<string, unknown>[]) : undefined,
      recipients: Array.isArray(body.recipients)
        ? (body.recipients as { email?: unknown; name?: unknown }[])
            .filter((r) => typeof r?.email === "string")
            .map((r) => ({ email: String(r.email), name: typeof r.name === "string" ? r.name : "" }))
        : undefined,
    });
    return NextResponse.json({ ok: true, newsletter: n });
  } catch (e) {
    const msg = e instanceof NewsletterError ? e.message : "It didn't save.";
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest, { params }: Ctx) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  try {
    await deleteNewsletter((await params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof NewsletterError ? e.message : "It didn't delete." }, { status: 400 });
  }
}
