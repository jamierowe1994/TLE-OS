"use client";

import { useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * The property, captured while you're on the phone to the landlord.
 *
 * Four rows, drawn with EXACTLY the contact column's grammar — same icon
 * size, same text size, same row rhythm, same hairlines — so the two columns
 * read as one instrument, not two widgets that happened to land together.
 *
 * The type picker is ours, not the browser's: a native <select> was the one
 * piece of stock UI on a page where everything else is drawn, and it looked
 * like a form had wandered in.
 */

const TYPES = ["Flat", "Terraced", "Semi-detached", "Detached", "Bungalow", "Maisonette", "HMO", "Room"];

/** The row skeleton, lifted from DetailRow so the columns rhyme. */
function Row({ icon, label, children }: { icon: string; label: string; children: React.ReactNode }) {
  return (
    /* h-[42px] matches DetailRow exactly — the two columns share one ruler. */
    <div className="flex h-[42px] items-center gap-3">
      <DoodleIcon name={icon} size={15} className="shrink-0 text-muted" />
      <span className="min-w-0 flex-1 text-[13.5px]">{label}</span>
      {children}
    </div>
  );
}

function Stepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
      >
        −
      </button>
      <span className="figures w-6 text-center text-[13px]">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="flex h-6 w-6 items-center justify-center rounded-full border border-line/80 text-[13px] leading-none text-muted transition-colors hover:border-ink/40 hover:text-ink"
      >
        +
      </button>
    </span>
  );
}

/** The house-style dropdown: a pill that opens a drawn menu. */
function TypePicker({ value, onChange }: { value: string; onChange: (t: string) => void }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 rounded-full border px-3 py-1 text-[12px] transition-colors ${
          value ? "border-line/80" : "border-dashed border-line text-muted"
        } hover:border-ink/40`}
      >
        {value || "Choose…"}
        <span className={`text-[8px] transition-transform ${open ? "rotate-180" : ""}`}>▾</span>
      </button>

      {open && (
        <div className="fade-up absolute right-0 top-full z-30 mt-1.5 w-44 rounded-xl border border-line/80 bg-card p-1.5 shadow-[0_12px_32px_-12px_rgba(16,16,20,0.3)]">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => { onChange(t); setOpen(false); }}
              className={`flex w-full items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-[12.5px] transition-colors hover:bg-page ${
                t === value ? "font-semibold text-accent-dark" : ""
              }`}
            >
              {t}
              {t === value && <span className="text-[10px]">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PropertyFacts() {
  const [type, setType] = useState("");
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);
  const [receptions, setReceptions] = useState(0);

  return (
    <div className="divide-y divide-line/50">
      <Row icon="home" label="Property type">
        <TypePicker value={type} onChange={setType} />
      </Row>
      <Row icon="bed.png" label="Bedrooms">
        <Stepper value={beds} onChange={setBeds} />
      </Row>
      <Row icon="doc" label="Bathrooms">
        <Stepper value={baths} onChange={setBaths} />
      </Row>
      <Row icon="sofa.png" label="Receptions">
        <Stepper value={receptions} onChange={setReceptions} />
      </Row>
    </div>
  );
}
