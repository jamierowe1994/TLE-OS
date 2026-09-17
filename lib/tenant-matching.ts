import "server-only";
import { bookFor } from "@/lib/listings-cache";
import type { OsListing } from "@/lib/rex-listings";
import { HOLDING_FEE_WORDING } from "@/lib/email/tle-documents";

/**
 * The small facts several tenant emails need about homes (16 Sep 2026).
 *
 * ── Why "nearby, at a similar rent" and not "matches their criteria" ─────
 *
 * The OS holds no tenant criteria. A REX lead's budget and move date are "—",
 * the passport has income and household but no target area or beds, and the
 * only property search runs in the browser. So the honest match is to the
 * home they already showed us they wanted: same town or postcode district,
 * rent within a fifth either way, live and not let agreed, nearest rent
 * first. When criteria are captured this is the one function to change.
 */

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** "NN1 4LA" -> "NN1". Tolerates a missing space. */
export function districtOf(postcode: string | null | undefined): string | null {
  const p = (postcode ?? "").toUpperCase().replace(/\s+/g, "");
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(p)) return null;
  return p.slice(0, -3);
}

const SCOTTISH_AREAS = new Set(["AB", "DD", "DG", "EH", "FK", "G", "HS", "IV", "KA", "KW", "KY", "ML", "PA", "PH", "TD", "ZE"]);

/** Scotland by postcode area. The listing's agreement type is better where it is to hand (lib/handover). */
export function isScottish(postcode: string | null | undefined): boolean {
  const d = districtOf(postcode);
  const area = d?.match(/^[A-Z]{1,2}/)?.[0] ?? "";
  return SCOTTISH_AREAS.has(area);
}

/** Pounds, with pence only when there are any. */
export function pounds(n: number): string {
  const pence = Math.round(n * 100);
  return pence % 100 === 0
    ? `£${(pence / 100).toLocaleString("en-GB")}`
    : `£${(pence / 100).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** A week's rent, rounded DOWN to the penny - the Tenant Fees Act cap on a holding deposit. */
export function weeksRent(rentPcm: number): number {
  return Math.floor(((rentPcm * 12) / 52) * 100) / 100;
}

/**
 * What it costs to move in, as the lines the enquiry reply prints.
 *
 * England: a week's holding fee, five weeks' deposit (the cap below £50,000 a
 * year), the first month. Scotland: no holding fee, and a deposit is agreed
 * per tenancy up to two months, so it is not stated as a figure.
 */
export function moveInCosts(rentPcm: number, scottish: boolean): { list: string; feesLine: string } {
  if (scottish) {
    return {
      list: `First month's rent: <strong>${pounds(rentPcm)}</strong><br>A deposit, protected in a government-approved scheme. We'll confirm the amount with you before you apply`,
      feesLine: "No admin fees, no referencing fees and no holding fee.",
    };
  }
  const deposit = Math.floor(((rentPcm * 12) / 52) * 5 * 100) / 100;
  return {
    list: `Holding fee (one week's rent): <strong>${pounds(weeksRent(rentPcm))}</strong><br>Deposit (five weeks' rent): <strong>${pounds(deposit)}</strong><br>First month's rent: <strong>${pounds(rentPcm)}</strong>`,
    feesLine: "No admin fees and no referencing fees. The holding fee goes towards your first month's rent.",
  };
}

/** The "if it's a yes" holding-fee sentence for a home, England or Scotland. */
export function holdingFeeIfYes(rentPcm: number | null, scottish: boolean): string {
  if (scottish) return HOLDING_FEE_WORDING.scotland.ifYes();
  return HOLDING_FEE_WORDING.england.ifYes(rentPcm ? pounds(weeksRent(rentPcm)) : "one week's rent");
}

/** The whole live book, from the shared cache - one REX read an hour at most. */
export async function liveBook(): Promise<OsListing[]> {
  const book = await bookFor(null).catch(() => null);
  return (book?.listings ?? []).filter((l) => !l.letAgreed && l.publicationStatus === "published" && (l.rentMonthly ?? 0) > 0);
}

export function findListing(book: OsListing[], id: string | number | null | undefined): OsListing | null {
  if (id == null || id === "") return null;
  return book.find((l) => String(l.id) === String(id)) ?? null;
}

/**
 * Up to `limit` live homes like the ones given: same postcode district (or
 * town when there is no postcode), rent within 20%, nearest rent first.
 * `since` keeps only homes published after it, for "what has come on since".
 */
export function similarHomes(
  book: OsListing[],
  like: { postcode?: string | null; locality?: string | null; rentMonthly?: number | null }[],
  opts: { exclude?: (string | number)[]; since?: Date | null; limit?: number } = {}
): OsListing[] {
  const exclude = new Set((opts.exclude ?? []).map(String));
  const districts = new Set(like.map((l) => districtOf(l.postcode)).filter((d): d is string => Boolean(d)));
  const towns = new Set(
    like.map((l) => (l.locality ?? "").split(",")[0].replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, "").trim().toLowerCase()).filter(Boolean)
  );
  const rents = like.map((l) => l.rentMonthly ?? 0).filter((r) => r > 0);
  const mid = rents.length ? rents.reduce((a, b) => a + b, 0) / rents.length : 0;

  return book
    .filter((l) => !exclude.has(String(l.id)))
    .filter((l) => {
      const d = districtOf(l.postcode);
      const town = (l.locality ?? "").split(",")[0].replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, "").trim().toLowerCase();
      return (d && districts.has(d)) || (town && towns.has(town));
    })
    .filter((l) => !mid || Math.abs((l.rentMonthly ?? 0) - mid) <= mid * 0.2)
    .filter((l) => !opts.since || (l.publishedAt ? new Date(l.publishedAt) > opts.since : false))
    .sort((a, b) => Math.abs((a.rentMonthly ?? 0) - mid) - Math.abs((b.rentMonthly ?? 0) - mid))
    .slice(0, opts.limit ?? 3);
}

/** One line per home, rent first, the way Homes That Fit prints them. */
export function homesListHtml(homes: { name: string; locality?: string | null; rentMonthly?: number | null; rent?: number | null }[]): string {
  return homes
    .map((h) => {
      const r = h.rentMonthly ?? h.rent ?? null;
      const rent = r && r > 0 ? `<strong>£${Math.round(r).toLocaleString("en-GB")} pcm</strong> · ` : "";
      return `${rent}${esc(h.name)}${h.locality ? `, ${esc(h.locality)}` : ""}`;
    })
    .join("<br>");
}
