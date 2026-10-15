import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { landlordPapersOnFile } from "@/lib/landlord-papers";
import { bankOnFile } from "@/lib/landlord-home";
import { publicError } from "@/lib/public-error";

/**
 * What we already hold for a landlord, so nobody asks for it twice (Jade
 * Grewal, 14 Oct 2026): their ID and AML from their other homes, and whether
 * PayProp has a bank account for them - the last four digits, never more.
 *
 * GET ?email=&name=&property=&appraisal= -> { ok, papers, bank }
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const s = (v: string | null, n: number) => (v ?? "").trim().slice(0, n);

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const u = req.nextUrl.searchParams;
  const email = s(u.get("email"), 200);
  const name = s(u.get("name"), 160);
  if (!email && !name) return NextResponse.json({ ok: true, papers: { id: null, aml: null }, bank: null });
  try {
    const [papers, bank] = await Promise.all([
      landlordPapersOnFile({ email, name, notAt: s(u.get("property"), 300) || null, notAppraisal: s(u.get("appraisal"), 120) || null }),
      bankOnFile({ email, name }).catch(() => null),
    ]);
    return NextResponse.json({ ok: true, papers, bank });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Couldn't check what's on file just now.") }, { status: 500 });
  }
}
