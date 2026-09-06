"use client";

import { Head, NotConnected, WIDGETS, type WidgetDef } from "@/components/widgets";

/**
 * The Finances board's registry — same machine as the dashboard, pointed at
 * the money. Everything here follows the accounts' own rules, because the
 * portal already settled them the hard way: a fee belongs to the month its
 * PayProp batch TRANSFERRED, and every figure is net of VAT. A dashboard
 * that disagrees with the bank teaches people to ignore it.
 *
 * Which is why, since 6 Sep 2026, every tile here says "not connected yet"
 * rather than a number: the £48,210 and the rest were typed in, and a
 * typed-in fee figure on Susan's screen is the one thing this board must
 * never show. The company's live figures are on Company figures (owners).
 * This board is per person and comes alive when James settles whose fee is
 * whose. Same rule of size once it does: the number → the trend → the names.
 */

export const FINANCE_WIDGETS: Record<string, WidgetDef> = {
  "fees-month": {
    label: "Fees this month", icon: "wallet", hint: "the headline — net of VAT, both agencies",
    defaultW: 2, defaultH: 2,
    render: (w, h) => (
      <>
        <Head icon="wallet" label="Fees this month" />
        <NotConnected needs="The company figure is live on Company figures for owners, from PayProp. This board is per person, and needs the rule for whose fee is whose." w={w} h={h} />
      </>
    ),
  },

  "management-fees": {
    label: "Management fees", icon: "key", hint: "the recurring engine, and who pays it",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="key" label="Management fees" />
        <NotConnected needs="The company figure is live on Company figures for owners, from PayProp. This board is per person, and needs the rule for whose fee is whose." w={w} h={h} />
      </>
    ),
  },

  "setup-fees": {
    label: "Set-up fees", icon: "rocket", hint: "new business landing as money",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="rocket" label="Set-up fees" />
        <NotConnected needs="The company figure is live on Company figures for owners, from PayProp. This board is per person, and needs the rule for whose fee is whose." w={w} h={h} />
      </>
    ),
  },

  "licence-income": {
    label: "Licence income", icon: "file-contract", hint: "partners' monthly fees, and who's paid",
    defaultW: 2, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="file-contract" label="Licence income" />
        <NotConnected needs="Partner licences and joining fees run through a separate bank account. The company total is on Company figures." w={w} h={h} />
      </>
    ),
  },

  "money-held": {
    label: "In, not yet out", icon: "bank", hint: "reconciled rent still sitting with us",
    defaultW: 1, defaultH: 1,
    render: (w, h) => (
      <>
        <Head icon="bank" label="In, not yet out" />
        <NotConnected needs="Needs PayProp's incoming-funds view, which the API does not offer yet. Reconciled and held already show on Company figures." w={w} h={h} />
      </>
    ),
  },

  /* Tenant arrears and the voids' cost come straight from the dashboard
     registry — one definition, both boards. */
  arrears: WIDGETS.arrears,
  occupancy: WIDGETS.occupancy,
  earnings: WIDGETS.earnings,
};

/* Squared off deliberately: fees 2×2 anchors the left, the four small
   boxes stack the right two columns, and licence income runs full-width
   underneath — no ragged edge anywhere (James, 8 Aug 2026). */
export const FINANCE_DEFAULT_LAYOUT = [
  { id: "f1", type: "fees-month", w: 2, h: 2 },
  { id: "f2", type: "management-fees", w: 1, h: 1 },
  { id: "f3", type: "setup-fees", w: 1, h: 1 },
  { id: "f5", type: "money-held", w: 1, h: 1 },
  { id: "f6", type: "arrears", w: 1, h: 1 },
  { id: "f4", type: "licence-income", w: 4, h: 1 },
];

export const FINANCE_TRAY_GROUPS = [
  { key: "income", label: "Fee income", icon: "wallet", types: ["fees-month", "management-fees", "setup-fees", "earnings"] },
  { key: "partners", label: "Partners", icon: "file-contract", types: ["licence-income"] },
  { key: "risk", label: "Risk & flow", icon: "bank", types: ["arrears", "money-held", "occupancy"] },
];
