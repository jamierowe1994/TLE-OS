import "server-only";

/**
 * The Paid Leads tab's figures, read from Launch Pad - the paid leads admin
 * site (launchpad.theexpertsgroup.co.uk/admin) - rather than worked out here.
 *
 * Susan Liles, 3 Nov 2026: "The paid leads tab on here doesn't show the same
 * details as the paid leads admin site?" It didn't. The tab counted Meta's
 * leads for the whole TLE ad account (13 so far this month) and asked a Go
 * High Level token that has been refused since GHL was retired, so referrals
 * and MAs were dashes. Her MD screen in Launch Pad counts the leads that
 * actually landed in each agent's funnel (8), with MAs, speed to lead, leads
 * by team member, where they came from and what needs chasing.
 *
 * Launch Pad's partner API (/api/partner/brand-figures) works those out with
 * the same functions its MD screen uses, so the two screens cannot drift. The
 * shared key is ADS_API_KEY here and PARTNER_API_KEY there, the same pair the
 * socials already use.
 */

export interface LaunchPadAgentLine {
  name: string;
  started: boolean;
  active: boolean;
  connected: boolean;
  leads: number;
  converted: number;
  rate: number | null;
  speedMs: number | null;
  spend: number | null;
  metaLeads: number | null;
  cpl: number | null;
  error?: string;
}

export interface LaunchPadFigures {
  brand: string;
  conversionLabel: string;
  month: string;
  from: string;
  to: string;
  metaConnected: boolean;
  /** Meta's own window for the spend: this month, last month, or none. */
  metaWindow: "this_month" | "last_month" | null;
  generatedAt: string;
  totals: {
    leads: number;
    converted: number;
    rate: number | null;
    team: number;
    started: number;
    speedMs: number | null;
    monthlyBudget: number;
    spend: number | null;
    metaLeads: number | null;
    cpl: number | null;
    costPerConversion: number | null;
  };
  agents: LaunchPadAgentLine[];
  sources: { source: string; leads: number }[];
  attention: { kind: "unanswered" | "cold"; leadName: string; agentName: string; ageMs: number }[];
  attentionCount: number;
}

export type LaunchPadFiguresResult =
  | { ok: true; figures: LaunchPadFigures }
  | { ok: false; reason: "not-configured" | "not-deployed" | "unavailable"; detail?: string };

function base(): string | null {
  const b = process.env.ADS_API_BASE;
  return b ? b.replace(/\/$/, "") : null;
}

/** One month of TLE's paid-leads figures from Launch Pad. Never throws. */
export async function fetchLaunchPadFigures(month: string): Promise<LaunchPadFiguresResult> {
  const b = base();
  const key = process.env.ADS_API_KEY;
  if (!b || !key) return { ok: false, reason: "not-configured" };
  const controller = new AbortController();
  // Launch Pad asks Meta once per agent, serially, the first time in five
  // minutes. Sixteen agents is a few seconds; give it room.
  const timer = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(
      `${b}/api/partner/brand-figures?brand=lettings&month=${encodeURIComponent(month)}`,
      { headers: { Authorization: `Bearer ${key}` }, cache: "no-store", signal: controller.signal }
    );
    if (res.status === 404) return { ok: false, reason: "not-deployed" };
    if (!res.ok) return { ok: false, reason: "unavailable", detail: `Launch Pad answered ${res.status}` };
    const figures = (await res.json()) as LaunchPadFigures;
    if (!figures?.totals || figures.month !== month) {
      return { ok: false, reason: "unavailable", detail: "Launch Pad answered for a different month" };
    }
    return { ok: true, figures };
  } catch (e) {
    return { ok: false, reason: "unavailable", detail: e instanceof Error ? e.message : undefined };
  } finally {
    clearTimeout(timer);
  }
}
