import { NextRequest, NextResponse } from "next/server";
import { isStage } from "@/lib/landlord-sample";
import { rajAt } from "@/lib/landlord-sample";
import { SAMPLE_DECK } from "@/lib/present";
import { SAMPLE_EXTRAS } from "@/lib/appraisal-deck";
import { fileData, fileHtml } from "@/lib/landlord-file";

/**
 * The new landlord file and The Plan on the sample landlord (Claude Design,
 * 24 Oct 2026), for James to look at before it replaces /landlord. Raj at any
 * stop with ?stage=, the same as /landlord/demo. Nothing on it writes: uploads,
 * messages and signing say so instead.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const want = req.nextUrl.searchParams.get("stage");
  const view = rajAt(isStage(want) ? want : "instruction").view;
  /* ?bare=1: what a landlord gets when the agent wrote no figure, loves or fixes, so the fallbacks can be seen. */
  const bare = req.nextUrl.searchParams.get("bare") === "1";
  const deck = bare ? { ...(view.presentation ?? SAMPLE_DECK), figure: null, loves: null, fixes: null } : { ...(view.presentation ?? SAMPLE_DECK), ...SAMPLE_EXTRAS };
  const ask = SAMPLE_EXTRAS.figure!.ask;
  const d = fileData({
    view,
    first: "Raj",
    full: "Raj Patel",
    deck,
    sample: true,
    sampleFigure: bare ? null : { ...SAMPLE_EXTRAS.figure! },
    sampleService: { name: "Rent collection", fee: 14.4, setup: Math.round(ask * 0.6), setupWords: "", marketing: "Included" },
  });
  return new NextResponse(fileHtml(d), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } });
}
