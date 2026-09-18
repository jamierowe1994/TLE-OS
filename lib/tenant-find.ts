import "server-only";
import { randomUUID } from "node:crypto";
import { hasDb, q } from "@/lib/db";
import { geocode } from "@/lib/geocode";
import { proseEmail } from "@/lib/email/prose";
import { sendEmail } from "@/lib/resend";
import { readListingDetails } from "@/lib/listing-details";
import { findUserById } from "@/lib/users";
import { fits, type HomeFilter, type MarketHome } from "@/lib/market-homes";
import type { PassportRecord } from "@/lib/passport";

/**
 * The tenant's side of Find a home (18 Sep 2026): where they are searching
 * from, the homes they have asked about, and the new-home alerts they have
 * agreed to. The homes themselves are lib/tenant-homes.
 */

/* ── Where they search from ─────────────────────────────────────────────── */

export type Origin = { lat: number; lng: number; label: string };

/** Their own house, from the passport. The geocode is cached for good, so
 *  this costs Google once per address. Null when there is no address yet,
 *  or it cannot be placed - the page then searches everywhere and says so. */
export async function originFromPassport(record: PassportRecord | null): Promise<Origin | null> {
  const address = record?.data?.currentAddress?.trim() ?? "";
  if (!address) return null;
  const g = await geocode(address).catch(() => null);
  if (!g || !g.ok) return null;
  return { lat: g.at.lat, lng: g.at.lng, label: g.at.postcode ?? address.split(",")[0].trim() };
}

/** A postcode or town they typed. */
export async function originFromText(text: string): Promise<Origin | null> {
  const t = text.trim();
  if (t.length < 2 || t.length > 80) return null;
  const g = await geocode(/\b(uk|united kingdom)\b/i.test(t) ? t : `${t}, UK`).catch(() => null);
  if (!g || !g.ok) return null;
  return { lat: g.at.lat, lng: g.at.lng, label: t.toUpperCase() === t ? t : t.replace(/\b\w/g, (c) => c.toUpperCase()) };
}

/* ── What they have asked about ─────────────────────────────────────────── */

export type AskedAbout = { listingId: string; at: string; via: "portal" | "lead"; address: string };

/**
 * Their most recent enquiry on a home, from either door: the portal's own
 * (os_tenant_enquiries) or a portal lead REX took in (os_leads - Rightmove,
 * OnTheMarket, our website). James: "in 99% of cases these people would have
 * inquired about a property anyway", and it is almost always the second.
 */
export async function latestEnquiry(email: string): Promise<AskedAbout | null> {
  if (!hasDb() || !email.trim()) return null;
  const rows = await q<{ listing_id: string; at: Date; via: string; address: string | null }>(
    `SELECT listing_id, at, via, address FROM (
       SELECT listing_id, created_at AS at, 'portal' AS via, address FROM os_tenant_enquiries WHERE LOWER(email) = LOWER($1)
       UNION ALL
       SELECT listing_id, COALESCE(received_at, first_seen) AS at, 'lead' AS via, address FROM os_leads
        WHERE LOWER(email) = LOWER($1) AND listing_id IS NOT NULL AND listing_id <> ''
     ) e ORDER BY at DESC LIMIT 1`,
    [email.trim()]
  ).catch(() => []);
  const r = rows[0];
  if (!r) return null;
  return { listingId: String(r.listing_id), at: new Date(r.at).toISOString(), via: r.via === "portal" ? "portal" : "lead", address: r.address ?? "" };
}

/**
 * An enquiry from the portal: kept, then straight to the listing's agent as
 * an email they can reply to. Not a REX lead - REX writes stay locked - so
 * the agent's inbox is where it lands (flagged to James, 18 Sep 2026).
 *
 * Who gets it: the listing's own agent in REX; failing that, the agent who
 * sent the tenant their passport. If neither can be found it is still kept,
 * and the answer says it was not sent so the page never claims otherwise.
 */
