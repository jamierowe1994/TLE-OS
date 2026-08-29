import "server-only";
import type { Scope } from "@/lib/scope";
import { bookFor, invalidateListingBook } from "@/lib/listings-cache";
import { getListingContacts } from "@/lib/business/rex-stats";
import { addPropertyNote } from "@/lib/business/property-notes-store";
import { isExpiredToken, rexCall, RexWriteBlocked } from "@/lib/rex";
import { MERGE_WRITE, NoSenderIdentity, previewMerge, sendMerge } from "@/lib/rex-mailmerge";
import { rexTokenFor } from "@/lib/rex-user";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * THINGS STEVE CAN DO, AS OPPOSED TO THINGS HE CAN FIND OUT.
 *
 * ── The shape, and why it is this shape ──────────────────────────────────
 *
 * Steve never performs an action. He PROPOSES one: a tool returns a proposal,
 * the widget renders it as a card with the real recipient and the real text on
 * it, and the person presses the button. Only that press executes anything.
 *
 * James's rule, 29 Aug: compose, then one click. The click is not bureaucracy.
 * It is the only moment a human reads the thing before it becomes irreversible,
 * and every action here is irreversible in the way that matters — a landlord
 * cannot un-read an email and a portal advert cannot be un-published.
 *
 * ── Three guards, because a signature alone is not enough ────────────────
 *
 * 1. THE PROPOSAL IS SEALED. It goes to the browser HMAC-signed and comes back
 *    the same way, so what executes is what the server composed, not what the
 *    page holds. Nothing in a proposal is read from the request body.
 *
 * 2. THE RECIPIENT IS RE-RESOLVED, NEVER CARRIED. Even sealed, an address the
 *    MODEL chose is an address a prompt could have chosen. So a proposal names
 *    a listing and a role — "the landlord of 828057" — and the executor looks
 *    up who that is at the moment it runs. Talk Steve into any address you
 *    like; the email still goes to the landlord on the REX record.
 *
 * 3. SCOPE IS CHECKED AGAIN AT EXECUTION. The proposal was made under one
 *    person's scope; the click arrives as a fresh request and is re-checked
 *    against it. A sealed proposal is not a capability someone else can spend.
 */

/** What the card shows, and what the executor is allowed to act on. */
export type ActionProposal =
  | {
      kind: "note";
      listingId: string;
      address: string;
      text: string;
    }
  | {
      kind: "reminder";
      listingId: string | null;
      address: string | null;
      title: string;
      startsAt: string;
      mins: number;
    }
  | {
      kind: "write-up";
      listingId: string;
      address: string;
      heading: string;
      body: string;
    }
  | {
      kind: "email";
      listingId: string;
      address: string;
      /** WHO, as a role on a record. Never an address — see guard 2. */
      to: "landlord" | "tenant";
      toName: string;
      toEmail: string;
      subject: string;
      body: string;
    };

export interface ActionOutcome {
  ok: boolean;
  /** What to tell them, in their own bubble, after the button. */
  message: string;
  /** Set when the action cannot run yet and somebody must change something. */
  blocked?: boolean;
}

/* ==========================================================================
   Shared checks.
   ========================================================================== */

async function listingInScope(
  listingId: string,
  scope: Scope
): Promise<{ ok: true; address: string } | { ok: false; why: string }> {
  if (scope.unlinked) {
    return { ok: false, why: "We can't tell which REX user you are, so I can't act on any property." };
  }
  const book = await bookFor(scope.rexUserId);
  const found = book.listings.find((l) => String(l.id) === String(listingId));
  if (!found) {
    if (scope.everything) return { ok: true, address: `listing ${listingId}` };
    return { ok: false, why: "That property isn't on your book, so I can't act on it." };
  }
  return { ok: true, address: `${found.name}, ${found.locality}` };
}

