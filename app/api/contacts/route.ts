import { NextRequest, NextResponse } from "next/server";
import { maskContactFields, seesContactLists } from "@/lib/contact-mask";
import { publicError } from "@/lib/public-error";
import { whoIs } from "@/lib/admin";
import { leadScope } from "@/lib/scope";
import { hasDb } from "@/lib/db";
import { saveContact, listContacts, markRex, type NewContact, type RexState } from "@/lib/contacts-store";
import { pushContactToRex, pushBlockedBecause } from "@/lib/rex-contacts";
import { TEST_STREET } from "@/lib/test-guard";
import { record } from "@/lib/audit";

/**
 * Adding a person.
 *
 * POST → saves the contact in the OS, then TRIES to create it in REX. The two
 *        are reported separately, because they succeed and fail independently
 *        and a caller that conflates them will lie about one of them.
 * GET  → the contacts added here that are on this person's board, newest
 *        first. `?state=held` is the queue of those saved but not yet in REX.
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
  const who = await whoIs(req);
  const { actor } = who;
  if (!actor) return NextResponse.json({ error: whyNoActor() }, { status: 401 });

  const stateParam = req.nextUrl.searchParams.get("state");
  const state = (["held", "sent", "failed", "linked"] as const).includes(stateParam as RexState)
    ? (stateParam as RexState)
    : undefined;

  /* WHOSE (Dan Richards' ticket, 15 Oct 2026). The Leads board merges this
     list into the board, and it used to be the whole business's for anybody:
     every agent had every other agent's hand-added people on their own board
     (shortened, and refused when opened), and every tenant-area enquiry too -
     Dan in Wolverhampton was shown a tenant looking in Glasgow. Now it is the
     board's own scope (lib/scope leadScope): the whole business for an owner
     and the office, otherwise the ones this person added and the tenant-area
     people who asked about their homes (lib/contacts-store ownedBySql). An
     owner viewing as somebody sees theirs. */
  const scope = await leadScope(req);
  const ownedBy = scope.everything ? null : ((who.viewingAs ? who.subject?.email : actor.email) ?? "").trim().toLowerCase() || "-";

  /* Somebody else's contacts come with their email and mobile shortened for
     an agent (lib/contact-mask, 10 Oct 2026); their own come whole, and
     opening one contact gives its full details. A scoped list is all their
     own. */
  const full = seesContactLists(actor.role) || ownedBy !== null;
  const me = actor.email.trim().toLowerCase();
  const contacts = (await listContacts({ state, ownedBy })).map((c) =>
    full || (c.createdBy ?? "").trim().toLowerCase() === me ? c : maskContactFields(c)
  );
  return NextResponse.json({
    contacts,
    /* So a list of "held" rows can say WHY they are held, without the reader
       having to go and find the switches page to guess. */
    rexBlocked: await pushBlockedBecause(),
  });
}

export async function POST(req: NextRequest) {
  const { actor } = await whoIs(req);
  if (!actor) return NextResponse.json({ error: whyNoActor() }, { status: 401 });

  const body = (await req.json().catch(() => null)) as (NewContact & { pushToRex?: boolean; rexId?: string | null }) | null;
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "A name is the one thing needed." }, { status: 400 });
  }

  /* A landlord is registered with a source, or not at all (Howard, 24 Sep
     2026). Checked here as well as on the panel, so no other way in skips it. */
  if (body.kind === "landlord" && !String(body.source ?? "").trim()) {
    return NextResponse.json({ error: "Choose where this landlord came from before saving." }, { status: 400 });
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

  /* A landlord saved at the test address is a TEST landlord (James, 13 Oct
     2026): New listing at 14 Test Street saves them here first, and without
     the flag they went to REX like anybody else. Flagged, they never do
     (lib/rex-contacts refuses is_test), and the listing made for them stays
     in the OS (app/api/listings/new). The address alone decides it - the
     test street, never the postcode (lib/test-guard). */
  const isTest = TEST_STREET.test(String(draft.address ?? ""));

  let saved;
  try {
    saved = await saveContact(draft, actor.email, { isTest });
  } catch (e) {
    /* The one case where the whole thing fails. Said plainly rather than
       swallowed, because the alternative is the bug this replaces. */
    return NextResponse.json(
      { error: publicError(e, "Could not save the contact.") },
      { status: 500 }
    );
  }

  /* A tenant added by hand gets Let's Find You a Home (16 Sep 2026), once,
     behind the Automatic tenant emails switch. Never allowed to fail the
     save: the contact exists whatever the email does. */
  /* What it did comes back to the panel (4 Oct 2026), which used to say "the
     welcome email has NOT gone" whatever had happened. */
  let welcome: { state: string; detail: string } | null = null;
  if (draft.kind === "tenant" && !isTest && (draft.email ?? "").trim()) {
    const r = await import("@/lib/tenant-journey-emails")
      .then((m) => m.sendAddedWelcome({ contactId: saved.id, name: saved.name ?? draft.name, email: String(draft.email), by: actor }))
      .catch(() => null);
    welcome = r ? { state: r.state, detail: r.detail } : { state: "failed", detail: "The welcome email could not be worked out." };
  }

  /* "CONTINUING X'S RECORD" (22 Sep 2026). The panel offered the REX contact
     it matched and the agent chose to carry on with them - and the route then
     created a second REX contact anyway, because the choice never reached it.
     A chosen record is linked, and REX is not written to. */
  /* A test contact is never joined to a REX record, nor pushed to one. */
  if (isTest) {
    const detail = "A test contact (the test address) - kept in the OS, never sent to REX.";
    await markRex(saved.id, "held", detail, null, actor.email);
    /* A test landlord belongs to a test file from the start, so it shows on
       the tester's Test files tab and Delete there clears it and all that
       follows (lib/test-overlay adoptTestKit). */
    if (draft.kind === "landlord") {
      await import("@/lib/test-overlay")
        .then((m) => m.adoptTestKit({ by: actor, contactId: saved.id }))
        .catch((e) => console.error("[contacts] could not file the test landlord", (e as Error).message));
    }
    return NextResponse.json({
      welcome,
      contact: { ...saved, rexState: "held", rexDetail: detail },
      rex: { ok: false, reason: "test_file", detail },
    });
  }

  const rexId = typeof body.rexId === "string" && /^\d+$/.test(body.rexId.trim()) ? body.rexId.trim() : null;
  if (rexId) {
    const detail = `Carried on REX contact ${rexId} - nothing new was created in REX.`;
    await markRex(saved.id, "linked", detail, rexId, actor.email);
    return NextResponse.json({
      welcome,
      contact: { ...saved, rexState: "linked", rexDetail: detail, rexId },
      rex: { ok: true, reason: "linked", rexId, detail },
    });
  }

  /* Opt out with pushToRex: false — useful for entering a backlog without
     firing a REX write per row. Default is to try. */
  if (body.pushToRex === false) {
    await markRex(saved.id, "held", "Saved without attempting REX.", null, actor.email);
    return NextResponse.json({
      welcome,
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
    welcome,
    contact: {
      ...saved,
      rexState: state,
      rexDetail: outcome.detail,
      rexId: outcome.ok ? outcome.rexId : null,
    },
    rex: outcome,
  });
}
