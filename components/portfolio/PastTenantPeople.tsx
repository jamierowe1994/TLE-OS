"use client";

import { useEffect, useState } from "react";
import ContactBlock from "@/components/ContactBlock";
import FindingData from "@/components/business/FindingData";

/**
 * PAST TENANTS, WITH HOW TO REACH THEM (Josel Banagua, 20 Oct 2026): "is
 * there a way for the old tenancy emails to be displayed in the system as
 * sometimes I need to search the referencing form just to get their email
 * addresses?"
 *
 * Who lived at this home before, from PayProp's tenant records (every
 * tenancy it has run, the Inactive ones too) and the OS's own tenancy
 * archive. Read only: these people are not on the home any more, so nothing
 * here edits a record. Reads /api/portfolio/past-tenants.
 */

type Person = { name: string; email: string | null; phone: string | null; from: string | null; to: string | null; source: string; where: string | null };

const day = (iso: string | null) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : null);

export default function PastTenantPeople({ listing, listings, about }: { listing: string; listings: string[]; about?: string }) {
  const [state, setState] = useState<{ s: "loading" } | { s: "ready"; people: Person[]; payPropRead: boolean } | { s: "failed"; error: string }>({ s: "loading" });

  useEffect(() => {
    let live = true;
    setState({ s: "loading" });
    fetch(`/api/portfolio/past-tenants?listing=${encodeURIComponent(listing)}&listings=${encodeURIComponent(listings.join(","))}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (live) setState(j?.ok ? { s: "ready", people: j.people ?? [], payPropRead: Boolean(j.payPropRead) } : { s: "failed", error: j?.error ?? "Past tenants couldn't be read." }); })
      .catch(() => live && setState({ s: "failed", error: "Past tenants couldn't be read. Try again in a minute." }));
    return () => { live = false; };
  }, [listing, listings.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (state.s === "loading") return <FindingData label="Reading who lived here before" />;
  if (state.s === "failed") return <p className="text-[12.5px] text-accent-dark">{state.error}</p>;
  if (!state.people.length) {
    return (
      <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">
        {state.payPropRead ? "Nobody earlier on record for this home. PayProp holds no past tenancy here, and the OS has kept no earlier let." : "PayProp's tenant list isn't to hand just now, so earlier tenants can't be shown. Look again in a minute."}
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
      {state.people.map((p) => {
        const dates = [day(p.from), day(p.to)];
        const when = dates[0] && dates[1] ? `${dates[0]} to ${dates[1]}` : dates[0] ? `From ${dates[0]}` : dates[1] ? `Until ${dates[1]}` : "Dates not on record";
        return (
          <li key={`${p.name}|${p.email ?? ""}`} className="rounded-xl border border-line/50 bg-white px-4 py-3 text-[13px]">
            <ContactBlock role="tenant" person={{ name: p.name, email: p.email, phone: p.phone }} personRef={null} about={about} />
            <p className="mt-2 text-[11.5px] text-muted">{[p.where, when, `from ${p.source}`].filter(Boolean).join(" · ")}</p>
          </li>
        );
      })}
    </ul>
  );
}
