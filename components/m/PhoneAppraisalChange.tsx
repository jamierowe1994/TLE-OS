"use client";

import Link from "next/link";
import { useState } from "react";
import type { Appt } from "@/lib/diary";
import AppraisalChange, { canChangeAppraisalAppt } from "@/components/AppraisalChange";

/**
 * Rearrange and Cancel a market appraisal on the phone (James, 15 Oct 2026).
 * The /m phone view and the iPhone app's appointment screen both use it,
 * each with its own look - the same pattern as PhoneCancelViewing.
 *
 * Cancel asks once ("Yes, cancel it"), then says what happened in place,
 * offers the landlord's email (previewed, sent only on Send) and takes the
 * appraisal out of the phone's copy of the day. Rearrange opens the
 * appraisal booker on its current slot.
 */
export default function PhoneAppraisalChange({
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
  const [done, setDone] = useState<"cancelled" | "moved" | null>(null);
  if (!appt.appraisalId || (!canChangeAppraisalAppt(appt) && !done)) return null;
  const dropFromPhone = () => {
    try {
      const held = JSON.parse(sessionStorage.getItem(diaryKey) ?? "[]") as Appt[];
      sessionStorage.setItem(diaryKey, JSON.stringify(held.filter((a) => a.id !== appt.id)));
    } catch {
      /* The calendar asks the diary again anyway. */
    }
  };
  return (
    <div className={done ? cardClass : "mt-3 flex flex-col gap-2"} role={done ? "status" : undefined}>
      {done && (
        <p className="text-[17px] font-semibold">{done === "cancelled" ? "Appraisal cancelled" : "Appraisal moved"}</p>
      )}
      <div className={`flex flex-col gap-2 ${done ? "mt-2 [&>p]:text-[13.5px] [&>p]:leading-snug [&>p]:text-muted" : ""}`}>
        <AppraisalChange
          appraisalId={appt.appraisalId}
          buttonClass={`${buttonClass} gap-2`}
          noteClass="text-[13px] leading-snug text-accent-dark"
          onChanged={(ma) => {
            dropFromPhone();
            setDone(ma?.cancelledAt ? "cancelled" : "moved");
          }}
        />
      </div>
      {done && (
        <Link href={back} className="mt-3 inline-flex h-10 items-center text-[14.5px] font-semibold text-accent-dark">
          Back to your calendar
        </Link>
      )}
    </div>
  );
}
