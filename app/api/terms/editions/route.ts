import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { CURRENT, NEXT, baseEditionId, edition, editionFor, isRevision } from "@/lib/terms/catalogue";
import { ensureRevisionFor, ensureRevisions } from "@/lib/terms/revisions";
import type { Country, TermsDoc } from "@/lib/terms/types";

/**
 * GET [?version=] -> the saved versions of the Terms of Business the send
 * screen needs (James, 26 Nov 2026): the one that goes out for each country
 * now, and the one a contract in hand was sent on. The send screen registers
 * them (lib/terms/use-revisions) so the paper an agent reads before sending is
 * the wording that will be sent. Staff only; with nothing saved it is empty.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  await ensureRevisions(true);
  const docs = new Map<string, TermsDoc>();
  const latest: Record<string, string> = {};
  for (const country of ["england", "scotland"] as Country[]) {
    for (const next of [false, true]) {
      const d = editionFor(country, next);
      const base = (next ? NEXT[country] : null) ?? CURRENT[country];
      if (d && base && isRevision(d.id)) {
        docs.set(d.id, d);
        latest[base] = d.id;
      }
    }
  }
  const version = req.nextUrl.searchParams.get("version") ?? "";
  if (/^[\w-]+~r\d+$/.test(version)) {
    await ensureRevisionFor(version);
    const d = edition(version);
    if (d && baseEditionId(d.id) !== d.id) docs.set(d.id, d);
  }
  return NextResponse.json({ ok: true, docs: [...docs.values()], latest }, { headers: { "cache-control": "private, no-store" } });
}
