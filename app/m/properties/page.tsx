"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { PhoneProperty } from "@/app/api/m/properties/route";
import { ErrorLine, PhoneTop, ReachButtons, SearchBox, Spinner, dialable, mapsHref } from "../bits";

/**
 * FIND A PROPERTY: the facts an agent is asked on a doorstep. Read only.
 * Rent, whether it is still available, who lives there, who owns it, and the
 * way there.
 */

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null;

export default function PhoneProperties() {
  const [needle, setNeedle] = useState("");
  const [hits, setHits] = useState<PhoneProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const turn = useRef(0);

  useEffect(() => {
    const term = needle.trim();
    const mine = ++turn.current;
    setError(null);
    setHits(null);
    if (term.length < 2) return;
    const t = window.setTimeout(async () => {
      try {
        const r = await fetch(`/api/m/properties?q=${encodeURIComponent(term)}`, { cache: "no-store" });
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; properties?: PhoneProperty[]; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "The search did not answer.");
        if (mine === turn.current) setHits(j.properties ?? []);
      } catch (e) {
        if (mine === turn.current) {
          setHits([]);
          setError((e as Error).message);
        }
      }
    }, 320);
    return () => window.clearTimeout(t);
  }, [needle]);

  const searching = needle.trim().length >= 2;

  return (
    <main>
      <PhoneTop title="Find a Property" />
      <SearchBox value={needle} onChange={setNeedle} placeholder="Street, town or postcode" />

      <div className="mt-4">
        {!searching ? (
          <p className="px-1 text-[14px] text-muted">Type part of the address or the postcode.</p>
        ) : error ? (
          <ErrorLine text={error} />
        ) : hits === null ? (
          <Spinner label="Searching your properties" className="py-4" />
        ) : hits.length === 0 ? (
          <p className="py-6 text-center text-[14px] text-muted">No property found for &ldquo;{needle.trim()}&rdquo;.</p>
        ) : (
          <ul className="grid grid-cols-1 gap-3">
            {hits.map((p) => {
              const expanded = open === p.key;
              return (
                <li key={p.key} className="overflow-hidden rounded-[20px] border border-line/70 bg-card">
                  <button type="button" onClick={() => setOpen(expanded ? null : p.key)} className="flex w-full items-center gap-3 p-3 text-left" aria-expanded={expanded}>
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-panel text-muted">
                        <DoodleIcon name="home" size={22} />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15.5px] font-semibold leading-snug">{p.name}</span>
                      <span className="block truncate text-[13px] text-muted">{p.locality}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
                        {p.rent && <span className="figures">{p.rent}</span>}
                        <span className="rounded-full bg-accent-soft px-2 py-[1px] text-[11.5px] font-semibold text-accent-dark">{p.status}</span>
                      </span>
                    </span>
                  </button>

                  {expanded && (
                    <div className="border-t border-line/50 px-4 pb-4 pt-3 text-[14px]">
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
                        {p.availableFrom && (
                          <>
                            <dt className="text-muted">Available</dt>
                            <dd>{fmtDate(p.availableFrom)}</dd>
                          </>
                        )}
                        {p.propertyType && (
                          <>
                            <dt className="text-muted">Type</dt>
                            <dd>{p.propertyType}</dd>
                          </>
                        )}
                        {p.postcode && (
                          <>
                            <dt className="text-muted">Postcode</dt>
                            <dd>{p.postcode}</dd>
                          </>
                        )}
                      </dl>

                      <a
                        href={mapsHref(`${p.name}, ${p.locality}`, p.lat, p.lng)}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 flex h-12 items-center justify-center gap-2 rounded-xl border border-line/70 bg-card text-[14.5px] font-semibold"
                      >
                        <DoodleIcon name="target" size={17} /> Directions
                      </a>

                      <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Living There</p>
                      {p.tenants.length === 0 ? (
                        <p className="mt-1 text-muted">No tenant on the record.</p>
                      ) : (
                        p.tenants.map((t) => (
                          <div key={t.name} className="mt-1 flex items-center justify-between gap-3">
                            <span className="font-semibold">{t.name}</span>
                            {dialable(t.phone) && (
                              <a href={`tel:${dialable(t.phone)}`} className="flex h-10 items-center gap-1.5 rounded-lg border border-line/70 px-3 text-[13.5px] font-semibold">
                                <DoodleIcon name="call" size={15} /> Call
                              </a>
                            )}
                          </div>
                        ))
                      )}

                      {p.landlord && (
                        <>
                          <p className="mt-4 text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">Landlord</p>
                          <p className="mt-1 font-semibold">{p.landlord.name}</p>
                          <ReachButtons phone={p.landlord.phone} email={p.landlord.email} />
                        </>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
