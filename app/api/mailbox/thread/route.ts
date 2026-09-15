import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { conversationWith } from "@/lib/mailbox-read";

/**
 * GET ?email= → the signed-in person's own emails with that address, newest
 * first (lib/mailbox-read, 15 Sep 2026). Read live; nothing is stored.
 *
 * Never while viewing as somebody: that shows an owner an agent's leads, not
 * their private mailbox.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor, viewingAs } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, reason: "signed_out", detail: "Sign in first." }, { status: 401 });
  if (viewingAs) {
    return NextResponse.json({ ok: false, reason: "refused", detail: "Emails are private to the person whose mailbox they are in, so they don't show while you're viewing as somebody." });
  }
  const email = (req.nextUrl.searchParams.get("email") ?? "").trim();
  return NextResponse.json(await conversationWith(actor.id, email));
}
