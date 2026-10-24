import { rexSearchAll } from "@/lib/rex";
import { RULES } from "@/lib/staleness";
import { swr, type Held } from "./held";

/**
 * What the website needs per listing that the OS book does not carry.
 *
 * The cached book (lib/listings-cache.ts, OsListing) was shaped for the
 * agents' own screens and holds no listing agent, no town on its own, no
 * deposit and no highlights. The website's microsites and cards need all
 * four. Rather than widen OsListing and bump every warm cache on every
 * environment, this is ONE light REX walk - published, current, residential
 * rentals, no extra_fields, so two pages of a hundred - indexed by listing id
 * and held on the same clock as the book. It is the only REX read this feed
 * adds; the write-up, photographs and everything else come from the book.
 *
 * A follow-up could fold these fields into OsListing (bump listings:v4 to
 * v5) and delete this file.
 */
export interface ListingExtra {
  agent: { id: string; name: string; email: string | null; phone: string | null; position: string | null; photo: string | null } | null;
  town: string | null;
  deposit: number | null;
  highlights: string[];
  councilTaxIncluded: boolean | null;
  minimumTermMonths: number | null;
}

type Row = Record<string, unknown>;
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const obj = (v: unknown): Row => (v && typeof v === "object" ? (v as Row) : {});
const https = (u: string | null): string | null => (u ? (u.startsWith("//") ? `https:${u}` : u) : null);

function agentOf(l: Row): ListingExtra["agent"] {
  const a = obj(l.listing_agent_1);
  const id = str(a.id);
  if (!id) return null;
  const img = obj(a.profile_image);
  const thumbs = obj(img.thumbs);
  return {
    id,
    name: str(a.name) ?? [str(a.first_name), str(a.last_name)].filter(Boolean).join(" "),
    email: str(a.email_address)?.toLowerCase() ?? null,
    phone: str(a.phone_mobile) ?? str(a.phone_direct),
    position: str(a.position),
    photo: https(str(obj(thumbs["200x250"]).url) ?? str(obj(thumbs["700x875"]).url) ?? str(img.url)),
  };
}

function toExtra(l: Row): ListingExtra {
  const p = obj(l.property);
  const ct = l.council_tax_included_in_rent;
  return {
    agent: agentOf(l),
    town: str(p.adr_suburb_or_town) ?? str(p.adr_locality),
    deposit: num(l.price_bond),
    highlights: [l.meta_highlight_1, l.meta_highlight_2, l.meta_highlight_3].map(str).filter((s): s is string => Boolean(s)),
    councilTaxIncluded: ct == null ? null : ct === true || ct === "1" || ct === 1,
    minimumTermMonths: num(l.let_minimum_term_months),
  };
}

async function fetchExtras(): Promise<Record<string, ListingExtra>> {
  const rows = await rexSearchAll(
    "Listings",
    {
      criteria: [
        { name: "system_listing_state", value: "current" },
        { name: "listing_category_id", value: "residential_rental" },
        { name: "system_publication_status", value: "published" },
      ],
      order_by: { system_publication_time: "desc" },
    },
    { max: 800 }
  );
  const out: Record<string, ListingExtra> = {};
  for (const r of rows) {
    const id = str(r.id);
    if (id) out[id] = toExtra(r);
  }
  return out;
}

const KEY = "website:listing-extras:v1";

export function listingExtras(): Promise<Held<Record<string, ListingExtra>>> {
  return swr(KEY, fetchExtras, { freshMs: RULES["listing-book"].freshMs, keepMs: RULES["listing-book"].keepMs });
}
