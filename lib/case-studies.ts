import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { listingRead, readListingDetails } from "@/lib/listing-details";
import { noDashes } from "@/lib/no-dashes";
import { HIDE_KEYS, toWebsiteShape, type CaseFacts, type CasePhoto, type HideKey } from "@/lib/case-study-shape";

export type { CaseFacts, CasePhoto, HideKey };

/**
 * Case studies (James, 11 Nov 2026, from Richard): a home an agent has let,
 * written up and published on the website, on /case-studies and on the
 * agent's own page there.
 *
 * Started from the listing in REX (its photos, its advert, the home's facts)
 * by "Use as a case study" on the home's page or the listing's menu. From then
 * on it is the agent's own copy in os_case_studies: they reorder and drop
 * photos, add their own, and write the intro, the story and their notes.
 * Nothing is written back to REX.
 *
 * Public, so never the house number: the title is the street and the town,
 * the way the portals print it.
 */

export type CaseStatus = "draft" | "published";

export interface CaseStudy {
  id: string;
  slug: string;
  listingId: string;
  propertyId: string | null;
  agentRexId: string | null;
  agentName: string;
  status: CaseStatus;
  title: string;
  area: string;
  intro: string;
  headline: string;
  advert: string;
  story: string;
  notes: string;
  photos: CasePhoto[];
  facts: CaseFacts;
  showRent: boolean;
  showDays: boolean;
  hidden: HideKey[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
}

type Row = {
  id: string; slug: string; listing_id: string; property_id: string | null; agent_rex_id: string | null;
  agent_name: string; status: string; title: string; area: string; intro: string; headline: string;
  advert: string; story: string; notes: string; photos: unknown; facts: unknown; show_rent: boolean;
  show_days: boolean; hidden: unknown; created_by: string; created_at: Date; updated_at: Date; published_at: Date | null;
};

const EMPTY_FACTS: CaseFacts = { beds: null, baths: null, propertyType: null, rent: null, rentPeriod: null, publishedOn: null, letOn: null, daysToLet: null };

function toCase(r: Row): CaseStudy {
  const photos = Array.isArray(r.photos) ? (r.photos as CasePhoto[]).filter((p) => p && typeof p.url === "string") : [];
  return {
    id: r.id,
    slug: r.slug,
    listingId: r.listing_id,
    propertyId: r.property_id,
    agentRexId: r.agent_rex_id,
    agentName: r.agent_name,
    status: r.status === "published" ? "published" : "draft",
    title: r.title,
    area: r.area,
    intro: r.intro,
    headline: r.headline,
    advert: r.advert,
    story: r.story,
    notes: r.notes,
    photos,
    facts: { ...EMPTY_FACTS, ...((r.facts ?? {}) as Partial<CaseFacts>) },
    showRent: r.show_rent,
    showDays: r.show_days,
    hidden: Array.isArray(r.hidden) ? (r.hidden as string[]).filter((k): k is HideKey => (HIDE_KEYS as readonly string[]).includes(k)) : [],
    createdBy: r.created_by,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    publishedAt: r.published_at ? r.published_at.toISOString() : null,
  };
}

function slugify(s: string): string {
  return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
}

/** REX advert copy: markdown stars out, Windows line ends in, dashes as the house rule has them. */
export function tidyCopy(s: string): string {
  return noDashes(s.replace(/\r\n/g, "\n").replace(/\*\*?/g, "").replace(/[ \t]+\n/g, "\n").trim());
}

const DAY = 86_400_000;

/** "2 bedroom flat", or "room in a house share" - a room let has no bedroom count worth saying. */
export function homeKind(beds: number | null, type: string | null): string {
  const t = (type ?? "home").toLowerCase();
  if (/share|hmo|room/.test(t)) return /room/.test(t) ? t : `room in a ${t}`;
  return [beds ? `${beds} bedroom` : null, t].filter(Boolean).join(" ");
}
function day(v: unknown): string | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  const d = Number.isFinite(n) && String(v).length >= 9 && !String(v).includes("-") ? new Date(n * 1000) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

/* ---------------------------------------------------------------- reads -- */

export async function listCaseStudies(opts: { agentRexId?: string | null; publishedOnly?: boolean } = {}): Promise<CaseStudy[]> {
  if (!hasDb()) return [];
  const where = ["removed_at IS NULL"];
  const params: unknown[] = [];
  if (opts.agentRexId) { params.push(opts.agentRexId); where.push(`agent_rex_id = $${params.length}`); }
  if (opts.publishedOnly) where.push("status = 'published'");
  const rows = await q<Row>(
    `SELECT * FROM os_case_studies WHERE ${where.join(" AND ")} ORDER BY coalesce(published_at, updated_at) DESC`,
    params
  );
  return rows.map(toCase);
}

export async function getCaseStudy(id: string): Promise<CaseStudy | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>("SELECT * FROM os_case_studies WHERE id = $1 AND removed_at IS NULL", [id]);
  return rows[0] ? toCase(rows[0]) : null;
}

