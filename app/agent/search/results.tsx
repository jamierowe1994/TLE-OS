"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { PhonePerson } from "@/app/api/m/people/route";
import type { PhoneProperty } from "@/app/api/m/properties/route";
import { Spinner, dialable } from "../bits";

/**
 * What Search Everything finds: people and properties, asked of the two phone
 * finders at once. Shared by the search page and by Home's search box, which
 * floats up and shows these under it (components/app/FloatSearch).
 */
export default function SearchResults({ needle, flat = false }: { needle: string; flat?: boolean }) {
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

  if (needle.trim().length < 2) return <p className="px-5 py-4 text-[14px] text-muted">Type at least two letters of a name, a street or a postcode.</p>;

  const group = flat ? "" : "m-group";
  return (
    <div className={flat ? "py-2" : ""}>
      <h2 className={`mb-2 px-5 text-[17px] ${flat ? "mt-2" : "mt-6 !px-1"}`}>People</h2>
      {people === null ? (
        <Spinner label="Searching people" className="py-3" />
      ) : people.length === 0 ? (
        <p className="px-5 pb-2 text-[14px] text-muted">Nobody found.</p>
      ) : (
        <ul className={group}>
          {people.map((p) => (
            <li key={p.key} className="m-row flex items-center gap-3 px-5 py-3">
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

      <h2 className={`mb-2 px-5 text-[17px] ${flat ? "mt-4" : "mt-6 !px-1"}`}>Properties</h2>
      {homes === null ? (
        <Spinner label="Searching properties" className="py-3" />
      ) : homes.length === 0 ? (
        <p className="px-5 pb-3 text-[14px] text-muted">No property found.</p>
      ) : (
        <ul className={group}>
          {homes.map((h) => (
            <li key={h.key} className="m-row">
              <Link href={`/agent/properties?q=${encodeURIComponent(h.name)}`} className="flex items-center gap-3 px-5 py-3 active:bg-panel">
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
    </div>
  );
}
