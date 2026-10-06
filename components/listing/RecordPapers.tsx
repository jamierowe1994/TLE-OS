"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The papers already filed on the home's property record - the landlord
 * registration evidence, the terms of business, a licence - shown on the
 * listing's Documents tab (James, 6 Oct 2026). Hidden when there are none.
 */
type Paper = { field: string; label: string; name: string; url: string };

export default function RecordPapers({ listingId }: { listingId: string }) {
  const [papers, setPapers] = useState<Paper[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setPapers(null);
    setProblem(null);
    if (Number(listingId) < 0) {
      setPapers([]);
      return;
    }
    fetch(`/api/listings/record-files?id=${encodeURIComponent(listingId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; files?: Paper[]; error?: string }) => {
        if (!live) return;
        if (j.ok) setPapers(j.files ?? []);
        else setProblem(j.error ?? "The property record's papers did not load.");
      })
      .catch(() => live && setProblem("The property record's papers did not load."));
    return () => {
      live = false;
    };
  }, [listingId]);

  if (papers && papers.length === 0 && !problem) return null;

  return (
    <div className="mb-5 rounded-[22px] border border-line/50 bg-white p-5">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">On the property record</p>
      <p className="mt-1 mb-3 text-[12.5px] text-muted">Already filed against this home, so there is nothing to upload again.</p>
      {problem ? (
        <p className="text-[12px] text-accent-dark">{problem}</p>
      ) : !papers ? (
        <p className="flex items-center gap-2 text-[12px] text-muted">
          <span className="block h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Looking at the property record…
        </p>
      ) : (
        <ul className="divide-y divide-line/40">
          {papers.map((p) => (
            <li key={p.url}>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 py-2.5 transition-colors hover:bg-page">
                <DoodleIcon name="doc" size={14} className="shrink-0 text-accent-dark" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold">{p.label}</span>
                  <span className="block truncate text-[11.5px] text-muted">{p.name}</span>
                </span>
                <span className="text-[11.5px] font-semibold text-accent-dark">Open</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
