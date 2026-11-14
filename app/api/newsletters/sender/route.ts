import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { MailSenderError, getMailSender, setMailSender } from "@/lib/mail-sender";
import { mailoutDomains } from "@/lib/resend";

/**
 * The address mail-outs to landlords and tenants come from (lib/mail-sender):
 * a name, the address and where replies go, set by Marketing. One for every
 * mail-out, so changing it here changes the next one to send.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "see:marketing"))) return new NextResponse(null, { status: 404 });
  return NextResponse.json({ ok: true, sender: await getMailSender(), domains: mailoutDomains() });
}

export async function PUT(req: NextRequest) {
  const me = await requireCapability(req, "see:marketing");
  if (!me) return new NextResponse(null, { status: 404 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { name?: unknown; email?: unknown; replyTo?: unknown };
  try {
    const sender = await setMailSender(
      { name: typeof body.name === "string" ? body.name : "", email: typeof body.email === "string" ? body.email : "", replyTo: typeof body.replyTo === "string" ? body.replyTo : "" },
      me.name || me.email
    );
    return NextResponse.json({ ok: true, sender });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof MailSenderError ? e.message : "It didn't save." }, { status: 400 });
  }
}
