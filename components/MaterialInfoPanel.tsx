"use client";

import { Pill } from "@/components/Wire";
import { valuationLines, type MaterialInfo } from "@/lib/matinfo";

/**
 * Material information, as an agent reads it.
 *
 * Used in two places — the appraisal file's top section and the presentation
 * builder's Property step — so it is a component rather than markup written
 * twice and drifted apart.
 *
 * Three deliberate choices:
 *
 * **The headline fields are pulled out.** Property type, beds, floor area,
 * tenure, council tax band and EPC are what a landlord asks in the first two
 * minutes. Burying them at equal weight among broadband providers and lighting
 * descriptions makes an agent scroll while somebody is talking to them.
 *
 * **Coverage is stated.** "28 of 34 known" tells an agent whether a blank is
 * this property being unusual or Homesearch being thin, which changes what
 * they say next. A panel that just omits what it lacks reads as complete.
 *
 * **The valuation is labelled a SALE value.** Homesearch's `quick_valuation`
 * is a capital estimate. On a lettings appraisal, an unlabelled "£140,000"
 * next to rent figures is a number waiting to be misread out loud.
 */

/** Fields worth seeing before the fold, in the order a landlord asks for them. */
const HEADLINE = [
  "Property type",
  "Bedrooms",
  "Floor area",
  "Tenure",
  "Council tax band",
  "EPC rating",
];

export default function MaterialInfoPanel({
  material,
  warning,
  loading,
}: {
  material: MaterialInfo | null;
  /** The address-match warning, when Homesearch matched a different property. */
  warning?: string | null;
  loading?: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] text-muted">Pulling the property details…</p>
      </div>
    );
  }

  /* The wrong-address trap, made visible. We would rather show nothing than
     show a neighbour's tenure under this address. */
  if (!material) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          The property
        </p>
        <p className="mt-2.5 text-[12.5px] leading-relaxed">
          {warning ??
            "We couldn't confirm this address against Homesearch, so there are no property details to show."}
        </p>
        <p className="mt-2 text-[11px] leading-relaxed text-muted">
          Nothing is guessed here on purpose — a neighbour&apos;s tenure or EPC under this
          address is worse than a blank, because an agent will read it out.
        </p>
      </div>
    );
  }

  const all = material.groups.flatMap((g) => g.fields);
  const headline = HEADLINE.map((l) => all.find((f) => f.label === l)).filter(
    (f): f is NonNullable<typeof f> => Boolean(f)
  );
  const val = material.valuation ? valuationLines(material.valuation) : [];

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          The property
        </p>
        <span className="flex items-center gap-2 text-[10.5px] text-muted">
          <Pill tone="accent">Matched</Pill>
          {material.known} of {material.possible} known
        </span>
      </div>

      {headline.length > 0 && (
        <dl className="mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {headline.map((f) => (
            <div key={f.label} className="rounded-xl border border-line/60 bg-box p-3">
              <dt className="text-[9.5px] uppercase tracking-wide text-muted">{f.label}</dt>
              <dd className="figures mt-1 text-[13px] leading-tight">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {val.length > 0 && (
        <div className="mt-3 rounded-xl border border-line/60 bg-box p-3">
          <p className="text-[9.5px] uppercase tracking-wide text-muted">
            Sale value, not rent
          </p>
          <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px]">
            {val.map((f) => (
              <span key={f.label}>
                <span className="text-muted">{f.label}: </span>
                <span className="figures">{f.value}</span>
              </span>
            ))}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-3.5">
        {material.groups.map((g) => (
          <div key={g.id}>
            <p className="text-[10.5px] font-semibold">{g.title}</p>
            <dl className="mt-1.5 grid gap-x-5 gap-y-1 sm:grid-cols-2">
              {g.fields.map((f) => (
                <div key={f.label} className="flex items-baseline justify-between gap-3 border-b border-line/40 py-1">
                  <dt className="shrink-0 text-[11.5px] text-muted">{f.label}</dt>
                  <dd className="min-w-0 text-right text-[11.5px]">{f.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>

      <p className="mt-3.5 border-t border-line/70 pt-2.5 text-[10.5px] leading-relaxed text-muted">
        From Homesearch, live. Blanks are fields Homesearch does not hold for this
        property — not fields we chose to leave out.
      </p>
    </div>
  );
}
