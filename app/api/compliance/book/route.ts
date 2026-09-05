import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/admin";
import { getComplianceBook } from "@/lib/compliance-cache";
import { rexCall, rexConfigured, rexRows } from "@/lib/rex";

/**
 * GET /api/compliance/book → every property on the compliance book with
 * what REX holds per certificate type: the expiry in days from today, and
 * whether a file is attached. The tracker route only returns what is
 * outstanding; the backlog run needs the whole book to match a Propoly
 * folder to its REX property and to skip a certificate REX already holds
 * with a later date. Owner or the compliance role.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireAnyCapability(req, ["manage:switches", "see:agent-compliance"]);
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });

  /* ?find=<address> → REX's own address index, for a property the rental
     book does not carry (a managed home never marketed through this
     account, say). Candidates only; the caller decides which is the one. */
  const find = (req.nextUrl.searchParams.get("find") ?? "").trim();
  if (find) {
    if (!rexConfigured()) return NextResponse.json({ ok: true, candidates: [] });
    const res = await rexCall("Properties", "autocomplete", { search_string: find.slice(0, 120), limit: 12 }).catch(() => null);
    const candidates = res?.ok
      ? rexRows(res.result).map((r) => ({ id: String((r as { id?: unknown }).id ?? ""), address: String((r as { address?: unknown }).address ?? "").trim() })).filter((c) => c.id)
      : [];
    return NextResponse.json({ ok: true, candidates });
  }

  const { book, ageMs } = await getComplianceBook();
  return NextResponse.json({
    ok: true,
    ageMs,
    properties: book.properties.map((p) => ({
      id: p.id,
      name: p.name,
      locality: p.locality,
      certs: Object.fromEntries(Object.entries(p.certs).map(([k, v]) => [k, { expires: v.expires, attached: v.attached }])),
    })),
  });
}
