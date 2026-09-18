"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Sheet from "@/components/tenant/Sheet";
import { APPLICANT_TYPES } from "@/lib/passport-shape";
import { show, type OfferFieldKey, type OfferPassport } from "@/lib/offer-passport";

/**
 * AFTER THE VIEWING: the three answers, each in its own bottom sheet (James,
 * 18 Sep 2026) - Not for me, I liked it but have questions, Make an offer.
 * They were three links that opened the tenant's own email app.
 *
 * What is carried over rather than invented: the offer's rule and its fields
 * come from the How Was It? page and Howard's application form (app/tenant/
 * (public)/feedback and /apply) - at or below the advertised rent, a move-in
 * day, a term - and "everything about them" is their passport, shown back to
 * them to confirm rather than asked again.
 *
 * Opened from anywhere on the page by an event (ViewedButton), the way the
 * agent sheet is, so the next step's button and the tile's three can share
 * one set of sheets. Saved by /api/tenant/homes/viewed; in the sample nothing
 * is sent and the stage moves on instead, so the walkthrough carries on.
 */

export type ViewedKind = "not_for_me" | "questions" | "offer";
const EVENT = "tle-viewed";

export function ViewedButton({ kind, className, children }: { kind: ViewedKind; className: string; children: React.ReactNode }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent(EVENT, { detail: kind }))}>
      {children}
    </button>
  );
}

const NOT_RIGHT = [
  "It wasn't the right size",
  "The photos weren't quite right",
  "The price is a bit high",
  "The dates don't line up",
  "The area isn't right",
  "The condition",
  "Something else",
];
const TOPICS = ["Bills and council tax", "The landlord", "Parking", "Pets", "Deposit and fees", "Furniture", "The move-in date", "Something else"];
const TERMS = ["6 months", "12 months", "18 months", "24 months"];

const card = "rounded-[16px] border border-line/60";
const label = "text-[13px] font-semibold";
const input = "mt-1.5 w-full rounded-[12px] border border-line/80 bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-accent-dark";
/* A fixed height for the controls that sit side by side, so a date box and
   a select line up whatever the phone draws inside them. */
