import { NextRequest, NextResponse } from "next/server";
import { ALL_KINDS, clearSandbox, listSandbox, sandboxCounts, seedSandbox } from "@/lib/sandbox-store";
import { SANDBOX_KINDS, describeSeed, type SandboxKind } from "@/lib/sandbox";

/**
 * GET  /api/sandbox            → what exists, per kind
 * POST /api/sandbox { kind, action: "seed" | "clear" }
 *
 * `seed` is also `rewind`: it clears that kind first, so pressing it twice
 * replaces rather than accumulates.
 *
 * This only ever writes to the sandbox table. It cannot touch REX, PayProp,
 * Propoly or any real record — see lib/sandbox for why sandbox ids carry a
 * prefix and sandbox addresses use a domain that cannot resolve.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function validKind(k: unknown): k is SandboxKind {
  return typeof k === "string" && (ALL_KINDS as string[]).includes(k);
}

export async function GET() {
  const counts = await sandboxCounts();
  return NextResponse.json({
    kinds: SANDBOX_KINDS.map((k) => ({
      ...k,
      count: counts[k.id] ?? 0,
      willCreate: describeSeed(k.id),
    })),
    records: await listSandbox(),
  });
}

export async function POST(req: NextRequest) {
  let body: { kind?: unknown; action?: unknown };
  try {
    body = (await req.json()) as { kind?: unknown; action?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const action = body.action === "clear" ? "clear" : "seed";

  // "Clear everything" is the only operation allowed without a kind, and it is
  // still scoped to the sandbox table.
  if (action === "clear" && body.kind == null) {
    return NextResponse.json({ ok: true, action, cleared: await clearSandbox() });
  }
  if (!validKind(body.kind)) {
    return NextResponse.json({ error: `kind must be one of ${ALL_KINDS.join(", ")}` }, { status: 400 });
  }

  try {
    if (action === "clear") {
      return NextResponse.json({ ok: true, action, kind: body.kind, cleared: await clearSandbox(body.kind) });
    }
    const records = await seedSandbox(body.kind);
    return NextResponse.json({ ok: true, action, kind: body.kind, records });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
