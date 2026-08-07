"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PhotoBox from "@/components/PhotoBox";

/**
 * The property, captured while you're on the phone to the landlord.
 *
 * These are the questions an agent asks anyway during a first call. Today the
 * answers go in a notes box, which means they're readable by a human and
 * useless to everything else — you cannot filter on a note, and you certainly
 * cannot push one into REX as a bedroom count. So they get fields.
 *
 * Progressive on purpose: "vacant?" is one question until the answer is no,
 * and only then does it become two, and only then a date. Asking every
 * landlord for a vacancy date up front is how forms get abandoned.
 */

const TYPES = ["Flat", "Terraced", "Semi-detached", "Detached", "Bungalow", "Maisonette", "HMO", "Room"];

function Stepper({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: string;
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="flex items-center gap-2.5 text-[12.5px]">
        <DoodleIcon name={icon} size={15} className="text-muted" />
        {label}
      </span>
      <span className="flex items-center gap-1">
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
    </div>
  );
}

/** A yes/no that looks like a decision, not a dropdown. */
function YesNo({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
}) {
  return (
    <span className="flex shrink-0 rounded-full border border-line/80 p-0.5">
      {[true, false].map((v) => (
        <button
          key={String(v)}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${
            value === v ? "bg-accent-dark text-page" : "text-muted hover:text-ink"
          }`}
        >
          {v ? "Yes" : "No"}
        </button>
      ))}
    </span>
  );
}

const Ask = ({ children }: { children: React.ReactNode }) => (
  <div className="fade-up flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-line/50 pt-2.5">
    {children}
  </div>
);

export default function PropertyFacts() {
  const [type, setType] = useState("");
  const [beds, setBeds] = useState(0);
  const [baths, setBaths] = useState(0);
  const [receptions, setReceptions] = useState(0);
  const [vacant, setVacant] = useState<boolean | null>(null);
  const [soon, setSoon] = useState<boolean | null>(null);
  const [freeFrom, setFreeFrom] = useState("");

  const answered =
    [type, beds, baths].filter(Boolean).length + (vacant === null ? 0 : 1);

  return (
    <section className="rounded-2xl border border-line/80 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2.5 text-[13px]">
          <DoodleIcon name="home" size={16} className="text-accent-dark" />
          The property
        </h3>
        <span className="figures text-[10.5px] text-muted">{answered}/4</span>
      </div>

      <PhotoBox className="mb-3.5" label="Add a photo" />

      <label className="mb-2 block">
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="w-full rounded-lg border border-line/80 bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-ink"
        >
          <option value="">Property type…</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </label>

      <div className="divide-y divide-line/40">
        <Stepper label="Bedrooms" icon="bed.png" value={beds} onChange={setBeds} />
        <Stepper label="Bathrooms" icon="doc" value={baths} onChange={setBaths} />
        <Stepper label="Receptions" icon="sofa.png" value={receptions} onChange={setReceptions} />
      </div>

      <div className="mt-3 space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <span className="text-[12.5px]">Vacant now?</span>
          <YesNo
            value={vacant}
            onChange={(v) => {
              setVacant(v);
              // Answering "yes" retires the follow-ups rather than leaving
              // stale answers hanging off a question nobody is asking.
              if (v) { setSoon(null); setFreeFrom(""); }
            }}
          />
        </div>

        {vacant === false && (
          <Ask>
            <span className="text-[12.5px]">Becoming vacant soon?</span>
            <YesNo value={soon} onChange={(v) => { setSoon(v); if (!v) setFreeFrom(""); }} />
          </Ask>
        )}

        {vacant === false && soon === true && (
          <Ask>
            <span className="text-[12.5px]">Free from</span>
            <input
              type="date"
              value={freeFrom}
              onChange={(e) => setFreeFrom(e.target.value)}
              className="figures rounded-lg border border-line/80 bg-transparent px-2.5 py-1.5 text-[12px] outline-none focus:border-ink"
            />
          </Ask>
        )}

        {vacant === true && (
          <p className="fade-up text-[11px] text-accent-dark">
            Available immediately — it can go on the market as soon as compliance is in.
          </p>
        )}
      </div>

      <p className="mt-3.5 border-t border-line/60 pt-2.5 text-[10px] leading-relaxed text-muted">
        These are the fields REX wants on a property record. Captured here they can be
        pushed; captured in a note they can only be read.
      </p>
    </section>
  );
}
