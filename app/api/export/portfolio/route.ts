import { NextRequest, NextResponse } from "next/server";
import { publicError } from "@/lib/public-error";
import { scopeForWho } from "@/lib/scope";
import { whoIs } from "@/lib/admin";
import { hasDb, q } from "@/lib/db";
import { managedBookFor, managedCertsFor } from "@/lib/managed-book-cache";
import { rexConfigured } from "@/lib/rex";
import { headlineCerts, statusOf, type CertStatus, type CompProperty } from "@/lib/compliance";
import { aboutSheet, idsFrom, noteExport, xlsxResponse } from "@/lib/exports";
import type { ManagedProperty } from "@/lib/portfolio-types";
import type { Value } from "@/lib/xlsx";

/**
 * POST /api/export/portfolio { listings: [...], filters: "..." } → .xlsx
 *
 * Portfolio > Properties as a spreadsheet, for a portfolio review (Kirstie,
 * 16 Oct 2026): each home on screen, its current rent, and a market rent
 * beside it. The book is read the way /api/portfolio reads it, under the same
 * scope, so an agent gets their own homes and nobody gets more than their
 * screen. See lib/exports for the rules. No landlord or tenant email or phone.
 *
 * MARKET RENT. The OS holds no market rent for a let home. The one figure it
 * has is an agent's valuation from a market appraisal done in the OS, matched
 * on the REX property; that goes in where it exists and says so. Otherwise
 * the cell is left empty to fill in during the review, and the Difference
 * column works it out once it is.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/* Same words as the Certificates column on the screen. */
const RANK: Record<CertStatus, number> = { expired: 0, urgent: 1, missing: 2, watch: 3, ok: 4 };
function certSummary(cp: CompProperty | undefined): string {
  if (!cp) return "";
  const counts: Record<CertStatus, number> = { expired: 0, urgent: 0, missing: 0, watch: 0, ok: 0 };
  for (const k of headlineCerts(cp)) counts[statusOf(cp.certs[k])]++;
  const worst = (Object.keys(RANK) as CertStatus[]).sort((a, b) => RANK[a] - RANK[b]).find((s) => counts[s] > 0) ?? "ok";
  return worst === "expired" ? `${counts.expired} expired`
    : worst === "urgent" ? `${counts.urgent} due soon`
    : worst === "missing" ? `${counts.missing} no record`
    : worst === "watch" ? `${counts.watch} due in 90 days`
    : "In date";
}

/** The latest OS appraisal valuation per REX property, £ pcm. */
async function valuations(propertyIds: string[]): Promise<Map<string, { pcm: number; on: string | null }>> {
  const out = new Map<string, { pcm: number; on: string | null }>();
  if (!hasDb() || !propertyIds.length) return out;
  try {
    const rows = await q<{ rex_property_id: string; valuation: number; valued_at: Date | string | null }>(
      `SELECT DISTINCT ON (rex_property_id) rex_property_id, valuation, valued_at
         FROM os_market_appraisals
        WHERE rex_property_id = ANY($1::text[]) AND valuation IS NOT NULL AND cancelled_at IS NULL
        ORDER BY rex_property_id, valued_at DESC NULLS LAST, updated_at DESC`,
      [propertyIds]
    );
    for (const r of rows) {
      out.set(String(r.rex_property_id), { pcm: Number(r.valuation), on: r.valued_at ? new Date(r.valued_at).toISOString().slice(0, 10) : null });
    }
  } catch (e) {
    console.error("[export/portfolio] valuations", e instanceof Error ? e.message : e);
  }
  return out;
}

const SERVICE: Record<string, string> = { "Let Only": "Let only", "Rent Collect": "Rent collect" };

