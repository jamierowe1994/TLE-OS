import { Card, FlowTag, Ghost, PageHead, Pill } from "@/components/Wire";
import rexSample from "@/lib/rex-sample.json";

/**
 * The proof-of-concept page for the whole overlay: create a listing HERE,
 * push it INTO REX, and REX carries it to Rightmove.
 *
 * The properties below are REAL — a one-off, read-only pull of current REX
 * rental listings (photos included) taken 6 Aug 2026. Not a live hookup yet;
 * the point is that this exact data is reachable today with the access the
 * business already holds.
 */

type SampleListing = {
  id: string;
  name: string;
  locality: string;
  rent: number | null;
  advertisedAs: string | null;
  letAgreed: boolean;
  availableFrom: string | null;
  epcExpiry: string | null;
  imageCount: number;
  image: string;
};

// One row in the pull is a £4m sale miscategorised as a rental inside REX —
// exactly the kind of thing the overlay exists to catch. Rentless rows stay out.
const LISTINGS = (rexSample.listings as SampleListing[]).filter((l) => l.rent);

export default function Listings() {
  return (
    <>
      <PageHead
        title="Listings"
        blurb="List a property here, once. The OS pushes it into REX; REX syndicates to the portals; enquiries flow back through the same pipe into Leads."
      >
        <span className="hand rounded-2xl bg-ink px-4 py-2.5 text-[13px] text-white">
          + New listing
        </span>
      </PageHead>

      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg">On the market</h2>
        <FlowTag from="REX (real data, static pull 6 Aug)" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {LISTINGS.map((l) => (
          <div
            key={l.id}
            className="fade-up overflow-hidden rounded-2xl border border-line/60 bg-card shadow-[0_1px_2px_rgba(16,16,20,0.04)]"
          >
            <div className="relative aspect-[4/3] bg-page">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={l.image}
                alt={l.name}
                className="h-full w-full object-cover"
              />
              {l.letAgreed && (
                <span className="absolute left-3 top-3">
                  <Pill tone="good">Let agreed</Pill>
                </span>
              )}
              <span className="absolute bottom-3 right-3 rounded-full bg-ink/70 px-2 py-0.5 text-[10px] font-semibold text-white">
                {l.imageCount} photos
              </span>
            </div>
            <div className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="hand truncate text-[15px]">{l.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{l.locality}</p>
                </div>
                <p className="figures shrink-0 text-[19px] leading-tight">
                  £{l.rent?.toLocaleString("en-GB")}
                  <span className="text-[10px] text-muted"> pcm</span>
                </p>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {l.epcExpiry ? (
                  <Pill>EPC to {l.epcExpiry.slice(0, 4)}</Pill>
                ) : (
                  <Pill tone="accent">No EPC date</Pill>
                )}
                {l.availableFrom && <Pill>From {l.availableFrom}</Pill>}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Ghost
          label="Create a listing"
          detail="Photos, rent, description, compliance docs — one form, written into REX as the record. REX write capability is confirmed: every service takes create/update."
          tag={<FlowTag to="REX → Rightmove" />}
        />
        <Ghost
          label="Listing performance"
          detail="Days on market and price changes — reconstructable per listing from REX AuditLogs' field-level history. (Portal click-throughs are NOT in REX; that needs Rightmove's own reporting.)"
          tag={<FlowTag from="REX AuditLogs" />}
        />
      </div>
    </>
  );
}
