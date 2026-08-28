"use client";

import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * Kirstie's view — pre-tenancy.
 *
 * A placeholder, and labelled as one. The real screen is 3,385 lines in the
 * TLE portal plus its own API, and porting it is the same job Susan's figures
 * were: copy, repoint the imports, replace the portal's auth with a capability,
 * then check every figure against the original.
 *
 * It is NOT started here on purpose. Susan's port taught the lesson twice — the
 * stylesheet did not come across, and ten routes carried the portal's session
 * with them — and both only surfaced because that port had been merged and
 * driven. Starting a second one in the same breath, on top of a nav change
 * that has not been looked at yet, is how two half-ports become impossible to
 * tell apart.
 */
export default function PreTenancyView() {
  return (
    <>
      <PageHeader
        title="Kirstie's view"
        blurb="Pre-tenancy — the compliance and move-in run-up."
      />

      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">Not moved across yet</h2>
          <Pill tone="neutral">To port</Pill>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed">
          Pre-tenancy still lives in the TLE portal — 3,385 lines and its own API. It is the
          same kind of move as Susan&apos;s figures, and it is next.
        </p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Left as a placeholder rather than half-copied. Susan&apos;s port hid two faults
          that only appeared once it was merged and actually driven — the stylesheet never
          came across, and ten routes were still checking the portal&apos;s session. Running
          a second port before the first is verified would make those two sets of symptoms
          impossible to tell apart.
        </p>
        <a
          href="https://tle-portal-production.up.railway.app/pretenancy"
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-block rounded-lg border border-line/80 px-3.5 py-2 text-[12px]"
        >
          Open it in the portal for now
        </a>
      </div>
    </>
  );
}
