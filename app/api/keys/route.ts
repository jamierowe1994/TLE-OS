import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { fetchKeys } from "@/lib/rex-keys";
import { rexConfigured } from "@/lib/rex";
import { requireCapability } from "@/lib/admin";

/** Key sets for one or more properties. Read-only, like everything REX. */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  /* The key register for any homes asked for (Rig run 2, P-008): who holds
     which key is the office's, and nothing on an agent's screen asks for it.
     It answered anybody signed in. */
  if (!(await requireCapability(req, "see:everything"))) {
    return NextResponse.json({ ok: false, error: "The key register is the office's." }, { status: 403 });
  }
  if (!rexConfigured()) return NextResponse.json({ ok: true, keys: {} });
  const ids = (req.nextUrl.searchParams.get("propertyIds") ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 60);
  if (!ids.length) return NextResponse.json({ ok: true, keys: {} });
  try {
    return NextResponse.json({ ok: true, keys: await fetchKeys(ids) });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: publicError(e, "Couldn't read the key register.") },
      { status: 502 }
    );
  }
}
