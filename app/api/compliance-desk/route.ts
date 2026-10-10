import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { requireCapability } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { overview } from "@/lib/agent-compliance";
import { answer, isCheckKind, subjectExists, verifyQueue, worksToCheck } from "@/lib/compliance-desk";
import { confirmRegister, readAccuracy, readOne, REGISTERS } from "@/lib/cert-register";

/**
 * Michael's desk: what is waiting on him, and his tick.
 *
 * GET  → the documents to verify, the finished jobs to check, and how many
 *        agents are short. One call, because the dashboard draws all three and
 *        each list page needs its own plus the counts on the rail.
 *        The PROPERTY figures are not here: they come from the compliance book
 *        (/api/compliance/tracker), which walks REX and must never hold up a
 *        list that is one query.
 * POST → { kind, id, state: "verified" | "queried", note?, registerNumber?, fileAs? }.
 *        registerNumber is the engineer's number he checked on the register
 *        (lib/cert-register): kept with his tick, and against what was read.
 *        fileAs { type, expiry, issue? }: a landlord's certificate, filed as a
 *        real one on his Verified.
 *        { action: "read", kind, id } reads the engineer off the certificate.
 *
 * Since 4 Oct 2026 his answer has consequences (lib/compliance-desk, answer):
 * Verified lets a certificate go on to the landlord and tenants; a query
 * emails the agent. He still never writes to a landlord himself. `said` is the
 * one sentence about what happened next, for his screen.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: true, stored: false, reason: "No database on this environment.", verify: [], works: [], agents: null });
  try {
    const [verify, works, o, accuracy] = await Promise.all([verifyQueue(), worksToCheck(), overview(), readAccuracy().catch(() => null)]);
    /* Agents only: the office's own logins are on the grid but are not who
       "all of the agents are compliant" is about. */
    const agents = o.agents.filter((a) => a.role === "agent");
    return NextResponse.json({
      ok: true,
      stored: true,
      firstName: (me.name || "").split(" ")[0] ?? "",
      verify,
      works,
      /* How often the number read off a certificate was the one he confirmed. */
      registerAccuracy: accuracy,
      agents: {
        total: agents.length,
        short: agents.filter((a) => a.short > 0).length,
        names: agents.filter((a) => a.short > 0).map((a) => ({ userId: a.userId, name: a.name || a.email, short: a.short })),
        requirements: o.requirements.filter((r) => r.required).length,
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "Could not read the desk.") }, { status: 502 });
  }
}

export async function POST(req: NextRequest) {
  const me = await requireCapability(req, "see:agent-compliance");
  if (!me) return NextResponse.json({ ok: false, error: "Not yours." }, { status: 403 });
  if (!hasDb()) return NextResponse.json({ ok: false, error: "No database on this environment." }, { status: 503 });
  const b = (await req.json().catch(() => ({}))) as {
    kind?: string; id?: string; state?: string; note?: string; action?: string; registerNumber?: string; again?: boolean;
    fileAs?: { type?: string; expiry?: string; issue?: string } | null;
  };
  if (!b.kind || !isCheckKind(b.kind) || !b.id) return NextResponse.json({ ok: false, error: "Which one?" }, { status: 400 });
  /* Read the engineer off the certificate - once, kept. */
  if (b.action === "read") {
    if (b.kind === "works_order") return NextResponse.json({ ok: false, error: "Only certificates are read." }, { status: 400 });
    const read = await readOne(b.kind, b.id, { again: b.again === true });
    const reg = read.scheme !== "none" ? REGISTERS[read.scheme] : null;
    return NextResponse.json({ ok: true, read, registerName: reg?.name ?? null, registerUrl: reg?.url ?? null });
  }
  if (b.state !== "verified" && b.state !== "queried") return NextResponse.json({ ok: false, error: "Verified, or queried?" }, { status: 400 });
  if (b.state === "queried" && !b.note?.trim()) return NextResponse.json({ ok: false, error: "Say what is wrong with it, so the agent knows what to put right." }, { status: 400 });
  if (!(await subjectExists(b.kind, b.id))) return NextResponse.json({ ok: false, error: "That record is not there any more." }, { status: 404 });
  const number = (b.registerNumber ?? "").trim();
  if (number && b.state === "verified" && b.kind !== "works_order") {
    await confirmRegister(b.kind, b.id, number, me.name || me.email);
  }
  let said = "";
  try {
    said = await answer({
      kind: b.kind,
      id: b.id,
      state: b.state,
      note: b.note || (number && b.state === "verified" ? `Engineer ${number} checked on the register.` : undefined),
      by: me.name || me.email,
      fileAs: b.fileAs?.expiry ? { type: String(b.fileAs.type ?? ""), expiry: String(b.fileAs.expiry), issue: b.fileAs.issue ? String(b.fileAs.issue) : null } : null,
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "That did not save.") }, { status: 400 });
  }
  const [verify, works] = await Promise.all([verifyQueue(), worksToCheck()]);
  return NextResponse.json({ ok: true, said, verify, works });
}
