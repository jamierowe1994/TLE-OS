import { NextRequest, NextResponse } from "next/server";
import { autofillListing } from "@/lib/listing-autofill";
import { readListingDetails } from "@/lib/listing-details";
import { gateListingWrite } from "@/lib/listing-gate";
import { rexConfigured } from "@/lib/rex";

/**
 * "Fill it in for me" on the Marketing tab.
 *
 *   POST { id, copy?: boolean }
 *
 * Looks everything up and hands back suggestions with where each came from
 * (lib/listing-autofill). Saves nothing: the form fills what is empty and the
 * agent presses Save. `copy: false` skips the writer - facts only, no credit
 * spent - for when the description and key features are already done.
 *
 * Behind the same switch as saving, because it is part of editing the advert
 * and it spends Anthropic credit.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

export async function POST(req: NextRequest) {
  if (!rexConfigured()) return NextResponse.json({ ok: false, error: "The listings are not connected on this environment." }, { status: 503 });
  const gate = await gateListingWrite(req, "listing-edit");
  if ("refuse" in gate) return gate.refuse;
  const b = (await req.json().catch(() => ({}))) as { id?: unknown; copy?: unknown };
  const id = Number(b.id);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ ok: false, error: "Which listing?" }, { status: 400 });
  try {
    const details = await readListingDetails(id);
    const result = await autofillListing(details, { writeCopy: b.copy !== false });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "The lookup did not finish." }, { status: 502 });
  }
}
