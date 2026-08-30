import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getContact, updateContact, markRex } from "@/lib/contacts-store";
import { pushContactUpdateToRex } from "@/lib/rex-contacts";
import { record } from "@/lib/audit";

/**
 * One person: read them, or change them.
 *
 * GET   → the record.
 * PATCH → change the fields passed, then mirror the change into REX.
 *
 * ── The OS is the system of record, REX is the copy ───────────────────────
 *
 * The edit lands here FIRST and is never conditional on REX accepting it. That
 * is the whole shape of the overlay: an agent's correction must not be lost
 * because a backup store was slow, locked, or having a bad afternoon. `sync`
 * in the response says what happened to the copy, separately from `contact`,
 * which says what is now true.
 *
 * When the mirror fails the row is marked `failed` with the reason, so it shows
 * up as something to look at rather than drifting quietly out of step. A record
 * that disagrees with its backup and says nothing is worse than one that never
 * reached the backup at all.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return NextResponse.json({ error: "No such person." }, { status: 404 });
  return NextResponse.json({ contact });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const before = await getContact(id);
  if (!before) return NextResponse.json({ error: "No such person." }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Expected JSON." }, { status: 400 });

  /* Only these, and only if a string was sent. An empty name would leave a
     record nobody can find again, so it is refused rather than accepted. */
  const patch: Record<string, string> = {};
  for (const key of ["name", "email", "mobile", "address", "postcode", "source", "notes", "kind"]) {
    const v = body[key];
    if (typeof v === "string") patch[key] = v;
  }
  if (patch.name !== undefined && !patch.name.trim()) {
    return NextResponse.json({ error: "A person needs a name." }, { status: 400 });
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ contact: before, sync: null });
  }

  let contact;
  try {
    contact = await updateContact(id, patch);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save that change." },
      { status: 500 }
    );
  }
  if (!contact) return NextResponse.json({ error: "No such person." }, { status: 404 });

  /* Not in REX yet? Then there is nothing to mirror and this is not a failure —
     the create is still queued and will carry the new values when it runs. */
  if (!contact.rexId) {
    return NextResponse.json({ contact, sync: { ok: false, reason: "not_in_rex", detail: "Saved. Not backed up yet." } });
  }

  const outcome = await pushContactUpdateToRex(contact, actor.id);
  await markRex(
    id,
    outcome.ok ? "sent" : "failed",
    outcome.detail,
    contact.rexId,
    actor.email
  );

  if (outcome.ok) {
    /* What changed, not just that something did. "Who edited this and to what"
       is the question after a record turns out wrong, and REX's own log will
       say the OS, which is not an answer. */
    const changed = Object.keys(patch)
      .filter((k) => (before as unknown as Record<string, string>)[k] !== (contact as unknown as Record<string, string>)[k])
      .join(", ");
    await record({
      kind: "rex_contact_updated",
      actorId: actor.id,
      actorEmail: actor.email,
      subjectEmail: contact.email,
      detail: `REX contact ${contact.rexId} — ${contact.name}${changed ? ` (${changed})` : ""}`,
    });
  }

  return NextResponse.json({ contact: { ...contact, rexState: outcome.ok ? "sent" : "failed" }, sync: outcome });
}
