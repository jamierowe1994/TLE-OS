import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { getContact, markRex } from "@/lib/contacts-store";
import { pushContactToRex } from "@/lib/rex-contact-create";
import { record } from "@/lib/audit";

/**
 * Push a contact that was saved but never reached REX.
 *
 * This is the point of keeping "held" as a state rather than treating a locked
 * write as a failure: everything entered while the lock was on is a queue, and
 * this is how the queue drains. Nobody re-types anything.
 *
 * ── It refuses to create the same person twice ────────────────────────────
 *
 * A contact that already carries a rex_id is not pushed again, whatever the
 * caller asks for. Two records for one landlord is the exact mess this OS is
 * supposed to help REX avoid, and a retry button is precisely where it would
 * come from — a slow first attempt, an impatient second press.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) return NextResponse.json({ error: "No such contact." }, { status: 404 });

  if (contact.rexId) {
    return NextResponse.json({
      ok: false,
      reason: "already_there",
      detail: `${contact.name} is already REX contact ${contact.rexId}.`,
      contact,
    });
  }

  const outcome = await pushContactToRex(contact, actor.id);
  const state = outcome.ok
    ? "sent"
    : outcome.reason === "refused" || outcome.reason === "rex_session_expired"
      ? "failed"
      : "held";

  await markRex(id, state, outcome.detail, outcome.ok ? outcome.rexId : null, actor.email);

  if (outcome.ok) {
    await record({
      kind: "rex_contact_created",
      actorId: actor.id,
      actorEmail: actor.email,
      subjectEmail: contact.email,
      detail: `REX contact ${outcome.rexId} — ${contact.name} (pushed from the held list)`,
    });
  }

  return NextResponse.json({ ...outcome, contact: await getContact(id) });
}
