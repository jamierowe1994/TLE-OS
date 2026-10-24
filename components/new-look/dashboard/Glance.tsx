"use client";

import { Stat } from "@/components/new-look/backoffice/Bits";
import {
  applicationsSlot,
  appraisalsSlot,
  daysSince,
  leadsSlot,
  listingsSlot,
  onMarketOf,
  openOffersOf,
  sameDay,
  useAccepted,
  useShared,
} from "@/components/widgets";
import { stageCounts, type StageListing } from "@/lib/listing-stages";
import type { Lead } from "@/lib/leads-sample";
import type { Application } from "@/lib/applications";
import type { OsListing } from "@/lib/rex-listings";
import type { MarketAppraisal } from "@/lib/market-appraisal";

/**
 * The four figures across the dashboard (new look, lib/new-look "dashboard").
 *
 * Leads today, on the market, offers open and valuations booked - the front
 * office's four. Homes we manage was the fourth until the PM Dashboard took the
 * managed book (James, 24 Oct 2026); valuations is the landlord side's figure. Read through the very same shared reads as those
 * tiles (components/widgets), so the two looks can never disagree and a visit
 * that has both only asks once. Each opens its own screen, as the tiles did.
 *
 * The design's "Lets in progress" is "Offers open" here: that is the figure the
 * old board carried, and the live one we have. Its sub-lines are ours too, each
 * a real count off the same read - never the design's sample words.
 *
 * Loading is a grey bar, a failed read is a dash with the reason, never a held
 * number. Agent screens never name the system the figures come from.
 */

type Item = {
  label: string;
  href: string;
  value: number | null;
  sub: string | null;
  loading: boolean;
  failed: string | null;
};

const SAY_FAILED = "Couldn't be read just now";
const SAY_UNLINKED = "Your account isn't linked yet - ask James";

export default function Glance() {
  const leads = useShared<{ leads: Lead[] }>(leadsSlot, "/api/leads", (j) =>
    j.ok && Array.isArray(j.leads) ? { leads: j.leads as Lead[] } : null
  );
  const listings = useShared<{ listings: OsListing[] }>(listingsSlot, "/api/listings?tests=0", (j) =>
    j.ok && j.live && Array.isArray(j.listings) ? { listings: j.listings as OsListing[] } : null
  );
  const offers = useShared<{ applications: Application[] }>(applicationsSlot, "/api/applications?limit=300&tests=0", (j) =>
    Array.isArray(j.applications) && !j.error ? { applications: j.applications as Application[] } : null
  );
  const appraisals = useShared<{ appraisals: MarketAppraisal[] }>(appraisalsSlot, "/api/appraisals", (j) =>
    Array.isArray(j.appraisals) && !j.error ? { appraisals: j.appraisals as MarketAppraisal[] } : null
  );
  const accepted = useAccepted();

  const now = new Date();
  /* The month in London, worked out now, so it rolls over on its own. */
  const londonMonth = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/London", year: "numeric", month: "2-digit" }).format(d);
  const thisMonth = londonMonth(now);
  const booked = (appraisals.data?.appraisals ?? []).filter((a) => !a.cancelledAt && !a.archivedAt && a.createdAt && londonMonth(new Date(a.createdAt)) === thisMonth);
  const toCome = (appraisals.data?.appraisals ?? []).filter((a) => !a.cancelledAt && !a.archivedAt && a.appointmentAt && new Date(a.appointmentAt) > now).length;

  const leadList = leads.data?.leads ?? [];
  const open = offers.data ? openOffersOf(offers.data.applications) : [];
  const ageOf = (a: Application) => daysSince(a.dateReceived, a.createdAt ? a.createdAt * 1000 : null);
  const stages = listings.data ? stageCounts(listings.data.listings as StageListing[], accepted) : null;

  const failedOf = (f: { error: string | null; unlinked: boolean }) => (f.unlinked ? SAY_UNLINKED : f.error ? SAY_FAILED : null);

  const items: Item[] = [
    {
      label: "Leads today",
      href: "/leads",
      value: leads.data ? leadList.filter((l) => sameDay(l.receivedAt, now)).length : null,
      sub: leads.data ? `${leadList.filter((l) => l.stage === "New").length} not contacted yet` : null,
      loading: leads.loading,
      failed: leads.data ? null : failedOf(leads),
    },
    {
      label: "On the market",
      href: "/listings",
      value: listings.data ? onMarketOf(listings.data.listings, accepted).length : null,
      sub: stages ? `${stages.letAgreed} let agreed` : null,
      loading: listings.loading,
      failed: listings.data ? null : failedOf(listings),
    },
    {
      label: "Offers open",
      href: "/listings?stage=offers",
      value: offers.data ? open.length : null,
      sub: offers.data ? `${open.filter((a) => (ageOf(a) ?? 0) > 7).length} waiting over a week` : null,
      loading: offers.loading,
      failed: offers.data ? null : failedOf(offers),
    },
    {
      label: "Valuations booked",
      href: "/market-appraisals",
      value: appraisals.data ? booked.length : null,
      sub: appraisals.data ? `this month · ${toCome} visit${toCome === 1 ? "" : "s"} still to come` : null,
      loading: appraisals.loading,
      failed: appraisals.data ? null : failedOf(appraisals),
    },
  ];

  /* In boxes, the PM Dashboard's own (components/new-look/backoffice Stat), so
     the front and back office dashboards read as a pair (James, 24 Oct 2026):
     label, the figure, and what it means underneath. */
  return (
    <section className="nl-bo-stats nl-dash-stats" aria-label="Your figures">
      {items.map((g) => (
        <Stat
          key={g.label}
          label={g.label}
          href={g.href}
          value={g.loading ? null : g.value == null ? "-" : g.value.toLocaleString("en-GB")}
          error={g.loading ? null : g.failed}
          note={g.sub ?? undefined}
        />
      ))}
    </section>
  );
}
