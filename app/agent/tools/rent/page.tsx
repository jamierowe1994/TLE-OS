"use client";

import { useState } from "react";
import { TopBar } from "../../bits";

/**
 * RENT CONVERTER (Tools, 3 Oct 2026): per month, per week, per year, the way
 * the trade works it out - a week is the year's rent over 52, a month is the
 * year's rent over 12.
 */

const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function RentConverter() {
  const [rent, setRent] = useState("");
  const [per, setPer] = useState<"month" | "week" | "year">("month");
  const n = Number(rent.replace(/[^\d.]/g, "")) || 0;
  const yearly = per === "month" ? n * 12 : per === "week" ? n * 52 : n;
  const rows: Array<[string, number, "pink" | "sage" | undefined]> = [
    ["Per Month", yearly / 12, "pink"],
    ["Per Week", yearly / 52, "sage"],
    ["Per Year", yearly, undefined],
  ];

  return (
    <main className="pb-6">
      <TopBar back="/agent/tools" />
      <h1 className="m-title mt-3 text-[34px] leading-tight">Rent Converter</h1>
      <p className="mt-1 text-[14px] text-muted">Monthly, weekly and yearly, in one go.</p>

      <div className="mt-5 rounded-[26px] p-5" style={{ background: "var(--m-card)" }}>
        <label className="text-[13px] font-semibold text-muted">The Rent</label>
        <div className="mt-2 flex items-center gap-2">
          <span className="m-guide-num text-[40px] leading-none" style={{ color: "var(--m-coral)" }}>
            £
          </span>
          <input
            inputMode="decimal"
            value={rent}
            onChange={(e) => setRent(e.target.value)}
            placeholder="0"
            className="m-guide-num min-w-0 flex-1 bg-transparent text-[48px] leading-none outline-none placeholder:text-muted"
          />
        </div>
        <div className="mt-4 grid grid-cols-3 gap-1 rounded-full p-1" style={{ background: "var(--m-fill)" }}>
          {(["month", "week", "year"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPer(p)} aria-pressed={per === p} className="h-10 rounded-full text-[14px] font-medium" style={per === p ? { background: "var(--m-card)", color: "var(--m-coral)" } : undefined}>
              Per {p[0]!.toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 grid gap-2.5">
        {rows.map(([label, v, tone]) => (
          <li key={label} className="rounded-[24px] px-5 pb-4 pt-3" style={{ background: tone === "pink" ? "var(--m-pink-wash)" : tone === "sage" ? "var(--m-green-wash)" : "var(--m-card)" }}>
            <span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
            <span className="m-guide-num mt-1 block text-[44px] leading-none">{n ? money(v) : "-"}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
