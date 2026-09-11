import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { readAllTags } from "@/lib/lead-facts";

export const dynamic = "force-dynamic";

/** Every lead's saved tags at once, for the board's Tags filter. */
export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  return NextResponse.json({ ok: true, tags: await readAllTags() });
}
