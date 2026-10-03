"use client";

import { useState } from "react";
import { TopBar } from "../../bits";

/**
 * DEPOSIT CALCULATOR (Tools, 3 Oct 2026): the most that can be taken, from
 * the rent, under the Tenant Fees Act 2019 (England):
 *
 *   a week's rent   = monthly rent x 12 / 52
 *   holding deposit = at most 1 week's rent
 *   tenancy deposit = at most 5 weeks' rent, or 6 weeks' where the rent is
 *                     £50,000 a year or more
 *
 * Caps, so every figure is rounded DOWN to the penny - rounding up would
 * take a penny too much.
 */

const down = (n: number) => Math.floor(n * 100) / 100;
const money = (n: number) => `£${n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function DepositCalculator() {
  const [rent, setRent] = useState("");
  const [per, setPer] = useState<"month" | "week">("month");
  const n = Number(rent.replace(/[^\d.]/g, "")) || 0;
  const weekly = per === "month" ? (n * 12) / 52 : n;
  const yearly = weekly * 52;
  const weeks = yearly >= 50_000 ? 6 : 5;

  return (
    <main className="pb-6">
      <TopBar back="/agent/tools" />
      <h1 className="m-title mt-3 text-[34px] leading-tight">Deposit Calculator</h1>
      <p className="mt-1 text-[14px] text-muted">The most a landlord can take, from the rent.</p>

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
        <div className="mt-4 grid grid-cols-2 gap-1 rounded-full p-1" style={{ background: "var(--m-fill)" }}>
          {(["month", "week"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPer(p)} aria-pressed={per === p} className="h-10 rounded-full text-[14.5px] font-medium" style={per === p ? { background: "var(--m-card)", color: "var(--m-coral)" } : undefined}>
              Per {p === "month" ? "Month" : "Week"}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-3 grid gap-2.5">
        <Figure label="Holding deposit, at most" value={n ? money(down(weekly)) : "-"} note="One week's rent" tone="pink" />
        <Figure label="Tenancy deposit, at most" value={n ? money(down(weekly * weeks)) : "-"} note={`${weeks} weeks' rent${weeks === 6 ? " - the rent is £50,000 a year or more" : ""}`} tone="sage" />
        <Figure label="A week's rent" value={n ? money(down(weekly)) : "-"} note={per === "month" ? "Monthly rent x 12, divided by 52" : "As entered"} />
      </ul>

      <p className="mt-5 px-1 text-[12.5px] leading-relaxed text-muted">England, under the Tenant Fees Act 2019. Wales and Scotland have their own rules. A guide, not legal advice.</p>
    </main>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "pink" | "sage" }) {
  const bg = tone === "pink" ? "var(--m-pink-wash)" : tone === "sage" ? "var(--m-green-wash)" : "var(--m-card)";
  return (
    <li className="rounded-[24px] px-5 pb-4 pt-3" style={{ background: bg }}>
      <span className="block text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">{label}</span>
      <span className="m-guide-num mt-1 block text-[44px] leading-none">{value}</span>
      <span className="mt-1.5 block text-[13px] text-muted">{note}</span>
    </li>
  );
}
