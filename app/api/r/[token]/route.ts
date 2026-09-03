import { NextRequest, NextResponse } from "next/server";
import { recordResponse } from "@/lib/bond-qr";

/**
 * The rent-check form, from the public page. No sign-in; the token is the key.
 * A filled honeypot is thanked and dropped.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  if (str(b.company).trim()) return NextResponse.json({ ok: true });
  const r = await recordResponse({
    token,
    name: str(b.name),
    email: str(b.email),
    phone: str(b.phone),
    message: str(b.message),
    consent: b.consent === true,
  });
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
