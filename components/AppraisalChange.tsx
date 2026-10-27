"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import ViewingBooker, { type BookedResult } from "@/components/ViewingBooker";
import ConfirmSheet from "@/components/ConfirmSheet";
import { apptStartsAt } from "@/components/CancelViewing";
import type { Appt } from "@/lib/diary";
import { refreshDiary } from "@/lib/diary-store";

/**
 * REARRANGE AND CANCEL A MARKET APPRAISAL (James, 15 Oct 2026): "We could go
 * into our diary, and on an appraisal we should have a Rearrange button, and
 * a Cancel button as well."
 *
 * One component for the Diary, the Dashboard's diary, the appraisal file and
 * the phone. The work is server side (lib/appraisal-change). Here:
 *
 *   Cancel     asks once ("Yes, cancel it"), says what happened in place, and
 *              then OFFERS the landlord's email - previewed, editable, and
 *              only sent when the agent presses Send.
 *   Rearrange  the appraisal booker's own time picker (ViewingBooker, the
 *              agent's diary and personal busy times beside it) opened on the
 *              current slot; the "new time" email is in its column, ticked,
 *              and goes only with Move It and Send.
 *
 * Anything that did not go through says so and leaves the buttons.
 */

/** An appraisal the OS booked, still to come: the diary can change it. */
export function canChangeAppraisalAppt(a: Appt): boolean {
  if (!a.appraisalId) return false;
  return new Date(apptStartsAt(a)).getTime() > Date.now();
}

export type ChangeableAppraisal = {
  id: string;
  leadId: string | null;
  landlord: string;
  landlordEmail?: string | null;
  landlordMobile?: string | null;
  address: string;
  postcode: string;
  agent: string | null;
  appointmentAt: string | null;
  cancelledAt?: string | null;
  cancelledWas?: string | null;
};

type ChangeResponse = { ok?: boolean; said?: string; appraisal?: ChangeableAppraisal | null };

