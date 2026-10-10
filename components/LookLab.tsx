"use client";

import { useEffect, useState } from "react";
import { fetchMe } from "@/lib/me";
import { LAB_LAYOUTS, LAB_PALETTES, readLab, saveLab, type LabChoice } from "@/lib/style-lab";

/**
 * The look lab's picker (James, 10 Oct 2026): five palettes and five sidebar
 * layouts, mixed freely. On the Dashboard, for owners only, and kept in this
 * browser only - so an agent's screen never moves while he decides. Nothing
 * picked is the live look.
 */
export default function LookLab() {
  const [owner, setOwner] = useState(false);
  const [c, setC] = useState<LabChoice>({ palette: null, layout: null });

  useEffect(() => {
    setC(readLab());
    fetchMe().then((j) => setOwner(Boolean(j?.isOwner))).catch(() => null);
  }, []);

  if (!owner) return null;
  const pick = (next: LabChoice) => {
    setC(next);
    saveLab(next);
  };
  const palette = c.palette ?? "mist";
  const layout = c.layout ?? "original";
  const chip = (on: boolean) =>
    `rounded-2xl border px-3.5 py-3 text-left transition-colors ${on ? "border-ink bg-[var(--shell-pill)]" : "border-line/70 hover:border-ink/40"}`;

  return (
    <section className="mb-6 rounded-[22px] border border-line/60 bg-card p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-[15px]">Look lab</h2>
        <p className="text-[12px] text-muted">Mix a colour with a sidebar. Only you see it, on this computer. Nothing picked is what is live.</p>
        {(c.palette || c.layout) && (
          <button type="button" onClick={() => pick({ palette: null, layout: null })} className="ml-auto text-[12px] font-semibold text-accent-dark underline underline-offset-2">
            Back to the live look
          </button>
        )}
      </div>

      <p className="mt-4 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Colours</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {LAB_PALETTES.map((p) => (
          <button key={p.id} type="button" onClick={() => pick({ ...c, palette: p.id })} className={chip(palette === p.id)}>
            <span className="flex gap-1">
              {p.swatch.map((hex, i) => (
                <span key={i} className="h-5 w-5 rounded-full border border-black/10" style={{ background: hex }} />
              ))}
            </span>
            <span className="mt-2 block text-[13px] font-semibold">{p.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{p.blurb}</span>
          </button>
        ))}
      </div>

      <p className="mt-5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted">Sidebar</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {LAB_LAYOUTS.map((l) => (
          <button key={l.id} type="button" onClick={() => pick({ ...c, layout: l.id })} className={chip(layout === l.id)}>
            <span className="block text-[13px] font-semibold">{l.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{l.blurb}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
