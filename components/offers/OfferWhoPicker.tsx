"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * "Make an offer" on a listing (7 Oct 2026, Howard: "On the listing, could
 * there be a make an offer button").
 *
 * The offer form itself already existed (/offers/new, components/offers/
 * AgentOfferRecorder) but was only reachable from a past viewing's "How did
 * it land?", so nobody could find it. This asks the one thing the form needs
 * first - who the offer is from - and opens it with the home and the person
 * chosen. Everything else (rent, move-in, who's moving in, the passport
 * questions, the tenant's agreement) is asked by the form as before.
 *
 * The people offered are the ones who viewed this home and the ones who
 * enquired on it, with "Someone else" for anybody who isn't either. An email
 * is required because the offer is filed against their passport.
 */

export type OfferPerson = { key: string; name: string; email: string; phone: string; note: string };

const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim());
const inp = "mt-1.5 block h-11 w-full min-w-0 rounded-[12px] border border-line/80 bg-white px-3.5 text-[14px] outline-none focus:border-accent-dark";

export default function OfferWhoPicker({
  listingId,
  address,
  asking,
  people,
  loading,
  onClose,
}: {
  listingId: string;
  address: string;
  asking: string;
  people: OfferPerson[];
  loading: boolean;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<OfferPerson | null>(null);
  const [someoneElse, setSomeoneElse] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState("");

  const shown = useMemo(() => {
    const qy = query.trim().toLowerCase();
    return qy ? people.filter((p) => `${p.name} ${p.email} ${p.phone}`.toLowerCase().includes(qy)) : people;
  }, [people, query]);

  const choose = (p: OfferPerson) => {
    setSomeoneElse(false);
    setPicked(p);
    setName(p.name);
    setEmail(p.email);
    setErr("");
  };

  const go = () => {
    const n = name.trim();
    const e = email.trim();
    if (!n) return setErr("Put in their name.");
    if (!emailOk(e)) return setErr("Put in their email address. The offer is saved against it, with their passport.");
    window.location.href = `/offers/new?${new URLSearchParams({ listing: listingId, name: n, email: e })}`;
  };

  const ready = someoneElse || picked;

  return (
    <div className="fixed inset-0 z-[140] flex items-center justify-center p-4" data-steve-never>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/45" />
      <div className="fade-up relative flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-line/80 bg-page shadow-[0_30px_70px_-20px_rgba(0,0,0,0.5)]">
        <div className="flex shrink-0 items-start gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[19px] leading-tight">Make an Offer</h2>
            <p className="mt-0.5 truncate text-[12px] text-muted">
              {address}
              {asking ? ` · advertised at ${asking}` : ""}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/60 bg-white text-[12px] text-muted hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <p className="text-[13px] font-semibold text-ink">Who is the offer from?</p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">
            Pick them and the offer form opens with this home and their passport. You fill in the rest with them.
          </p>

          {people.length > 5 && (
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by name, email or phone" className={`${inp} mt-3`} />
          )}

          <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2">
            {loading && !people.length && <li className="rounded-[14px] border border-line/60 bg-white px-4 py-3 text-[12.5px] text-muted">Reading who has viewed and enquired…</li>}
            {!loading && !people.length && (
              <li className="rounded-[14px] border border-line/60 bg-white px-4 py-3 text-[12.5px] text-muted">Nobody has viewed or enquired on this home yet. Use Someone else below.</li>
            )}
            {shown.map((p) => {
              const on = !someoneElse && picked?.key === p.key;
              return (
                <li key={p.key}>
                  <button
                    type="button"
                    onClick={() => choose(p)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-[14px] border px-4 py-3 text-left transition-colors ${on ? "border-accent-dark bg-white" : "border-line/60 bg-white hover:border-ink/40"}`}
                  >
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${on ? "border-accent-dark bg-accent-dark text-white" : "border-line"}`}>
                      {on && <span className="h-2 w-2 rounded-full bg-white" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] font-semibold">{p.name}</span>
                      <span className="block truncate text-[11.5px] text-muted">{[p.note, p.email || "No email on their record"].filter(Boolean).join(" · ")}</span>
                    </span>
                  </button>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => {
                  setSomeoneElse(true);
                  setPicked(null);
                  setName("");
                  setEmail("");
                  setErr("");
                }}
                aria-pressed={someoneElse}
                className={`flex w-full items-center gap-3 rounded-[14px] border border-dashed px-4 py-3 text-left transition-colors ${someoneElse ? "border-accent-dark bg-white" : "border-line bg-transparent hover:border-ink/40"}`}
              >
                <DoodleIcon name="user" size={14} className="text-accent-dark" />
                <span className="text-[13.5px] font-semibold">Someone else</span>
              </button>
            </li>
          </ul>

          {/* Name and email, typed for someone new, or only the email when the
              person picked has none on their record. */}
          {ready && (someoneElse || !emailOk(picked?.email ?? "")) && (
            <div className="mt-4 grid gap-3 rounded-[16px] border border-line/60 bg-white p-4">
              {someoneElse && (
                <label className="block">
                  <span className="text-[12.5px] font-semibold text-ink">Their name</span>
                  <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" className={inp} />
                </label>
              )}
              <label className="block">
                <span className="text-[12.5px] font-semibold text-ink">Their email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" className={inp} />
                <span className="mt-1 block text-[11px] text-muted">The offer and their passport are filed against it.</span>
              </label>
            </div>
          )}

          {err && <p className="mt-3 rounded-[12px] bg-[#fdefec] px-3.5 py-2.5 text-[12.5px] text-[#9d4340]">{err}</p>}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-line/70 px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-full px-4 py-2.5 text-[12.5px] font-semibold text-muted hover:text-ink">
            Cancel
          </button>
          <button
            type="button"
            disabled={!ready}
            onClick={go}
            className="press-ring flex items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[12.5px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            <DoodleIcon name="coin" size={14} />
            Start the offer
          </button>
        </div>
      </div>
    </div>
  );
}
