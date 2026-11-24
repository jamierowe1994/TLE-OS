import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { lookFor } from "@/lib/new-look-store";
import { isSignatureDataUrl } from "@/lib/id-declaration";
import { saveSignature, signatureFor } from "@/lib/id-stamp";

/**
 * The agent's own signature for the declaration on a tenant's ID (Sean
 * McMahon, ticket 88c98681; lib/id-stamp). Behind the "idstamp" switch.
 *
 * GET -> { on, name, signature } for the signed-in agent - their own, never
 *        anybody else's.
 * PUT { png } -> keeps a newly drawn signature (a PNG data URL).
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const on = Boolean((await lookFor(actor).catch(() => null))?.idstamp);
  if (!on) return NextResponse.json({ ok: true, on: false });
  const sig = await signatureFor(actor.id).catch(() => undefined);
  if (sig === undefined) return NextResponse.json({ ok: false, error: "Could not read your signature." }, { status: 500 });
  return NextResponse.json({ ok: true, on: true, name: actor.name ?? "", signature: sig?.png ?? null });
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const on = Boolean((await lookFor(actor).catch(() => null))?.idstamp);
  if (!on) return NextResponse.json({ ok: false, error: "Signing IDs is not switched on for you." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "Signatures can't be kept on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as { png?: unknown };
  if (!isSignatureDataUrl(b.png)) return NextResponse.json({ ok: false, error: "Draw your signature in the box first." }, { status: 400 });
  try {
    await saveSignature(actor.id, b.png);
  } catch {
    return NextResponse.json({ ok: false, error: "Your signature did not save. Try again." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
