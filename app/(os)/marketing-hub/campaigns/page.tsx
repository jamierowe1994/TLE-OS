"use client";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
/** Linked, not rebuilt — see the Overview note on why there is one engine. */
export default function Campaigns() {
  return (
    <>
      <PageHeader title="Nurture campaigns" blurb="Enrolments, steps, and every send accounted for." />
      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] leading-relaxed">
          Campaigns already run in the OS on <span className="font-semibold">os_campaigns</span>,
          with an audit row for every step — sent, waiting on a person, or overtaken.
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Linked rather than copied here. Two campaign engines within one product is how you
          end up unable to say which one actually sent.
        </p>
        <Link href="/marketing" className="mt-3 inline-block rounded-lg border border-line/80 px-3.5 py-2 text-[12px]">
          Open campaigns
        </Link>
      </div>
    </>
  );
}
