"use client";

import Link from "next/link";
import {
  applicationsSlot,
  daysSince,
  leadsSlot,
  listingsSlot,
  onMarketOf,
  openOffersOf,
  sameDay,
  useAccepted,
  useManagedBook,
  useShared,
} from "@/components/widgets";
import { stageCounts, type StageListing } from "@/lib/listing-stages";
import type { Lead } from "@/lib/leads-sample";
import type { Application } from "@/lib/applications";
import type { OsListing } from "@/lib/rex-listings";

/**
 * The four figures across the dashboard (new look, lib/new-look "dashboard").
 *
 * The same four the old board opened on - leads today, on the market, offers
 * open, homes we manage - read through the very same shared reads as those
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
  const managed = useManagedBook();
  const accepted = useAccepted();

  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

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
      label: "Homes we manage",
      href: "/portfolio",
      value: managed.book ? (managed.book.counts.homes ?? managed.book.counts.properties) : null,
      sub: managed.book ? `${managed.book.properties.filter((p) => p.letSince?.startsWith(thisMonth)).length} let this month` : null,
      loading: managed.loading,
      failed: managed.book ? null : managed.unlinked ? SAY_UNLINKED : managed.loading ? null : SAY_FAILED,
    },
  ];

  return (
    <section className="nl-dash-glance" aria-label="Your figures">
      {items.map((g) => (
        <Link key={g.label} href={g.href} className="nl-dash-glance-item">
          <span className="nl-eyebrow">{g.label}</span>
          {g.loading ? (
            <span className="nl-dash-skel" aria-label="Loading">
              <i />
            </span>
          ) : (
            <span className="nl-dash-fig">{g.value == null ? "-" : g.value.toLocaleString("en-GB")}</span>
          )}
          <span className={`nl-meta${g.failed ? " nl-dash-warn" : ""}`}>{g.loading ? "Reading…" : (g.failed ?? g.sub ?? "")}</span>
        </Link>
      ))}
    </section>
  );
}