const field = "mt-1.5 block h-12 w-full min-w-0 rounded-[12px] border border-line/80 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark";
const primary = "flex w-full items-center justify-center gap-2 rounded-full bg-accent-dark py-3.5 text-[14.5px] font-semibold text-white disabled:opacity-50";
const gbp = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function ViewedSheets({
  property,
  listingId,
  askingPcm,
  agentFirst,
  passport,
  passportHref,
  sample,
  base,
}: {
  property: string;
  listingId: string | null;
  askingPcm: number | null;
  agentFirst: string;
  /** The passport answers the offer shows back, and lets them change. */
  passport: OfferPassport;
  passportHref: string | null;
  sample: boolean;
  base: string;
}) {
  const [open, setOpen] = useState<ViewedKind | null>(null);
  const [done, setDone] = useState<ViewedKind | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const [reasons, setReasons] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [amount, setAmount] = useState(askingPcm ? String(askingPcm) : "");
  const [moveIn, setMoveIn] = useState("");
  const [term, setTerm] = useState("12 months");
  /* Their passport as they are sending it. Anything changed here is saved to
     the passport and shown to the agent against the original (lib/offer-
     passport); the tenant sees nothing different. */
  const [pp, setPp] = useState<OfferPassport>(passport);
  const set = <K extends OfferFieldKey>(k: K, v: OfferPassport[K]) => setPp((cur) => ({ ...cur, [k]: v }));
  const [editing, setEditing] = useState<string | null>(null);
  const adults = Math.max(1, parseInt(pp.numAdults, 10) || 1);
  const children = Math.max(0, parseInt(pp.numChildren, 10) || 0);
  const [offerNote, setOfferNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    const on = (e: Event) => {
      setErr("");
      setOpen((e as CustomEvent<ViewedKind>).detail);
    };
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);

  const offerNum = Number(amount.replace(/[£,\s]/g, ""));
  const offerError =
    !amount.trim() ? null : !Number.isFinite(offerNum) || offerNum <= 0 ? "That doesn't look like an amount." : askingPcm && offerNum > askingPcm ? `The advertised rent is ${gbp(askingPcm)} a month, so an offer can't be above that.` : null;
  const today = new Date().toISOString().slice(0, 10);

  async function send(kind: ViewedKind) {
    setErr("");
    if (kind === "questions" && !message.trim()) return setErr("Write your questions in the box.");
    if (kind === "offer") {
      if (!amount.trim() || offerError) return setErr(offerError ?? "Tell us what you'd like to offer each month.");
      if (!moveIn) return setErr("Choose the day you'd like to move in.");
      if (!confirmed) return setErr("Tick to say your details are up to date.");
    }
    if (sample) return setDone(kind);
    setBusy(true);
    const r = await fetch("/api/tenant/homes/viewed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind,
        listingId,
        address: property,
        reasons,
        note,
        topics,
        message,
        offer: { amount: offerNum, moveIn, term, note: offerNote, confirmed },
        passport: { ...pp, numAdults: String(adults), numChildren: String(children) },
      }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't send. Try again in a minute.");
    setDone(kind);
  }

  /* From the latest list, not the one this render saw: two quick taps must
     both count. */
  const toggle = (set: React.Dispatch<React.SetStateAction<string[]>>, v: string) => set((list) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]));
  const close = () => setOpen(null);
  /* In the sample, where each answer leads in the walkthrough. */
  const nextStage = (kind: ViewedKind) => (kind === "offer" ? "offer" : kind === "not_for_me" ? "matched" : null);

  const Done = ({ kind }: { kind: ViewedKind }) => (
    <div className="py-4 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent-dark text-white">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
      <h2 className="mt-4 text-[21px] font-bold leading-tight">
        {kind === "offer" ? "Your Offer Is In" : kind === "questions" ? "Your Questions Are With " + agentFirst : "Thanks for Telling Us"}
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[13.5px] leading-relaxed text-ink/70">
        {kind === "offer"
          ? `${agentFirst} puts your offer of ${gbp(offerNum)} a month to the landlord and comes back to you, usually the same day.`
          : kind === "questions"
            ? `${agentFirst} will reply by email. Take your time - the home is still there for you to offer on.`
            : `It helps us find somewhere that fits. We will send you homes that suit you better.`}
      </p>
      {sample && <p className="mt-3 text-[12px] text-muted">This is the sample, so nothing was sent.</p>}
      <div className="mt-5 space-y-2.5">
        {sample && nextStage(kind) && (
          <a href={`/tenant/demo/stage?to=${nextStage(kind)}&back=${encodeURIComponent(base)}`} className={primary}>
            See what happens next
          </a>
        )}
        {kind === "not_for_me" && (
          <Link href={`${base}/homes`} className={sample ? "block w-full rounded-full border border-line/80 py-3 text-center text-[14px] font-semibold" : primary}>
            See other homes
          </Link>
        )}
        <button type="button" onClick={close} className="block w-full py-2 text-[13px] font-semibold text-muted">
          Close
        </button>
      </div>
    </div>
  );

  const chips = (all: string[], on: string[], set: React.Dispatch<React.SetStateAction<string[]>>) => (
    <div className="mt-3 flex flex-wrap gap-2">
      {all.map((r) => {
        const lit = on.includes(r);
        return (
          <button
            key={r}
            type="button"
            onClick={() => toggle(set, r)}
            aria-pressed={lit}
            className={`rounded-full border px-3.5 py-2 text-[13px] transition-colors ${lit ? "border-accent-dark bg-accent-dark font-semibold text-white" : "border-line/80 bg-white"}`}
          >
            {r}
          </button>
        );
      })}
    </div>
  );

  const error = err ? <p className="mt-3 text-[13px] font-semibold text-[#9d4340]">{err}</p> : null;

  return (
    <>
      {/* ── Not for me ── */}
      <Sheet
        open={open === "not_for_me"}
        onClose={close}
        label="Not for me"
        footer={done === "not_for_me" ? undefined : <button type="button" disabled={busy} onClick={() => send("not_for_me")} className={primary}>{busy ? "Sending…" : "Send"}</button>}
      >
        {done === "not_for_me" ? (
          <Done kind="not_for_me" />
        ) : (
          <>
            <h2 className="text-[20px] font-bold leading-tight">Not for You?</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">Fair enough. What wasn&apos;t right about {property}? Tick any that apply - it helps us find one that is.</p>
            {chips(NOT_RIGHT, reasons, setReasons)}
            <label className="mt-5 block">
              <span className={label}>Anything else you&apos;d tell us?</span>
              <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="In your own words" className={input} />
            </label>
            {error}
          </>
        )}
      </Sheet>

      {/* ── Questions ── */}
      <Sheet
        open={open === "questions"}
        onClose={close}
        label="Questions"
        footer={done === "questions" ? undefined : <button type="button" disabled={busy} onClick={() => send("questions")} className={primary}>{busy ? "Sending…" : `Send to ${agentFirst}`}</button>}
      >
        {done === "questions" ? (
          <Done kind="questions" />
        ) : (
          <>
            <h2 className="text-[20px] font-bold leading-tight">Ask {agentFirst} Anything</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">Liked it but want to know more first? Tick what it&apos;s about, and ask away.</p>
            {chips(TOPICS, topics, setTopics)}
            <label className="mt-5 block">
              <span className={label}>Your questions</span>
              <textarea rows={4} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="What would you like to know?" className={input} />
            </label>
            <p className="mt-2 text-[12px] text-muted">It goes to {agentFirst} by email, and they reply to you.</p>
            {error}
          </>
        )}
      </Sheet>

      {/* ── Make an offer ── */}
      <Sheet
        open={open === "offer"}
        onClose={close}
        label="Make an offer"
        footer={done === "offer" ? undefined : <button type="button" disabled={busy} onClick={() => send("offer")} className={primary}>{busy ? "Sending…" : "Put my offer forward"}</button>}
      >
        {done === "offer" ? (
          <Done kind="offer" />
        ) : (
          <>
            <h2 className="text-[20px] font-bold leading-tight">Make an Offer</h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted">On {property}. {agentFirst} puts it to the landlord. Your passport does the rest, so this is only what it doesn&apos;t already know.</p>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Your offer</p>
            <label className="mt-2 block">
              <span className={label}>Rent per month</span>
              <span className="mt-0.5 block text-[12px] text-muted">{askingPcm ? `Advertised at ${gbp(askingPcm)} a month. Offers at or below that.` : "What you would like to pay each month."}</span>
              <div className="relative mt-1.5">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-muted">£</span>
                <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${input} !mt-0 pl-8 text-[16px] font-semibold ${offerError ? "!border-[#9d4340]" : ""}`} />
              </div>
              {offerError && <span className="mt-1.5 block text-[12.5px] text-[#9d4340]">{offerError}</span>}
            </label>
            {/* The same height, the date a little narrower and the term a
                little wider (James, 18 Sep 2026): a phone's date box has its
                own minimum width and was pushing into the select beside it. */}
            <div className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.12fr)] gap-3">
              <label className="block min-w-0">
                <span className={label}>Move in on</span>
                <input type="date" min={today} value={moveIn} onChange={(e) => setMoveIn(e.target.value)} className={`${field} appearance-none`} />
              </label>
              <label className="block min-w-0">
                <span className={label}>For</span>
                <select value={term} onChange={(e) => setTerm(e.target.value)} className={field}>
                  {TERMS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </label>
            </div>

            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">Who&apos;s moving in</p>
            <div className="mt-2 grid grid-cols-2 gap-3">
              <Stepper label="Adults" value={adults} min={1} onChange={(n) => set("numAdults", String(n))} />
              <Stepper label="Children" value={children} min={0} onChange={(n) => set("numChildren", String(n))} />
            </div>
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className={label}>Any pets?</span>
              <div className="flex gap-2">
                {[false, true].map((v) => (
                  <button key={String(v)} type="button" onClick={() => set("pets", v)} className={`rounded-full border px-4 py-1.5 text-[13px] ${pp.pets === v ? "border-accent-dark bg-accent-dark font-semibold text-white" : "border-line/80"}`}>
                    {v ? "Yes" : "No"}
                  </button>
                ))}
              </div>
            </div>
            {pp.pets && <input value={pp.petsNote} onChange={(e) => set("petsNote", e.target.value)} placeholder="What, and how many?" className={input} />}

            <p className="mt-6 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted">About you, from your passport</p>
            <p className="mt-1 text-[12px] leading-snug text-muted">Anything changed since you made it? Put it right here and your passport updates too.</p>
            <dl className={`${card} mt-2 divide-y divide-line/50 px-4`}>
              <Fact id="work" title="Working" value={show("applicantType", pp.applicantType)} editing={editing} setEditing={setEditing}>
                <select value={pp.applicantType} onChange={(e) => set("applicantType", e.target.value)} className={field}>
                  <option value="">Choose one</option>
                  {APPLICANT_TYPES.map((t) => <option key={t}>{t}</option>)}
                </select>
              </Fact>
              <Fact id="income" title="Income" value={show("annualIncome", pp.annualIncome)} editing={editing} setEditing={setEditing}>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-muted">£</span>
                  <input inputMode="numeric" value={pp.annualIncome} onChange={(e) => set("annualIncome", e.target.value)} placeholder="A year, before tax" className={`${field} pl-7`} />
                </div>
              </Fact>
              <Fact id="rtr" title="Right to rent" value={pp.hasBritishPassport ? "British or Irish passport" : pp.shareCode ? `Share code ${pp.shareCode}` : "Not given yet"} editing={editing} setEditing={setEditing}>
                <YesNo q="Do you have a British or Irish passport?" v={pp.hasBritishPassport} on={(v) => set("hasBritishPassport", v)} />
                {pp.hasBritishPassport === false && <input value={pp.shareCode} onChange={(e) => set("shareCode", e.target.value.toUpperCase())} placeholder="Your share code" className={`${field} mt-2`} />}
              </Fact>
              <Fact id="ref" title="Landlord reference" value={show("landlordRef", pp.landlordRef)} editing={editing} setEditing={setEditing}>
                <YesNo q="Can your current or last landlord give a reference?" v={pp.landlordRef} on={(v) => set("landlordRef", v)} />
              </Fact>
              <Fact id="guar" title="Guarantor" value={show("guarantor", pp.guarantor)} editing={editing} setEditing={setEditing}>
                <YesNo q="Do you have a guarantor if one is needed?" v={pp.guarantor} on={(v) => set("guarantor", v)} />
              </Fact>
              <Fact id="credit" title="Adverse credit" value={show("adverseCredit", pp.adverseCredit)} editing={editing} setEditing={setEditing}>
                <YesNo q="Any CCJs, defaults or missed payments?" v={pp.adverseCredit} on={(v) => set("adverseCredit", v)} />
                {pp.adverseCredit && <input value={pp.adverseCreditNote} onChange={(e) => set("adverseCreditNote", e.target.value)} placeholder="A line about it" className={`${field} mt-2`} />}
              </Fact>
              <Fact id="smoke" title="Smoker" value={show("smoker", pp.smoker)} editing={editing} setEditing={setEditing}>
                <YesNo q="Does anyone moving in smoke?" v={pp.smoker} on={(v) => set("smoker", v)} />
              </Fact>
            </dl>
            <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-[12px] bg-accent-soft/70 p-3">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" />
              <span className="text-[12.5px] leading-snug">These details are up to date, and I&apos;m happy for them to go to the landlord with my offer.</span>
            </label>

            <label className="mt-5 block">
              <span className={label}>Anything the landlord should know?</span>
              <textarea rows={3} value={offerNote} onChange={(e) => setOfferNote(e.target.value)} placeholder="Optional - why this home, flexibility on dates, anything that helps" className={input} />
            </label>
            {error}
          </>
        )}
      </Sheet>
    </>
  );
}

function Stepper({ label: l, value, min, onChange }: { label: string; value: number; min: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between rounded-[12px] border border-line/80 px-3 py-2">
      <span className="text-[13px] font-semibold">{l}</span>
      <span className="flex items-center gap-2.5">
        <button type="button" onClick={() => onChange(Math.max(min, value - 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-panel text-[15px]" aria-label={`Fewer ${l.toLowerCase()}`}>−</button>
        <span className="w-4 text-center text-[14px] font-semibold">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(9, value + 1))} className="flex h-7 w-7 items-center justify-center rounded-full bg-panel text-[15px]" aria-label={`More ${l.toLowerCase()}`}>+</button>
      </span>
    </div>
  );
}

/** One passport answer: the value, and Change to open its editor in place. */
function Fact({ id, title, value, editing, setEditing, children }: { id: string; title: string; value: string; editing: string | null; setEditing: (v: string | null) => void; children: React.ReactNode }) {
  const open = editing === id;
  return (
    <div className="py-2.5">
      <div className="flex items-center justify-between gap-3">
        <dt className="text-[12.5px] text-muted">{title}</dt>
        <dd className="flex min-w-0 items-center gap-2.5">
          <span className="truncate text-right text-[13px] font-semibold">{value}</span>
          <button type="button" onClick={() => setEditing(open ? null : id)} className="shrink-0 text-[12px] font-semibold text-accent-dark underline underline-offset-2">
            {open ? "Done" : "Change"}
          </button>
        </dd>
      </div>
      {open && <div className="pb-1 pt-2.5">{children}</div>}
    </div>
  );
}

function YesNo({ q, v, on }: { q: string; v: boolean | null; on: (v: boolean) => void }) {
  return (
    <div>
      <p className="text-[12.5px]">{q}</p>
      <div className="mt-2 flex gap-2">
        {[true, false].map((b) => (
          <button key={String(b)} type="button" onClick={() => on(b)} className={`flex-1 rounded-full border py-2 text-[13px] ${v === b ? "border-accent-dark bg-accent-dark font-semibold text-white" : "border-line/80"}`}>
            {b ? "Yes" : "No"}
          </button>
        ))}
      </div>
    </div>
  );
}
