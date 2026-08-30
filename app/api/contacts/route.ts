import { NextRequest, NextResponse } from "next/server";
import { whoIs } from "@/lib/admin";
import { hasDb } from "@/lib/db";
import { saveContact, listContacts, markRex, type NewContact, type RexState } from "@/lib/contacts-store";
import { pushContactToRex, pushBlockedBecause } from "@/lib/rex-contact-create";
import { record } from "@/lib/audit";

/**
 * Adding a person.
 *
 * POST → saves the contact in the OS, then TRIES to create it in REX. The two
 *        are reported separately, because they succeed and fail independently
 *        and a caller that conflates them will lie about one of them.
 * GET  → the contacts added here, newest first. `?state=held` is the queue of
 *        everything saved but not yet in REX.
 *
 * ── Saving is never conditional on REX ────────────────────────────────────
 *
 * The response always carries the saved record. If REX refuses — locked,
 * switched off, no personal sign-in — that is reported in `rex`, and the row
 * stays as "held" so it can be pushed later without re-typing. The previous
 * version of this screen had a Save button wired to an optional callback
 * nobody passed: it said "Saved to Leads" and wrote nothing, anywhere. The
 * rule taken from that is that the only acceptable failure is a loud one.
 *
 * ── Any signed-in person may add a contact ────────────────────────────────
 *
 * Leads is a front-of-house screen and taking down an enquiry is the job, so
 * this asks for a session and not a capability. The REX write is gated
 * separately and much harder — see lib/rex-contact-create.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Why there is no signed-in person.
 *
 * `whoIs` returns nothing both when nobody is signed in AND when there is no
 * database to look accounts up in — which is every local dev server without a
 * DATABASE_URL. Answering "Sign in first" to somebody who IS signed in sends
 * them round a loop that cannot end, so the two are told apart.
 */
function whyNoActor(): string {
  return hasDb()
    ? "Sign in first."
    : "No database is connected on this environment, so there are no accounts and nothing can be saved.";
}

export async function GET(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ error: whyNoActor() }, { status: 401 });

  const stateParam = req.nextUrl.searchParams.get("state");
  const state = (["held", "sent", "failed", "linked"] as const).includes(stateParam as RexState)
    ? (stateParam as RexState)
    : undefined;

  return NextResponse.json({
    contacts: await listContacts({ state }),
    /* So a list of "held" rows can say WHY they are held, without the reader
       having to go and find the switches page to guess. */
    rexBlocked: await pushBlockedBecause(),
  });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ error: whyNoActor() }, { status: 401 });

  const body = (await req.json().catch(() => null)) as (NewContact & { pushToRex?: boolean }) | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "A name is the one thing needed." }, { status: 400 });
  }

  const draft: NewContact = {
    kind: body.kind === "landlord" ? "landlord" : "tenant",
    name: body.name,
    email: body.email,
    mobile: body.mobile,
    address: body.address,
    postcode: body.postcode,
    source: body.source,
    enquiry: body.enquiry,
    notes: body.notes,
  };

  let saved;
  try {
    saved = await saveContact(draft, actor.email);
  } catch (e) {
    /* The one case where the whole thing fails. Said plainly rather than
       swallowed, because the alternative is the bug this replaces. */
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Could not save the contact." },
      { status: 500 }
    );
  }

  /* Opt out with pushToRex: false — useful for entering a backlog without
     firing a REX write per row. Default is to try. */
  if (body.pushToRex === false) {
    await markRex(saved.id, "held", "Saved without attempting REX.", null, actor.email);
    return NextResponse.json({
      contact: { ...saved, rexState: "held", rexDetail: "Saved without attempting REX." },
      rex: { ok: false, reason: "not_attempted", detail: "Saved here only, as asked." },
    });
  }

  const outcome = await pushContactToRex(saved, actor.id);

  /* "failed" only when REX was actually asked and said no. A refusal by our own
     locks is "held": nothing was attempted, nothing is wrong with the record,
     and it should push cleanly the moment the lock lifts. */
  const state: RexState = outcome.ok
    ? "sent"
    : outcome.reason === "refused" || outcome.reason === "rex_session_expired"
      ? "failed"
      : "held";

  await markRex(saved.id, state, outcome.detail, outcome.ok ? outcome.rexId : null, actor.email);

  if (outcome.ok) {
    await record({
      kind: "rex_contact_created",
      actorId: actor.id,
      actorEmail: actor.email,
      subjectEmail: saved.email,
      detail: `REX contact ${outcome.rexId} — ${saved.name}`,
    });
  }

  /* The returned row carries the state that was actually WRITTEN, not the one
     the happy path assumed. Reporting "held" while the database says "failed"
     is the same class of bug as the Save button that saved nothing. */
  return NextResponse.json({
    contact: {
      ...saved,
      rexState: state,
      rexDetail: outcome.detail,
      rexId: outcome.ok ? outcome.rexId : null,
    },
    rex: outcome,
  });
}
