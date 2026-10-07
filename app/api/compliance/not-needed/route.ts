import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability, whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { clearNotNeeded, markNotNeeded } from "@/lib/cert-not-needed";
import { patchHeldBook, refreshComplianceBook } from "@/lib/compliance-cache";
import { CERT_META, clearMarks, withMark, type CertKey } from "@/lib/compliance";
import type { MarkKind } from "@/lib/cert-not-needed";

/**
 * POST   { propertyId, cert, reason } → mark a certificate not needed on a home.
 * POST   { propertyId, cert, kind: "renewal_applied", appliedOn, ref }
 *                                      → an HMO licence renewal is with the council.
 * DELETE { propertyId, cert }         → undo it.
 *
 * The compliance office's call (James, 7 Oct 2026), from the tracker. The held
 * compliance book is patched in place so every screen agrees at once; undoing
 * also starts a full refresh, because only REX knows what the record was.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest) {
  return requireAnyCapability(req, ["manage:switches", "see:agent-compliance"]);
}

type Body = { propertyId: string; cert: CertKey; reason: string; kind: MarkKind; appliedOn: string | null; ref: string };

async function read(req: NextRequest): Promise<Body | string> {
  const b = (await req.json().catch(() => null)) as { propertyId?: string; cert?: string; reason?: string; kind?: string; appliedOn?: string; ref?: string } | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  const cert = String(b?.cert ?? "").trim() as CertKey;
  if (!/^(\d+|pm-[0-9a-z-]+)$/i.test(propertyId)) return "Which home? propertyId is missing.";
  if (!CERT_META[cert]) return "Which certificate? cert is not one we track.";
  const kind: MarkKind = b?.kind === "renewal_applied" ? "renewal_applied" : "not_needed";
  let appliedOn: string | null = null;
  if (kind === "renewal_applied") {
    if (cert !== "licence") return "A renewal applied for is for a licence.";
    appliedOn = String(b?.appliedOn ?? "").trim();
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(appliedOn) || appliedOn > today || appliedOn < "2020-01-01") return "When did the renewal go to the council? A date, not in the future.";
  }
  return { propertyId, cert, reason: String(b?.reason ?? "").trim().slice(0, 300), kind, appliedOn, ref: String(b?.ref ?? "").trim().slice(0, 80) };
}

export async function POST(req: NextRequest) {
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const r = await read(req);
  if (typeof r === "string") return NextResponse.json({ ok: false, error: r }, { status: 400 });
  /* Not needed is the office's call. A licence renewal at the council is a
     fact any of us may know first - the agent often does - so anyone signed
     in may note it, with their name on it (7 Oct 2026). */
  const me = r.kind === "renewal_applied" ? (await whoIs(req)).actor : await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: r.kind === "renewal_applied" ? "Sign in first." : "Only the compliance office can mark a certificate not needed." }, { status: r.kind === "renewal_applied" ? 401 : 403 });
  const by = me.name || me.email;
  const n = await markNotNeeded(r.propertyId, r.cert, r.reason, by, { kind: r.kind, appliedOn: r.appliedOn, ref: r.ref });
  await patchHeldBook((book) => {
    for (const p of book.properties) {
      if (String(p.id) !== r.propertyId) continue;
      p.certs[r.cert] = withMark(p.certs[r.cert], n);
    }
  }).catch(() => false);
  return NextResponse.json({ ok: true, notNeeded: n });
}

export async function DELETE(req: NextRequest) {
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "Only the compliance office can undo this." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const r = await read(req);
  if (typeof r === "string") return NextResponse.json({ ok: false, error: r }, { status: 400 });
  await clearNotNeeded(r.propertyId, r.cert);
  await patchHeldBook((book) => {
    for (const p of book.properties) {
      if (String(p.id) !== r.propertyId) continue;
      const held = p.certs[r.cert];
      if (!held) continue;
      p.certs[r.cert] = clearMarks(held);
    }
  }).catch(() => false);
  void refreshComplianceBook().catch(() => null);
  return NextResponse.json({ ok: true });
}
