"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PmCard, PmWait, MixRing, RankBars, type Tone } from "@/components/new-look/dashboard/PmCharts";
import type { ManagedProperty } from "@/lib/portfolio-types";

/**
 * The book in pictures on the PM Dashboard (James, 8 Nov 2026: the three boxes
 * "look really nice ... they're not necessarily for that specific page" -
 * Portfolio is just for the homes). By service, where the homes are, rent
 * bands - read live from /api/portfolio, the same read Portfolio uses. Each
 * part opens Portfolio already filtered to it (?service= / ?town= / ?rent=).
 * A book that can't be read says so; nothing is drawn from an old figure.
 */

type Book = { properties: ManagedProperty[]; counts: { properties: number; towns: number; byService: Record<string, number> } };
type State = { status: "loading" } | { status: "failed"; error: string } | { status: "ready"; book: Book };

const SERVICE_TONE: Record<string, Tone> = { Managed: "olive", "Let Only": "terra", "Rent Collect": "clay", "Not set": "sage" };
const TOWN_TONES: Tone[] = ["terra", "clay", "olive", "sage", "brown", "clay"];
const BANDS: [string, number, number][] = [
  ["Under £750", 0, 749],
  ["£750 to £999", 750, 999],
  ["£1,000 to £1,249", 1000, 1249],
  ["£1,250 to £1,499", 1250, 1499],
  ["£1,500 to £1,999", 1500, 1999],
  ["£2,000 and over", 2000, 1000000],
];
const BAND_TONES: Tone[] = ["sage", "olive", "clay", "terra", "brown", "brown"];

export default function BookPictures() {
  const router = useRouter();
  const [s, setS] = useState<State>({ status: "loading" });

  useEffect(() => {
    let gone = false;
    fetch("/api/portfolio", { cache: "no-store" })
      .then(async (r) => (await r.json()) as { ok?: boolean; error?: string; properties?: ManagedProperty[]; counts?: Book["counts"] })
      .then((j) => {
        if (gone) return;
        if (j.ok && j.properties && j.counts) setS({ status: "ready", book: { properties: j.properties, counts: j.counts } });
        else setS({ status: "failed", error: j.error ?? "The book couldn't be read just now." });
      })
      .catch(() => !gone && setS({ status: "failed", error: "The book couldn't be read just now." }));
    return () => {
      gone = true;
    };
  }, []);

  const go = (q: string) => router.push(`/portfolio?${q}#homes`);

  if (s.status !== "ready") {
    const body = s.status === "loading" ? <PmWait>Reading the book…</PmWait> : <p className="nl-pmc-off">{s.error}</p>;
    return (
      <div className="nl-port-graphs">
        <PmCard title="By Service">{body}</PmCard>
        <PmCard title="Where the Homes Are">{body}</PmCard>
        <PmCard title="Rent Bands">{body}</PmCard>
      </div>
    );
  }

  const { book } = s;
  const svc = Object.entries(book.counts.byService).sort((a, b) => b[1] - a[1]);
  const m = new Map<string, number>();
  for (const p of book.properties) if (p.town) m.set(p.town, (m.get(p.town) ?? 0) + 1);
  const towns = [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-GB")).slice(0, 6);
  const priced = book.properties.filter((x) => x.rentMonthly != null);
  const bands = BANDS.map(([label, lo, hi]) => ({ label, lo, hi, n: priced.filter((x) => x.rentMonthly! >= lo && x.rentMonthly! <= hi).length }));

  return (
    <div className="nl-port-graphs">
      <PmCard title="By Service" aside={<span className="nl-pmc-aside is-quiet">Press one to see them</span>}>
        <MixRing
          middle={book.counts.properties}
          middleLabel="properties"
          parts={svc.map(([k, n]) => ({ key: k, n, tone: SERVICE_TONE[k] ?? "brown", onPick: () => go(`service=${encodeURIComponent(k)}`) }))}
        />
      </PmCard>
      <PmCard title="Where the Homes Are" aside={<span className="nl-pmc-aside is-quiet">{book.counts.towns} towns</span>}>
        <RankBars rows={towns.map(([t, n], i) => ({ label: t, value: n, tone: TOWN_TONES[i], onPick: () => go(`town=${encodeURIComponent(t)}`) }))} />
      </PmCard>
      <PmCard title="Rent Bands" aside={<span className="nl-pmc-aside is-quiet">Per month</span>}>
        {priced.length === 0 ? (
          <p className="nl-pmc-off">No rents were read for these homes, so no bands are drawn.</p>
        ) : (
          <RankBars rows={bands.map((b, i) => ({ label: b.label, value: b.n, tone: BAND_TONES[i], onPick: b.n ? () => go(`rent=${b.lo}-${b.hi}`) : undefined }))} />
        )}
      </PmCard>
    </div>
  );
}
