import "server-only";
import { rexCall } from "@/lib/rex";

/**
 * SENDING EMAIL THROUGH REX, IN THE SHAPE REX ACTUALLY HAS.
 *
 * ── Why this file exists ─────────────────────────────────────────────────
 *
 * Three places in this codebase called MailMerge/createAndSend with a payload
 * REX has never accepted — a top-level `subject` and `body`, and recipients as
 * `{service_name, record_id}` under `merge_objects`, `recipients`, or
 * `recipient_records` depending on which file you opened. All three disagreed
 * with each other, so at most one could have been right. None was. They had
 * simply never run: the write lock refused them long before REX could.
 *
 * Read from the live API on 29 Aug 2026, the model is:
 *
 *   MailMerge has NO subject field, NO body field and NO recipients field.
 *   Recipients are `merge_objects`, each identifying records by id.
 *   Content is either a stored template id, or per-object `custom`.
 *   `custom_content_uri` is REX's OUTPUT (rexlive://…/<mergeId>.json) — it is
 *   written by REX after the fact and must never be supplied.
 *
 * The custom shape is `{ subject, body }` — NOT the `template_email_subject` /
 * `template_body` names a stored template uses. Sending those two returns
 * "When sending a custom template, you must specify a body", which is REX
 * saying it found the custom block and couldn't see a `body` in it.
 *
 * ── The dry run is the good bit ──────────────────────────────────────────
 *
 * getMergedStringSet renders a merge WITHOUT sending it: real contact, real
 * property, merge tags resolved. Its name begins with "get", so it passes the
 * read-only allowlist untouched — a full preview of an email costs nothing and
 * needs no permission. Proven against Flat 1, 4 Hermosa Road: it returned
 * "About Flat 1/4 Hermosa Road" and "Dear Shelia,".
 *
 * That is why preview and send are separate functions here. Anything that is
 * about to email a landlord can show a person the finished article first.
 */

/** Who it goes to, as records. Addresses are never sent — ids are. */
export interface MergeTarget {
  contactId: string;
  listingId?: string | null;
  propertyId?: string | null;
}

/** What it says. `body` is HTML — REX renders it as the email body. */
export interface MergeContent {
  subject: string;
  body: string;
}

export interface MergePreview {
  subject: string;
  body: string;
  /** Merge tags that resolved to nothing — a "Dear ," waiting to happen. */
  emptyTags: string[];
}

function mergeObject(target: MergeTarget, content?: MergeContent) {
  return {
    contact_id: String(target.contactId),
    ...(target.listingId ? { listing_id: String(target.listingId) } : {}),
    ...(target.propertyId ? { property_id: String(target.propertyId) } : {}),
    /* Per-object, not top-level: `custom_template` is a valid argument on
       queueMergeUsingObjects but NOT on getMergedStringSet, so putting the
       content on the object is the one form both accept. */
    ...(content ? { custom: { subject: content.subject, body: content.body } } : {}),
  };
}

/**
 * Render the email exactly as REX would send it, without sending it.
 *
 * Read-only, so this works on a locked environment. Use it to show somebody
 * what is about to go out, and to catch a merge tag that resolved to nothing
 * before a landlord reads "Dear ,".
 */
export async function previewMerge(
  target: MergeTarget,
  content: MergeContent,
  actorToken?: string | null
): Promise<MergePreview | { error: string }> {
  const res = await rexCall("MailMerge", "getMergedStringSet", {
    merge_type: "email",
    merge_object: mergeObject(target, content),
    return_tag_stats: true,
  }, actorToken);

  if (!res.ok) return { error: res.error ?? `REX wouldn't render it (${res.status}).` };

  const r = (res.result ?? {}) as { subject?: string; body?: string; tags?: unknown };
  const tags = r.tags as { empty_tags?: unknown } | undefined;
  return {
    subject: String(r.subject ?? ""),
    body: String(r.body ?? ""),
    emptyTags: Array.isArray(tags?.empty_tags) ? tags.empty_tags.map(String) : [],
  };
}

/** The exact allowlist entry this needs, quoted in errors so nobody guesses. */
export const MERGE_WRITE = "MailMerge/queueMergeUsingObjects";

/**
 * Send it, for real.
 *
 * Throws RexWriteBlocked on a locked environment — callers should catch it and
 * name MERGE_WRITE rather than reporting a generic failure, because "REX said
 * no" and "this environment hasn't been unlocked" are different problems with
 * different fixes.
 */
export async function sendMerge(
  target: MergeTarget,
  content: MergeContent,
  actorToken?: string | null,
  opts?: { sendFromUserId?: string | null; locationId?: string | null }
): Promise<{ ok: true; result: unknown } | { ok: false; error: string }> {
  const res = await rexCall("MailMerge", "queueMergeUsingObjects", {
    merge_type: "email",
    merge_objects: [mergeObject(target, content)],
    include_letterhead: false,
    /* Synchronous, so a failure comes back here rather than as a token we
       would then have to poll and nobody would. */
    async: false,
    ...(opts?.sendFromUserId ? { send_from_user_id: Number(opts.sendFromUserId) } : {}),
    ...(opts?.locationId ? { location_id: Number(opts.locationId) } : {}),
  }, actorToken);

  if (!res.ok) return { ok: false, error: res.error ?? `REX refused the send (${res.status}).` };
  return { ok: true, result: res.result };
}