export async function POST(req: NextRequest) {
  if (!rexConfigured()) {
    return NextResponse.json({ ok: false, error: "REX isn't connected on this environment, so there is no book to download." }, { status: 503 });
  }
  const who = hasDb() ? await whoIs(req).catch(() => null) : null;
  if (hasDb() && !who?.actor) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const scope = await scopeForWho(req, who);
  if (scope.unlinked) {
    return NextResponse.json({ ok: false, error: "We can't tell which REX user you are, so there is no portfolio to download. Ask James to link your account." }, { status: 403 });
  }
  const asked = await idsFrom(req, "listings");
  if (!asked) return NextResponse.json({ ok: false, error: "Nothing to download." }, { status: 400 });

  try {
    const { book } = await managedBookFor(scope.rexUserId);
    const byId = new Map(book.properties.map((p) => [String(p.listingId), p]));
    /* In the screen's order, and only homes in this person's book. */
    const homes: ManagedProperty[] = [];
    for (const id of asked.ids) {
      const p = byId.get(id);
      if (p && !p.test) homes.push(p);
    }
    const certs = await managedCertsFor(scope.rexUserId, book).catch(() => null);
    const certBy = certs?.status === "ready" ? new Map(certs.certs.properties.map((c) => [String(c.id), c])) : null;
    const valued = await valuations([...new Set(homes.map((p) => p.propertyId).filter((x): x is string => Boolean(x)))]);

    const rows: Value[][] = homes.map((p) => {
      const v = p.propertyId ? valued.get(String(p.propertyId)) : undefined;
      return [
        p.name,
        p.locality,
        p.town,
        p.postcode,
        p.service ? SERVICE[p.service] ?? p.service : "",
        p.letType,
        p.agent?.name ?? "",
        p.landlord?.name ?? "",
        p.tenants.map((t) => t.name).filter(Boolean).join(", "),
        p.letSince,
        p.rent,
        p.rent == null ? "" : p.rentPeriod === "week" ? "Week" : "Month",
        p.rentMonthly == null ? null : Math.round(p.rentMonthly),
        p.rent == null ? "" : p.rentSource === "payprop" ? "PayProp" : "REX",
        v?.pcm ?? null,
        v ? `Appraisal${v.on ? ` ${new Date(`${v.on}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}` : ""}` : "",
        `IF(OR(O{r}="",M{r}=""),"",O{r}-M{r})`,
        p.notice ? (p.notice.leavingOn ?? "Notice given") : "",
        certBy ? certSummary(p.propertyId ? certBy.get(String(p.propertyId)) : undefined) : "",
        p.ref ?? "",
      ];
    });

    await noteExport(req, who?.actor ?? null, "Portfolio", rows.length, asked.filters);

    const rentRoll = homes.reduce((a, p) => a + (p.rentMonthly ?? 0), 0);
    return xlsxResponse("Portfolio", [
      {
        name: "Properties",
        columns: [
          { header: "Property", width: 34 },
          { header: "Area", width: 22 },
          { header: "Town", width: 14 },
          { header: "Postcode", width: 10 },
          { header: "Service", width: 13 },
          { header: "Let type", width: 11 },
          { header: "Agent", width: 20 },
          { header: "Landlord", width: 24 },
          { header: "Tenants", width: 30 },
          { header: "Let since", kind: "date", width: 12 },
          { header: "Rent", kind: "money", width: 9 },
          { header: "Rent per", width: 9 },
          { header: "Current rent pcm", kind: "money", width: 15 },
          { header: "Rent from", width: 10 },
          { header: "Market rent pcm", kind: "money", width: 15 },
          { header: "Market rent from", width: 18 },
          { header: "Difference pcm", kind: "formula", width: 14 },
          { header: "Tenants leaving", kind: "date", width: 14 },
          { header: "Certificates", width: 15 },
          { header: "Ref", width: 10 },
        ],
        rows,
      },
      aboutSheet([
        ["From", `Portfolio > Properties, ${scope.everything ? "the whole business" : `${scope.label}'s book`}, read live when you pressed the button.`],
        ["Filters on screen", asked.filters || "None"],
        ["Homes", `${rows.length}, current rent ${`£${Math.round(rentRoll).toLocaleString("en-GB")}`} pcm in all.`],
        ["Current rent", "The agreed rent on each home's current let, from REX, or from PayProp where REX holds none (Rent from says which). Current rent pcm is the monthly figure, a weekly rent turned into a month."],
        ["Market rent", "Filled in only where an agent valued the home at a market appraisal in the OS (Market rent from gives the date). The OS holds no other market rent, so the rest are empty to fill in. Difference pcm works itself out as you do."],
        ["Certificates", certBy ? "The same summary as the Certificates column on the screen." : "Still being read when you downloaded, so left empty. Download again in a few minutes."],
      ]),
    ]);
  } catch (e) {
    return NextResponse.json({ ok: false, error: publicError(e, "REX didn't answer, so the spreadsheet couldn't be made. Try again in a moment.") }, { status: 502 });
  }
}
