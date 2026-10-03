import { hasDb, q } from "@/lib/db";
import { bookFor } from "@/lib/listings-cache";
import { findListing, liveBook, similarHomes } from "@/lib/tenant-matching";
import { hiddenLeadIds } from "@/lib/hidden-leads";
import type { OsListing } from "@/lib/rex-listings";

/**
 * WHO A HOME SUITS - the match behind Mail the database (17 Sep 2026), moved
 * here from app/api/listings/email-out on 3 Oct 2026 so the desk's button and
 * the phone's Email the Database flow (app/agent/match) answer with exactly
 * the same people. The rule and its reasons are written up on the route.
 */

/** Enquiries from the last this-many days. */
export const DAYS = 90;

type LeadRow = { id: string; name: string; email: string; listing_id: string; received_at: Date | null };

export type EmailOutPerson = {
  email: string;
  name: string;
  leadId: string;
  askedAbout: string;
  askedRent: number | null;
  askedPer: string;
  askedAt: string | null;
  why: string[];
  /** Where the home they asked about is, for the phone's map. */
  lat: number | null;
  lng: number | null;
};

const per = (l: Pick<OsListing, "rentPeriod">) => (l.rentPeriod === "week" ? "per week" : "pcm");
const town = (l: OsListing) => (l.locality ?? "").split(",")[0].replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i, "").trim().toLowerCase();
const district = (p: string | null) => (p ?? "").toUpperCase().replace(/\s+/g, "").slice(0, -3);

export async function matchFor(id: string): Promise<{ home: OsListing | null; people: EmailOutPerson[]; alreadySent: number }> {
  const live = await liveBook();
  const home = findListing(live, id);
  if (!home || !hasDb()) return { home, people: [], alreadySent: 0 };

  /* The whole current book for the homes they asked about: most enquiries
     are on homes that have since gone let agreed. */
  const book = (await bookFor(null).catch(() => null))?.listings ?? live;
  const [leads, hidden, sent] = await Promise.all([
    q<LeadRow>(
      `SELECT id, name, email, listing_id, received_at FROM os_leads
        WHERE enquiry = 'Letting' AND email IS NOT NULL AND email <> '' AND listing_id IS NOT NULL
          AND stage NOT IN ('Not proceeding', 'Closed')
          AND received_at > NOW() - make_interval(days => $1)
        ORDER BY received_at DESC NULLS LAST`,
      [DAYS]
    ),
    hiddenLeadIds(),
    q<{ sent_to: string }>(
      `SELECT DISTINCT lower(sent_to) AS sent_to FROM os_tenant_email_log
        WHERE email_id = 'tenant-matches' AND outcome = 'sent' AND meta->'homes' @> $1::jsonb`,
      [JSON.stringify([{ id: String(home.id) }])]
    ).catch(() => []),
  ]);
  const sentTo = new Set(sent.map((s) => s.sent_to));
  /* Anyone who asked about THIS home knows about it already. */
  const askedHere = new Set(leads.filter((l) => l.listing_id === String(home.id)).map((l) => l.email.trim().toLowerCase()));

  const seen = new Set<string>();
  const people: EmailOutPerson[] = [];
  let alreadySent = 0;
  for (const l of leads) {
    const email = l.email.trim().toLowerCase();
    if (seen.has(email) || hidden.has(l.id) || askedHere.has(email)) continue;
    const asked = findListing(book, l.listing_id);
    /* No rent on the home they asked about, no way to say it is similar. */
    if (!asked || !(asked.rentMonthly && asked.rentMonthly > 0)) continue;
    if (!similarHomes([home], [asked], { limit: 1 }).length) continue;
    seen.add(email);
    if (sentTo.has(email)) {
      alreadySent++;
      continue;
    }
    const why = [
      asked.postcode && home.postcode && district(asked.postcode) === district(home.postcode) ? "Same postcode area" : town(asked) === town(home) ? "Same town" : "Nearby",
      "Similar rent",
    ];
    people.push({
      email,
      name: l.name,
      leadId: l.id,
      askedAbout: asked.name,
      askedRent: asked.rent,
      askedPer: per(asked),
      askedAt: l.received_at ? new Date(l.received_at).toISOString() : null,
      why,
      lat: asked.lat ?? null,
      lng: asked.lng ?? null,
    });
  }
  return { home, people, alreadySent };
}
