"use client";

import Link from "next/link";
import { useState } from "react";
import type { Appt } from "@/lib/diary";
import CancelViewing, { canCancelViewing, targetFromAppt } from "@/components/CancelViewing";

/**
 * Cancel viewing on the phone (Lorna's ticket, 15 Oct 2026: "on the phone app
 * there isn't an option to cancel a viewing"). The /m phone view and the
 * iPhone app's appointment screen both use it, each with its own look.
 *
 * Asks once ("Yes, cancel it"), then says what happened in place and takes
 * the viewing out of the phone's copy of the day, so the calendar it goes
 * back to no longer shows it.
 */
export default function PhoneCancelViewing({
  appt,
  back,
  buttonClass,
  cardClass,
  diaryKey,
}: {
  appt: Appt;
  back: string;
  buttonClass: string;
  cardClass: string;
  diaryKey: string;
}) {
  const [said, setSaid] = useState<string | null>(null);
  if (!canCancelViewing(appt) && !said) return null;
  if (said) {
    return (
      <div className={cardClass} role="status">
        <p className="text-[17px] font-semibold">Viewing cancelled</p>
        <p className="mt-1 text-[13.5px] leading-snug text-muted">{said}</p>
        <Link href={back} className="mt-3 inline-flex h-10 items-center text-[14.5px] font-semibold text-accent-dark">
          Back to your calendar
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-2">
      <CancelViewing
        target={targetFromAppt(appt)}
        className={buttonClass}
        onDone={(s) => {
          try {
            const held = JSON.parse(sessionStorage.getItem(diaryKey) ?? "[]") as Appt[];
            sessionStorage.setItem(diaryKey, JSON.stringify(held.filter((a) => a.id !== appt.id)));
          } catch {
            /* The calendar asks the diary again anyway. */
          }
          setSaid(s || "It's out of your diary.");
        }}
      />
    </div>
  );
}