/**
 * Who the landlord actually is, asked at the moment of sending.
 *
 * This is the load-bearing half of guard 2. The proposal says "landlord of
 * 828057"; this resolves that to a person and an address now, from REX, and
 * whatever the model believed is discarded.
 */
async function resolveRecipient(
  listingId: string,
  role: "landlord" | "tenant"
): Promise<{ name: string; email: string; contactId: string } | { error: string }> {
  const people = await getListingContacts(listingId);
  if (!people.length) {
    return { error: "REX didn't return any contacts for that property, so I can't tell who to send it to. Worth checking the record directly." };
  }
  /* REX's own words, which are not ours: a landlord is "Listing Owner" and a
     tenant is "Purchaser / Tenant" (reln_type ids `owner` and `purchtenant`).
     Matching on "Landlord" alone would find nobody, ever. */
  const want = role === "landlord" ? /owner|landlord|vendor/i : /tenant|purchtenant/i;
  const match = people.find((c) => c.role && want.test(c.role) && c.email);
  if (!match) {
    const roles = people.map((c) => `${c.name} (${c.role ?? "no role"})`).join(", ");
    return { error: `Nobody on that property is recorded as a ${role} with an email address. REX has: ${roles}.` };
  }
  return { name: match.name, email: match.email as string, contactId: match.id };
}

/* ==========================================================================
   Execution. One function per kind, all reached through `perform`.
   ========================================================================== */

async function doNote(p: Extract<ActionProposal, { kind: "note" }>, actor: { id: string; name: string }): Promise<ActionOutcome> {
  await addPropertyNote({
    listingId: p.listingId,
    authorId: actor.id,
    authorName: actor.name,
    authorRole: "agent",
    text: p.text,
  });
  return { ok: true, message: `Noted against ${p.address}. It's on the property file, in the OS — not in REX.` };
}

