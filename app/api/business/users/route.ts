import { NextRequest, NextResponse } from "next/server";
import { requireCapability } from "@/lib/admin";
import { findById, listUsers, linkUser, toAdmin } from "@/lib/business/users-store";
import type { UserLinks } from "@/lib/business/users-store";
import type { AdminNote } from "@/lib/business/types";
import { ROSTER } from "@/lib/business/seed-data";

// Admin user management: list portal accounts and link them to the business
// (agentKey ↔ roster, rexUserId ↔ REX AccountUsers, metaCampaignId ↔ Meta).
// Session + ADMIN_EMAILS gated.

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
  const users = await listUsers();
  return NextResponse.json({ users });
}

/** Nullable-string field: "" and null both clear the value. */
function asNullableString(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s === "" ? null : s;
}

// PATCH { userId, agentKey?, rexUserId?, metaCampaignId?, location?, note? }
// Present-key semantics: only keys present in the body are updated; sending
// null (or "") clears a field. `note` appends an admin note, never replaces.
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(req);
  if (gate) return gate;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  /* Two separate things, which a paste during the port had merged into one:
     the capability check (401) and the missing-userId guard (400). The merged
     version dropped the null check entirely and then reported an auth failure
     as "userId is required", which is a misleading answer to a question nobody
     asked. */
  if (!(await requireCapability(req, "see:business"))) {
    return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  }
  const userId = typeof body.userId === "string" ? body.userId : null;
  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }
  const existing = await findById(userId);
  if (!existing) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  const patch: UserLinks = {};

  if ("agentKey" in body) {
    const agentKey = asNullableString(body.agentKey);
    if (agentKey && !ROSTER.some((r) => r.agentKey === agentKey)) {
      return NextResponse.json(
        { error: `Unknown agentKey "${agentKey}" — must match the roster.` },
        { status: 400 }
      );
    }
    patch.agentKey = agentKey;
  }
  if ("rexUserId" in body) patch.rexUserId = asNullableString(body.rexUserId);
  if ("metaCampaignId" in body)
    patch.metaCampaignId = asNullableString(body.metaCampaignId);
  if ("location" in body) patch.location = asNullableString(body.location);

  if (typeof body.note === "string" && body.note.trim()) {
    const note: AdminNote = { at: new Date().toISOString(), text: body.note.trim() };
    patch.adminNotes = [...(existing.adminNotes ?? []), note];
  }

  const updated = await linkUser(userId!, patch);
  if (!updated) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  return NextResponse.json({ user: toAdmin(updated) });
}
