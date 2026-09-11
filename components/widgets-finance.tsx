"use client";

import { Head, NotConnected, WIDGETS, type WidgetDef } from "@/components/widgets";
import {
  FeeForecast, FeesThisMonth, ManagementFees, NextMonth, PaidToYou, Platform, PortfolioGrowth, SetupFees, Target,
} from "@/components/widgets-forecast";

/**
 * The Finances board's registry: the home screen's machine, pointed at the
 * money (James, 11 Sep 2026: "a second dashboard for their finances that is
 * completely customisable to them").
 *
 * The default board answers the four questions he named, in this order:
 * the fees this month, what comes to you, where next month lands, and the
 * platform you trade on - then the engine behind them. Everything on it is
 * live off REX and the Hub at the rates an owner sets; a tile with no rate
 * yet says which one it is waiting for. The tiles that still have no feed
 * at all (arrears, money held, occupancy) stay in the tray, honest, rather
 * than on the board saying "not connected" in a row.
 *
 * Two tiles wear colour, like the dashboard: fees on the pink, take-home on
 * the sage. Everything else is white with a hairline.
 */

export const FINANCE_WIDGETS: Record<string, WidgetDef> = {
  "fees-month": {
    label: "Fees this month", icon: "wallet", hint: "the headline, off the live book and the rates",
    defaultW: 2, defaultH: 2,
    tint: "bg-accent-soft/70",
    render: (w, h) => <FeesThisMonth w={w} h={h} />,
  },
  "paid-to-you": {
    label: "Paid to you", icon: "coin", hint: "your share of the fees, less the licence",
    defaultW: 1, defaultH: 1,
    tint: "bg-sage/25",
    render: (w, h) => <PaidToYou w={w} h={h} />,
  },
  "next-month": {
    label: "Next month", icon: "trend-up", hint: "where the projection lands next month",
    defaultW: 1, defaultH: 1,
    render: (w, h) => <NextMonth w={w} h={h} />,
  },
  platform: {
    label: "Your platform", icon: "star", hint: "the package you trade on, and what it means",
    defaultW: 1, defaultH: 1,
    render: (w, h) => <Platform w={w} h={h} />,
  },
  target: {
    label: "Your target", icon: "target", hint: "what you want this year, and how far along you are",
    defaultW: 2, defaultH: 1,
    sizes: { s: [1, 1], m: [2, 1], l: [2, 2] },
    render: (w, h) => <Target w={w} h={h} />,
  },
  "fee-forecast": {
    label: "The year ahead", icon: "trend-up", hint: "what the book earns, where it lands, and where the rates are set",
    defaultW: 4, defaultH: 2,
    sizes: { s: [2, 1], m: [4, 1], l: [4, 2] },
    render: (w, h) => <FeeForecast w={w} h={h} />,
  },
  "portfolio-growth": {
    label: "Portfolio growth", icon: "trend-up", hint: "how the book has grown, live from REX",
    defaultW: 2, defaultH: 2,
    render: (w, h) => <PortfolioGrowth w={w} h={h} />,
  },
  "management-fees": {
    label: "Management fees", icon: "key", hint: "the recurring engine, off the live rent roll",
    defaultW: 1, defaultH: 1,
    render: (w, h) => <ManagementFees w={w} h={h} />,
  },
  "setup-fees": {
    label: "Set-up fees", icon: "pack/house", hint: "the one-off on every new let",
    defaultW: 2, defaultH: 1,
    render: (w, h) => <SetupFees w={w} h={h} />,
  },

  /* Kept under its old name so a board saved before today still loads; it
     is the same tile as Your platform, which shows the licence book to an
     owner. */
  "licence-income": {
    label: "Licence income", icon: "file-contract", hint: "partners' monthly licences, by package",
    defaultW: 2, defaultH: 1,
    render: (w, h) => <Platform w={w} h={h} />,
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
     registry - one definition, both boards. */
  arrears: WIDGETS.arrears,
  occupancy: WIDGETS.occupancy,
  earnings: WIDGETS.earnings,
};

/* Squared off: fees 2×2 anchors the left with the four one-boxes beside it,
   the year ahead runs full width, then growth 2×2 with the two 2×1s stacked
   beside it. No ragged edge anywhere. */
export const FINANCE_DEFAULT_LAYOUT = [
  { id: "f1", type: "fees-month", w: 2, h: 2 },
  { id: "f2", type: "paid-to-you", w: 1, h: 1 },
  { id: "f3", type: "next-month", w: 1, h: 1 },
  { id: "f4", type: "platform", w: 1, h: 1 },
  { id: "f5", type: "management-fees", w: 1, h: 1 },
  { id: "f0", type: "fee-forecast", w: 4, h: 2 },
  { id: "f7", type: "portfolio-growth", w: 2, h: 2 },
  { id: "f8", type: "setup-fees", w: 2, h: 1 },
  { id: "f9", type: "target", w: 2, h: 1 },
];

export const FINANCE_TRAY_GROUPS = [
  { key: "money", label: "Your money", icon: "wallet", types: ["fees-month", "paid-to-you", "next-month", "target"] },
  { key: "engine", label: "The engine", icon: "trend-up", types: ["fee-forecast", "management-fees", "setup-fees", "portfolio-growth"] },
  { key: "platform", label: "Platform", icon: "star", types: ["platform"] },
  { key: "later", label: "Not wired yet", icon: "bank", types: ["arrears", "money-held", "occupancy", "earnings"] },
];
