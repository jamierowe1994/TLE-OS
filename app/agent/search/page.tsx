"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PhonePerson } from "@/app/api/m/people/route";
import type { PhoneProperty } from "@/app/api/m/properties/route";
import { PhoneTop, SearchBox, Spinner, dialable } from "../bits";

/**
 * SEARCH EVERYTHING (3 Oct 2026): Home's search box, from James's mockup -
 * "Search properties, tenants, landlords..." - asks the two phone finders at
 * once and shows both. A person rings from here; a property opens on the
 * Properties tab with the same words.
 */

export default function PhoneSearch() {
  const [needle, setNeedle] = useState("");
  const [people, setPeople] = useState<PhonePerson[] | null>(null);
  const [homes, setHomes] = useState<PhoneProperty[] | null>(null);
  const turn = useRef(0);

  useEffect(() => {
    const term = needle.trim();
    const mine = ++turn.current;
    setPeople(null);
    setHomes(null);
    if (term.length < 2) return;
    const t = window.setTimeout(() => {
      const ask = <T,>(url: string, key: string) =>
        fetch(url, { cache: "no-store" })
          .then((r) => r.json())
          .then((j: Record<string, unknown>) => (Array.isArray(j[key]) ? (j[key] as T[]) : []))
          .catch(() => [] as T[]);
      void ask<PhonePerson>(`/api/m/people?q=${encodeURIComponent(term)}`, "people").then((p) => mine === turn.current && setPeople(p.slice(0, 8)));
      void ask<PhoneProperty>(`/api/m/properties?q=${encodeURIComponent(term)}`, "properties").then((p) => mine === turn.current && setHomes(p.slice(0, 8)));
    }, 300);
    return () => window.clearTimeout(t);
  }, [needle]);

  const searching = needle.trim().length >= 2;

  return (
    <main>
      <PhoneTop title="Search" back="/agent" />
      <SearchBox value={needle} onChange={setNeedle} placeholder="Properties, tenants, landlords..." autoFocus />

      {!searching ? (
        <p className="mt-4 px-1 text-[14px] text-muted">Type at least two letters of a name, a street or a postcode.</p>
      ) : (
        <>
          <h2 className="mb-2 mt-6 px-1 text-[19px]">People</h2>
          {people === null ? (
            <Spinner label="Searching people" className="py-3" />
          ) : people.length === 0 ? (
            <p className="px-1 text-[14px] text-muted">Nobody found.</p>
          ) : (
            <ul className="m-group">
              {people.map((p) => (
                <li key={p.key} className="m-row flex items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-medium">{p.name}</span>
                    <span className="block truncate text-[13px] text-muted">{[p.role, p.context].filter(Boolean).join(" · ")}</span>
                  </span>
                  {dialable(p.phone) && (
                    <a href={`tel:${dialable(p.phone)}`} className="m-btn m-btn-primary m-press !h-9 !px-4 !text-[13.5px]">
                      Call
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}

          <h2 className="mb-2 mt-6 px-1 text-[19px]">Properties</h2>
          {homes === null ? (
            <Spinner label="Searching properties" className="py-3" />
          ) : homes.length === 0 ? (
            <p className="px-1 text-[14px] text-muted">No property found.</p>
          ) : (
            <ul className="m-group">
              {homes.map((h) => (
                <li key={h.key} className="m-row">
                  <Link href={`/agent/properties?q=${encodeURIComponent(h.name)}`} className="flex items-center gap-3 px-4 py-3 active:bg-panel">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15.5px] font-medium">{h.name}</span>
                      <span className="block truncate text-[13px] text-muted">{[h.locality, h.status].filter(Boolean).join(" · ")}</span>
                    </span>
                    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0 text-muted">
                      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}
