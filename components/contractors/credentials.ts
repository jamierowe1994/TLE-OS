import type { Contractor } from "@/lib/works-orders";
import { ukDaysFromToday } from "@/lib/london-clock";

/**
 * A contractor's credentials, said the same way on the card, the record and
 * the form (James, 21 Oct 2026: "gas safety numbers or NAPIT numbers ... a
 * public liability option, the public liability number").
 *
 * Client-safe: no server imports.
 */

/** Where a job opens: its own full page (James, 21 Oct 2026). */
export const jobHref = (id: string) => `/maintenance/${encodeURIComponent(id)}`;

/** Insurance running out inside this many days is called out in amber. */
export const LIABILITY_SOON_DAYS = 30;

/* The registers Michael checks a certificate against (the same pages as
   REGISTERS in lib/cert-register, which is server-only). */
const REGISTER = {
  gas: { name: "Gas Safe Register", url: "https://www.gassaferegister.co.uk/find-an-engineer-or-check-the-register/" },
  niceic: { name: "NICEIC", url: "https://www.niceic.com/find-a-contractor" },
  napit: { name: "NAPIT", url: "https://search.napit.org.uk/" },
};

export interface Credential {
  key: "gas" | "niceic" | "napit" | "other" | "legacy";
  label: string;
  value: string;
  register?: { name: string; url: string };
}

/** Every registration on file. The old one-box registration shows only while the new boxes are blank. */
export function credentialsOf(c: Partial<Contractor>): Credential[] {
  const out: Credential[] = [];
  const t = (v: string | undefined | null) => (v ?? "").trim();
  if (t(c.gasSafeNumber)) out.push({ key: "gas", label: "Gas Safe", value: t(c.gasSafeNumber), register: REGISTER.gas });
  if (t(c.niceicNumber)) out.push({ key: "niceic", label: "NICEIC", value: t(c.niceicNumber), register: REGISTER.niceic });
  if (t(c.napitNumber)) out.push({ key: "napit", label: "NAPIT", value: t(c.napitNumber), register: REGISTER.napit });
  if (t(c.otherRegistration)) out.push({ key: "other", label: "Other registration", value: t(c.otherRegistration) });
  if (!out.length && t(c.registration)) out.push({ key: "legacy", label: "Registration", value: t(c.registration) });
  return out;
}

export type LiabilityState = "none" | "ok" | "soon" | "expired" | "no_date";

/** Public liability: is it on file, and is it in date. */
export function liabilityOf(c: Partial<Contractor>): { state: LiabilityState; days: number | null; pill: string; tone: "neutral" | "good" | "warn" | "accent" } {
  const any = Boolean((c.publicLiabilityNumber ?? "").trim() || (c.publicLiabilityInsurer ?? "").trim() || c.publicLiabilityExpiry);
  if (!any) return { state: "none", days: null, pill: "No insurance on file", tone: "neutral" };
  if (!c.publicLiabilityExpiry) return { state: "no_date", days: null, pill: "Insured, no expiry given", tone: "neutral" };
  const days = ukDaysFromToday(c.publicLiabilityExpiry);
  if (days < 0) return { state: "expired", days, pill: `Insurance expired ${longDay(c.publicLiabilityExpiry)}`, tone: "accent" };
  if (days <= LIABILITY_SOON_DAYS) return { state: "soon", days, pill: days === 0 ? "Insurance expires today" : `Insurance expires in ${days} ${days === 1 ? "day" : "days"}`, tone: "warn" };
  return { state: "ok", days, pill: `Insured to ${longDay(c.publicLiabilityExpiry)}`, tone: "good" };
}

/** "2027-03-14" as "14 Mar 2027". */
export function longDay(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
}

/** Pounds for a cover figure: £5m, £2,000,000 reads better as £2m. */
export function coverWords(pence: number | null | undefined): string {
  if (pence == null || !Number.isFinite(pence) || pence <= 0) return "";
  const pounds = pence / 100;
  if (pounds >= 1_000_000 && pounds % 100_000 === 0) return `£${(pounds / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 1 })}m`;
  return `£${pounds.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

/** A website as a link: "jdplumbing.co.uk" becomes https://jdplumbing.co.uk. */
export function siteHref(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t.replace(/^\/+/, "")}`;
  try {
    const u = new URL(withScheme);
    return u.protocol === "http:" || u.protocol === "https:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** The website without the https:// and www, for showing. */
export const siteLabel = (raw: string | null | undefined) => (raw ?? "").trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").replace(/\/$/, "");
