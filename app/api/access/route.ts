import { NextRequest, NextResponse } from "next/server";
import {
  accessFor,
  grantAccess,
  requestAccess,
  type RexObjectType,
  type RexPermission,
} from "@/lib/rex-permissions";
import { rexWritesLocked } from "@/lib/rex";

/**
 * Can I work this record, and if not, how do I get in?
 *
 * GET  /api/access?type=contacts&id=123&user=36739
 *        → { canEdit, isOwner, ownerIds }
 *
 * POST /api/access   { type, id, user, action: "grant" | "request", reason? }
 *        → grants access without moving ownership, or asks the owner for it.
 *
 * The POST half is refused by the OS's REX write lock until somebody sets
 * REX_ALLOW_WRITES for the exact method. That is not timidity: this decides
 * who can see a real person's file in the team's live system, and the first
 * one should go through with a human watching.
 */

const TYPES: RexObjectType[] = ["contacts", "listings", "properties"];
const PERMS: RexPermission[] = ["read", "update", "owner"];

function parse(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const type = p.get("type") as RexObjectType | null;
  const id = p.get("id");
  const user = p.get("user");
  if (!type || !TYPES.includes(type)) return { error: `type must be one of ${TYPES.join(", ")}` };
  if (!id || !user) return { error: "id and user are required" };
  return { type, id, user };
}

export async function GET(req: NextRequest) {
  const q = parse(req);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  const answer = await accessFor(q.type, q.id, q.user);
  if (!answer) {
    return NextResponse.json({ error: "REX didn't answer." }, { status: 502 });
  }
  return NextResponse.json({ ...answer, writesLocked: rexWritesLocked() });
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const type = body.type as RexObjectType;
  const id = body.id as string | number;
  const user = String(body.user ?? "");
  const action = body.action === "grant" ? "grant" : "request";
  const permission = PERMS.includes(body.permission as RexPermission)
    ? (body.permission as RexPermission)
    : "update";

  if (!TYPES.includes(type) || !id || !user) {
    return NextResponse.json({ error: "type, id and user are required" }, { status: 400 });
  }

  const reason = String(body.reason ?? "").trim();
  if (action === "request" && !reason) {
    // Ours, not REX's. A request nobody can judge gets rubber-stamped or
    // ignored, and both are worse than being made to say why.
    return NextResponse.json(
      { error: "Say why you need it — the owner has to be able to judge the request." },
      { status: 400 }
    );
  }

  try {
    const res =
      action === "grant"
        ? await grantAccess(type, id, user, permission)
        : await requestAccess(type, id, user, reason, permission);
    return NextResponse.json({ ok: Boolean(res?.ok), action, result: res?.result ?? null });
  } catch (e) {
    // RexWriteBlocked lands here and carries its own instructions.
    return NextResponse.json(
      { error: (e as Error).message, writesLocked: rexWritesLocked() },
      { status: 423 }
    );
  }
}
