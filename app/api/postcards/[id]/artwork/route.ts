import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { readDesigns, sendable } from "@/lib/postcard-store";
import { postcardPdf, postcardSidePdf } from "@/lib/postcard-pdf";

/**
 * The print artwork for one design: front on page one, back on page two, at
 * A6 plus 3mm of bleed all round.
 *
 * ?merged=1 fills the example landlord in, which is what you want to look at
 * before signing anything off. Without it the braces survive.
 *
 * ?side=front|back gives one face on its own, with no address block, which
 * is the shape Stannp wants: a file per side, and the address laid down by
 * them where their machines expect it.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { id } = await ctx.params;
  const { designs } = await readDesigns();
  const design = designs.find((d) => d.id === id);
  if (!design) return NextResponse.json({ ok: false, error: "No such design." }, { status: 404 });
  if (!sendable(design)) return NextResponse.json({ ok: false, error: "That card has a fault on it. Fix it before printing." }, { status: 400 });

  const merged = req.nextUrl.searchParams.get("merged") === "1";
  const side = req.nextUrl.searchParams.get("side");
  try {
    const pdf =
      side === "front" || side === "back"
        ? await postcardSidePdf(design, side, { example: merged, forStannp: true })
        : await postcardPdf(design, { example: merged });
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `inline; filename="${design.id}${merged ? "-example" : ""}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Could not draw the artwork." }, { status: 500 });
  }
}
