"use client";

import { Tag } from "@/components/ListingTags";
import PropertyPhoto from "@/components/PropertyPhoto";
import DoodleIcon from "@/components/DoodleIcon";
import type { OpenOfferRow } from "@/app/api/offers/open/route";

/**
 * EVERY OFFER WAITING, ONE ROW EACH (Howard, 8 Oct 2026, ticket 84a81dae:
 * "there is no offers tab/screen showing me all the offers i need to handle").
 *
 * Listings > Offers in used to list the HOMES with offers on them; now it
 * opens on the offers themselves - the home, who from, the rent against the
 * asking, move-in, when it came in and where it stands - and a row opens that
 * offer on its listing (?offer=), where Accept, Decline and Send to the
 * landlord are. "By home" brings the old view back. Offers stay on their
 * listing until accepted (James, 7 Oct 2026); this is only the way in.
 */

export type HomeOnBoard = { name: string; image: string | null; rent: number | null; perMonth: boolean };

const gbp = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const day = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T12:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

/** "Today", "Yesterday", "3 days ago", then the date. */
function received(iso: string | null): string {
  if (!iso) return "-";
  const fmt = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
  const a = new Date(`${fmt(new Date(iso))}T12:00:00Z`).getTime();
  const b = new Date(`${fmt(new Date())}T12:00:00Z`).getTime();
  const n = Math.round((b - a) / 86_400_000);
  if (n <= 0) return "Today";
  if (n === 1) return "Yesterday";
  if (n < 7) return `${n} days ago`;
  return day(iso);
}

export function offerHref(r: Pick<OpenOfferRow, "listingId" | "ref">): string {
  return `/listings/${encodeURIComponent(r.listingId)}?tab=applications&offer=${encodeURIComponent(r.ref)}`;
}

export default function OffersInList({
  rows,
  error,
  homes,
  onOpen,
  onRetry,
}: {
  rows: OpenOfferRow[] | null;
  error: string | null;
  homes: Map<string, HomeOnBoard>;
  onOpen: (r: OpenOfferRow) => void;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <div className="py-8 text-center" role="alert">
        <p className="text-[13px] font-semibold text-ink">The offers didn&apos;t load</p>
        <p className="mx-auto mt-1.5 max-w-md text-[12px] leading-relaxed text-muted">{error}</p>
        <button type="button" onClick={onRetry} className="mt-4 rounded-full bg-accent px-5 py-2 text-[12px] font-semibold text-white">
          Try again
        </button>
      </div>
    );
  }
  if (rows === null) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-muted" role="status">
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
        Reading the offers&hellip;
      </p>
    );
  }
  if (!rows.length) {
    return (
      <div className="py-10 text-center" role="status">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name="coin" size={20} />
        </span>
        <p className="mt-3 text-[13px] font-semibold text-ink">No offers waiting</p>
        <p className="mx-auto mt-1 max-w-sm text-[12px] leading-relaxed text-muted">
          Every offer on your listings has been decided. A new one shows here the moment it comes in.
        </p>
      </div>
    );
  }

  return (
    /* Sized by the panel, not the window: beside the sidebar a laptop's
       panel is far narrower than its screen. */
    <div className="@container">
      {/* Column names, once the panel is wide enough, so the rows read as a table. */}
      <div className="mb-2 hidden grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.2fr)_96px_84px_92px_140px] gap-x-4 px-3 text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted @3xl:grid">
        <span />
        <span>Home</span>
        <span>From</span>
        <span>Offer</span>
        <span>Move in</span>
        <span>Received</span>
        <span>Status</span>
      </div>
      <ul className="cascade space-y-2.5">
        {rows.map((r) => {
          const h = homes.get(r.listingId);
          const asking = h?.perMonth ? h.rent : null;
          const vsAsking =
            r.amount != null && asking ? (r.amount >= asking ? "asking rent" : `${gbp(asking - r.amount)} under`) : null;
          const status = r.held
            ? { tone: "neutral" as const, label: "Held", note: "Another offer is accepted" }
            : r.countered
              ? { tone: "accent" as const, label: "Negotiating", note: `${r.countered.side === "landlord" ? "Landlord" : "Tenant"} countered${r.countered.offered != null ? `, first offer ${gbp(r.countered.offered)}` : ""}` }
              : r.landlordSent
              ? { tone: "good" as const, label: "With the landlord", note: `Sent ${day(r.landlordSent.at)}` }
              : { tone: "accent" as const, label: "To decide", note: "Landlord not told yet" };
          return (
            <li key={r.ref} className="fade-up">
              <a
                href={offerHref(r)}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onOpen(r);
                }}
                data-steve-row=""
                className="group grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[18px] border border-line/50 bg-white p-2.5 transition-colors hover:border-ink/40 @3xl:grid-cols-[56px_minmax(0,1.4fr)_minmax(0,1.2fr)_96px_84px_92px_140px] @3xl:gap-x-4"
              >
                <PropertyPhoto src={h?.image ?? null} className="row-span-2 h-14 w-14 rounded-[12px] @3xl:row-span-1" width={160} height={160} />
                <span className="min-w-0">
                  <span className="hand block truncate text-[15px] leading-tight group-hover:text-accent-dark group-hover:underline group-hover:underline-offset-2">
                    {h?.name || r.home || "A listing"}
                  </span>
                  {/* On a phone the person and the rent sit under the home. */}
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted @3xl:hidden">
                    {r.name}
                    {r.amount != null && ` · ${gbp(r.amount)} pcm`}
                  </span>
                </span>
                <span className="col-start-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted @3xl:hidden">
                  {r.moveIn && <span>Moving in {day(r.moveIn)}</span>}
                  <span>{received(r.at)}</span>
                  <Tag tone={status.tone}>{status.label}</Tag>
                </span>

                <span className="hidden min-w-0 @3xl:block">
                  <span className="block truncate text-[13px] text-ink">{r.name}</span>
                  <span className="block truncate text-[10.5px] text-muted">{r.via}</span>
                </span>
                <span className="hidden @3xl:block">
                  <span className="figures block text-[16px] leading-none">{r.amount != null ? gbp(r.amount) : "-"}</span>
                  <span className="mt-1 block text-[10px] text-muted">{vsAsking ?? "a month"}</span>
                </span>
                <span className="hidden text-[12.5px] @3xl:block">{r.moveIn ? day(r.moveIn) : "-"}</span>
                <span className="hidden text-[12.5px] @3xl:block">{received(r.at)}</span>
                <span className="hidden min-w-0 @3xl:block">
                  <Tag tone={status.tone}>{status.label}</Tag>
                  <span className="mt-1 block truncate text-[10px] text-muted">{status.note}</span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
