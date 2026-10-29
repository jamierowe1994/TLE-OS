"use client";

import { useCallback, useEffect, useState } from "react";
import SignInAgain from "@/components/SignInAgain";
import type { Withdrawn, WithdrawnChoice } from "@/lib/listing-withdrawn";

/**
 * "This home was withdrawn - what now?" on the listing's page (James, 29 Oct
 * 2026, after Lorna Fieldson's 15 Egton Street: withdrawn by the landlord on
 * 25 Sep, still On the market here, its terms still counted as out).
 *
 * Shows only when something happened: the listing was withdrawn in the
 * listings system, or its let fell through (cancelled in Propoly or on the
 * let's page). Three answers, then one line saying which was chosen, with
 * Change to answer again at any point. See lib/listing-withdrawn.
 */

const day = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : null);
const stamp = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const tidy = (why: string | null) => (why ? why.charAt(0).toUpperCase() + why.slice(1).toLowerCase() : null);

export default function WithdrawnBox({ listingId, address, onChanged }: { listingId: string; address: string; onChanged?: () => void }) {
  const [w, setW] = useState<Withdrawn | null>(null);
  const [asking, setAsking] = useState(false);
  const [pick, setPick] = useState<WithdrawnChoice | null>(null);
  const [cancelTerms, setCancelTerms] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [did, setDid] = useState<string[]>([]);

  const load = useCallback(() => {
    fetch(`/api/listings/withdrawn?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; withdrawn?: Withdrawn | null }) => {
        if (!j.ok) return;
        setW(j.withdrawn ?? null);
        setAsking(Boolean(j.withdrawn && !j.withdrawn.choice));
      })
      .catch(() => {});
  }, [listingId]);
  useEffect(load, [load]);

  if (!w) return null;

  const gone = w.source === "listing";
  const when = day(w.on);
  const what = gone
    ? `${address} was withdrawn${when ? ` on ${when}` : ""}${w.why ? `: ${tidy(w.why)}` : ""}.`
    : `The let${w.tenants ? ` to ${w.tenants}` : ""} fell through${when ? ` on ${when}` : ""}${w.why ? `: ${w.why}` : ""}.`;
  const options: { id: WithdrawnChoice; label: string; sub: string }[] = [
    {
      id: "off",
      label: gone ? "Keep it off the market" : "Take it off the market",
      sub: gone
        ? w.onPortals ? "It stays withdrawn, and the portals are told to take it down." : "It stays withdrawn. Nothing else changes."
        : "Withdrawn, and taken off Rightmove, OnTheMarket and Zoopla.",
    },
    { id: "relist", label: "Put it back on the market", sub: "Available again, Let Agreed taken off, and back on Rightmove, OnTheMarket and Zoopla." },
    { id: "leave", label: "Leave it as it is", sub: "Nothing changes, and this stops asking. You can change your mind here later." },
  ];
  const chosenWords = (c: WithdrawnChoice) => (c === "off" ? (gone ? "Kept off the market" : "Taken off the market") : c === "relist" ? "Put back on the market" : "Left as it is");

  async function go() {
    if (!pick) return;
    setBusy(true);
    setError(null);
    setSignIn(false);
    const j = (await fetch("/api/listings/withdrawn", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: listingId, choice: pick, cancelTerms: pick === "off" && cancelTerms }),
    })
      .then((r) => r.json())
      .catch(() => null)) as { ok?: boolean; error?: string; signIn?: boolean; did?: string[] } | null;
    setBusy(false);
    if (!j?.ok) {
      setError(j?.error ?? "That didn't go through. Try again in a minute.");
      setSignIn(Boolean(j?.signIn));
      return;
    }
    setDid(j.did ?? []);
    setPick(null);
    load();
    onChanged?.();
  }

  if (!asking && w.choice) {
    return (
      <div className="rounded-2xl border border-line/70 bg-white px-4 py-3 text-[12.5px] leading-relaxed text-muted">
        <span className="text-ink">{what}</span> {chosenWords(w.choice.choice)} by {w.choice.by}, {stamp(w.choice.at)}.{" "}
        <button type="button" onClick={() => { setAsking(true); setDid([]); }} className="text-ink underline">
          Change
        </button>
        {did.length > 0 && <span className="mt-1 block text-[11.5px]">{did.join(" ")}</span>}
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-accent/40 bg-accent-soft/30 p-4 sm:p-5" aria-label="This home was withdrawn">
      <h2 className="text-[15px] font-normal text-ink">{gone ? "This Home Was Withdrawn" : "This Let Fell Through"}</h2>
      <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{what} What should happen to the listing here?</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="What should happen">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={pick === o.id}
            onClick={() => setPick(o.id)}
            className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${pick === o.id ? "border-ink bg-white" : "border-line/80 bg-white/70 hover:border-ink/40"}`}
          >
            <span className="block text-[13px] text-ink">{o.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{o.sub}</span>
          </button>
        ))}
      </div>
      {pick === "off" && w.terms.length > 0 && (
        <label className="mt-3 flex items-start gap-2 text-[12.5px] text-ink">
          <input type="checkbox" checked={cancelTerms} onChange={(e) => setCancelTerms(e.target.checked)} className="mt-0.5" />
          <span>
            Cancel the terms still out to {w.terms.map((t) => `${t.name}${t.sentAt ? ` (sent ${stamp(t.sentAt)})` : ""}`).join(" and ")}.{" "}
            <span className="text-muted">They come off Terms Out and stop being chased. Nobody is emailed.</span>
          </span>
        </label>
      )}
      {error && <p className="mt-3 text-[12px] text-accent-dark">{error}</p>}
      {signIn && <div className="mt-3"><SignInAgain compact doing="carry on" onDone={() => void go()} /></div>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" disabled={!pick || busy} onClick={() => void go()} className="rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-page disabled:opacity-40">
          {busy ? "Doing it…" : "Confirm"}
        </button>
        {w.choice && (
          <button type="button" onClick={() => { setAsking(false); setPick(null); setError(null); }} className="text-[12px] text-muted underline">
            Keep it as it was
          </button>
        )}
        <span className="text-[11.5px] text-muted">Nobody is emailed.</span>
      </div>
    </section>
  );
}
