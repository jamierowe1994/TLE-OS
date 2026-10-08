"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import { DateField } from "@/components/offers/OfferParts";
import { refreshDiary, useDiary } from "@/lib/diary-store";
import { apptStartIso } from "@/components/viewings/ChangeViewing";
import { atLondon, dayWords, hhmm, lengthWords, londonDay, plus } from "@/lib/london-clock";
import type { BlockAnchor } from "@/components/viewings/AddToBlock";

/**
 * BOOK A SLOT (James, 8 Oct 2026).
 *
 * "We would say book a slot. They would then pick a slot. It might be 15
 * minutes, half an hour, an hour, 2 hours ... select 45 minutes if they want.
 * They should be able to type in the time that they want, and within that
 * slot, we would then block that out." Then tenants are booked within it.
 *
 * The day, a start and an end, both typed to the minute, with a few lengths
 * to start from. Booking only holds the time (POST /api/viewings/slot): the
 * agent's Outlook, nobody told. The last screen offers Book within slot.
 */

export type SlotHome = { id: string; name: string; locality: string };

const LENGTHS = [15, 30, 45, 60, 90, 120];
const inp = "figures block h-11 w-full min-w-0 rounded-[12px] border border-line/80 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark";

export default function BookSlot({
  home,
  open,
  onClose,
  onBookWithin,
}: {
  home: SlotHome | null;
  open: boolean;
  onClose: () => void;
  /** "Book within slot" from the last screen. */
  onBookWithin: (slot: BlockAnchor) => void;
}) {
  const today = londonDay(new Date().toISOString());
  const [day, setDay] = useState(today);
  const [from, setFrom] = useState("12:00");
  const [to, setTo] = useState("13:00");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [made, setMade] = useState<{ slot: BlockAnchor; said: string } | null>(null);
  const { appts } = useDiary();

  useEffect(() => {
    if (!open) return;
    setDay(londonDay(new Date(Date.now() + 86_400_000).toISOString()));
    setFrom("12:00");
    setTo("13:00");
    setProblem(null);
    setMade(null);
  }, [open, home?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  const startsAt = atLondon(day, from);
  const endsAt = atLondon(day, to);
  const minutes = startsAt && endsAt ? Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60_000) : 0;

  /* Anything else in their diary that day that this would run into. */
  const clashes = useMemo(() => {
    if (!startsAt || minutes <= 0) return [];
    const a = new Date(startsAt).getTime();
    const b = a + minutes * 60_000;
    return appts.filter((x) => {
      if (x.kind === "travel") return false;
      const s = new Date(apptStartIso(x)).getTime();
      return s < b && a < s + x.mins * 60_000;
    });
  }, [appts, startsAt, minutes]);

  if (!open || !home) return null;

  const problemWith =
    !startsAt ? "Type when the slot starts." : !endsAt ? "Type when it ends." : minutes < 5 ? "The end has to be after the start." : minutes > 8 * 60 ? "A slot can run for up to 8 hours." : new Date(startsAt).getTime() < Date.now() ? "That time has already gone." : null;

  async function book() {
    if (problemWith || busy || !startsAt || !home) return;
    setBusy(true);
    setProblem(null);
    const j = await fetch("/api/viewings/slot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ listingId: home.id, address: home.name, startsAt, minutes }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string; slotId?: string }>)
      .catch(() => null);
    setBusy(false);
    if (!j?.ok || !j.slotId) return setProblem(j?.said ?? "That didn't save. Check your calendar before trying again.");
    setMade({
      slot: { viewingId: j.slotId, listingId: home.id, property: home.name, locality: home.locality, startsAt, minutes, slot: true },
      said: j.said ?? "Slot held.",
    });
    void refreshDiary().catch(() => null);
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-steve-never>
      <button aria-label="Close" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">{made ? "Slot Booked" : "Book a Slot"}</h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">{[home.name, home.locality].filter(Boolean).join(", ")}</p>
          </div>
          <button
            type="button"
            onClick={() => !busy && onClose()}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {made ? (
            <div className="rounded-2xl border border-line/60 bg-white px-4 py-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#56634a] text-[12px] text-white">✓</span>
                {dayWords(made.slot.startsAt)}, {hhmm(made.slot.startsAt)}-{hhmm(plus(made.slot.startsAt, made.slot.minutes))}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{made.said} Now book the tenants in within it.</p>
            </div>
          ) : (
            <>
              <p className="text-[12.5px] leading-relaxed text-muted">
                Hold the time at the property, then book tenants in within it one by one. Nobody is emailed - you confirm each tenant yourself.
              </p>
              <label className="mt-4 block">
                <span className="text-[12.5px] font-semibold text-ink">Day</span>
                <div className="mt-1.5">
                  <DateField value={day} onChange={setDay} min={today} className={inp} />
                </div>
              </label>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">Starts</span>
                  <input
                    type="time"
                    step={60}
                    value={from}
                    onChange={(e) => {
                      if (!/^\d{2}:\d{2}$/.test(e.target.value)) return;
                      /* Moving the start keeps the length. */
                      const s = atLondon(day, e.target.value);
                      setFrom(e.target.value);
                      if (s && minutes > 0) setTo(hhmm(plus(s, minutes)));
                    }}
                    className={`${inp} mt-1.5`}
                  />
                </label>
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">Ends</span>
                  <input type="time" step={60} value={to} onChange={(e) => /^\d{2}:\d{2}$/.test(e.target.value) && setTo(e.target.value)} className={`${inp} mt-1.5`} />
                </label>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {LENGTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={minutes === m}
                    onClick={() => startsAt && setTo(hhmm(plus(startsAt, m)))}
                    className={`rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition-colors ${
                      minutes === m ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-white hover:border-ink/40"
                    }`}
                  >
                    {lengthWords(m)}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12px] text-muted">
                {problemWith ?? `${dayWords(startsAt!)}, ${from}-${to} · ${lengthWords(minutes)}`}
              </p>
              {clashes.length > 0 && !problemWith && (
                <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] leading-relaxed text-[#9d4340]">
                  Already in your diary then: {clashes.slice(0, 3).map((c) => `${c.start} ${c.what}`).join("; ")}.
                </p>
              )}
            </>
          )}
          {problem && <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">{problem}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
          {made ? (
            <>
              <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40">
                Done
              </button>
              <PressButton
                onClick={() => {
                  const slot = made.slot;
                  onClose();
                  onBookWithin(slot);
                }}
                className="press-ring shrink-0 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-white"
              >
                <span className="flex items-center gap-2">
                  <DoodleIcon name="user" size={15} />
                  Book within slot
                </span>
              </PressButton>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50">
                Cancel
              </button>
              <PressButton
                onClick={() => void book()}
                disabled={Boolean(problemWith) || busy}
                className={`press-ring shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${!problemWith && !busy ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
              >
                <span className="flex items-center gap-2">
                  {busy ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" /> : <DoodleIcon name="calendar" size={15} />}
                  {busy ? "Booking…" : "Book slot"}
                </span>
              </PressButton>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
