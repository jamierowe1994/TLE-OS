"use client";

import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import type { BusinessTabKey } from "./rail";
import Overview from "./tabs/overview";
import PaidLeads from "./tabs/paid-leads";
import MoveIns from "./tabs/move-ins";
import Income from "./tabs/income";
import Pnl from "./tabs/pnl";
import Forecast from "./tabs/forecast";
import Agents from "./tabs/agents";
import Portfolio from "./tabs/portfolio";
import Arrears from "./tabs/arrears";
import Compliance from "./tabs/compliance";
import AssistantTab from "./tabs/assistant";
import Diagnostics from "./tabs/diagnostics";

type TabComponent = (props: { month: string; seed: SeedData }) => React.ReactNode;

export const TAB_COMPONENTS: Record<BusinessTabKey, TabComponent> = {
  overview: Overview,
  "paid-leads": PaidLeads,
  "move-ins": MoveIns,
  income: Income,
  pnl: Pnl,
  forecast: Forecast,
  agents: Agents,
  portfolio: Portfolio,
  arrears: Arrears,
  compliance: Compliance,
  assistant: AssistantTab,
  diagnostics: Diagnostics,
};
