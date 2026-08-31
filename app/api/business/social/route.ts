import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/admin";
import { fetchBrandSocial, socialApiConfigured } from "@/lib/business/social-client";

// The Lettings Expert's organic socials (Facebook + Instagram followers +
// growth), pulled live from the sister ads platform's partner API.
// GET ?preset=<last_7d|last_14d|last_30d|last_90d>
//
// Two audiences: Susan reads it as business performance, Francesca as her own
// work. There were also two IDENTICAL guards here, one returning 401 and one
// 403 — the second could never run.
export async function GET(req: NextRequest) {
  if (!(await requireAnyCapability(req, ["see:business", "see:marketing"]))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }

  const preset = req.nextUrl.searchParams.get("preset") ?? "last_30d";
  const social = await fetchBrandSocial(preset);
  return NextResponse.json({
    configured: socialApiConfigured(),
    preset,
    social,
  });
}
