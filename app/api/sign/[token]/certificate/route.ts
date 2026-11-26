import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { TermsRefused, uploadByToken } from "@/lib/terms/flow";

/**
 * A certificate the landlord already holds, uploaded from their signing link
 * while they answer the questions about the home (James, 26 Nov 2026). No
 * account: the token in the link is the key, as it is for the rest of
 * app/api/sign/[token]. The file goes in by the landlord's upload door, so the
 * compliance desk checks it before it counts; nothing goes to REX from here.
 *
 *   POST multipart: kind (gas | eicr | epc), file (one or more pages), label
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Expected a file upload." }, { status: 400 });
  }
  const files = form.getAll("file").filter((f): f is File => f instanceof File);
  try {
    const done = await uploadByToken(token, String(form.get("kind") ?? ""), files, String(form.get("label") ?? "") || undefined);
    return NextResponse.json({ ok: true, ...done });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't upload. Try again in a moment.") }, { status: e instanceof TermsRefused ? 400 : 502 });
  }
}
