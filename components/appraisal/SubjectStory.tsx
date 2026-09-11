"use client";

import { useEffect, useState } from "react";
import type { MarketListing } from "@/lib/ma-research";
import type { PropertyHistoryRow } from "@/app/api/property-history/route";

/**
 * The property's own story, beside what we know about it.
 *
 * James, 11 Sep 2026: "we should be able to pull previous listing information
 * to see what it was listed at before, and see if it was let. Has it been on
 * the market recently? ... any photos we might be able to dig up."
 *
 * Two sources, and they answer different questions:
 *
 *   - THE LIVE FEED (Homesearch, already on the page as the market and the
 *     let-agreed stock): is this address advertised by anybody right now, at
 *     what, and with what photographs. Homesearch keeps no history, so this
 *     is today only.
 *   - OUR OWN BOOK (REX, via /api/property-history): every listing we have
 *     raised against this address, in every state - so "we let this in 2024
 *     at £950" and the pictures we took, when it has been through our hands.
 *
 * Nothing here is guessed. An address that neither source knows says so.
 */
const money = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

/** The same house, by number and street, ignoring how each feed spells the rest. */
function sameHouse(subject: string, other: string): boolean {
  const a = norm(subject), b = norm(other);
  const num = a.match(/\b\d+[a-z]?\b/)?.[0];
  if (!num) return false;
  const street = a.split(" ").find((w) => w.length > 3 && !/\d/.test(w));
  return Boolean(street) && b.includes(`${num} `) && b.includes(street as string);
}

const STATE: Record<string, string> = {
  leased: "Let by us",
  current: "On our book now",
  withdrawn: "We listed it, then withdrawn",
  archived: "We listed it",
};

function when(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

export default function SubjectStory({
  address,
  postcode,
  live,
}: {
  address: string;
  postcode: string;
  /** Everything the research has on the market or let agreed nearby. */
  live: MarketListing[];
}) {
  const [ours, setOurs] = useState<PropertyHistoryRow[] | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    setOurs(undefined);
    const q = new URLSearchParams({ address, postcode });
    fetch(`/api/property-history?${q}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; listings?: PropertyHistoryRow[] } | null) => {
        if (!gone) setOurs(j?.ok && Array.isArray(j.listings) ? j.listings : null);
      })
      .catch(() => !gone && setOurs(null));
    return () => {
      gone = true;
    };
  }, [address, postcode]);

  const now = live.find((l) => sameHouse(address, l.address));
  const photos = [
    ...(now ? [now.image, ...(now.photos ?? [])] : []),
    ...(ours ?? []).flatMap((o) => o.images),
  ].filter((u, i, all): u is string => Boolean(u) && all.indexOf(u) === i);

  return (
    <div>
      <h2 className="hand text-[20px] leading-tight">Its story</h2>

      {/* Photographs first, when there are any: they are the most visual
          thing on a step James called "a very boring slide". */}
      {photos.length > 0 && (
        <div className="mt-3 grid grid-cols-4 gap-1.5">
          {photos.slice(0, 4).map((u, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={u} src={u} alt="" loading="lazy" className={`aspect-[4/3] w-full rounded-xl object-cover ${i === 0 ? "col-span-2 row-span-2 aspect-auto" : ""}`} />
          ))}
        </div>
      )}

      <ul className="mt-3 space-y-2">
        {now ? (
          <li className="rounded-xl border border-[#56634a]/30 bg-[#f1f4ec] p-3">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-[#56634a]">
              {now.status === "let agreed" ? "Let agreed right now" : "On the market right now"}
            </p>
            <p className="mt-1 text-[13px]">
              {now.rent != null && <span className="figures font-semibold">{money(now.rent)} pcm</span>}
              {now.agent && <span className="text-muted"> with {now.agent}</span>}
              {now.daysListed != null && <span className="text-muted"> · listed {now.daysListed}d ago</span>}
            </p>
            {now.advert && (
              <a href={now.advert} target="_blank" rel="noreferrer" className="mt-1 inline-block text-[11.5px] text-muted underline hover:text-ink">
                See the advert
              </a>
            )}
          </li>
        ) : null}

        {ours === undefined ? (
          <li className="text-[12px] text-muted">Checking our own book&hellip;</li>
        ) : ours && ours.length > 0 ? (
          ours.map((o) => (
            <li key={o.id} className="flex items-start gap-3 rounded-xl border border-line/70 p-3">
              {o.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={o.image} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover" />
              ) : (
                <span className="h-12 w-16 shrink-0 rounded-lg bg-line/30" />
              )}
              <span className="min-w-0">
                <span className="block text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  {STATE[o.state ?? ""] ?? "On our book"}
                  {o.letAgreed && o.state === "current" ? " · let agreed" : ""}
                </span>
                <span className="mt-0.5 block text-[13px]">
                  {o.rentMonthly != null ? <span className="figures font-semibold">{money(o.rentMonthly)} pcm</span> : "No rent recorded"}
                  {o.publishedAt && <span className="text-muted"> · listed {when(o.publishedAt)}</span>}
                  {o.daysOnMarket != null && o.state === "current" && <span className="text-muted"> · {o.daysOnMarket}d on</span>}
                </span>
                {o.images.length > 0 && (
                  <span className="mt-0.5 block text-[11px] text-muted">{o.images.length} photograph{o.images.length === 1 ? "" : "s"} on file</span>
                )}
              </span>
            </li>
          ))
        ) : (
          <li className="text-[12px] leading-relaxed text-muted">
            {now ? "Not through our hands before." : "Not on our book before, and nobody is advertising it today."}
            {ours === null && " (REX did not answer, so our own history could not be checked.)"}
          </li>
        )}
      </ul>
    </div>
  );
}
