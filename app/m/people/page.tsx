"use client";

import { useEffect, useRef, useState } from "react";
import type { PhonePerson } from "@/app/api/m/people/route";
import type { NearbyPerson } from "@/app/api/m/nearby/route";
import { ErrorLine, PhoneTop, ReachButtons, SearchBox, Spinner } from "../bits";
import { RadiusBox, RadiusSheet, type RadiusPick } from "../radius";

/**
 * TENANT and LANDLORD: a name in, a number out. Read only.
 *
 * Two answers, like the search bar on the full OS: what the OS already holds
 * comes back as they type, and the full contact book is asked behind it and
 * says it is still looking, because a common surname takes it several seconds.
 *
 * Under the name box, Search by Radius (James, 18 Sep 2026): everyone with a
 * home, or an enquiry, within a distance of where you stand or a postcode.
 * Those come back as short rows that open out when tapped.
 */

export default function PhonePeople() {
  const [needle, setNeedle] = useState("");
  const [fast, setFast] = useState<PhonePerson[] | null>(null);
  const [slow, setSlow] = useState<PhonePerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slowNote, setSlowNote] = useState<string | null>(null);
  const turn = useRef(0);
  const [side, setSide] = useState<"tenant" | "landlord" | null>(null);
  const [sheet, setSheet] = useState(false);
  const [radius, setRadius] = useState<RadiusPick | null>(null);
  const [near, setNear] = useState<NearbyPerson[] | null>(null);
  const [nearError, setNearError] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const q = sp.get("q");
    if (q) setNeedle(q);
    const w = sp.get("who");
    setSide(w === "tenant" || w === "landlord" ? w : null);
  }, []);

  useEffect(() => {
    const term = needle.trim();
    const mine = ++turn.current;
    setError(null);
    setSlowNote(null);
    if (term.length < 2) {
      setFast(null);
      setSlow(null);
      return;
    }
    /* Typing a name takes over from a radius search. */
    setRadius(null);
    setFast(null);
    setSlow(null);
    const t = window.setTimeout(async () => {
      const ask = (extra: string) =>
        fetch(`/api/m/people?q=${encodeURIComponent(term)}${extra}`, { cache: "no-store" }).then(async (r) => {
          const j = (await r.json().catch(() => ({}))) as { ok?: boolean; people?: PhonePerson[]; error?: string };
          if (!r.ok || !j.ok) throw new Error(j.error ?? "The search did not answer.");
          return j.people ?? [];
        });
      ask("")
        .then((p) => mine === turn.current && setFast(p))
        .catch((e: Error) => mine === turn.current && (setFast([]), setError(e.message)));
      ask("&rex=1")
        .then((p) => mine === turn.current && setSlow(p))
        .catch((e: Error) => mine === turn.current && (setSlow([]), setSlowNote(e.message)));
    }, 320);
    return () => window.clearTimeout(t);
  }, [needle]);

  useEffect(() => {
    if (!radius) return setNear(null);
    setNear(null);
    setNearError(null);
    const sp = new URLSearchParams({ who: side ?? "tenant", lat: String(radius.lat), lng: String(radius.lng), miles: String(radius.miles) });
    fetch(`/api/m/nearby?${sp.toString()}`, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as { ok?: boolean; people?: NearbyPerson[]; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "The radius search did not answer.");
        setNear(j.people ?? []);
      })
      .catch((e: Error) => {
        setNear([]);
        setNearError(e.message);
      });
  }, [radius, side]);

  /* The slow half only adds people the fast half did not already show. */
  const shown = new Set((fast ?? []).map((p) => `${p.name.toLowerCase()}|${p.phone.replace(/\D/g, "")}|${p.email.toLowerCase()}`));
  const extra = (slow ?? []).filter((p) => !shown.has(`${p.name.toLowerCase()}|${p.phone.replace(/\D/g, "")}|${p.email.toLowerCase()}`));
  /* Only the other side is left out - a plain contact could be either. */
  const other = side === "tenant" ? /landlord/i : side === "landlord" ? /tenant|applicant/i : null;
  const all = [...(fast ?? []), ...extra].filter((p) => !other || !other.test(p.role));
  const searching = needle.trim().length >= 2;
  const title = side === "tenant" ? "Tenant" : side === "landlord" ? "Landlord" : "Find a Person";

  return (
    <main>
      <PhoneTop title={title} />
      <SearchBox value={needle} onChange={setNeedle} placeholder="Name, phone or email" />
      {side && (
        <RadiusBox
          picked={radius}
          onOpen={() => setSheet(true)}
        />
      )}

      <div className="mt-4">
        {radius ? (
          <>
            <div className="mb-2 flex items-center justify-between px-1">
              <p className="text-[13px] text-muted">
                {near ? `${near.length} ${side === "landlord" ? (near.length === 1 ? "landlord" : "landlords") : near.length === 1 ? "tenant" : "tenants"}, nearest first` : ""}
              </p>
              <button type="button" onClick={() => setRadius(null)} className="h-9 px-1 text-[13px] font-semibold text-accent-dark">
                Clear
              </button>
            </div>
            {nearError && <ErrorLine text={nearError} />}
            {near === null ? (
              <Spinner label="Looking around" className="py-4" />
            ) : near.length === 0 && !nearError ? (
              <p className="py-6 text-center text-[14px] text-muted">Nobody within {radius.miles} {radius.miles === 1 ? "mile" : "miles"}. Try further out.</p>
            ) : (
              <ul className="grid grid-cols-1 gap-2">
                {near.map((p) => (
                  <OpenRow key={p.key} p={p} />
                ))}
              </ul>
            )}
          </>
        ) : !searching ? (
          <p className="px-1 text-[14px] text-muted">
            Type at least two letters of their name, or part of their number{side ? ", or search by radius" : ""}.
          </p>
        ) : (
          <>
            {error && <ErrorLine text={error} />}
            {fast === null && <Spinner label="Searching" className="py-4" />}
            <ul className="grid grid-cols-1 gap-3">
              {all.map((p) => (
                <li key={p.key} className="rounded-[20px] border border-line/70 bg-card p-4">
                  <p className="text-[17px] font-semibold leading-snug">{p.name}</p>
                  <p className="mt-0.5 text-[13px] text-muted">{[p.role, p.context].filter(Boolean).join(" · ")}</p>
                  {(p.phone || p.email) && (
                    <p className="mt-2 break-words text-[14.5px]">
                      {p.phone && <span className="figures mr-3 font-semibold">{p.phone}</span>}
                      {p.email && <span className="text-muted">{p.email}</span>}
                    </p>
                  )}
                  <ReachButtons phone={p.phone} email={p.email} />
                </li>
              ))}
            </ul>
            {fast !== null && slow === null && <Spinner label="Checking the full contact book" className="py-4" />}
            {slowNote && <p className="mt-3 text-[13px] text-muted">{slowNote}</p>}
            {fast !== null && slow !== null && all.length === 0 && !error && (
              <p className="py-6 text-center text-[14px] text-muted">Nobody found for &ldquo;{needle.trim()}&rdquo;.</p>
            )}
          </>
        )}
      </div>

      {sheet && (
        <RadiusSheet
          start={radius}
          onClose={() => setSheet(false)}
          onPick={(p) => {
            setSheet(false);
            setNeedle("");
            setRadius(p);
          }}
        />
      )}
    </main>
  );
}

/** A radius result: one line to scan, and everything else when tapped. */
function OpenRow({ p }: { p: NearbyPerson }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="rounded-[20px] border border-line/70 bg-card">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold leading-snug">{p.name}</span>
          <span className="block truncate text-[13px] text-muted">{[p.role, p.context].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="figures shrink-0 text-[14px] text-muted">{p.miles < 0.1 ? "< 0.1 mi" : `${p.miles} mi`}</span>
        <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 text-muted" style={{ transform: open ? "rotate(90deg)" : undefined, transition: "transform 200ms" }}>
          <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open && (
        <div className="border-t border-line/50 px-4 pb-4 pt-3">
          {(p.phone || p.email) && (
            <p className="break-words text-[14.5px]">
              {p.phone && <span className="figures mr-3 font-semibold">{p.phone}</span>}
              {p.email && <span className="text-muted">{p.email}</span>}
            </p>
          )}
          <ReachButtons phone={p.phone} email={p.email} />
        </div>
      )}
    </li>
  );
}
