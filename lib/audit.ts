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
  /* A catalogue email sent to the person who asked for it, from Admin ->
     Emails. Recorded because it is the one button in the product that renders
     an arbitrary template and puts it in a real inbox. */
  | "email_test_sent";

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
        e.actorEmail ?? "",
        e.subjectId ?? null,
        e.subjectEmail ?? "",
        e.detail ?? "",
        e.ip ?? "",
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
