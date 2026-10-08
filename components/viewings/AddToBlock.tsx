"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import ConfirmSheet from "@/components/ConfirmSheet";
import { WhoIsViewing, type OnFile } from "@/components/viewings/BookViewing";
import { refreshDiary, useDiary } from "@/lib/diary-store";
import { apptStartIso, canChangeTime } from "@/components/viewings/ChangeViewing";
import type { Appt } from "@/lib/diary";

/**
 * ADD ANOTHER VIEWING TO THIS SLOT (James, 8 Oct 2026).
 *
 * "Rather than having to go through the whole process every time, you can
 * then click Add another viewing to this slot. You'll then pick your time,
 * and that should be granular ... 5, 10, or 15-minute intervals. We'll then be
 * able to find the tenant on the system and add them in directly ... bolt as
 * many of them on ... a viewing block whilst we've still got access to this
 * property."
 *
 * Opened from a booked viewing (the anchor). Three short steps, round and
 * round as many times as they like:
 *
 *   who   the same "Who's viewing?" search the listing's booker uses
 *   when  the block so far, then the next slots straight after it, in 5, 10
 *         or 15 minutes, or any time to the minute
 *   done  booked - the same POST /api/viewings/book, with blockOf so the new
 *         viewing takes the anchor's access (lib/viewing-block) - and the
 *         confirmation offered, never sent on its own
 *
 * The property, the agent and accompanied or not are the anchor's; nothing
 * else is asked again.
 */

export type BlockAnchor = {
  /** The booked viewing's id: "rex-…" or "os-…". */
  viewingId: string;
  listingId: string;
  property: string;
  locality?: string;
  startsAt: string;
  minutes: number;
  unaccompanied?: boolean;
  who?: string;
};

type Slot = { startsAt: string; minutes: number; who: string; mine?: boolean };

/** A diary viewing as a block's first viewing: one still to come, on a listing. */
export function anchorFromAppt(a: Appt | null | undefined): BlockAnchor | null {
  if (!a || !canChangeTime(a) || !a.listingId) return null;
  const property = a.where || a.what.replace(/^[^-—]+[-—]\s*/, "").replace(/\s+with\s+.*$/i, "") || "the property";
  return {
    viewingId: a.id,
    listingId: String(a.listingId),
    property,
    startsAt: apptStartIso(a),
    minutes: a.mins,
    unaccompanied: /^unaccompanied/i.test(a.what),
    who: a.who,
  };
}

const LENGTHS = [5, 10, 15] as const;
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const dayWords = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/London" });
const londonDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const plus = (iso: string, mins: number) => new Date(new Date(iso).getTime() + mins * 60_000).toISOString();
const sameHome = (a: Appt, anchor: BlockAnchor) =>
  (a.listingId != null && String(a.listingId) === anchor.listingId) ||
  (!!a.where && a.where.trim().toLowerCase().startsWith(anchor.property.trim().toLowerCase()));

/** The anchor's day as YYYY-MM-DD plus a typed HH:MM, as an instant (London). */
function atLondon(dayIso: string, time: string): string | null {
  if (!/^\d{1,2}:\d{2}$/.test(time)) return null;
  const [h, m] = time.split(":").map(Number);
  const day = londonDay(dayIso);
  /* Find the UTC instant whose London clock reads day h:m (BST or GMT). */
  for (const offset of [0, -60, 60]) {
    const guess = new Date(`${day}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`).getTime() + offset * 60_000;
    const iso = new Date(guess).toISOString();
    if (londonDay(iso) === day && hhmm(iso) === `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`) return iso;
  }
  return null;
}

