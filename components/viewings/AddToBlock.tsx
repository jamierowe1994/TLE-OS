"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import DoodleIcon from "@/components/DoodleIcon";
import { PressButton } from "@/components/Bits";
import ConfirmSheet from "@/components/ConfirmSheet";
import { WhoIsViewing, type OnFile } from "@/components/viewings/BookViewing";
import { refreshDiary, useDiary } from "@/lib/diary-store";
import { apptStartIso, canChangeTime } from "@/components/viewings/ChangeViewing";
import { atLondon, dayWords, hhmm, londonDay, plus } from "@/lib/london-clock";
import type { Appt } from "@/lib/diary";

/**
 * BOOK WITHIN A SLOT, OR STRAIGHT AFTER A VIEWING (James, 8 Oct 2026).
 *
 * Two ways in, one screen:
 *
 *   a slot     "Book within slot" - time held at a home (components/viewings/
 *              BookSlot), tenants booked in it one by one. The free times
 *              inside the slot are offered.
 *   a viewing  "Add another viewing to this slot" - more people straight after
 *              a booked viewing, while we have access. The times after the
 *              block are offered.
 *
 * In James's order: the time and how long ("she gets to pick"), typed to the
 * minute, then find the tenant (the same Who's viewing? search), then Book.
 * Booking is POST /api/viewings/book with blockOf, so the new viewing shares
 * the first one's access (lib/viewing-block). Then the agent confirms it
 * themselves - call them, or read and send the email. Nothing is sent on its
 * own (James: "at no stage should we ever send an email without verification").
 */

export type BlockAnchor = {
  /** The booked viewing's or the slot's id: "rex-…" or "os-…". */
  viewingId: string;
  listingId: string;
  property: string;
  locality?: string;
  startsAt: string;
  minutes: number;
  unaccompanied?: boolean;
  who?: string;
  /** A viewing slot rather than a viewing: viewings go INSIDE it. */
  slot?: boolean;
};

type Slot = { startsAt: string; minutes: number; who: string; mine?: boolean };

const QUICK = [5, 10, 15, 20, 30];

const sameHome = (a: Appt, anchor: BlockAnchor) =>
  (a.listingId != null && String(a.listingId) === anchor.listingId) ||
  (!!a.where && a.where.trim().toLowerCase().startsWith(anchor.property.trim().toLowerCase()));

