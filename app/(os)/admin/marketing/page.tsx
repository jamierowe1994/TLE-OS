"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * Francesca's view — marketing.
 *
 * Built to be looked at by James first and handed over second, which is why it
 * says plainly what is real and what is not. A page that presents three
 * sections as equals when one of them does nothing is a page that gets
 * demonstrated to Francesca and then apologised for.
 *
 * Two of the three already exist elsewhere in the OS and are LINKED rather
 * than rebuilt: campaigns run on os_campaigns / os_campaign_sends, and storage
 * on the R2 bucket the OS already uses. Copying either into a marketing
 * namespace would have given us two of each within a week.
 *
 * The chatbot is the one that does not exist. James described it as somewhere
 * Francesca fires information and PDFs, held so Claude can serve it to the
 * front end later. That is a real build — ingestion, storage, retrieval — and
 * it is named here as missing rather than stubbed with a text box that goes
 * nowhere.
 */

type Campaign = { id: string; name?: string; title?: string };

export default function MarketingView() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [files, setFiles] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/campaigns")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { campaigns?: Campaign[] } | null) => setCampaigns(j?.campaigns ?? []))
      .catch(() => setCampaigns([]));
    fetch("/api/r2/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { objects?: unknown[]; files?: unknown[] } | null) =>
        setFiles((j?.objects ?? j?.files ?? []).length)
      )
      .catch(() => setFiles(null));
  }, []);

  return (
    <>
      <PageHeader
        title="Francesca's view"
        blurb="Marketing — nurture campaigns, the file store, and the assistant that isn't built yet."
      />

      <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12px] leading-relaxed">
        <span className="font-semibold">Yours to shape before she sees it.</span> Two of
        these three are live already; the assistant is named honestly as missing rather than
        stubbed, so nothing here demos better than it works.
      </p>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">Nurture campaigns</h2>
          <Pill tone="accent">Live</Pill>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Already running in the OS — enrolments, steps, and an audit of every send. Linked
          rather than rebuilt here, or we&apos;d have two campaign engines within a week.
        </p>
        <p className="mt-2 text-[12.5px]">
          {campaigns === null
            ? "Counting…"
            : `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"} set up.`}
        </p>
        <Link
          href="/emails"
          className="mt-3 inline-block rounded-lg border border-line/80 px-3.5 py-2 text-[12px]"
        >
          Open campaigns
        </Link>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">File store</h2>
          <Pill tone="accent">Live</Pill>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Cloudflare R2, EU jurisdiction — the same bucket the rest of the OS uses for
          brochures and media. PDFs and assets go here.
        </p>
        <p className="mt-2 text-[12.5px]">
          {files === null ? "Couldn't reach the bucket." : `${files} file${files === 1 ? "" : "s"} stored.`}
        </p>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">The assistant</h2>
          <Pill tone="neutral">Not built</Pill>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          Somewhere Francesca fires information and documents, held so it can be served to
          the front end later. Three real pieces: taking it in, storing it so it can be
          searched, and answering from it.
        </p>
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          Deliberately not stubbed. A text box that accepts her work and drops it is worse
          than a page that says the feature is coming — she&apos;d find out a fortnight later,
          having relied on it.
        </p>
      </section>
    </>
  );
}
