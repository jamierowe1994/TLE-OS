import { NextRequest, NextResponse } from "next/server";
import { requireCapability, whoIs } from "@/lib/admin";
import { applyPhase, PhaseRefused, PHASES, phaseState, previewPhase, type PhaseId } from "@/lib/phases";
import { publicOrigin } from "@/lib/origin";

/**
 * The three pilot phases (lib/phases).
 *
 *   GET   where the pilot is, what each phase is, and what pressing each one
 *         would change RIGHT NOW - read off the live switches and areas, so
 *         the screen never describes a button from memory
 *   POST  { phase, typed, invite?, announce? } - press it
 *
 * `manage:switches`, which is the owner's alone: a phase arms live sends and
 * emails a whole agency. Refused while viewing as somebody.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
/* Phase 1 emails a roster one at a time. */
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!(await requireCapability(req, "manage:switches"))) return new NextResponse(null, { status: 404 });
  const [state, ...previews] = await Promise.all([phaseState(), ...PHASES.map((p) => previewPhase(p.id))]);
  return NextResponse.json({
    ok: true,
    state,
    phases: PHASES.map((p, i) => ({ id: p.id, name: p.name, confirm: p.confirm, says: p.says, steps: p.steps, preview: previews[i] })),
  });
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "manage:switches");
  if (!me) return new NextResponse(null, { status: 404 });
  const { viewingAs } = await whoIs(req);
  if (viewingAs) return NextResponse.json({ ok: false, error: "Stop viewing as somebody first." }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { phase?: number; typed?: string; invite?: unknown; announce?: boolean };
  if (![1, 2, 3].includes(Number(b.phase))) return NextResponse.json({ ok: false, error: "Which phase?" }, { status: 400 });
  try {
    const result = await applyPhase({
      id: Number(b.phase) as PhaseId,
      typed: String(b.typed ?? ""),
      me,
      origin: publicOrigin(req),
      invite: Array.isArray(b.invite) ? b.invite.filter((v): v is string => typeof v === "string") : [],
      announce: b.announce !== false,
    });
    return NextResponse.json({ ok: true, result, state: await phaseState() });
  } catch (e) {
    if (e instanceof PhaseRefused) return NextResponse.json({ ok: false, error: e.message }, { status: 400 });
    console.error("phase failed", e);
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "That did not finish. Check Admin, Switches to see what was set." }, { status: 500 });
  }
}
