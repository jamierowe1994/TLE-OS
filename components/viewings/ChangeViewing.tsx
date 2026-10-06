"use client";

import ViewingBooker, { type BookedResult } from "@/components/ViewingBooker";
import { refreshDiary } from "@/lib/diary-store";
import type { Appt } from "@/lib/diary";

/**
 * CHANGE TIME on a booked viewing (James, 6 Oct 2026: "we don't have any way
 * of editing that ... and then obviously we can resend confirmations").
 *
 * The same booker and the same steps as booking one: the diary opens on the
 * slot it has now, the email is "New time for your viewing" to read and edit
 * before it goes, then the landlord, then access. The move itself goes
 * through /api/viewings/change with notify off, so the applicant gets the
 * email the agent saw, once, and not a second automatic copy.
 *
 * Kept at the same time, it is a resend: nothing is moved, and the
 * confirmation goes again only if the agent sends it.
 */

/** The appointment's start as an instant: a day offset from today and a local "HH:MM". */
export function apptStartIso(a: Pick<Appt, "day" | "start">): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + a.day);
  const [h, m] = a.start.split(":").map(Number);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.toISOString();
}

/** Only a viewing still to come, in a diary we can move it in. */
export function canChangeTime(a: Appt | null | undefined): boolean {
  if (!a || a.kind !== "viewing" || a.fromOutlook) return false;
  if (!(a.id.startsWith("rex-") || a.id.startsWith("os-"))) return false;
  return new Date(apptStartIso(a)).getTime() > Date.now();
}

export default function ChangeViewing({ appt, onClose, onChanged }: { appt: Appt | null; onClose: () => void; onChanged?: (said: string) => void }) {
  const oldStart = appt ? apptStartIso(appt) : "";
  const address = appt ? appt.where || appt.what.replace(/^[^-—]+[-—]\s*/, "") || "the property" : "";
  const listingId = appt?.listingId ? String(appt.listingId) : "";
  const leadId = appt ? appt.leadId ?? `diary-${appt.id}` : null;

  async function move(v: Parameters<Parameters<typeof ViewingBooker>[0]["onBooked"]>[0]): Promise<BookedResult> {
    if (!appt || !v.startsAt) return { said: "Pick a time first.", failed: true };
    const timeChanged = new Date(v.startsAt).getTime() !== new Date(oldStart).getTime();
    const changed = timeChanged || v.minutes !== appt.mins;
    const applicantEmail = appt.contact?.email || null;
    const said: string[] = [];

    if (changed) {
      const r = await fetch("/api/viewings/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          viewingId: appt.id,
          action: "move",
          newStartsAt: v.startsAt,
          oldStartsAt: oldStart,
          minutes: v.minutes,
          applicantName: appt.who ?? "",
          applicantEmail,
          address,
          unaccompanied: Boolean(appt.unaccompanied),
          notify: false,
        }),
      })
        .then(async (x) => ({ status: x.status, j: (await x.json().catch(() => ({}))) as { ok?: boolean; said?: string } }))
        .catch(() => null);
      if (!r || !r.j.ok) {
        return { said: r?.j.said ?? "That did not go through - the connection dropped. Nothing was moved or sent.", failed: true };
      }
      /* "That viewing is another agent's" comes back ok:false; anything that
         reached here was moved, and says where. */
      said.push(r.j.said || "Moved.");
    }

    if (v.confirmation?.send && leadId) {
      const c = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "send",
          kind: "viewing",
          booking: {
            leadId,
            listingId: listingId || null,
            applicantName: appt.who ?? "",
            applicantEmail,
            address,
            startsAt: v.startsAt,
            minutes: v.minutes,
            unaccompanied: Boolean(appt.unaccompanied),
            ...(timeChanged ? { movedFrom: oldStart } : {}),
          },
          subject: v.confirmation.subject,
          html: v.confirmation.html,
          again: v.confirmation.again,
        }),
      })
        .then((x) => x.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
        .catch(() => null);
      said.push(
        c?.sent
          ? `${timeChanged ? "New time sent" : "Confirmation sent again"}. ${c.detail ?? ""}`.trim()
          : `The email did not send: ${String(c?.detail ?? c?.error ?? "the connection dropped").replace(/\.+$/, "")}.`
      );
    } else if (changed) {
      said.push("Nobody was emailed.");
    }

    void refreshDiary();
    const out = said.join(" ") || "Nothing changed.";
    onChanged?.(out);
    return { said: out, viewingId: appt.id };
  }

  return (
    <ViewingBooker
      open={Boolean(appt)}
      onClose={onClose}
      lead={appt ? { name: appt.who || "The applicant", email: appt.contact?.email ?? "", phone: appt.contact?.phone ?? "" } : null}
      leadId={leadId}
      properties={appt ? [{ id: listingId, name: address, locality: "", rent: null, image: null, propertyId: appt.propertyId ?? null }] : []}
      firstId={listingId}
      skipProperty
      agent=""
      editing={appt ? { startsAt: oldStart, minutes: appt.mins, unaccompanied: Boolean(appt.unaccompanied) } : null}
      onBooked={move}
    />
  );
}
