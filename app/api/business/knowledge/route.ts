import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { findById } from "@/lib/business/users-store";
import {
  listKnowledge,
  upsertKnowledge,
  deleteKnowledge,
} from "@/lib/business/knowledge-store";

// Admin-only CRUD for the assistant knowledge base (Admin → Assistant).
//   GET    /api/admin/knowledge          → { entries }
//   POST   /api/admin/knowledge          { id?, title, content } → { entry }
//   DELETE /api/admin/knowledge?id=...   → { deleted }

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  /* ONE auth system. The portal guarded this with its own session plus an
     ADMIN_EMAILS list; in the OS the same job is a capability, so owner and
     super_admin pass and nobody else does — including developers, who have no
     business reading the money. */
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate) return gate;
  return NextResponse.json({ entries: await listKnowledge() });
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const { id, title, content } = (body ?? {}) as {
    id?: string;
    title?: string;
    content?: string;
  };
  if (typeof title !== "string" || typeof content !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  try {
    const entry = await upsertKnowledge({ id: id ?? null, title, content });
    return NextResponse.json({ entry });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Couldn't save that entry." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  return NextResponse.json({ deleted: await deleteKnowledge(id) });
}
