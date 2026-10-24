"use client";

import { useEffect, useState } from "react";
import TermsPanel from "@/components/terms/TermsPanel";
import TermsBanner from "@/components/appraisal/TermsBanner";
import { SERVICE_LEVELS, type MarketAppraisal } from "@/lib/market-appraisal";

/**
 * THE APPRAISAL'S TERMS OF BUSINESS, on its Documents tab (new look).
 *
 * James, 24 Oct 2026: the contract should be the words on the page, the same
 * Terms of Business the listing sends (components/terms/TermsPanel: the
 * October 2026 wording, England or Scotland by the address, each landlord
 * their own link), and it can go at any point - "they might know the person".
 * So a file sends from here, with the fees already agreed on the appraisal
 * filled in for the agent to check.
 *
 * A file whose terms already went the older way (the DocuSeal pack from the
 * prepare page) keeps showing that one, so a contract that is out is never
 * hidden behind a "nothing sent yet".
 */

const vat = (n: number) => Math.round(n * 1.2 * 100) / 100;

export default function AppraisalTerms({ ma, onChanged }: { ma: MarketAppraisal; onChanged?: (next?: MarketAppraisal) => void }) {
  /* Null while asking whether the older contract went out on this file. */
  const [older, setOlder] = useState<boolean | null>(null);
  useEffect(() => {
    let live = true;
    /* Terms made on our page win (Dover Close, 24 Oct 2026): sending them
       stamps termsSentAt too, which on its own read as "the older contract
       went", so a signed contract showed the old banner's "not sent yet". */
    const ours = fetch(`/api/terms?appraisalId=${encodeURIComponent(ma.id)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { terms?: { status: string }[] }) => (j.terms ?? []).some((t) => t.status !== "cancelled"))
      .catch(() => false);
    const theirs = fetch(`/api/appraisals/${encodeURIComponent(ma.id)}/terms`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { parties?: { role: string; sentAt: string | null; completedAt: string | null }[] }) => {
        const landlord = j.parties?.find((p) => p.role === "landlord");
        return Boolean(landlord?.sentAt || landlord?.completedAt || ma.termsSentAt);
      })
      .catch(() => Boolean(ma.termsSentAt));
    Promise.all([ours, theirs]).then(([onOurPage, wentOlder]) => live && setOlder(!onOurPage && wentOlder));
    return () => {
      live = false;
    };
  }, [ma.id, ma.termsSentAt]);

  if (older === null) {
    return (
      <section data-look="new" className="nl-cmp-tob is-loading">
        <p className="nl-meta">Reading the terms…</p>
      </section>
    );
  }
  if (older) return <TermsBanner ma={ma} onChanged={onChanged} />;

  const service = SERVICE_LEVELS.find((s) => s.id === ma.serviceLevel)?.label ?? null;
  const findOnly = ma.serviceLevel === "tenant_find" || ma.serviceLevel === "intro_only";
  return (
    <TermsPanel
      appraisalId={ma.id}
      listingId={ma.listingId ?? null}
      propertyId={ma.rexPropertyId ?? null}
      propertyAddress={ma.postcode && !ma.address.toUpperCase().includes(ma.postcode.toUpperCase()) ? `${ma.address}, ${ma.postcode}` : ma.address}
      landlords={ma.landlord || ma.landlordEmail ? [{ name: ma.landlord, email: ma.landlordEmail ?? "" }] : []}
      serviceOnRecord={service}
      feesOnRecord={{
        /* The contract's own wording, VAT out then in, from what was agreed at the appraisal. */
        managementFee: !findOnly && ma.feePct != null ? `${ma.feePct}% + VAT (${vat(ma.feePct)}% inc VAT) of the rent each month` : null,
        setUpFee: ma.setupFee === 0 ? "None" : ma.setupFee != null ? `£${ma.setupFee.toLocaleString("en-GB")} + VAT (£${vat(ma.setupFee).toLocaleString("en-GB")} inc VAT)` : null,
      }}
      onChanged={() => onChanged?.()}
    />
  );
}
