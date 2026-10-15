"use client";

import { useState } from "react";
import { toast } from "@/lib/toast";
import type { OfferPart } from "@/lib/offer-people-shape";

/**
 * Each other adult on an offer, as the agent sees it (James, 14 Oct 2026):
 * filled in, or still with them. Copy link to send it again; Fill it in for
 * them opens their part, and saving it there marks it as done by the agent.
 */
export default function OfferPartsList({ parts }: { parts: OfferPart[] }) {
  const [open, setOpen] = useState<number | null>(null);
  if (!parts.length) return null;
  const copy = async (p: OfferPart) => {
    try {
      await navigator.clipboard.writeText(p.link);
      toast(`${p.name.split(/\s+/)[0]}'s link is copied.`);
    } catch {
      window.prompt("Copy this link", p.link);
    }
  };
  return (
    <div className="mt-3 rounded-2xl border border-line/50 bg-white">
      <p className="px-3.5 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">The other {parts.length === 1 ? "adult" : "adults"} moving in</p>
      <ul className="divide-y divide-line/40">
        {parts.map((p, i) => (
          <li key={p.link} className="px-3.5 py-3 text-[12.5px]">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{p.name}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${p.filled ? "bg-[#f1f4ec] text-[#56634a]" : "bg-[#fdf3dc] text-[#8a5a00]"}`}>
                {p.filled ? p.by ?? "Filled in" : "Waiting for them"}
              </span>
              <span className="ml-auto flex gap-1.5">
                {p.filled ? (
                  <button type="button" onClick={() => setOpen(open === i ? null : i)} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold hover:border-ink/40">
                    {open === i ? "Hide" : "Their answers"}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={() => void copy(p)} className="rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold hover:border-ink/40">
                      Copy link
                    </button>
                    <a href={p.link} target="_blank" rel="noreferrer" className="rounded-full bg-accent-dark px-3 py-1 text-[11.5px] font-semibold text-white">
                      Fill it in for them
                    </a>
                  </>
                )}
              </span>
            </div>
            {p.filled && open === i && (
              <dl className="mt-2.5 grid gap-y-1.5">
                {p.lines.map((l) => (
                  <div key={l.label} className="flex gap-2">
                    <dt className="w-36 shrink-0 text-muted">{l.label}</dt>
                    <dd className="min-w-0 break-words">{l.value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
