import "server-only";
import { hasDb, q } from "@/lib/db";
import { uid } from "@/lib/auth";

/**
 * The audit trail.
 *
 * Append-only by convention: nothing in the product updates or deletes a row.
 * The entire value of an audit trail is that the thing being audited cannot
 * edit it, and a `deleteAudit()` helper — however well-intentioned — is the
 * first step to that not being true.
 *
 * Recording NEVER throws. An audit write that can fail a sign-in would mean a
 * database hiccup locks the whole company out, which is a far worse outcome
 * than a missing row. Failures are logged and swallowed.
 */

export type AuditKind =
  | "sign_in"
  | "sign_in_failed"
  | "password_reset"
  | "view_as_start"
  | "view_as_end"
  /* Arming or disarming a send. Recorded because a switch that turns on
     outbound mail is the single most consequential control in the product, and
     "who turned it on, and when" is the first question after anything goes
     wrong with one. */
  | "switch_changed"
  /* A record created in REX from the OS. REX is the live system six businesses
     share and there is no undo, so the first question after a bad record is
     "who made it, when, and from where" — and REX's own log will say the OS,
     which is not an answer. */
  | "rex_contact_created"
  /* An edit made in the OS and mirrored into REX. Recorded with the field names
     that changed, because "who edited this, and to what" is the question after
     a record turns out wrong — and REX's own log will only say the OS did it. */
  | "rex_contact_updated"
  /* The lead tenant on a let changed in the OS (lib/lead-tenant). */
  | "lead_tenant_changed"
  /* A catalogue email sent to the person who asked for it, from Admin ->
     Emails. Recorded because it is the one button in the product that renders
     an arbitrary template and puts it in a real inbox. */
  | "email_test_sent"
  /* An area of the OS moved between hidden, look only, testers and everyone
     (15 Sep 2026). The pilot is switched on one area at a time, so "when did
     Leads go live, and who pressed it" is the question when something that
     was not tested starts being used. */
  | "area_changed"
  | "phase_changed"
  /* A Microsoft connect that bounced, with Microsoft's reason (23 Sep 2026). */
  | "mailbox_connect_failed"
  /* A REX sign-in REX refused, in REX's own words (19 Oct 2026). Rovena Buci
     and Ed Westwood could not connect with credentials they say are right, and
     nothing anywhere recorded why: the route turned every refusal into the
     same sentence about using your REX password. Never the password, and
     never the token - only what REX said and which address was tried. */
  | "rex_signin_failed"
  /* Somebody made a tester, or stopped being one. A tester can act where
     every other agent can only look. */
  | "area_tester_changed"
  /* A listing put on the portals, taken off them, or put back (15 Sep 2026).
     It is the one button in Listings that reaches the public, and REX's own
     log will only say the OS did it. */
  | "listing_publication"
  /* The advert edited from the OS into REX: which fields, and any photo or
     floor plan uploaded (15 Sep 2026). */
  | "listing_edited"
  | "listing_owner_changed"
  /* A landlord typed onto a home's own OS record where REX names nobody
     (15 Oct 2026, lib/record-landlords). Not mirrored to REX. */
  | "record_landlord_saved"
  | "property_person_added"
  | "property_person_changed"
  | "property_person_removed"
  | "tenant_logins_sent"
  /* A home moved to another agent in the OS, or put back (15 Oct 2026,
     lib/agent-moves). REX is not changed. */
  | "home_agent_moved"
  /* A landlord's own home address saved on their OS record (15 Oct 2026,
     lib/landlord-home). Personal data, and the terms of business carry it. */
  | "landlord_home_address_saved"
  /* An owner locked somebody out of the OS, or let them back in (10 Oct
     2026, lib/lockout), and every sign-in a locked person tried. */
  | "user_locked"
  | "user_unlocked"
  | "sign_in_locked"
  /* Somebody went well past a person's pace and the middleware paused their
     data calls for fifteen minutes (10 Oct 2026). Read by the owners' bell. */
  | "reading_paused"
  /* Marketing's Base44 app read the lead figures with its key (12 Oct 2026,
     /api/marketing/leads-feed). Counts only; at most one line an hour. */
  | "marketing_feed_read"
  /* Saved through Steve's card (lib/assistant-actions, 15 Oct 2026): a
     tenant's right to rent expiry on a let, and a home's address in the OS. */
  | "rtr_expiry_recorded"
  | "property_address_changed"
  /* A list downloaded as a spreadsheet (19 Oct 2026, lib/exports): which
     screen, how many rows and the filters. No emails or phones go in one. */
  | "data_exported";

export interface AuditRow {
  id: string;
  kind: AuditKind;
  actorEmail: string;
  subjectEmail: string;
  detail: string;
  ip: string;
  at: string;
}

export async function record(e: {
  kind: AuditKind;
  actorId?: string | null;
  actorEmail?: string;
  subjectId?: string | null;
  subjectEmail?: string;
  detail?: string;
  ip?: string;
}): Promise<void> {
  if (!hasDb()) return;
  try {
    await q(
      `insert into os_audit (id, kind, actor_id, actor_email, subject_id, subject_email, detail, ip)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        uid(),
        e.kind,
        e.actorId ?? null,
        /* Capped, whatever a caller passes (Rig run 4, P-062): one oversized
           value made the activity page unusable. */
        (e.actorEmail ?? "").slice(0, 254),
        e.subjectId ?? null,
        (e.subjectEmail ?? "").slice(0, 254),
        (e.detail ?? "").slice(0, 2000),
        (e.ip ?? "").slice(0, 64),
      ]
    );
  } catch (err) {
    console.error("[audit] could not record", e.kind, err);
  }
}

export async function recent(limit = 100): Promise<AuditRow[]> {
  if (!hasDb()) return [];
  const rows = await q<{
    id: string; kind: string; actor_email: string; subject_email: string;
    detail: string; ip: string; at: Date | string;
  }>(
    `select id, kind, actor_email, subject_email, detail, ip, at
       from os_audit order by at desc limit $1`,
    [limit]
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as AuditKind,
    actorEmail: r.actor_email,
    subjectEmail: r.subject_email,
    detail: r.detail,
    ip: r.ip,
    at: new Date(r.at).toISOString(),
  }));
}
