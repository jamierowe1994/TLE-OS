import type { RailGroup } from "@/components/WorkspaceRail";

/**
 * Susan's screens, as the rail lists them. Plain data so the server layout can
 * draw the rail without importing the tabs; registry.tsx maps each key to the
 * component that draws it.
 *
 * James, 17 Sep 2026: her page "looks very different to the rest of the
 * pages". It had its own red sidebar, top bar and logo, ported from the portal.
 * It now sits in the same rail as the admin centre and Kirstie's workspace,
 * with each tab at its own address.
 */
export const BUSINESS_TABS = [
  { key: "overview", label: "Overview", icon: "dashboard", blurb: "The business at a glance: the funnel, headcount, commission and ramp time, month to date." },
  { key: "paid-leads", label: "Paid Leads", icon: "megaphone", blurb: "What the paid adverts bring in, and what those leads turn into." },
  { key: "move-ins", label: "Move-ins & Pipeline", icon: "key", blurb: "Who has moved in, who is on the way, and the deals in progression." },
  { key: "income", label: "Income", icon: "coin", blurb: "Commission from PayProp, net of VAT, month by month." },
  { key: "pnl", label: "P&L", icon: "bank", blurb: "Income from PayProp, costs from the accounts, and the plan for the months ahead." },
  { key: "forecast", label: "Forecast", icon: "trend-up", blurb: "The plan, the partners' own forecasts, and what the book is worth." },
  { key: "agents", label: "Agents", icon: "user", blurb: "Each partner's month: commission, book, appraisals, listings and pipeline." },
  { key: "portfolio", label: "Portfolio", icon: "pack/building", blurb: "The book: managed, let only and rent collection, England & Wales and Scotland." },
  { key: "arrears", label: "Arrears", icon: "wallet", blurb: "Who is behind, by how much and for how long. Contains tenant personal data." },
  { key: "compliance", label: "Compliance", icon: "shield", blurb: "Certificates on the homes we manage, by type." },
  { key: "assistant", label: "Assistant", icon: "message", blurb: "Ask about the figures." },
  { key: "diagnostics", label: "Diagnostics", icon: "setting", blurb: "Which sources are connected and answering." },
] as const;

export type BusinessTabKey = (typeof BUSINESS_TABS)[number]["key"];

/** The boardroom story, not the working tabs. */
export const PRESENT_KEYS: BusinessTabKey[] = ["overview", "paid-leads", "income", "portfolio", "forecast"];

export const BUSINESS_RAIL: RailGroup[] = [
  {
    title: null,
    items: BUSINESS_TABS.slice(0, 7).map((t) => ({ href: `/company-figures/${t.key}`, label: t.label, icon: t.icon })),
  },
  {
    title: "The book",
    rule: true,
    items: BUSINESS_TABS.slice(7, 10).map((t) => ({ href: `/company-figures/${t.key}`, label: t.label, icon: t.icon })),
  },
  {
    title: null,
    rule: true,
    items: BUSINESS_TABS.slice(10).map((t) => ({ href: `/company-figures/${t.key}`, label: t.label, icon: t.icon })),
  },
];