export default function AddToBlock({ anchor, onClose }: { anchor: BlockAnchor | null; onClose: () => void }) {
  const [step, setStep] = useState<"who" | "when" | "done">("who");
  const [person, setPerson] = useState<OnFile | null>(null);
  const [added, setAdded] = useState<Slot[]>([]);
  const [length, setLength] = useState<number>(15);
  const [start, setStart] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<{ who: string; startsAt: string; minutes: number; said: string; booking: Parameters<typeof ConfirmSheet>[0]["target"] | null; sent: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { appts } = useDiary();

  /* A new anchor is a new block. */
  useEffect(() => {
    setStep("who");
    setPerson(null);
    setAdded([]);
    setProblem(null);
    setLast(null);
    setLength(anchor && anchor.minutes <= 15 ? (LENGTHS.includes(anchor.minutes as 5 | 10 | 15) ? anchor.minutes : 15) : 15);
  }, [anchor?.viewingId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* The block: this home's viewings that day from the anchor on, joined end
     to start (a gap of up to 15 minutes still counts - one visit to the
     property), plus the ones added here. */
  const block = useMemo<Slot[]>(() => {
    if (!anchor) return [];
    const day = londonDay(anchor.startsAt);
    const fromDiary: Slot[] = appts
      .filter((a) => a.kind === "viewing" && sameHome(a, anchor))
      .map((a) => ({ startsAt: apptStartIso(a), minutes: a.mins, who: a.who || "Viewer" }))
      .filter((s) => londonDay(s.startsAt) === day);
    const all = [...fromDiary, ...added, { startsAt: anchor.startsAt, minutes: anchor.minutes, who: anchor.who || "First viewing" }];
    /* One per start time, the anchor's name winning. */
    const byStart = new Map<string, Slot>();
    for (const s of all) {
      const k = new Date(s.startsAt).toISOString();
      if (!byStart.has(k) || s.mine) byStart.set(k, s);
    }
    const sorted = [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const out: Slot[] = [];
    let end = new Date(anchor.startsAt).getTime();
    for (const s of sorted) {
      const t = new Date(s.startsAt).getTime();
      if (t < new Date(anchor.startsAt).getTime()) continue;
      if (out.length && t - end > 15 * 60_000) break;
      out.push(s);
      end = Math.max(end, t + s.minutes * 60_000);
    }
    return out;
  }, [anchor, appts, added]);

  const nextFree = useMemo(() => {
    if (!anchor) return null;
    const ends = block.map((s) => new Date(s.startsAt).getTime() + s.minutes * 60_000);
    return new Date(Math.max(new Date(anchor.startsAt).getTime() + anchor.minutes * 60_000, ...ends)).toISOString();
  }, [anchor, block]);

  /* The next slots straight after the block, stepping by the length picked. */
  const slots = useMemo(() => (nextFree ? Array.from({ length: 8 }, (_, i) => plus(nextFree, i * length)) : []), [nextFree, length]);

  useEffect(() => {
    if (step === "when" && nextFree) {
      setStart(nextFree);
      setTyped(hhmm(nextFree));
    }
  }, [step, nextFree]);

  const clash = useMemo(() => {
    if (!start) return null;
    const a = new Date(start).getTime();
    const b = a + length * 60_000;
    return block.find((s) => {
      const s0 = new Date(s.startsAt).getTime();
      return a < s0 + s.minutes * 60_000 && s0 < b;
    }) ?? null;
  }, [start, length, block]);

  if (!anchor) return null;
  const first = (n: string) => n.trim().split(/\s+/)[0] || n;

  async function book() {
    if (!anchor || !person || !start || busy) return;
    if (new Date(start).getTime() < Date.now()) return setProblem("That time has already gone. Pick a later one.");
    setBusy(true);
    setProblem(null);
    const booking = {
      leadId: person.leadId,
      listingId: anchor.listingId,
      applicantName: person.name,
      applicantEmail: person.email || null,
      address: anchor.property,
      startsAt: start,
      minutes: length,
      unaccompanied: Boolean(anchor.unaccompanied),
    };
    const j = await fetch("/api/viewings/book", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...booking, contactId: person.contactId, blockOf: anchor.viewingId }),
    })
      .then((r) => r.json() as Promise<{ ok?: boolean; said?: string; test?: boolean; blockAccess?: string | null; outlook?: { ok?: boolean; detail?: string } }>)
      .catch(() => null);
    setBusy(false);
    if (!j?.ok) {
      setProblem(j?.said ?? "That didn't book. Check your calendar before trying again.");
      return;
    }
    const access =
      j.blockAccess === "granted"
        ? "Access: the yes for the first viewing covers this one."
        : j.blockAccess === "asked"
          ? "Access: asked for the first viewing and not confirmed yet - it covers this one when it is."
          : j.blockAccess === "vacant"
            ? "Access: vacant, keys in the office."
            : "Access: not asked for the first viewing yet - ask on the listing.";
    const said = [j.test ? j.said : j.outlook?.ok ? "In your Outlook calendar." : (j.outlook?.detail ?? "Booked."), access].filter(Boolean).join(" ");
    setAdded((cur) => [...cur, { startsAt: start, minutes: length, who: person.name, mine: true }]);
    setLast({ who: person.name, startsAt: start, minutes: length, said, booking: j.test ? null : { kind: "viewing", booking }, sent: null });
    setStep("done");
    void refreshDiary().catch(() => null);
  }

  const again = () => {
    setPerson(null);
    setLast(null);
    setProblem(null);
    setStep("who");
  };

  if (step === "who") {
    return (
      <WhoIsViewing
        home={{ id: anchor.listingId, name: anchor.property, locality: anchor.locality ?? "", rent: null, image: null }}
        title={added.length ? "Add Another Viewing" : "Add Another Viewing to This Slot"}
        sub={`${anchor.property} · after ${hhmm(nextFree ?? anchor.startsAt)} on ${dayWords(anchor.startsAt)}`}
        onClose={onClose}
        onPick={(p) => {
          setPerson(p);
          setStep("when");
        }}
      />
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-steve-never>
      <button aria-label="Close" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">{step === "done" ? "Added to the Block" : `When Is ${first(person?.name ?? "")} Viewing?`}</h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {anchor.property} · {dayWords(anchor.startsAt)}
            </p>
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
          {/* The block so far. */}
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The block so far</p>
          <ol className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
            {block.map((s) => (
              <li key={s.startsAt} className="flex items-center gap-3 border-b border-line/40 px-4 py-2.5 last:border-b-0">
                <span className="figures w-[92px] shrink-0 text-[12.5px]">
                  {hhmm(s.startsAt)}-{hhmm(plus(s.startsAt, s.minutes))}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{s.who}</span>
                {s.mine && <span className="rounded-full bg-[#f1f4ec] px-2 py-0.5 text-[10.5px] font-semibold text-[#56634a]">Added now</span>}
              </li>
            ))}
          </ol>

          {step === "when" && person && (
            <>
              <p className="mt-5 text-[13px] font-semibold">How long is it?</p>
              <div className="mt-2 inline-flex rounded-full border border-line/70 bg-white p-1 text-[12.5px] font-semibold">
                {LENGTHS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={length === m}
                    onClick={() => setLength(m)}
                    className={`rounded-full px-4 py-1.5 transition-colors ${length === m ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
                  >
                    {m} min
                  </button>
                ))}
              </div>

              <p className="mt-5 text-[13px] font-semibold">Start at</p>
              <p className="mt-0.5 text-[11.5px] text-muted">Straight after the block, every {length} minutes. Or type any time.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {slots.map((iso) => (
                  <button
                    key={iso}
                    type="button"
                    aria-pressed={start === iso}
                    onClick={() => {
                      setStart(iso);
                      setTyped(hhmm(iso));
                    }}
                    className={`figures rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
                      start === iso ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-white hover:border-ink/40"
                    }`}
                  >
                    {hhmm(iso)}
                  </button>
                ))}
                <label className="flex items-center gap-2 rounded-full border border-line/80 bg-white py-1 pl-3.5 pr-1.5 text-[12.5px]">
                  <span className="text-muted">Other</span>
                  <input
                    type="time"
                    step={60}
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setStart(atLondon(anchor.startsAt, e.target.value));
                    }}
                    className="figures rounded-full bg-page px-2 py-0.5 text-[12.5px] outline-none"
                  />
                </label>
              </div>

              <div className="mt-5 rounded-2xl border border-line/60 bg-white px-4 py-3 text-[12.5px] leading-relaxed">
                <span className="font-semibold">{person.name}</span>
                {start ? ` · ${hhmm(start)}-${hhmm(plus(start, length))}` : ""}
                <span className="block text-[11.5px] text-muted">
                  {[person.email, person.phone].filter(Boolean).join(" · ") || "No contact details on file"}
                  {anchor.unaccompanied ? " · unaccompanied, like the first" : ""}
                </span>
              </div>
              {clash && (
                <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">
                  That runs into {clash.who} at {hhmm(clash.startsAt)}. Pick another time, or book it anyway if they are viewing together.
                </p>
              )}
            </>
          )}

          {step === "done" && last && (
            <div className="mt-5 rounded-2xl border border-line/60 bg-white px-4 py-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#56634a] text-[12px] text-white">✓</span>
                {first(last.who)} at {hhmm(last.startsAt)}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{last.said}</p>
              {last.booking && (
                <p className="mt-2 text-[12px]">
                  {last.sent ? (
                    <span className="text-[#56634a]">{last.sent}</span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(true)} className="font-semibold text-accent-dark hover:underline">
                      Send {first(last.who)} the confirmation
                    </button>
                  )}
                </p>
              )}
            </div>
          )}

          {problem && <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">{problem}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
          {step === "when" ? (
            <>
              <button type="button" onClick={again} disabled={busy} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50">
                Back
              </button>
              <PressButton
                onClick={() => void book()}
                disabled={!start || busy}
                className={`press-ring shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${start && !busy ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
              >
                <span className="flex items-center gap-2">
                  {busy ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" /> : <DoodleIcon name="calendar" size={15} />}
                  {busy ? "Booking…" : start ? `Book ${hhmm(start)}` : "Pick a time"}
                </span>
              </PressButton>
            </>
          ) : (
            <>
              <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40">
                Done
              </button>
              <PressButton onClick={again} className="press-ring shrink-0 rounded-full bg-accent-dark px-6 py-2.5 text-[13px] font-semibold text-white">
                <span className="flex items-center gap-2">
                  <DoodleIcon name="user" size={15} />
                  Add another
                </span>
              </PressButton>
            </>
          )}
        </div>
      </div>
      {confirming && last?.booking && (
        <ConfirmSheet
          target={last.booking}
          title={`Confirm ${first(last.who)}'s viewing`}
          onClose={() => setConfirming(false)}
          onSent={(detail) => setLast((cur) => (cur ? { ...cur, sent: detail } : cur))}
        />
      )}
    </div>,
    document.body
  );
}
