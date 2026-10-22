import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { optOutFor, saveOptOut } from "@/lib/zero-deposit-optout";
import { record } from "@/lib/audit";
import { publicError } from "@/lib/public-error";

/**
 * A landlord's zero deposit opt-out (lib/zero-deposit-optout), one person at a time.
 *
 * GET  ?email=&ref=                                  -> { ok, optOut }
 * PUT  { email?, ref?, name?, optedOut, reason? }    -> { ok, optOut }
 *
 * Staff only: the agent records it, never the landlord. Saved on the OS
 * record; nothing is written to REX, Propoly or Flatfair.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const u = req.nextUrl.searchParams;
  const email = s(u.get("email"), 200);
  const ref = s(u.get("ref"), 120);
  if (!email && !ref) return NextResponse.json({ ok: true, optOut: null });
  try {
    return NextResponse.json({ ok: true, optOut: await optOutFor({ email, ref }) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That couldn't be read just now.") }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const email = s(b?.email, 200).toLowerCase();
  const ref = s(b?.ref, 120);
  if (!email && !ref) return NextResponse.json({ ok: false, error: "Add their email first, so this has somebody to belong to." }, { status: 400 });
  if (typeof b?.optedOut !== "boolean") return NextResponse.json({ ok: false, error: "Opted out or not?" }, { status: 400 });
  try {
    const optOut = await saveOptOut({
      email,
      ref,
      name: s(b.name, 160),
      optedOut: b.optedOut,
      reason: s(b.reason, 300),
      by: { email: actor.email, name: actor.name ?? "" },
    });
    await record({
      kind: "zero_deposit_optout",
      actorId: actor.id,
      actorEmail: actor.email,
      detail: `${email || ref}: ${optOut ? `opted out of zero deposit${optOut.reason ? ` (${optOut.reason})` : ""}` : "opt-out taken off, back to zero deposit under the terms"}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, optOut });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That didn't save.") }, { status: 500 });
  }
}
