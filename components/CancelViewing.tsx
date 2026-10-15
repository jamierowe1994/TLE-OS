"use client";

import { useState } from "react";
import type { Appt } from "@/lib/diary";
import { refreshDiary } from "@/lib/diary-store";
import { londonParts, londonTime } from "@/lib/london-time";

/**
 * Cancel a booked viewing from wherever it is opened (Lorna's ticket, 15 Oct
 * 2026): the Diary, the Dashboard's diary, the tenant's file, the listing's
 * Viewings and the phone. Before this only the full viewing screen had it.
 *
 * Asks once, like Cancel appointment. The cancel itself is the same one the
 * viewing screen runs (/api/viewings/change): out of the office diary and the
 * agent's Outlook, the applicant emailed, no reminder text, and it shows as
 * cancelled everywhere the OS lists it. A cancel that did not go through says
 * why and leaves the button, rather than pretending.
 */

export interface CancelTarget {
  /** The diary id: rex-<event> or os-<row>. */
  id: string;
  startsAt: string;
  mins: number;
  who: string;
  email?: string | null;
  address: string;
  unaccompanied?: boolean;
}

/** A booked viewing that is still to come, and one the OS can call off. */
export function canCancelViewing(a: Appt): boolean {
  if (a.kind !== "viewing" || a.fromOutlook || a.fromPersonal) return false;
  if (!a.id.startsWith("rex-") && !a.id.startsWith("os-")) return false;
  if (a.id.startsWith("os-inspection-")) return false;
  return new Date(apptStartsAt(a)).getTime() > Date.now();
}

/** The diary keeps a day offset from today and a London "HH:MM". */
export function apptStartsAt(a: Pick<Appt, "day" | "start">): string {
  const today = londonParts(new Date());
  const d = new Date(Date.UTC(today.year, today.month - 1, today.day + a.day));
  const [h, m] = a.start.split(":").map(Number);
  return londonTime(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), h || 0, m || 0).toISOString();
}

export function targetFromAppt(a: Appt): CancelTarget {
  return {
    id: a.id,
    startsAt: apptStartsAt(a),
    mins: a.mins,
    who: a.who ?? "",
    email: a.contact?.email ?? null,
    address: a.where || a.what.replace(/^[^—]+—\s*/, ""),
    unaccompanied: Boolean(a.unaccompanied),
  };
}

export async function cancelViewing(t: CancelTarget): Promise<{ ok: boolean; said: string }> {
  const j = await fetch("/api/viewings/change", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      viewingId: t.id,
      action: "cancel",
      reason: "organiser",
      oldStartsAt: t.startsAt,
      minutes: t.mins,
      applicantName: t.who,
      applicantEmail: t.email ?? null,
      address: t.address,
      unaccompanied: Boolean(t.unaccompanied),
    }),
  })
    .then((r) => r.json() as Promise<{ ok?: boolean; said?: string }>)
    .catch(() => null);
  if (!j) return { ok: false, said: "That didn't go through - the connection dropped. The viewing is still booked." };
  return { ok: Boolean(j.ok), said: j.said ?? (j.ok ? "Cancelled." : "That didn't cancel it. Try again.") };
}

export default function CancelViewing({
  target,
  onDone,
  className,
  label = "Cancel viewing",
}: {
  target: CancelTarget;
  onDone: (said: string) => void;
  className: string;
  label?: string;
}) {
  const [state, setState] = useState<"ask" | "busy" | null>(null);
  const [said, setSaid] = useState<string | null>(null);

  async function go() {
    if (state !== "ask") return setState("ask");
    setState("busy");
    setSaid(null);
    const r = await cancelViewing(target);
    if (!r.ok) {
      setState(null);
      setSaid(r.said);
      return;
    }
    await refreshDiary().catch(() => null);
    setState(null);
    onDone(r.said);
  }

  return (
    <>
      <button
        type="button"
        data-steve="viewing.cancel"
        disabled={state === "busy"}
        onBlur={() => state === "ask" && setState(null)}
        onClick={() => void go()}
        className={className}
      >
        {state === "busy" ? "Cancelling…" : state === "ask" ? "Yes, cancel it" : label}
      </button>
      {said && <p className="w-full text-[11.5px] text-accent-dark">{said}</p>}
    </>
  );
}
