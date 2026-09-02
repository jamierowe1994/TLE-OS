"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The search bar at the top. Searches THIS page: every panel that carries
 * data-search is shown or hidden by whether its text contains what was
 * typed, so "gas" leaves the certificate, "presentation" leaves the deck.
 * Clearing the box brings everything back. Nothing leaves the browser.
 */
export default function FileSearch() {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<{ shown: number; total: number } | null>(null);

  useEffect(() => {
    const needle = q.trim().toLowerCase();
    const panels = document.querySelectorAll<HTMLElement>("[data-search]");
    let shown = 0;
    panels.forEach((el) => {
      /* textContent, not innerText: innerText is empty on a hidden element,
         so a panel hidden by the last keystroke could never come back. */
      const hit = !needle || (el.textContent ?? "").toLowerCase().includes(needle);
      el.hidden = !hit;
      if (hit) shown++;
    });
    setHits(needle ? { shown, total: panels.length } : null);
    return () => panels.forEach((el) => { el.hidden = false; });
  }, [q]);

  return (
    <label className="flex min-w-0 flex-1 items-center gap-2.5 rounded-full bg-white px-4 py-2.5 text-[12.5px] ring-1 ring-transparent transition-shadow focus-within:ring-ink/20">
      <DoodleIcon name="search" size={15} className="shrink-0 text-muted" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Escape") setQ(""); }}
        placeholder="Search your property file"
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        aria-label="Search your property file"
      />
      {hits && (
        <span className={`shrink-0 text-[11px] ${hits.shown ? "text-muted" : "text-accent-dark"}`}>
          {hits.shown ? `${hits.shown} of ${hits.total}` : "nothing matches"}
        </span>
      )}
      {q && (
        <button type="button" onClick={() => setQ("")} aria-label="Clear" className="text-muted hover:text-ink">
          <DoodleIcon name="cross" size={12} />
        </button>
      )}
    </label>
  );
}
