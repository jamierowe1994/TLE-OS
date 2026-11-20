"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import FindingData from "@/components/business/FindingData";

/**
 * THE CLEAN SWEEP'S PAPERS ON THE HOME'S PAGE (Josel Banagua, 20 Oct 2026:
 * "a dedicated tab for each property where all relevant information could be
 * stored and easily accessed in one place").
 *
 * The tenancy agreement, deposit certificate, inventory, landlord ID, terms
 * of business and the rest that the clean sweep gathered from REX PM,
 * Propoly, PayProp and Flatfair. Until now only the clean sweep screen showed
 * them. The office sees every paper. An agent, on a home in their own book,
 * sees the tenancy papers only (lib/record-papers AGENT_HOME_PAPERS, the list
 * lib/r2-access opens for them; Lianna Denholm, ticket 35aa0745, 20 Nov 2026:
 * "I cant see any of the leases"). ID and references stay with the office.
 */

type File = { key: string; field: string; label: string; name: string; sizeBytes: number; at: string | null; where: string | null; url: string };

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

export default function RecordFiles({ listing, listings }: { listing: string; listings: string[] }) {
  const [state, setState] = useState<{ s: "loading" } | { s: "ready"; office: boolean; files: File[] } | { s: "failed"; error: string }>({ s: "loading" });

  useEffect(() => {
    let live = true;
    fetch(`/api/portfolio/record-files?listing=${encodeURIComponent(listing)}&listings=${encodeURIComponent(listings.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setState(j?.ok ? { s: "ready", office: Boolean(j.office), files: j.files ?? [] } : { s: "failed", error: j?.error ?? "The papers couldn't be read." }); })
      .catch(() => live && setState({ s: "failed", error: "The papers couldn't be read. Try again in a minute." }));
    return () => { live = false; };
  }, [listing, listings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const office = state.s === "ready" && state.office;
  const groups = state.s === "ready" ? [...new Set(state.files.map((f) => f.label))] : [];
  return (
    <section className="mt-5">
      <p className="mb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">From the Clean Sweep</p>
      <p className="mb-3 max-w-[72ch] text-[12px] leading-relaxed text-muted">
        {state.s !== "ready"
          ? "What the clean sweep gathered for this home from the old systems."
          : office
            ? "What the clean sweep gathered for this home from the old systems. Agents see the tenancy papers; ID and references are seen by the office only."
            : "The tenancy papers the clean sweep gathered for this home from the old systems. ID, references and the landlord's own papers stay with the office."}
      </p>
      {state.s === "loading" ? (
        <FindingData label="Reading the clean sweep's papers" />
      ) : state.s === "failed" ? (
        <p className="text-[12.5px] text-accent-dark">{state.error}</p>
      ) : !state.files.length ? (
        <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">{office ? "The clean sweep holds no papers for this home." : "The clean sweep holds no tenancy papers for this home."}</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {groups.map((g) => (
            <div key={g} className="rounded-xl border border-line/50 bg-white px-4 py-3">
              <p className="text-[12.5px] font-semibold">{g}</p>
              <ul className="mt-1.5 space-y-1">
                {state.files.filter((f) => f.label === g).map((f) => (
                  <li key={f.key} className="flex min-w-0 items-center gap-2 text-[12px]">
                    <DoodleIcon name="folder" size={12} className="shrink-0 text-accent-dark" />
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="min-w-0 truncate underline-offset-2 hover:underline">{f.name}</a>
                    <span className="ml-auto shrink-0 text-[11px] text-muted">{[f.where, day(f.at)].filter(Boolean).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
