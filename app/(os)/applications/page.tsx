"use client";

import { useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import { FlowTag, Pill } from "@/components/Wire";

/**
 * Applications: the pre-tenancy pipeline, lifted from the TLE portal so the
 * two products speak the same language on merge day.
 *
 * The eight stages and the nine checklist items are the PORTAL's, verbatim —
 * they came out of Kirstie's real process. Propoly only tracks five statuses;
 * the other three (PLC, Deposit, Move day) are portal-side stages someone
 * moves a deal into by hand, which is why this overlay has to own them.
 */

const STAGES = [
  { key: "deal_started", label: "Deal started", blurb: "Terms agreed — rent, dates and tenant details being set up." },
  { key: "holding_fee", label: "Holding fee", blurb: "Collecting the fee that takes the property off the market." },
  { key: "referencing", label: "Referencing", blurb: "Credit, employer and previous-landlord checks." },
  { key: "plc", label: "PLC", blurb: "Pre-let compliance — Right to Rent, gas/EICR/EPC and licensing." },
  { key: "deposit", label: "Deposit", blurb: "Collecting the deposit and registering it with the scheme." },
  { key: "tenancy_agreement", label: "Tenancy agreement", blurb: "Drawn up with the agreed clauses and signed by all parties." },
  { key: "rent_payment", label: "Rent payment", blurb: "First month's rent collected, standing order set up." },
  { key: "move_day", label: "Move day", blurb: "Keys, inventory and check-in." },
];

/** Kirstie's spreadsheet, one tick each — the portal's CHECKLIST_ITEMS. */
const CHECKLIST = [
  "Holding fee received",
  "References passed",
  "Right to Rent verified",
  "Tenancy agreement sent",
  "Agreement signed by all parties",
  "Deposit registered",
  "Move-in monies received",
  "Standing order set up",
  "Keys & inventory arranged",
];

type App = {
  id: string;
  tenant: string;
  property: string;
  locality: string;
  image: string | null;
  rent: string;
  moveIn: string;
  stageKey: string;
  ticked: number;
  agent: string;
  flag?: string;
};

const APPS: App[] = [
  {
    id: "a1", tenant: "Marcus Bell", property: "7 Station Approach", locality: "Luton LU1",
    image: null, rent: "£1,150 pcm", moveIn: "1 Sep 2026", stageKey: "holding_fee",
    ticked: 1, agent: "Kirstie",
  },
  {
    id: "a2", tenant: "Sophie Turner", property: "Flat 2, Mercer Street", locality: "Manchester M4",
    image: null, rent: "£995 pcm", moveIn: "12 Sep 2026", stageKey: "referencing",
    ticked: 2, agent: "Kirstie", flag: "Stalled 6 days",
  },
  {
    id: "a3", tenant: "Priya Shah", property: "12 Elm Gardens", locality: "Didsbury M20",
    image: null, rent: "£1,750 pcm", moveIn: "1 Oct 2026", stageKey: "plc",
    ticked: 3, agent: "Michael",
  },
  {
    id: "a4", tenant: "Liam Doyle", property: "88 Kelvin Way", locality: "Glasgow G12",
    image: null, rent: "£1,300 pcm", moveIn: "20 Aug 2026", stageKey: "tenancy_agreement",
    ticked: 5, agent: "Kirstie",
  },
  {
    id: "a5", tenant: "Hannah Price", property: "5 Orchard Close", locality: "St Albans AL1",
    image: null, rent: "£1,700 pcm", moveIn: "14 Aug 2026", stageKey: "move_day",
    ticked: 8, agent: "Michael", flag: "Friday",
  },
];

const stageIdx = (k: string) => STAGES.findIndex((s) => s.key === k);

export default function Applications() {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = APPS.find((a) => a.id === openId) ?? null;
  const cur = open ? stageIdx(open.stageKey) : -1;

  return (
    <>
      <PageHeader
        title="Applications"
        blurb="Every application from offer to keys, on the eight stages the business actually runs. Stage changes are written back to REX."
        illustration="/illustrations/notioly/checklist.svg"
      />

      <div className="mt-10">
        <FlowTag from="Propoly + REX" to="REX" />
      </div>

      {/* ── The pipeline: how many sit at each stage. */}
      <div className="fade-up mt-4 rounded-2xl border border-line/80 p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15px]">Pipeline</h2>
          <p className="text-[11px] text-muted">{APPS.length} live applications</p>
        </div>
        <div className="grid grid-cols-4 gap-3 sm:grid-cols-8">
          {STAGES.map((s, i) => {
            const n = APPS.filter((a) => a.stageKey === s.key).length;
            return (
              <div key={s.key} title={s.blurb}>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`h-2 w-2 rounded-full ${n ? "bg-accent" : "bg-line"}`}
                  />
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted">
                    {i + 1}
                  </span>
                </div>
                <p className="figures mt-1.5 text-[22px] leading-none">{n || "—"}</p>
                <p className="mt-1 text-[10px] leading-tight text-muted">{s.label}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── The applications, with the open one beside them. */}
      <div className={`mt-4 grid gap-4 ${open ? "xl:grid-cols-[2fr_1fr]" : ""}`}>
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 p-5">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-line/70">
                  {["Applicant", "Property", "Rent", "Move-in", "Stage", "Checklist", "With"].map(
                    (c) => (
                      <th
                        key={c}
                        className="pb-2.5 pr-3 text-[9.5px] font-bold uppercase tracking-wider text-muted"
                      >
                        {c}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {APPS.map((a) => {
                  const isOpen = a.id === openId;
                  const st = STAGES[stageIdx(a.stageKey)];
                  return (
                    <tr
                      key={a.id}
                      onClick={() => setOpenId(isOpen ? null : a.id)}
                      className={`cursor-pointer border-b border-line/40 transition-colors last:border-0 ${
                        isOpen ? "bg-accent-soft/50" : "hover:bg-page"
                      }`}
                    >
                      <td className="py-3 pr-3">
                        <span className="hand block whitespace-nowrap text-[13px]">
                          {a.tenant}
                        </span>
                        {a.flag && (
                          <span className="mt-1 inline-block">
                            <Pill tone="accent">{a.flag}</Pill>
                          </span>
                        )}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="flex items-center gap-2.5">
                          <PropertyPhoto
                            src={a.image}
                            className="h-9 w-11 shrink-0 rounded-md"
                          />
                          <span className="min-w-0">
                            <span className="block truncate">{a.property}</span>
                            <span className="block truncate text-[10.5px] text-muted">
                              {a.locality}
                            </span>
                          </span>
                        </span>
                      </td>
                      <td className="figures whitespace-nowrap py-3 pr-3">{a.rent}</td>
                      <td className="whitespace-nowrap py-3 pr-3 text-muted">{a.moveIn}</td>
                      <td className="whitespace-nowrap py-3 pr-3">
                        <Pill tone="neutral">{st.label}</Pill>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-3">
                        <span className="flex items-center gap-1">
                          {CHECKLIST.map((_, i) => (
                            <span
                              key={i}
                              className={`h-1.5 w-1.5 rounded-full ${
                                i < a.ticked ? "bg-accent" : "bg-line"
                              }`}
                            />
                          ))}
                          <span className="ml-1.5 text-[10px] text-muted">
                            {a.ticked}/{CHECKLIST.length}
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap py-3 pr-1 text-muted">{a.agent}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── The open application: where it is, and what's left. */}
        {open && (
          <aside className="fade-up h-fit rounded-2xl border border-line/80 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-3">
                <PropertyPhoto src={open.image} className="h-12 w-14 shrink-0 rounded-lg" />
                <div className="min-w-0">
                  <p className="hand truncate text-[16px] leading-tight">{open.tenant}</p>
                  <p className="mt-1 truncate text-[11px] text-muted">{open.property}</p>
                  <p className="truncate text-[11px] text-muted">
                    {open.rent} · moves {open.moveIn}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpenId(null)}
                className="shrink-0 text-muted transition-colors hover:text-ink"
                title="Close"
              >
                ✕
              </button>
            </div>

            {/* The eight stages, as a route walked so far. */}
            <div className="mt-5 border-t border-line/70 pt-4">
              <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                Where it&apos;s up to
              </p>
              <ol className="mt-3 space-y-2.5">
                {STAGES.map((s, i) => {
                  const done = i < cur;
                  const here = i === cur;
                  return (
                    <li key={s.key} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                          done
                            ? "border-accent-dark bg-accent-soft text-accent-dark"
                            : here
                              ? "border-accent-dark bg-accent-dark text-white"
                              : "border-line text-muted"
                        }`}
                      >
                        {done ? "✓" : i + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block text-[12px] leading-snug ${
                            here ? "font-semibold" : done ? "text-muted" : "text-muted/70"
                          }`}
                        >
                          {s.label}
                        </span>
                        {here && (
                          <span className="mt-0.5 block text-[10.5px] leading-snug text-muted">
                            {s.blurb}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>

            {/* The nine ticks. */}
            <div className="mt-5 border-t border-line/70 pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  Pre-tenancy checklist
                </p>
                <span className="figures text-[11px] text-muted">
                  {open.ticked}/{CHECKLIST.length}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {CHECKLIST.map((c, i) => {
                  const done = i < open.ticked;
                  return (
                    <li key={c} className="flex items-start gap-2.5">
                      <span
                        className={`mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[8px] ${
                          done
                            ? "border-accent-dark bg-accent-soft text-accent-dark"
                            : "border-line"
                        }`}
                      >
                        {done && "✓"}
                      </span>
                      <span
                        className={`text-[11.5px] leading-snug ${
                          done ? "text-muted line-through opacity-60" : ""
                        }`}
                      >
                        {c}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="mt-5 grid grid-cols-3 gap-2 border-t border-line/70 pt-4">
              {[
                { label: "Note", icon: "pencil" },
                { label: "Chase", icon: "mail" },
                { label: "Open in REX", icon: "link" },
              ].map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="flex flex-col items-center gap-1.5 rounded-xl border border-line/80 px-2 py-2.5 text-[10px] font-medium transition-colors hover:border-ink/40"
                >
                  <DoodleIcon name={a.icon} size={16} className="text-accent-dark" />
                  {a.label}
                </button>
              ))}
            </div>
          </aside>
        )}
      </div>

      <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
        <li>
          The eight stages and nine checklist items are the TLE portal&apos;s, verbatim —
          so the two products speak one language when they merge.
        </li>
        <li>
          Propoly tracks only five statuses. <span className="font-semibold">PLC,
          Deposit and Move day are portal-side stages</span> someone moves a deal into
          by hand, which is why the overlay has to own them rather than mirror Propoly.
        </li>
        <li>
          <span className="font-semibold">Referencing has no API source anywhere</span> —
          The Lettings Hub isn&apos;t connected in REX and Propoly carries no reference
          status field. That stage is manual until someone connects it.
        </li>
      </ul>
    </>
  );
}
