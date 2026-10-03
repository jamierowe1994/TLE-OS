import "server-only";
import { hasDb, q } from "@/lib/db";
import { putInOutlook, removeFromOutlook } from "@/lib/outlook-calendar";
import { kindLabel, type Inspection } from "@/lib/inspections";

/**
 * A booked visit in the inspector's diary (3 Oct 2026, James: "we need to be
 * able to book inspections"). The same two places a viewing goes:
 *
 *   - the inspector's own Outlook calendar (lib/outlook-calendar), keyed on
 *     the inspection, so moving the visit moves the event rather than adding
 *     a second one;
 *   - the OS's own diary row (os_appointments, kind "inspection"), so the
 *     visit shows in the Diary and on the dashboard even where their Outlook
 *     is not connected.
 *
 * A rehearsal visit goes in neither. Cancelling, or "couldn't get in", takes
 * it out of both.
 */

const key = (i: Inspection) => `inspection|${i.id}`;
const rowId = (i: Inspection) => `inspection-${i.id}`;

export async function putVisitInDiary(i: Inspection, inspectorUserId: string): Promise<string> {
  if (i.rehearsal || !i.bookedAt || !hasDb()) return "";
  const address = [i.propertyName, i.locality].filter(Boolean).join(", ");
  const title = `${kindLabel(i.kind)} - ${address}`.slice(0, 200);
  await q(
    `INSERT INTO os_appointments (id, starts_at, mins, kind, title, where_at, who, author_id, author_name)
     VALUES ($1, $2, $3, 'inspection', $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET starts_at = $2, mins = $3, title = $4, where_at = $5, who = $6, author_id = $7, author_name = $8`,
    [rowId(i), i.bookedAt, i.visitMins, title, address.slice(0, 200), (i.tenant || "").slice(0, 120), inspectorUserId, i.inspector]
  ).catch(() => null);
  await q(`UPDATE os_inspections SET appointment_id = $2 WHERE id = $1`, [i.id, rowId(i)]).catch(() => null);

  const outlook = await putInOutlook({
    userId: inspectorUserId,
    key: key(i),
    subject: title,
    body: `Booked in TLE OS. Inspection #${i.ref}.${i.tenant ? `\nTenant: ${i.tenant}${i.tenantPhone ? ` (${i.tenantPhone})` : ""}` : ""}${i.accessMethod === "keys" ? "\nWe hold keys - written permission first." : ""}`,
    location: address,
    startsAt: i.bookedAt,
    minutes: i.visitMins,
  }).catch(() => ({ ok: false as const, detail: "Could not reach Outlook." }));
  return outlook.ok ? `In ${i.inspector ? `${i.inspector.split(" ")[0]}'s` : "the"} diary and Outlook calendar.` : `In the OS diary. Not in Outlook: ${"detail" in outlook ? outlook.detail : "it was refused"}`;
}

export async function takeVisitOutOfDiary(i: Inspection, inspectorUserId: string | null): Promise<void> {
  if (!hasDb()) return;
  await q(`DELETE FROM os_appointments WHERE id = $1`, [rowId(i)]).catch(() => null);
  await q(`UPDATE os_inspections SET appointment_id = NULL WHERE id = $1`, [i.id]).catch(() => null);
  if (inspectorUserId) await removeFromOutlook(inspectorUserId, key(i)).catch(() => null);
}
