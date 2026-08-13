import { NextRequest, NextResponse } from "next/server";
import { markOpened } from "@/lib/present-store";

/**
 * "They've opened it."
 *
 * Fired once by the viewer when the deck is genuinely on screen, rather than
 * counted in the page render. Next renders a page more than once — a
 * prefetch, a re-render, a corporate mail scanner walking every link before
 * delivery — and an agent who rings a landlord because it says four opens
 * needs that four to be four people, not four renders.
 *
 * Deliberately unauthenticated and deliberately dull: it takes a token that
 * must already exist, increments a counter, and returns nothing. There is no
 * way to read anything back through it, and the worst a caller with a stolen
 * token can do is inflate a number on their own presentation.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let token = "";
  try {
    token = String(((await req.json()) as { token?: string })?.token ?? "");
  } catch {
    /* an empty body is not worth a 400 — nothing depends on the answer */
  }
  if (token) await markOpened(token);
  return NextResponse.json({ ok: true });
}
