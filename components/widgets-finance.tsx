"use client";

import {
  BigCount, Donut, Head, LineGraph, RowList, WIDGETS,
  type WidgetDef,
} from "@/components/widgets";
import { Pill } from "@/components/Wire";

/**
 * The Finances board's registry — same machine as the dashboard, pointed at
 * the money. Everything here follows the accounts' own rules, because the
 * portal already settled them the hard way: a fee belongs to the month its
 * PayProp batch TRANSFERRED, and every figure is net of VAT. A dashboard
 * that disagrees with the bank teaches people to ignore it.
 *
 * Same rule of size: the number → the trend → the names → the full picture.
 */

const FEES_12M = [41.2, 43.8, 40.1, 45.6, 44.2, 46.9, 45.1, 47.3, 44.8, 46.2, 47.1, 48.2];
const SETUP_12M = [11, 14, 9, 15, 13, 17, 14, 16, 12, 15, 14, 16.1];

export const FINANCE_WIDGETS: Record<string, WidgetDef> = {
  "fees-month": {
    label: "Fees this month", icon: "wallet", hint: "the headline — net of VAT, both agencies",
    defaultW: 2, defaultH: 2,
    render: (w, h) => (
      <>
        <Head icon="wallet" label="Fees this month" />
        {w === 1 && h === 1 && <BigCount value="£48.2k" hint="net of VAT, both agencies" />}
        {(w >= 2 || h >= 2) && (
          <>
            <div className="mt-2 flex items-end gap-4">
              <div>
                <p className="figures text-[34px] leading-none">£48,210</p>
                <p className="mt-1 text-[11px] font-medium text-accent-dark">+4% on last month</p>
              </div>
              <div className="mb-1 min-w-0 flex-1">
                <LineGraph data={FEES_12M} tall={h >= 2} />
                <p className="mt-1 text-[9px] text-muted">12 months · net of VAT</p>
              </div>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">By stream</p>
                <RowList
                  rows={[
                    { a: "£31,145", b: "Management fees", c: "65%" },
                    { a: "£16,086", b: "Set-up fees", c: "33%" },
                    { a: "£4,700", b: "Licence income", c: "in 'Other' — see note" },
                  ]}
                  max={3}
                />
                {w >= 2 && (
                  <p className="mt-3 border-t border-line/50 pt-2 text-[10px] text-muted">
                    Counted the accounts&apos; way: a fee belongs to the month its PayProp batch
                    transferred, net of VAT — this always agrees with the bank.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </>
    ),
  },

  "management-fees": {
    label: "Management fees", icon: "key", hint: "the recurring engine, and who pays it",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="key" label="Management fees" />
        {w === 1 && h === 1 ? (
          <BigCount value="£31.1k" hint="E&W + Glasgow" />
        ) : (
          <>
            <div className="mt-2 flex items-end gap-5">
              <p className="figures text-[30px] leading-none">£31,145</p>
              <div className="mb-0.5 flex gap-4 text-[11px]">
                <span><span className="figures text-[15px]">£24.3k</span> <span className="text-muted">E&amp;W</span></span>
                <span><span className="figures text-[15px]">£6.8k</span> <span className="text-muted">Glasgow</span></span>
              </div>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  Biggest books — their fee per month
                </p>
                <RowList
                  rows={[
                    { a: "£512", b: "K&P Property Group · 14 homes" },
                    { a: "£498", b: "Raj Chauhan · 11 homes" },
                    { a: "£365", b: "Howard Bentley · 8 homes" },
                    { a: "£0", b: "Margaret Wilson · 9 homes", c: "CHECK — book earns £5k/mo" },
                  ]}
                  max={4}
                />
              </>
            )}
          </>
        )}
      </>
    ),
  },

  "setup-fees": {
    label: "Set-up fees", icon: "rocket", hint: "new business landing as money",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="rocket" label="Set-up fees" />
        {w === 1 && h === 1 ? (
          <BigCount value="£16.1k" hint="England & Wales" />
        ) : (
          <>
            <div className="mt-2 flex items-end gap-4">
              <div>
                <p className="figures text-[30px] leading-none">£16,086</p>
                <p className="mt-1 text-[11px] font-medium text-accent-dark">England &amp; Wales</p>
              </div>
              <div className="mb-1 min-w-0 flex-1">
                <LineGraph data={SETUP_12M} tall={h >= 2} />
                <p className="mt-1 text-[9px] text-muted">12 months</p>
              </div>
            </div>
            {h >= 2 && (
              <RowList
                rows={[
                  { a: "3d ago", b: "12 Elm Gardens — new instruction", c: "£1,440" },
                  { a: "1w ago", b: "6 Sandpiper Way — new instruction", c: "£1,020" },
                  { a: "2w ago", b: "9 Granby Road — switch from agent", c: "£1,194" },
                ]}
                max={3}
              />
            )}
          </>
        )}
      </>
    ),
  },

  "licence-income": {
    label: "Licence income", icon: "file-contract", hint: "partners' monthly fees, and who's paid",
    defaultW: 2, defaultH: 1,
    render: (w, h) => (
      <>
        <div className="flex items-center justify-between gap-2">
          <Head icon="file-contract" label="Licence income" />
          {w >= 2 && h >= 2 && <Pill tone="accent">per-agent tagging in PayProp pending</Pill>}
        </div>
        {w === 1 && h === 1 ? (
          <BigCount value="£4,700" hint="partner licences + joining" />
        ) : (
          <>
            <div className="mt-2 flex items-end gap-5">
              <p className="figures text-[30px] leading-none">£4,700</p>
              <p className="mb-0.5 text-[11px] text-muted">3 partner licences + 1 joining fee</p>
            </div>
            {h >= 2 && (
              <>
                <p className="mt-4 text-[10px] font-semibold uppercase tracking-wide text-muted">
                  The monthly fee, partner by partner
                </p>
                <RowList
                  rows={[
                    { a: "£1,500", b: "Partner licence — Rhiannon", c: "paid 1st" },
                    { a: "£1,500", b: "Partner licence — Michael", c: "paid 3rd" },
                    { a: "£500", b: "Partner licence — new joiner (intro rate)", c: "4 days late" },
                    { a: "£1,200", b: "Joining fee — one-off", c: "this month" },
                  ]}
                  max={4}
                />
              </>
            )}
          </>
        )}
      </>
    ),
  },

  "money-held": {
    label: "In, not yet out", icon: "bank", hint: "reconciled rent still sitting with us",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="bank" label="In, not yet out" />
        {w === 1 && h === 1 ? (
          <BigCount value="£1,240" hint="oldest batch 2 days" />
        ) : (
          <>
            <RowList
              rows={[
                { a: "2d", b: "Rent in from Flat 2, Mercer St", c: "£1,190 to P. Okafor" },
                { a: "1d", b: "Part-payment, 88 Kelvin Way", c: "£50 to M. Wilson" },
              ]}
              max={h >= 2 ? 4 : 2}
            />
            {h >= 2 && (
              <p className="mt-3 border-t border-line/50 pt-2 text-[10px] text-muted">
                Money that&apos;s arrived but hasn&apos;t left for the landlord. Flagged when it
                ages — batched daily, never per-event noise.
              </p>
            )}
          </>
        )}
      </>
    ),
  },

  /* Tenant arrears and the voids' cost come straight from the dashboard
     registry — one definition, both boards. */
  arrears: WIDGETS.arrears,
  occupancy: WIDGETS.occupancy,
  earnings: WIDGETS.earnings,
};

export const FINANCE_DEFAULT_LAYOUT = [
  { id: "f1", type: "fees-month", w: 2, h: 2 },
  { id: "f2", type: "management-fees", w: 1, h: 1 },
  { id: "f3", type: "setup-fees", w: 1, h: 1 },
  { id: "f4", type: "licence-income", w: 2, h: 1 },
  { id: "f5", type: "money-held", w: 1, h: 1 },
  { id: "f6", type: "arrears", w: 1, h: 1 },
];

export const FINANCE_TRAY_GROUPS = [
  { key: "income", label: "Fee income", icon: "wallet", types: ["fees-month", "management-fees", "setup-fees", "earnings"] },
  { key: "partners", label: "Partners", icon: "file-contract", types: ["licence-income"] },
  { key: "risk", label: "Risk & flow", icon: "bank", types: ["arrears", "money-held", "occupancy"] },
];
