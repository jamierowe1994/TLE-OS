import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { keepAgentSignature, savedAgentSignature } from "@/lib/terms/signatures";

/**
 * The signed-in agent's saved signature (James's send screen, 24 Oct 2026:
 * "My signature", once they have ticked "Save it for next time").
 *
 *   GET    -> { image | null }
 *   DELETE -> forgotten
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, image: await savedAgentSignature(actor.id) }, { headers: { "cache-control": "private, no-store" } });
}

export async function DELETE(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await keepAgentSignature(actor.id, null);
  return NextResponse.json({ ok: true });
}
