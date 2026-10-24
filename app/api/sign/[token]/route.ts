import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { publicOrigin } from "@/lib/origin";
import { landlordSign, landlordSigned, landlordView, saveDetails, TermsRefused } from "@/lib/terms/flow";

/**
 * The landlord's own link to their terms (lib/terms). No account: the token
 * in the link is the key, one per person, as a tenant's passport link is.
 *
 *   GET                                  -> the contract, their details, who has signed
 *   POST { action: "details", details }  -> saved and put on the contract; where to sign
 *   POST { action: "signed", name? }     -> checked with DocuSeal; the last one completes it
 *   POST { action: "sign", signature, startNow } -> signed on our page (24 Oct 2026), sealed by DocuSeal
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const view = await landlordView((await ctx.params).token).catch(() => null);
  if (!view) return NextResponse.json({ ok: false, error: "This link isn't recognised. Ask your agent to send it again." }, { status: 404 });
  return NextResponse.json({ ok: true, ...view }, { headers: { "cache-control": "private, no-store" } });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as { action?: string; details?: Record<string, string>; name?: string; signature?: unknown; startNow?: boolean | null };
  try {
    if (b.action === "details") return NextResponse.json({ ok: true, ...(await saveDetails(token, b.details ?? {})) });
    if (b.action === "sign") {
      const meta = { ip: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, userAgent: req.headers.get("user-agent") };
      return NextResponse.json({ ok: true, ...(await landlordSign(token, b.signature, typeof b.startNow === "boolean" ? b.startNow : null, publicOrigin(req), meta)) });
    }
    if (b.action === "signed") return NextResponse.json({ ok: true, ...(await landlordSigned(token, publicOrigin(req), b.name)) });
    throw new TermsRefused("What should happen?");
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't work. Try again in a moment.") }, { status: e instanceof TermsRefused ? 400 : 502 });
  }
}