export async function caseStudyForListing(listingId: string): Promise<CaseStudy | null> {
  if (!hasDb()) return null;
  const rows = await q<Row>("SELECT * FROM os_case_studies WHERE listing_id = $1 AND removed_at IS NULL", [String(listingId)]);
  return rows[0] ? toCase(rows[0]) : null;
}

/* --------------------------------------------------------------- create -- */

/** What a new case study starts from: the listing, read live from REX. */
export async function draftFromListing(listingId: string) {
  const id = Number(listingId);
  if (!Number.isFinite(id) || id <= 0) throw new Error("That home has no listing to start a case study from.");
  const d = await readListingDetails(id, { cached: true });
  /* The dates are on the raw record, already held by the read above. */
  const raw = await listingRead(id, "Listings", "read", { id }).catch(() => null);
  const l = ((raw?.ok ? raw.result : null) ?? {}) as Record<string, unknown>;
  const publishedOn = day(l.system_publication_time);
  const state = String(l.system_listing_state ?? "");
  const letAgreed = l.let_agreed != null && l.let_agreed !== "0" && l.let_agreed !== 0 && l.let_agreed !== false;
  const letOn = state === "leased" || letAgreed ? day(l.state_date) ?? day(l.system_modtime) : null;
  const daysToLet = publishedOn && letOn ? Math.max(0, Math.round((Date.parse(letOn) - Date.parse(publishedOn)) / DAY)) : null;
  const period = (d.rentPeriod ?? "").toLowerCase();
  const street = (d.streetName || "").trim();
  const title = [street, d.town].filter(Boolean).join(", ") || d.town || "A home we let";
  const kind = homeKind(d.beds, d.propertyType);
  return {
    details: d,
    title,
    area: d.town || "",
    /* "Let in 9 days" sells; "let in 118 days" does not, and REX's let date
       for a room re-advertised over the summer can run long. So the speed is
       only offered up front when it is a month or less; the agent can still
       switch it on. */
    quick: daysToLet != null && daysToLet <= 30,
    intro: `How we let this ${kind}${d.town ? ` in ${d.town}` : ""}${daysToLet != null && daysToLet <= 30 ? `, in ${daysToLet <= 1 ? "a day" : `${daysToLet} days`}` : ""}.`,
    headline: tidyCopy(d.heading),
    advert: tidyCopy(d.body),
    photos: d.images.slice().sort((a, b) => a.priority - b.priority).map((m) => ({ url: m.url.replace(/^\/\//, "https://"), from: "rex" as const })),
    facts: {
      beds: d.beds,
      baths: d.baths,
      propertyType: d.propertyType,
      rent: d.rent,
      rentPeriod: period.startsWith("week") ? "week" : period ? "month" : null,
      publishedOn,
      letOn,
      daysToLet,
    } satisfies CaseFacts,
  };
}

async function freeSlug(base: string): Promise<string> {
  const root = slugify(base) || "case-study";
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? root : `${root}-${i + 1}`;
    const rows = await q("SELECT 1 FROM os_case_studies WHERE slug = $1", [slug]);
    if (rows.length === 0) return slug;
  }
  return `${root}-${randomUUID().slice(0, 6)}`;
}

/** One per listing: asking again opens the one already started. */
export async function createCaseStudy(listingId: string, by: string): Promise<{ study: CaseStudy; existed: boolean }> {
  const had = await caseStudyForListing(listingId);
  if (had) return { study: had, existed: true };
  const draft = await draftFromListing(listingId);
  const id = randomUUID().replace(/-/g, "").slice(0, 24);
  const slug = await freeSlug(draft.title);
  const rows = await q<Row>(
    `INSERT INTO os_case_studies (id, slug, listing_id, property_id, agent_rex_id, agent_name, title, area, intro, headline, advert, photos, facts, created_by, show_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14,$15)
     ON CONFLICT DO NOTHING RETURNING *`,
    [id, slug, String(listingId), draft.details.propertyId, draft.details.agent.id, draft.details.agent.name ?? "",
      draft.title, draft.area, draft.intro, draft.headline, draft.advert, JSON.stringify(draft.photos), JSON.stringify(draft.facts), by, draft.quick]
  );
  if (rows[0]) return { study: toCase(rows[0]), existed: false };
  /* Two presses at once: the other one won. */
  const won = await caseStudyForListing(listingId);
  if (!won) throw new Error("The case study could not be started.");
  return { study: won, existed: true };
}

/* ---------------------------------------------------------------- write -- */

export interface CasePatch {
  title?: string; area?: string; intro?: string; headline?: string; advert?: string; story?: string; notes?: string;
  photos?: CasePhoto[]; showRent?: boolean; showDays?: boolean; hidden?: HideKey[]; status?: CaseStatus;
}

const TEXT_LIMITS: Record<string, number> = { title: 120, area: 80, intro: 400, headline: 300, advert: 8000, story: 6000, notes: 4000 };

export function cleanPatch(body: Record<string, unknown>): CasePatch | string {
  const out: CasePatch = {};
  for (const k of Object.keys(TEXT_LIMITS) as (keyof typeof TEXT_LIMITS)[]) {
    const v = body[k];
    if (v === undefined) continue;
    if (typeof v !== "string") return `${k} must be text.`;
    const t = noDashes(v.replace(/\r\n/g, "\n")).trim();
    if (t.length > TEXT_LIMITS[k]) return `That ${k === "advert" ? "advert" : k} is too long.`;
    (out as Record<string, unknown>)[k] = t;
  }
  if (out.title !== undefined && !out.title) return "Give it a title.";
  if (body.photos !== undefined) {
    if (!Array.isArray(body.photos)) return "Photos must be a list.";
    const photos: CasePhoto[] = [];
    for (const p of body.photos as unknown[]) {
      const url = typeof (p as CasePhoto)?.url === "string" ? (p as CasePhoto).url : null;
      if (!url || !/^https:\/\//.test(url) && !url.startsWith("/case-img/")) return "One of the photos isn't a picture we can show.";
      photos.push({ url, from: (p as CasePhoto).from === "upload" ? "upload" : "rex" });
    }
    if (photos.length > 60) return "That's more photos than a case study can hold (60).";
    out.photos = photos;
  }
  if (typeof body.showRent === "boolean") out.showRent = body.showRent;
  if (typeof body.showDays === "boolean") out.showDays = body.showDays;
  if (body.hidden !== undefined) {
    if (!Array.isArray(body.hidden) || body.hidden.some((k) => !(HIDE_KEYS as readonly unknown[]).includes(k))) return "That isn't something that can be hidden.";
    out.hidden = [...new Set(body.hidden as HideKey[])];
  }
  if (body.status === "draft" || body.status === "published") out.status = body.status;
  return out;
}

export async function updateCaseStudy(id: string, patch: CasePatch): Promise<CaseStudy | null> {
  const sets: string[] = [];
  const params: unknown[] = [];
  const set = (col: string, v: unknown, cast = "") => { params.push(v); sets.push(`${col} = $${params.length}${cast}`); };
  if (patch.title !== undefined) set("title", patch.title);
  if (patch.area !== undefined) set("area", patch.area);
  if (patch.intro !== undefined) set("intro", patch.intro);
  if (patch.headline !== undefined) set("headline", patch.headline);
  if (patch.advert !== undefined) set("advert", patch.advert);
  if (patch.story !== undefined) set("story", patch.story);
  if (patch.notes !== undefined) set("notes", patch.notes);
  if (patch.photos !== undefined) set("photos", JSON.stringify(patch.photos), "::jsonb");
  if (patch.showRent !== undefined) set("show_rent", patch.showRent);
  if (patch.showDays !== undefined) set("show_days", patch.showDays);
  if (patch.hidden !== undefined) set("hidden", JSON.stringify(patch.hidden), "::jsonb");
  if (patch.status !== undefined) {
    set("status", patch.status);
    sets.push(patch.status === "published" ? "published_at = coalesce(published_at, NOW())" : "published_at = NULL");
  }
  if (sets.length === 0) return getCaseStudy(id);
  sets.push("updated_at = NOW()");
  params.push(id);
  const rows = await q<Row>(
    `UPDATE os_case_studies SET ${sets.join(", ")} WHERE id = $${params.length} AND removed_at IS NULL RETURNING *`,
    params
  );
  return rows[0] ? toCase(rows[0]) : null;
}

export async function removeCaseStudy(id: string): Promise<boolean> {
  const rows = await q("UPDATE os_case_studies SET removed_at = NOW(), status = 'draft' WHERE id = $1 AND removed_at IS NULL RETURNING id", [id]);
  return rows.length > 0;
}

/* --------------------------------------------------------------- public -- */

/** What the website gets: published only, already worded, hidden things left out. */
export function forWebsite(c: CaseStudy, osOrigin: string) {
  return toWebsiteShape(c, osOrigin);
}

/** The address the website shows it at. */
export function websiteUrlFor(c: Pick<CaseStudy, "slug">): string {
  const base = (process.env.WEBSITE_ORIGIN ?? "https://thelettingexperts.co.uk").replace(/\/+$/, "");
  return `${base}/case-studies/${c.slug}`;
}
