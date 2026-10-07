import { NextRequest, NextResponse } from "next/server";
import { requireAnyCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { clearNotNeeded, markNotNeeded } from "@/lib/cert-not-needed";
import { patchHeldBook, refreshComplianceBook } from "@/lib/compliance-cache";
import { CERT_META, type CertKey } from "@/lib/compliance";

/**
 * POST   { propertyId, cert, reason } → mark a certificate not needed on a home.
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

async function read(req: NextRequest): Promise<{ propertyId: string; cert: CertKey; reason: string } | string> {
  const b = (await req.json().catch(() => null)) as { propertyId?: string; cert?: string; reason?: string } | null;
  const propertyId = String(b?.propertyId ?? "").trim();
  const cert = String(b?.cert ?? "").trim() as CertKey;
  if (!/^(\d+|pm-[0-9a-z-]+)$/i.test(propertyId)) return "Which home? propertyId is missing.";
  if (!CERT_META[cert]) return "Which certificate? cert is not one we track.";
  return { propertyId, cert, reason: String(b?.reason ?? "").trim().slice(0, 300) };
}

export async function POST(req: NextRequest) {
  const me = await gate(req);
  if (!me) return NextResponse.json({ ok: false, error: "Only the compliance office can mark a certificate not needed." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const r = await read(req);
  if (typeof r === "string") return NextResponse.json({ ok: false, error: r }, { status: 400 });
  const by = me.name || me.email;
  const n = await markNotNeeded(r.propertyId, r.cert, r.reason, by);
  await patchHeldBook((book) => {
    for (const p of book.properties) {
      if (String(p.id) !== r.propertyId) continue;
      const held = p.certs[r.cert];
      p.certs[r.cert] = { ...(held ?? { expires: null, attached: false }), notNeeded: { by: n.by, reason: n.reason, at: n.at } };
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
      const { notNeeded: _gone, ...rest } = held;
      void _gone;
      p.certs[r.cert] = rest;
    }
  }).catch(() => false);
  void refreshComplianceBook().catch(() => null);
  return NextResponse.json({ ok: true });
}
