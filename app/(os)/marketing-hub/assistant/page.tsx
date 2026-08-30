"use client";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
export default function Assistant() {
  return (
    <>
      <PageHeader title="The assistant" blurb="Where Francesca puts what the front end should know." />
      <div className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">Not built yet</h2>
          <Pill tone="neutral">To build</Pill>
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed">
          Somewhere to fire information and documents, held so it can be served to the front
          end later. Three real pieces: taking it in, storing it so it can be searched, and
          answering from it.
        </p>
        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          Deliberately not stubbed with a text box. One that accepts her work and drops it is
          worse than a page admitting the feature is coming — she&apos;d find out a fortnight
          later, having relied on it.
        </p>
      </div>
    </>
  );
}