export default function AppraisalChange({
  appraisalId,
  appraisal = null,
  buttonClass,
  onChanged,
  showRearrange = true,
  showCancel = true,
  noteClass = "w-full text-[11.5px] text-accent-dark",
  above = false,
}: {
  appraisalId: string;
  /** The record when the caller already has it (the file page). */
  appraisal?: ChangeableAppraisal | null;
  buttonClass: string;
  /** After a cancel or a move that went through, with the record as it now is. */
  onChanged?: (ma: ChangeableAppraisal | null, said: string) => void;
  showRearrange?: boolean;
  showCancel?: boolean;
  noteClass?: string;
  /** Inside the floating boxes (the Diary, 27 Oct 2026): the booker opens over them. */
  above?: boolean;
}) {
  const [ma, setMa] = useState<ChangeableAppraisal | null>(appraisal);
  useEffect(() => setMa(appraisal), [appraisal]);
  const [ask, setAsk] = useState<"ask" | "busy" | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [justCancelled, setJustCancelled] = useState(false);
  const [booking, setBooking] = useState(false);
  /* The time it is moving FROM, fixed when the booker opens: the record moves
     under it on success, and a changing `editing` would restart the booker
     instead of showing its done screen. */
  const [movingFrom, setMovingFrom] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [emailed, setEmailed] = useState<string | null>(null);
  const cancelled = justCancelled || Boolean(ma?.cancelledAt);

  /* The diary is read again when this goes away after a change: the entry has
     already left the server's diary, and the screen behind should follow. */
  const changed = useRef(false);
  useEffect(() => () => void (changed.current && refreshDiary().catch(() => null)), []);

  async function load(): Promise<ChangeableAppraisal | null> {
    if (ma) return ma;
    setLoading(true);
    const j = await fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}?bare=1`)
      .then((r) => r.json() as Promise<{ appraisal?: ChangeableAppraisal | null }>)
      .catch(() => null);
    setLoading(false);
    const got = j?.appraisal ?? null;
    if (!got) setSaid("That appraisal couldn't be read just now. Try again in a minute.");
    setMa(got);
    return got;
  }

  async function cancel() {
    if (ask !== "ask") return setAsk("ask");
    setAsk("busy");
    setSaid(null);
    const j = await fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}/change`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "cancel" }),
    })
      .then((r) => r.json() as Promise<ChangeResponse>)
      .catch(() => null);
    setAsk(null);
    if (!j?.ok) {
      setSaid(j?.said ?? "That didn't go through - the connection dropped. The appraisal is still booked.");
      return;
    }
    changed.current = true;
    setJustCancelled(true);
    if (j.appraisal) setMa(j.appraisal);
    setSaid(j.said ?? "Cancelled.");
    onChanged?.(j.appraisal ?? null, j.said ?? "Cancelled.");
  }

  async function rearrange() {
    const got = await load();
    if (!got) return;
    /* A cancelled one is booked afresh: the landlord was told it was off,
       so their email is a confirmation, not "it has moved". */
    setMovingFrom(got.cancelledAt ? null : got.appointmentAt);
    setBooking(true);
  }

  async function onBooked(v: { startsAt: string | null; minutes: number; confirmation?: { send: boolean; subject?: string; html?: string; again?: boolean } }): Promise<BookedResult> {
    if (!v.startsAt) return { said: "Pick a day and a time first.", failed: true };
    const j = await fetch(`/api/appraisals/${encodeURIComponent(appraisalId)}/change`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "move", startsAt: v.startsAt, minutes: v.minutes }),
    })
      .then((r) => r.json() as Promise<ChangeResponse>)
      .catch(() => null);
    if (!j?.ok) return { said: j?.said ?? "That didn't go through - the connection dropped. The appraisal is still at its old time.", failed: true };
    changed.current = true;
    const lines = [j.said ?? "Moved."];
    /* The landlord's "new time" email, only because the agent left it ticked
       and pressed Move It and Send. */
    if (v.confirmation?.send) {
      const c = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "send", kind: "appraisal", id: appraisalId, subject: v.confirmation.subject, html: v.confirmation.html, again: v.confirmation.again, minutes: v.minutes }),
      })
        .then((r) => r.json() as Promise<{ sent?: boolean; detail?: string; error?: string }>)
        .catch(() => null);
      lines.push(c?.sent ? `New time sent to the landlord. ${c.detail ?? ""}`.trim() : `The email to the landlord did not send: ${c?.detail ?? c?.error ?? "the connection dropped"}. Send it from the appraisal.`);
    } else {
      lines.push("The landlord has not been emailed.");
    }
    setJustCancelled(false);
    if (j.appraisal) setMa(j.appraisal);
    setSaid(null);
    onChanged?.(j.appraisal ?? null, lines.join(" "));
    return { said: lines.join(" ") };
  }

  return (
    <>
      {showRearrange && (
        <button type="button" data-steve="appraisal.rearrange" disabled={loading} onClick={() => void rearrange()} className={buttonClass}>
          <DoodleIcon name="calendar" size={13} />
          {loading ? "Opening…" : cancelled ? "Rebook" : "Rearrange"}
        </button>
      )}
      {showCancel && !cancelled && (
        <button
          type="button"
          data-steve="appraisal.cancel"
          disabled={ask === "busy"}
          onBlur={() => ask === "ask" && setAsk(null)}
          onClick={() => void cancel()}
          className={buttonClass}
        >
          <DoodleIcon name="cross" size={11} />
          {ask === "busy" ? "Cancelling…" : ask === "ask" ? "Yes, cancel it" : "Cancel appraisal"}
        </button>
      )}
      {cancelled && (
        <button type="button" data-steve="appraisal.cancel-email" onClick={() => setEmailing(true)} className={buttonClass}>
          <DoodleIcon name="mail" size={13} />
          Email the landlord
        </button>
      )}
      {said && <p className={noteClass} role="status">{said}</p>}
      {justCancelled && !emailed && (
        <p className={noteClass}>The landlord hasn&apos;t been told. Email them, or ring them.</p>
      )}
      {emailed && <p className={noteClass}>{emailed}</p>}

      {emailing && (
        <ConfirmSheet
          target={{ kind: "appraisal-cancelled", id: appraisalId }}
          title="Tell the Landlord It's Cancelled"
          onClose={() => setEmailing(false)}
          onSent={(d) => setEmailed(d)}
        />
      )}
      {booking && ma && (
        <ViewingBooker
          open={booking}
          onClose={() => setBooking(false)}
          mode="appraisal"
          address={[ma.address, ma.postcode].filter((x, i) => x && (i === 0 || !ma.address.toUpperCase().includes(x.toUpperCase()))).join(", ")}
          lead={{ name: ma.landlord, email: ma.landlordEmail ?? "", phone: ma.landlordMobile ?? "" }}
          properties={[]}
          leadId={ma.leadId}
          appraisalId={ma.id}
          agent={ma.agent ?? ""}
          editing={movingFrom ? { startsAt: movingFrom, minutes: 60 } : null}
          onBooked={onBooked}
          above={above}
        />
      )}
    </>
  );
}
