import "server-only";
import { rexCall, rexConfigured } from "@/lib/rex";

/**
 * Who is allowed to work a record — and how to let somebody else in.
 *
 * THE PROBLEM. TLE's REX is configured so an agent sees the records they
 * created. When two agents touch the same person, the second one cannot work
 * the file: Lucy adds Lily Clark, Steve finds the same person later, and Steve
 * is locked out of a record that is legitimately his to progress.
 *
 * THE FIX IS AN API, NOT A SUPPORT TICKET. Howard's "Create Application on Rex"
 * flow already calls transferObjectOwnershipToUser in production, which is how
 * we know the service exists and works.
 *
 * BUT TRANSFER IS THE WRONG VERB. It moves ownership from Lucy to Steve, so
 * the fix for Steve breaks Lucy — the same bug, pointed the other way. The
 * service also has grantPermission, which lets Steve in while Lucy keeps the
 * record. That is what a shared file actually needs.
 *
 * Measured against live REX, 18 Aug 2026:
 *   • object_type is PLURAL — "contacts", "listings", "properties". The
 *     singular returns a DBException with a null sql field, which reads like
 *     an outage rather than a bad argument and cost twenty minutes.
 *   • permission_type: "read", "update", "owner" are real. "write" and "full"
 *     are accepted and return nothing, so they are not the words REX uses.
 *   • getUsersWithOwnerPermissionsOnObjects → { "2347597": ["36739"] }
 *
 * The reads run today. The writes are refused by the OS's own lock until
 * somebody sets REX_ALLOW_WRITES for the exact method, which is deliberate:
 * this changes who can see a real person's record in the team's live system.
 */

export type RexObjectType = "contacts" | "listings" | "properties";
export type RexPermission = "read" | "update" | "owner";

/** Owner user ids per object id. Empty array = nobody owns it (unattributed). */
export async function ownersOf(
  objectType: RexObjectType,
  ids: Array<string | number>
): Promise<Record<string, string[]> | null> {
  if (!rexConfigured() || ids.length === 0) return null;
  const res = await rexCall(
    "SecurityObjectPermissions",
    "getUsersWithOwnerPermissionsOnObjects",
    { object_type: objectType, object_ids: ids.map(Number) }
  ).catch(() => null);
  if (!res || !res.ok) return null;
  // REX answers [] rather than {} when nothing matches, which JSON.parse is
  // perfectly happy with and Object.entries silently treats as empty.
  const r = res.result;
  return Array.isArray(r) ? {} : ((r ?? {}) as Record<string, string[]>);
}

/** Who can EDIT each object — the question "can I work this?" actually asks. */
export async function editorsOf(
  objectType: RexObjectType,
  ids: Array<string | number>
): Promise<Record<string, string[]> | null> {
  if (!rexConfigured() || ids.length === 0) return null;
  const res = await rexCall(
    "SecurityObjectPermissions",
    "getUpdatePermissionsForObjects",
    { object_type: objectType, object_ids: ids.map(Number) }
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const r = res.result;
  return Array.isArray(r) ? {} : ((r ?? {}) as Record<string, string[]>);
}

export interface AccessAnswer {
  /** Can this user edit the record right now? */
  canEdit: boolean;
  /** Whether they own it, which is a stronger claim than being able to edit. */
  isOwner: boolean;
  /** Everyone who owns it. Usually one; occasionally nobody. */
  ownerIds: string[];
}

/** The whole question for one record and one person, in one call each way. */
export async function accessFor(
  objectType: RexObjectType,
  id: string | number,
  rexUserId: string
): Promise<AccessAnswer | null> {
  const [owners, editors] = await Promise.all([
    ownersOf(objectType, [id]),
    editorsOf(objectType, [id]),
  ]);
  if (!owners && !editors) return null;
  const key = String(id);
  const ownerIds = owners?.[key] ?? [];
  const editorIds = editors?.[key] ?? [];
  return {
    ownerIds,
    isOwner: ownerIds.includes(String(rexUserId)),
    // Owning implies editing, but REX does not always list the owner among
    // the editors, so both are checked rather than assuming one contains
    // the other.
    canEdit: editorIds.includes(String(rexUserId)) || ownerIds.includes(String(rexUserId)),
  };
}

/**
 * Let somebody in, WITHOUT taking the record off whoever owns it.
 *
 * This is the fix for the duplicate problem. Ownership is untouched, so the
 * agent who built the relationship keeps it and the second agent can still do
 * their job.
 *
 * Blocked by the OS write lock until REX_ALLOW_WRITES names this method —
 * changing who can see a real person's record deserves someone watching the
 * first one go through.
 */
export async function grantAccess(
  objectType: RexObjectType,
  id: string | number,
  rexUserId: string,
  permission: RexPermission = "update"
) {
  return rexCall("SecurityObjectPermissions", "grantPermission", {
    object_type: objectType,
    object_id: Number(id),
    user_id: Number(rexUserId),
    permission_type: permission,
  });
}

/**
 * Ask the owner, rather than helping yourself.
 *
 * The right default when the person asking does not have rights to grant it.
 * The reason is required by us, not by REX: an access request with no stated
 * reason is one nobody can judge, so it either gets rubber-stamped or ignored.
 */
export async function requestAccess(
  objectType: RexObjectType,
  id: string | number,
  rexUserId: string,
  reason: string,
  permission: RexPermission = "update"
) {
  return rexCall("SecurityObjectPermissions", "requestPermission", {
    object_type: objectType,
    object_id: Number(id),
    user_id: Number(rexUserId),
    permission_type: permission,
    reason_for_request: reason,
  });
}
