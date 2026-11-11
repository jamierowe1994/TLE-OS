/**
 * A case study as the website draws it (James, 11 Nov 2026). Pure, so the
 * server feed (lib/case-studies forWebsite) and the OS's visual editor build
 * exactly the same thing: what the agent sees in the editor is what goes out.
 */

export interface CasePhoto {
  url: string;
  /** "rex" came from the listing, "upload" the agent added. */
  from: "rex" | "upload";
}

export interface CaseFacts {
  beds: number | null;
  baths: number | null;
  propertyType: string | null;
  rent: number | null;
  rentPeriod: "month" | "week" | null;
  /** YYYY-MM-DD the advert went live, and the day REX moved it on (let agreed or let). */
  publishedOn: string | null;
  letOn: string | null;
  daysToLet: number | null;
}

/** What an agent can switch off on the page: each fact, and the advert section. */
export const HIDE_KEYS = ["type", "beds", "days", "rent", "let", "advert"] as const;
export type HideKey = (typeof HIDE_KEYS)[number];

export interface CaseShapeInput {
  id: string; slug: string; title: string; area: string; intro: string; headline: string;
  advert: string; story: string; notes: string; photos: CasePhoto[]; facts: CaseFacts;
  showRent: boolean; showDays: boolean; hidden: HideKey[];
  agentRexId: string | null; agentName: string; publishedAt: string | null;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function paragraphs(s: string): string[] {
  return s.split(/\n{2,}/).map((p) => p.replace(/\n/g, " ").trim()).filter(Boolean);
}

/** Everything switched off, including the older rent / days switches. */
export function hiddenOf(c: Pick<CaseShapeInput, "hidden" | "showRent" | "showDays">): HideKey[] {
  const out = new Set<HideKey>((c.hidden ?? []).filter((k): k is HideKey => (HIDE_KEYS as readonly string[]).includes(k)));
  if (!c.showRent) out.add("rent");
  if (!c.showDays) out.add("days");
  return [...out];
}

/**
 * The website's shape. `full` keeps the hidden facts in (the editor greys them
 * and offers Show); the public feed leaves them out, so a hidden rent is never
 * sent to the website at all.
 */
export function toWebsiteShape(c: CaseShapeInput, osOrigin: string, { full = false } = {}) {
  const f = c.facts;
  const hidden = hiddenOf(c);
  const off = (k: HideKey) => !full && hidden.includes(k);
  const letOn = f.letOn ? new Date(f.letOn) : null;
  return {
    id: c.id,
    slug: c.slug,
    title: c.title,
    area: c.area || null,
    propertyType: off("type") ? null : f.propertyType,
    beds: off("beds") ? null : f.beds,
    baths: f.baths,
    intro: c.intro || null,
    headline: off("advert") ? null : c.headline || null,
    advert: off("advert") ? [] : paragraphs(c.advert),
    story: paragraphs(c.story),
    notes: paragraphs(c.notes),
    photos: c.photos.map((p) => (p.url.startsWith("/") ? `${osOrigin}${p.url}` : p.url)),
    rent: off("rent") ? null : f.rent,
    rentPeriod: off("rent") ? null : f.rentPeriod,
    daysToLet: off("days") ? null : f.daysToLet,
    letMonth: off("let") || !letOn ? null : `${MONTHS[letOn.getUTCMonth()]} ${letOn.getUTCFullYear()}`,
    agent: c.agentRexId ? { id: c.agentRexId, name: c.agentName } : null,
    publishedAt: c.publishedAt,
    hidden,
  };
}
