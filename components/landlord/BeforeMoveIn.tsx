"use client";

import { useState } from "react";
import type { ViewPrep } from "@/lib/landlord-view";

/**
 * Before moving day (1 Oct 2026): the works the landlord agreed to when they
 * approved the offer, to tick off before the tenant moves in. On the sample
 * a tick only moves on the screen.
 */
export default function BeforeMoveIn({ items, sample, className }: { items: ViewPrep[]; sample?: boolean; className: string }) {
  const [list, setList] = useState(items);
  const [err, setErr] = useState("");
  const left = list.filter((i) => !i.done).length;
  const due = list.find((i) => i.dueOn)?.dueOn ?? null;
  const dueWords = due ? new Date(`${due}T12:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }) : null;

  async function tick(id: string, done: boolean) {
    setErr("");
    setList((l) => l.map((i) => (i.id === id ? { ...i, done } : i)));
    if (sample) return;
    const r = await fetch("/api/landlord/prep", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, done }) })
      .then((x) => x.json())
      .catch(() => null);
    if (!r?.ok) {
      setList((l) => l.map((i) => (i.id === id ? { ...i, done: !done } : i)));
      setErr(r?.error ?? "That didn't save. Try again.");
    }
  }

  return (
    <section className={className} id="before-moving-day" data-search>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[18px]">Before Moving Day</h2>
        <span className="text-[11.5px] text-muted">{left ? `${left} to do${dueWords ? ` by ${dueWords}` : ""}` : "All done"}</span>
      </div>
      <p className="mt-1 text-[13px] text-muted">What you agreed to when you approved the offer. Tick each one off as it is done.</p>
      <ul className="mt-3 space-y-2">
        {list.map((i) => (
          <li key={i.id}>
            <label className={`flex cursor-pointer items-center gap-3 rounded-[14px] border px-4 py-3 transition-colors ${i.done ? "border-line/60 bg-black/[0.02]" : "border-line/80 bg-white"}`}>
              <input type="checkbox" checked={i.done} onChange={(e) => void tick(i.id, e.target.checked)} className="h-4 w-4 shrink-0 accent-[#56423e]" />
              <span className={`min-w-0 flex-1 text-[14px] ${i.done ? "text-muted line-through" : ""}`}>{i.title}</span>
            </label>
          </li>
        ))}
      </ul>
      {err && <p className="mt-2 text-[12.5px] text-[#9d4340]">{err}</p>}
    </section>
  );
}