/** A diary viewing or slot as the place to book within: one still to come, on a listing. */
export function anchorFromAppt(a: Appt | null | undefined): BlockAnchor | null {
  if (!a || !a.listingId) return null;
  if (a.kind === "slot") {
    if (new Date(apptStartIso(a)).getTime() + a.mins * 60_000 < Date.now()) return null;
    return {
      viewingId: a.id,
      listingId: String(a.listingId),
      property: a.where || a.what.replace(/^viewing slot\s*-\s*/i, "") || "the property",
      startsAt: apptStartIso(a),
      minutes: a.mins,
      slot: true,
    };
  }
  if (!canChangeTime(a)) return null;
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

export default function AddToBlock({ anchor, onClose }: { anchor: BlockAnchor | null; onClose: () => void }) {
  const [step, setStep] = useState<"when" | "who" | "done">("when");
  const [person, setPerson] = useState<OnFile | null>(null);
  const [added, setAdded] = useState<Slot[]>([]);
  const [length, setLength] = useState(15);
  const [lengthText, setLengthText] = useState("15");
  const [start, setStart] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<{ who: string; phone: string; startsAt: string; minutes: number; said: string; booking: Parameters<typeof ConfirmSheet>[0]["target"] | null; sent: string | null } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const { appts } = useDiary();

  /* A new anchor is a new block. */
  useEffect(() => {
    setStep("when");
    setPerson(null);
    setAdded([]);
    setProblem(null);
    setLast(null);
    setStart(null);
    const first = anchor && !anchor.slot && anchor.minutes <= 30 ? anchor.minutes : 15;
    setLength(first);
    setLengthText(String(first));
  }, [anchor?.viewingId]); // eslint-disable-line react-hooks/exhaustive-deps

  const slotEnd = anchor?.slot ? plus(anchor.startsAt, anchor.minutes) : null;

  /* What is already booked. In a slot: every viewing at this home inside it.
     After a viewing: the home's viewings that day from it on, joined end to
     start (a gap of up to 15 minutes is still one visit). Plus the ones added
     here, which the diary may not have caught up with yet. */
  const booked = useMemo<Slot[]>(() => {
    if (!anchor) return [];
    const day = londonDay(anchor.startsAt);
    const fromDiary: Slot[] = appts
      .filter((a) => a.kind === "viewing" && sameHome(a, anchor))
      .map((a) => ({ startsAt: apptStartIso(a), minutes: a.mins, who: a.who || "Viewer" }))
      .filter((s) => londonDay(s.startsAt) === day);
    const all = anchor.slot ? [...fromDiary, ...added] : [...fromDiary, ...added, { startsAt: anchor.startsAt, minutes: anchor.minutes, who: anchor.who || "First viewing" }];
    const byStart = new Map<string, Slot>();
    for (const s of all) {
      const k = new Date(s.startsAt).toISOString();
      if (!byStart.has(k) || s.mine) byStart.set(k, s);
    }
    const sorted = [...byStart.values()].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const from = new Date(anchor.startsAt).getTime();
    if (anchor.slot) {
      const to = from + anchor.minutes * 60_000;
      return sorted.filter((s) => {
        const t = new Date(s.startsAt).getTime();
        return t < to && t + s.minutes * 60_000 > from;
      });
    }
    const out: Slot[] = [];
    let end = from;
    for (const s of sorted) {
      const t = new Date(s.startsAt).getTime();
      if (t < from) continue;
      if (out.length && t - end > 15 * 60_000) break;
      out.push(s);
      end = Math.max(end, t + s.minutes * 60_000);
    }
    return out;
  }, [anchor, appts, added]);

  const overlaps = (iso: string, mins: number) => {
    const a = new Date(iso).getTime();
    const b = a + mins * 60_000;
    return booked.find((s) => {
      const s0 = new Date(s.startsAt).getTime();
      return a < s0 + s.minutes * 60_000 && s0 < b;
    }) ?? null;
  };

  /* The times to offer. In a slot: walk it from the start, a viewing's length
     at a time, jumping to the end of anything booked in the way - so a gap
     opens the moment the last viewing finishes (12:10, not 12:15). After a
     viewing: the next eight straight after the block. */
  const offered = useMemo(() => {
    if (!anchor) return [];
    if (anchor.slot && slotEnd) {
      const out: string[] = [];
      const stop = new Date(slotEnd).getTime();
      let t = new Date(anchor.startsAt).getTime();
      for (let guard = 0; guard < 200 && out.length < 24 && t + length * 60_000 <= stop; guard++) {
        const iso = new Date(t).toISOString();
        const hit = overlaps(iso, length);
        if (hit) {
          t = Math.max(t + 60_000, new Date(hit.startsAt).getTime() + hit.minutes * 60_000);
          continue;
        }
        if (t > Date.now()) out.push(iso);
        t += length * 60_000;
      }
      return out;
    }
    const ends = booked.map((s) => new Date(s.startsAt).getTime() + s.minutes * 60_000);
    const next = new Date(Math.max(new Date(anchor.startsAt).getTime() + anchor.minutes * 60_000, ...ends)).toISOString();
    return Array.from({ length: 8 }, (_, i) => plus(next, i * length));
  }, [anchor, booked, length, slotEnd]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Land on the first offered time, and keep a typed one if it still fits. */
  useEffect(() => {
    if (step !== "when") return;
    if (start && !overlaps(start, length)) return;
    const first = offered[0] ?? null;
    setStart(first);
    setTyped(first ? hhmm(first) : "");
  }, [step, offered]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!anchor) return null;
  const first = (n: string) => n.trim().split(/\s+/)[0] || n;
  const clash = start ? overlaps(start, length) : null;
  const pastEnd = Boolean(start && slotEnd && new Date(plus(start, length)).getTime() > new Date(slotEnd).getTime());
  const beforeStart = Boolean(start && anchor.slot && new Date(start).getTime() < new Date(anchor.startsAt).getTime());

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
        ? `Access: the yes for the ${anchor.slot ? "slot" : "first viewing"} covers this one.`
        : j.blockAccess === "asked"
          ? `Access: asked for the ${anchor.slot ? "slot" : "first viewing"} and not confirmed yet.`
          : j.blockAccess === "vacant"
            ? "Access: vacant, keys in the office."
            : "Access: not asked yet - ask on the listing.";
    const said = [j.test ? j.said : j.outlook?.ok ? "In your Outlook calendar." : (j.outlook?.detail ?? "Booked."), access].filter(Boolean).join(" ");
    setAdded((cur) => [...cur, { startsAt: start, minutes: length, who: person.name, mine: true }]);
    setLast({ who: person.name, phone: person.phone, startsAt: start, minutes: length, said, booking: j.test ? null : { kind: "viewing", booking }, sent: null });
    setStep("done");
    void refreshDiary().catch(() => null);
  }

  const again = () => {
    setPerson(null);
    setLast(null);
    setProblem(null);
    setStart(null);
    setStep("when");
  };

  const setLengthTo = (m: number) => {
    setLength(m);
    setLengthText(String(m));
  };

  if (step === "who" && start) {
    return (
      <WhoIsViewing
        home={{ id: anchor.listingId, name: anchor.property, locality: anchor.locality ?? "", rent: null, image: null }}
        title={`Who's Viewing at ${hhmm(start)}?`}
        sub={`${anchor.property} · ${hhmm(start)}-${hhmm(plus(start, length))}, ${dayWords(start)}`}
        onClose={() => setStep("when")}
        onPick={(p) => {
          setPerson(p);
          setStep("when");
        }}
      />
    );
  }

  const title =
    step === "done"
      ? anchor.slot ? "Booked Within the Slot" : "Added to the Block"
      : anchor.slot ? "Book Within Slot" : "Add Another Viewing to This Slot";

  return createPortal(
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-steve-never>
      <button aria-label="Close" onClick={() => !busy && onClose()} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[92vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <h2 className="text-[19px] leading-tight">{title}</h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {anchor.property} · {dayWords(anchor.startsAt)}
              {anchor.slot && slotEnd ? `, ${hhmm(anchor.startsAt)}-${hhmm(slotEnd)}` : ""}
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
          {/* What is already booked. */}
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{anchor.slot ? "Booked in this slot" : "The block so far"}</p>
          {booked.length ? (
            <ol className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
              {booked.map((s) => (
                <li key={s.startsAt} className="flex items-center gap-3 border-b border-line/40 px-4 py-2.5 last:border-b-0">
                  <span className="figures w-[92px] shrink-0 text-[12.5px]">
                    {hhmm(s.startsAt)}-{hhmm(plus(s.startsAt, s.minutes))}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px]">{s.who}</span>
                  {s.mine && <span className="rounded-full bg-[#f1f4ec] px-2 py-0.5 text-[10.5px] font-semibold text-[#56634a]">Added now</span>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-2 rounded-2xl border border-dashed border-line px-4 py-3 text-[12.5px] text-muted">Nobody booked in it yet. The whole slot is free.</p>
          )}

          {step === "when" && (
            <>
              <p className="mt-5 text-[13px] font-semibold">How long is this viewing?</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {QUICK.map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={length === m}
                    onClick={() => setLengthTo(m)}
                    className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${length === m ? "border-ink bg-ink text-white" : "border-line/80 bg-white text-muted hover:text-ink"}`}
                  >
                    {m} min
                  </button>
                ))}
                <label className="flex items-center gap-1.5 rounded-full border border-line/80 bg-white py-1 pl-3.5 pr-2 text-[12.5px]">
                  <span className="text-muted">Or</span>
                  <input
                    inputMode="numeric"
                    value={lengthText}
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^\d]/g, "").slice(0, 3);
                      setLengthText(v);
                      const n = Number(v);
                      if (n >= 5 && n <= 240) setLength(n);
                    }}
                    aria-label="Minutes"
                    className="figures w-10 rounded-full bg-page px-1.5 py-0.5 text-center text-[12.5px] outline-none"
                  />
                  <span className="text-muted">min</span>
                </label>
              </div>

              <p className="mt-5 text-[13px] font-semibold">Starts at</p>
              <p className="mt-0.5 text-[11.5px] text-muted">
                {anchor.slot ? `The free times in the slot, every ${length} minutes.` : `Straight after the block, every ${length} minutes.`} Or type any time.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {offered.map((iso) => (
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
                {anchor.slot && offered.length === 0 && <span className="py-1.5 text-[12px] text-muted">No free {length}-minute gap left in the slot.</span>}
                <label className="flex items-center gap-2 rounded-full border border-line/80 bg-white py-1 pl-3.5 pr-1.5 text-[12.5px]">
                  <span className="text-muted">Other</span>
                  <input
                    type="time"
                    step={60}
                    value={typed}
                    onChange={(e) => {
                      setTyped(e.target.value);
                      setStart(atLondon(londonDay(anchor.startsAt), e.target.value));
                    }}
                    className="figures rounded-full bg-page px-2 py-0.5 text-[12.5px] outline-none"
                  />
                </label>
              </div>

              {/* Who: picked after the time, from the same search as anywhere else. */}
              <p className="mt-5 text-[13px] font-semibold">Who&apos;s viewing?</p>
              {person ? (
                <div className="mt-2 flex items-center gap-3 rounded-2xl border border-line/60 bg-white px-4 py-3">
                  <span className="min-w-0 flex-1 text-[12.5px] leading-relaxed">
                    <span className="font-semibold">{person.name}</span>
                    {start ? ` · ${hhmm(start)}-${hhmm(plus(start, length))}` : ""}
                    <span className="block text-[11.5px] text-muted">
                      {[person.email, person.phone].filter(Boolean).join(" · ") || "No contact details on file"}
                      {anchor.unaccompanied ? " · unaccompanied, like the first" : ""}
                    </span>
                  </span>
                  <button type="button" onClick={() => start && setStep("who")} className="shrink-0 text-[12px] font-semibold text-accent-dark hover:underline">
                    Change
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={!start}
                  onClick={() => setStep("who")}
                  className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-dashed border-line bg-white px-4 py-3 text-left text-[13px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-50"
                >
                  <DoodleIcon name="search" size={15} className="text-accent-dark" />
                  Find the tenant
                </button>
              )}

              {clash && (
                <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">
                  That runs into {clash.who} at {hhmm(clash.startsAt)}. Pick another time, or book it anyway if they are viewing together.
                </p>
              )}
              {(pastEnd || beforeStart) && !clash && (
                <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">
                  That is outside the slot ({hhmm(anchor.startsAt)}-{slotEnd ? hhmm(slotEnd) : ""}). You can still book it.
                </p>
              )}
            </>
          )}

          {step === "done" && last && (
            <div className="mt-5 rounded-2xl border border-line/60 bg-white px-4 py-4">
              <p className="flex items-center gap-2 text-[14px] font-semibold">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#56634a] text-[12px] text-white">✓</span>
                {first(last.who)} at {hhmm(last.startsAt)}-{hhmm(plus(last.startsAt, last.minutes))}
              </p>
              <p className="mt-1.5 text-[12px] leading-relaxed text-muted">{last.said}</p>
              {/* Confirming is the agent's: a call, or the email read before it goes. */}
              <p className="mt-3 text-[12px] font-semibold">Confirm it with {first(last.who)}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {last.phone && (
                  <a href={`tel:${last.phone.replace(/\s+/g, "")}`} className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40">
                    <DoodleIcon name="call" size={13} />
                    Call {last.phone}
                  </a>
                )}
                {last.booking &&
                  (last.sent ? (
                    <span className="py-1.5 text-[12px] text-[#56634a]">{last.sent}</span>
                  ) : (
                    <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-1.5 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] font-semibold hover:border-ink/40">
                      <DoodleIcon name="mail" size={13} />
                      Read and send the email
                    </button>
                  ))}
                {!last.phone && !last.booking && <span className="text-[12px] text-muted">Test viewing - nothing to send.</span>}
              </div>
            </div>
          )}

          {problem && <p className="mt-3 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">{problem}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-line/70 px-6 py-4">
          {step === "when" ? (
            <>
              <button type="button" onClick={onClose} disabled={busy} className="rounded-full border border-line/80 px-5 py-2.5 text-[12.5px] font-medium transition-colors hover:border-ink/40 disabled:opacity-50">
                Cancel
              </button>
              <PressButton
                onClick={() => (person ? void book() : start && setStep("who"))}
                disabled={!start || busy}
                className={`press-ring shrink-0 rounded-full px-6 py-2.5 text-[13px] font-semibold ${start && !busy ? "bg-accent-dark text-white" : "cursor-not-allowed bg-ink/30 text-page/60"}`}
              >
                <span className="flex items-center gap-2">
                  {busy ? <span className="block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-page/40 border-t-page" /> : <DoodleIcon name={person ? "calendar" : "search"} size={15} />}
                  {busy ? "Booking…" : !start ? "Pick a time" : person ? `Book ${first(person.name)} at ${hhmm(start)}` : "Next: find the tenant"}
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
                  {anchor.slot ? "Book another in the slot" : "Add another"}
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
