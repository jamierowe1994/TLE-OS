"use client";

import { useState } from "react";
import type { Appt } from "@/lib/diary";
import { refreshDiary } from "@/lib/diary-store";

/**
 * Cancel a general appointment made in the OS (Rhiannon, 15 Oct 2026: a
 * duplicate she put in her diary on the Dashboard could not be taken out).
 *
 * Only the OS's own general entries: a booked viewing cancels through its file,
 * a slot through Remove slot, an inspection through the inspection, and an
 * entry made in Outlook is changed there. Asks once, like Remove slot.
 */
export function canCancelGeneral(a: Appt): boolean {
  return (
    a.id.startsWith("os-") &&
    !a.id.startsWith("os-inspection-") &&
    a.kind !== "slot" &&
    a.kind !== "viewing" &&
    !a.leadId
  );
}

export default function CancelAppointment({
  appt,
  onDone,
  className,
}: {
  appt: Appt;
  onDone: () => void;
  className: string;
}) {
  const [state, setState] = useState<"ask" | "busy" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  if (!canCancelGeneral(appt)) return null;

  async function go() {
    if (state !== "ask") return setState("ask");
    setState("busy");
    setSaid(null);
    const j = await fetch("/api/appointments", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: appt.id }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string }>)
      .catch(() => null);
    if (!j?.ok) {
      setState(null);
      setSaid(j?.said ?? "That didn't cancel it. Try again.");
      return;
    }
    await refreshDiary().catch(() => null);
    onDone();
  }

  return (
    <>
      <button
        type="button"
        disabled={state === "busy"}
        onBlur={() => state === "ask" && setState(null)}
        onClick={() => void go()}
        className={className}
      >
        {state === "busy" ? "Cancelling…" : state === "ask" ? "Yes, cancel it" : "Cancel appointment"}
      </button>
      {said && <p className="w-full text-[11.5px] text-accent-dark">{said}</p>}
    </>
  );
}