async function doReminder(p: Extract<ActionProposal, { kind: "reminder" }>, actor: { id: string; name: string }): Promise<ActionOutcome> {
  if (!hasDb()) return { ok: false, message: "There's no database on this environment, so there's nowhere to keep it." };
  await q(
    `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid(), new Date(p.startsAt).toISOString(), p.mins, "reminder", p.title.slice(0, 200),
     (p.address ?? "").slice(0, 200), "", actor.id, actor.name]
  );
  const when = new Date(p.startsAt).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
  /* Said every time, same as the appointments route: a reminder nobody told
     you was OS-only is a reminder somebody expects REX to fire. */
  return { ok: true, message: `Set for ${when}. It's in the OS diary only — it has NOT gone to REX or your 365 calendar.` };
}

async function doWriteUp(
  p: Extract<ActionProposal, { kind: "write-up" }>,
  actorToken: string | null
): Promise<ActionOutcome> {
  try {
    const res = await rexCall("Listings", "update", {
      data: {
        id: Number(p.listingId),
        related: { listing_adverts: [{ advert_type: "internet", advert_heading: p.heading, advert_body: p.body }] },
      },
    }, actorToken);
    if (!res.ok) {
      if (actorToken && isExpiredToken(res)) {
        return { ok: false, message: "Your REX sign-in has lapsed — reconnect it in your profile and try again." };
      }
      return { ok: false, message: res.error ?? `REX refused the write (${res.status}).` };
    }
    await invalidateListingBook();
    return {
      ok: true,
      message: `Saved to REX on ${p.address}. It'll be live on Rightmove, Zoopla and OnTheMarket in about five to ten minutes — nothing else to press.`,
    };
  } catch (e) {
    if (e instanceof RexWriteBlocked) {
      return {
        ok: false,
        blocked: true,
        message: 'Writes to REX are locked on this environment. Set REX_ALLOW_WRITES="Listings/update" to unlock this one call.',
      };
    }
    return { ok: false, message: e instanceof Error ? e.message : "That save failed." };
  }
}

/**
 * Email — now the real thing.
 *
 * The shape was settled on 29 Aug by reading MailMerge itself rather than
 * guessing a fifth time: recipients are merge_objects of record ids, and free
 * text goes in per-object `custom` as { subject, body }. See lib/rex-mailmerge.
 *
 * Two things happen here that don't happen anywhere else in the OS:
 *
 *   • The recipient is resolved AGAIN, at the moment of sending, from REX. The
 *     model never supplies an address — it names a listing and a role, and who
 *     that is gets looked up now. Talk Steve into any address you like; this
 *     still goes to the landlord on the record.
 *   • The send is refused if REX cannot render the message. getMergedStringSet
 *     is read-only and costs nothing, so there is no excuse for discovering a
 *     broken merge tag by posting "Dear ," to a landlord.
 */
async function doEmail(
  p: Extract<ActionProposal, { kind: "email" }>,
  actorToken: string | null
): Promise<ActionOutcome> {
  const who = await resolveRecipient(p.listingId, p.to);
  if ("error" in who) return { ok: false, message: who.error };

  const target = { contactId: who.contactId, listingId: p.listingId };
  const content = { subject: p.subject, body: toHtml(p.body) };

  /* Render it first. A merge tag that resolves to nothing is the difference
     between a professional email and one that opens "Dear ,". */
  const preview = await previewMerge(target, content, actorToken);
  if ("error" in preview) {
    return { ok: false, message: `REX couldn't put that email together: ${preview.error}` };
  }
  if (preview.emptyTags.length) {
    return {
      ok: false,
      message: `Not sending that — ${preview.emptyTags.join(", ")} came out blank, so ${who.name} would get an email with a gap in it. Say it a different way and I'll rebuild it.`,
    };
  }

  try {
    const sent = await sendMerge(target, content, actorToken);
    if (!sent.ok) return { ok: false, message: sent.error };
    return {
      ok: true,
      message: `Sent to ${who.name} at ${who.email}. It's on their REX timeline, so whoever picks them up next can see it.`,
    };
  } catch (e) {
    if (e instanceof NoSenderIdentity) {
      /* Not a failure of the email. They are not linked, so it would have gone
         out from the office account instead of from them. */
      return { ok: false, blocked: true, message: e.message };
    }
    if (e instanceof RexWriteBlocked) {
      return {
        ok: false,
        blocked: true,
        message: `Sending is locked on this environment. Set REX_ALLOW_WRITES="${MERGE_WRITE}" to unlock it — and send the first one to a colleague, not a landlord.`,
      };
    }
    return { ok: false, message: e instanceof Error ? e.message : "That send failed." };
  }
}

/** Plain text as REX wants it: HTML, with the line breaks preserved. */
function toHtml(text: string): string {
  return text
    .trim()
    .split(/\n{2,}/)
    .map((para) => `<p>${para.replace(/\n/g, "<br>").replace(/&/g, "&amp;").replace(/</g, "&lt;")}</p>`)
    .join("\n");
}

/**
 * Run a proposal, having re-checked everything about it.
 *
 * Nothing here reads the request body. The proposal arrives sealed, the scope
 * arrives from the session, and both are checked again before anything runs.
 */
export async function perform(
  proposal: ActionProposal,
  scope: Scope,
  actor: { id: string; name: string; osUserId: string | null }
): Promise<ActionOutcome> {
  /* Scope, again. The proposal was sealed under one person's rights and is
     being spent under whoever is holding it now. Every kind carries a
     listingId except a standalone reminder, which carries null. */
  if (proposal.listingId) {
    const check = await listingInScope(proposal.listingId, scope);
    if (!check.ok) return { ok: false, message: check.why };
  }

  switch (proposal.kind) {
    case "note":
      return doNote(proposal, actor);
    case "reminder":
      return doReminder(proposal, actor);
    case "write-up":
      return doWriteUp(proposal, await rexTokenFor(actor.osUserId));
    case "email":
      return doEmail(proposal, await rexTokenFor(actor.osUserId));
  }
}