export async function makeEnquiry(p: {
  email: string;
  name: string;
  phone: string;
  message: string;
  home: MarketHome;
  passportAgentId: string | null;
}): Promise<{ ok: true; sentTo: string | null } | { ok: false; error: string }> {
  if (!hasDb()) return { ok: false, error: "Enquiries can't be saved on this environment." };

  let to: string | null = null;
  const details = await readListingDetails(Number(p.home.id)).catch(() => null);
  if (details?.agent.email) to = details.agent.email;
  if (!to && p.passportAgentId) to = (await findUserById(p.passportAgentId).catch(() => null))?.email ?? null;

  const address = [p.home.name, p.home.locality].filter(Boolean).join(", ");
  const rent = `£${Math.round(p.home.rent).toLocaleString("en-GB")} ${p.home.rentPeriod === "week" ? "a week" : "a month"}`;
  let outcome = "not_sent";
  if (to) {
    const body = [
      `${p.name} has asked about ${address} (${rent}) from their tenant area.`,
      p.message.trim() ? `What they said:\n${p.message.trim()}` : "They didn't add a message.",
      [`Email: ${p.email}`, p.phone.trim() ? `Phone: ${p.phone.trim()}` : null].filter(Boolean).join("\n"),
      "Their tenant passport is complete, so they can apply in one tap once they have viewed. Reply to this email to answer them.",
    ].join("\n\n");
    try {
      await sendEmail({ to, subject: `Enquiry from the tenant area: ${address}`, html: proseEmail(body), replyTo: p.email, audience: "internal" });
      outcome = "sent";
    } catch (e) {
      outcome = `failed: ${e instanceof Error ? e.message : "send failed"}`.slice(0, 300);
    }
  }

  await q(
    `INSERT INTO os_tenant_enquiries (id, email, name, phone, listing_id, address, message, sent_to, outcome)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [randomUUID(), p.email, p.name, p.phone.trim() || null, p.home.id, address, p.message.trim().slice(0, 4000), to, outcome]
  );
  return { ok: true, sentTo: outcome === "sent" ? to : null };
}

/* ── New-home alerts ────────────────────────────────────────────────────── */

export type HomeAlert = {
  place: string | null;
  lat: number | null;
  lng: number | null;
  radiusMiles: number | null;
  minBeds: number | null;
  maxRent: number | null;
  type: "house" | "flat" | null;
  since: string;
};

type AlertRow = {
  email: string; name: string; place: string | null; lat: number | null; lng: number | null;
  radius_miles: number | null; min_beds: number | null; max_rent: number | null; home_type: string | null;
  consent_at: Date; created_at: Date; last_sent_at: Date | null;
};

const toAlert = (r: AlertRow): HomeAlert => ({
  place: r.place,
  lat: r.lat,
  lng: r.lng,
  radiusMiles: r.radius_miles,
  minBeds: r.min_beds,
  maxRent: r.max_rent,
  type: r.home_type === "house" || r.home_type === "flat" ? r.home_type : null,
  since: new Date(r.consent_at).toISOString(),
});

export async function alertFor(email: string): Promise<HomeAlert | null> {
  if (!hasDb()) return null;
  const rows = await q<AlertRow>(`SELECT * FROM os_tenant_home_alerts WHERE LOWER(email) = LOWER($1) AND stopped_at IS NULL`, [email]).catch(() => []);
  return rows[0] ? toAlert(rows[0]) : null;
}

/** Only ever called with the tenant's own tick: consent_at is that moment. */
export async function saveAlert(email: string, name: string, a: Omit<HomeAlert, "since">): Promise<void> {
  await q(
    `INSERT INTO os_tenant_home_alerts (email, name, place, lat, lng, radius_miles, min_beds, max_rent, home_type, consent_at)
     VALUES (LOWER($1),$2,$3,$4,$5,$6,$7,$8,$9,NOW())
     ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, place = EXCLUDED.place, lat = EXCLUDED.lat, lng = EXCLUDED.lng,
       radius_miles = EXCLUDED.radius_miles, min_beds = EXCLUDED.min_beds, max_rent = EXCLUDED.max_rent,
       home_type = EXCLUDED.home_type, consent_at = NOW(), stopped_at = NULL`,
    [email.trim(), name, a.place, a.lat, a.lng, a.radiusMiles, a.minBeds, a.maxRent, a.type]
  );
}

export async function stopAlert(email: string): Promise<void> {
  await q(`UPDATE os_tenant_home_alerts SET stopped_at = NOW() WHERE LOWER(email) = LOWER($1) AND stopped_at IS NULL`, [email]);
}

/**
 * Who is owed an alert: every live alert with homes that fit and were
 * published after the last one went (or after they signed up). Matching uses
 * the same `fits` the page filters with, so the email can never show a home
 * the page would have hidden.
 */
export async function alertsDue(homes: MarketHome[]): Promise<{ email: string; name: string; homes: MarketHome[] }[]> {
  if (!hasDb()) return [];
  const rows = await q<AlertRow>(`SELECT * FROM os_tenant_home_alerts WHERE stopped_at IS NULL`).catch(() => []);
  return rows
    .map((r) => {
      const from = (r.last_sent_at ?? r.consent_at).toISOString().slice(0, 10);
      const f: HomeFilter = { lat: r.lat, lng: r.lng, radiusMiles: r.radius_miles, minBeds: r.min_beds, maxRent: r.max_rent, type: toAlert(r).type };
      return { email: r.email, name: r.name, homes: homes.filter((h) => (h.publishedAt ?? "") > from && fits(h, f)) };
    })
    .filter((a) => a.homes.length > 0);
}
