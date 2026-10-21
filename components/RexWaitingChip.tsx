"use client";

import { useEffect, useState } from "react";

/**
 * "Waiting for REX" beside a record's save chip (21 Oct 2026, lib/rex-queue).
 * Shown only while a change to this record is kept for when REX is back,
 * and gone by itself once it has been sent.
 */
export default function RexWaitingChip({ refs, className = "" }: { refs: Array<[string, string | number | null | undefined]>; className?: string }) {
  const [n, setN] = useState(0);
  const qs = refs
    .filter(([, id]) => id != null && id !== "")
    .map(([kind, id]) => `ref=${encodeURIComponent(`${kind}:${id}`)}`)
    .join("&");

  useEffect(() => {
    if (!qs) return;
    let gone = false;
    let t: ReturnType<typeof setTimeout> | null = null;
    /* Every twenty seconds while REX is down (a save may have just been
       kept), every two minutes otherwise (one may have just gone). */
    const read = () =>
      fetch(`/api/rex/waiting?${qs}`, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((j: { n?: number; down?: boolean } | null) => {
          if (gone) return;
          if (j) setN(j.n ?? 0);
          t = setTimeout(read, j?.down ? 20_000 : 120_000);
        })
        .catch(() => {
          if (!gone) t = setTimeout(read, 120_000);
        });
    void read();
    return () => {
      gone = true;
      if (t) clearTimeout(t);
    };
  }, [qs]);

  if (!n) return null;
  return (
    <span
      title="Saved here. REX is down for maintenance, so this goes to REX as soon as it is back."
      className={`inline-flex items-center gap-1.5 rounded-full border border-[#5b3a29]/30 bg-[#5b3a29]/10 px-2.5 py-1 text-[11.5px] font-semibold text-[#5b3a29] ${className}`}
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      Waiting for REX{n > 1 ? ` (${n})` : ""}
    </span>
  );
}
