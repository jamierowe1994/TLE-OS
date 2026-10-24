import { NextRequest } from "next/server";
import { rexSearchAll } from "@/lib/rex";
import { websiteAuth, websiteError, websiteJson } from "../_lib/auth";
import { swr } from "../_lib/held";

/**
 * GET /api/public/website/figures - this month's lets, for the website.
 * Bearer WEBSITE_API_TOKEN.
 *
 * Live and month-scoped with no month literal: REX's `leased` residential
 * rentals whose state_date is on or after the first of the current month,
 * so it rolls over on its own. Days to let is publication time to leased
 * date, and the average is quoted ONLY with four or more lets carrying both
 * timestamps; otherwise it is null and the website says nothing. Held
 * fifteen minutes fresh, six hours at most, keyed by month so last month's
 * number can never carry over. A failed read with nothing held is a 502,
 * never a stale number dressed as a live one.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export interface WebsiteFigures {
  month: string;
  monthStart: string;
  letThisMonth: number;
  /** null when fewer than four lets this month have both timestamps. */
  avgDaysToLet: number | null;
  daysToLetSample: number;
  computedAt: string;
}

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function monthStartISO(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
}

async function fetchFigures(): Promise<WebsiteFigures> {
  const start = monthStartISO();
  const rows = await rexSearchAll(
    "Listings",
    {
      criteria: [
        { name: "system_listing_state", value: "leased" },
        { name: "listing_category_id", value: "residential_rental" },
        { name: "state_date", type: ">=", value: start },
      ],
      order_by: { state_date: "desc" },
    },
    { max: 500 }
  );
  const within = rows.filter((r) => (str(r.state_date) ?? "") >= start);
  const days = within
    .map((r) => {
      const pub = num(r.system_publication_time);
      const leased = str(r.state_date);
      if (!pub || !leased) return null;
      const d = (new Date(leased).getTime() - pub * 1000) / 86400000;
      return d >= 0 && d < 400 ? d : null;
    })
    .filter((d): d is number => d != null);
  const avg = days.length >= 4 ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : null;
  return {
    month: new Date().toLocaleString("en-GB", { month: "long" }),
    monthStart: start,
    letThisMonth: within.length,
    avgDaysToLet: avg,
    daysToLetSample: days.length,
    computedAt: new Date().toISOString(),
  };
}

export async function GET(req: NextRequest) {
  const refused = websiteAuth(req);
  if (refused) return refused;
  try {
    const held = await swr(`website:figures:v1:${monthStartISO()}`, fetchFigures, {
      freshMs: 15 * 60 * 1000,
      keepMs: 6 * 60 * 60 * 1000,
    });
    return websiteJson({ ok: true, ...held.value, stale: held.stale, ageMs: held.ageMs });
  } catch (err) {
    return websiteError(err);
  }
}
