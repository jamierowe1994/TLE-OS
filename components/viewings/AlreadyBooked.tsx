"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * ALREADY BOOKED IN HERE (Stuart Roper, 26 Oct 2026: "I booked a viewing for
 * Thursday by accident and then tried to correct it for Wednesday. What it did
 * is create a second appointment for Wednesday, but kept the one on Thursday").
 *
 * Booking again books again - there was no way to move a viewing from the
 * listing, so the second booking was the only road. Before the booker opens
 * for somebody who already has a viewing still to come on this home, it asks:
 * move that one, or book another as well. Read from /api/viewings/existing;
 * if that does not answer, the booking simply goes ahead as before.
 */

export type ExistingViewing = {
  id: string;
  startsAt: string;
  mins: number;
  who: string;
  email: string | null;
  phone: string | null;
  agent: string | null;
  leadId: string | null;
  unaccompanied: boolean;
};

/** This person's viewings still to come on this listing; [] when there are none or nobody answered. */
export async function upcomingHere(p: { listingId: string; leadId?: string | null; contactId?: string | null; email?: string | null; name?: string | null }): Promise<ExistingViewing[]> {
  try {
    const r = await fetch("/api/viewings/existing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listing: p.listingId, lead: p.leadId ?? "", contact: p.contactId ?? "", email: p.email ?? "", name: p.name ?? "" }),
    });
    const j = (await r.json().catch(() => null)) as { ok?: boolean; viewings?: ExistingViewing[] } | null;
    return j?.ok && Array.isArray(j.viewings) ? j.viewings : [];
  } catch {
    return [];
  }
}

/** "today at 2pm", "tomorrow at 10:30am", "on Thursday at 2pm", "on Tuesday 10 November at 2pm". */
export function whenWords(iso: string): string {
  const at = new Date(iso);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(at) - midnight(new Date())) / 86_400_000);
  const h = at.getHours();
  const m = at.getMinutes();
  const time = `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
  const weekday = at.toLocaleDateString("en-GB", { weekday: "long" });
  const day =
    days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 && days < 7 ? `on ${weekday}` : `on ${weekday} ${at.toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`;
  return `${day} at ${time}`;
}

export default function AlreadyBooked({
  name,
  existing,
  address,
  onMove,
  onBookAnother,
  onClose,
}: {
  /** The person being booked, as the agent picked them. */
  name: string;
  /** Soonest first; the first is the one offered to move. */
  existing: ExistingViewing[];
  address: string;
  onMove: (v: ExistingViewing) => void;
  onBookAnother: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const first = (name || existing[0]?.who || "").trim().split(/\s+/)[0] || "They";
  const v = existing[0];
  const more = existing.length - 1;
  if (!v) return null;

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div role="dialog" aria-modal="true" aria-labelledby="already-booked-title" className="fade-up relative w-full max-w-md overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex items-start gap-3 px-6 pb-2 pt-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft/70 text-accent-dark">
            <DoodleIcon name="calendar" size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="already-booked-title" className="text-[18px] leading-tight">
              Already Booked In
            </h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">{address}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="px-6 pb-6">
          <p className="text-[14px] leading-relaxed">
            {first} already has a viewing here {whenWords(v.startsAt)}. Move that one instead?
          </p>
          {(v.agent || more > 0) && (
            <p className="mt-1.5 text-[12px] text-muted">
              {v.agent ? `Booked with ${v.agent.split(/\s+/)[0]}.` : ""}
              {more > 0 ? ` ${more === 1 ? "There is one more after it" : `There are ${more} more after it`}.` : ""}
            </p>
          )}
          <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
            <button
              type="button"
              autoFocus
              onClick={() => onMove(v)}
              className="flex-1 rounded-xl bg-ink py-3 text-[13.5px] font-semibold text-page transition-opacity hover:opacity-90"
            >
              Move it
            </button>
            <button
              type="button"
              onClick={onBookAnother}
              className="flex-1 rounded-xl border border-line/80 bg-white py-3 text-[13.5px] font-semibold transition-colors hover:border-ink/40"
            >
              Book another as well
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
