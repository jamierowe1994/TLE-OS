"use client";

import { useEffect, useRef, useState } from "react";
import type { PhonePerson } from "@/app/api/m/people/route";
import { ErrorLine, PhoneTop, ReachButtons, SearchBox, Spinner } from "../bits";

/**
 * FIND A PERSON: a name in, a number out. Read only.
 *
 * Two answers, like the search bar on the full OS: what the OS already holds
 * comes back as they type, and the full contact book is asked behind it and
 * says it is still looking, because a common surname takes it several seconds.
 */

export default function PhonePeople() {
  const [needle, setNeedle] = useState("");
  const [fast, setFast] = useState<PhonePerson[] | null>(null);
  const [slow, setSlow] = useState<PhonePerson[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slowNote, setSlowNote] = useState<string | null>(null);
  const turn = useRef(0);

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setNeedle(q);
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

  /* The slow half only adds people the fast half did not already show. */
  const shown = new Set((fast ?? []).map((p) => `${p.name.toLowerCase()}|${p.phone.replace(/\D/g, "")}|${p.email.toLowerCase()}`));
  const extra = (slow ?? []).filter((p) => !shown.has(`${p.name.toLowerCase()}|${p.phone.replace(/\D/g, "")}|${p.email.toLowerCase()}`));
  const all = [...(fast ?? []), ...extra];
  const searching = needle.trim().length >= 2;

  return (
    <main>
      <PhoneTop title="Find a Person" />
      <SearchBox value={needle} onChange={setNeedle} placeholder="Name, phone or email" />

      <div className="mt-4">
        {!searching ? (
          <p className="px-1 text-[14px] text-muted">Type at least two letters of their name, or part of their number.</p>
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
    </main>
  );
}
