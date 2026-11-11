"use client";

import ContactBlock from "@/components/ContactBlock";

/**
 * The tenants the home's page names, on the let (4 Nov 2026, lib/let-people
 * householdFor). Somebody set them with Edit on the home's page because the
 * record named the wrong people; Portfolio, the home's page, a contractor's
 * email and Steve read that list, and the let page didn't say. Shown as set,
 * changed there. The application's own people stay underneath.
 */

export type Household = { tenants: Array<{ name: string; email: string | null; phone: string | null }>; by: string; at: string };

const dayOf = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.valueOf()) ? "" : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** Who set them and when, in a line. */
export function householdWords(h: Household): string {
  const day = dayOf(h.at);
  return `Set with Edit on the home's page by ${h.by}${day ? ` on ${day}` : ""}. Change them there.`;
}

export default function HouseholdOnHome({ household, listingId, newLook = false, className = "" }: { household: Household; listingId: string | null; newLook?: boolean; className?: string }) {
  const home = listingId ? `/portfolio/${encodeURIComponent(listingId)}` : null;
  const people = household.tenants.map((t, i) => (
    <ContactBlock key={`${t.name}-${i}`} fixed showName role="tenant" person={{ name: t.name, email: t.email, phone: t.phone }} personRef={null} />
  ));
  if (newLook) {
    return (
      <section className={`nl-cell ${className}`} data-steve="application.household">
        <div className="nl-cell-head">
          <h3 className="nl-block-title">Living There Now</h3>
          {home && <a className="nl-link" href={home}>Open the home</a>}
        </div>
        <p className="nl-meta">{householdWords(household)}</p>
        <div className="flex flex-col gap-3">{people}</div>
      </section>
    );
  }
  return (
    <div className={`rounded-xl border border-line/50 bg-white p-4 ${className}`} data-steve="application.household">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Living there now</p>
        {home && <a className="text-[11.5px] font-semibold text-accent-dark hover:underline" href={home}>Open the home</a>}
      </div>
      <p className="mt-1 text-[11.5px] text-muted">{householdWords(household)}</p>
      <div className="mt-3 flex flex-col gap-3">{people}</div>
    </div>
  );
}
