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
      {/* "Marketing", not "Francesca's view" — she is the one who opens this
          now, and a screen that introduces itself in the third person reads as
          somebody else's. "Francesca's view" is the label on JAMES's admin
          rail, which is the only place naming the person is the useful part. */}
      <PageHeader
        title="Marketing"
        blurb="Nurture campaigns, paid leads, the file store and the assistant."
      />

      <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12px] leading-relaxed">
        <span className="font-semibold">Yours to shape before she sees it.</span> Campaigns
        and the file store are live. The assistant takes questions but cannot answer them
        yet, and says so on every screen — nothing here demos better than it works.
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
          <Pill tone="accent">Part built</Pill>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          He exists. The character in the corner takes questions on any screen, and every
          one lands in his console — that list is the writing order for the help centre,
          because each entry is something somebody needed and could not find.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
          What is missing is the answering. There is no model behind him yet — no key, no
          call — so he collects questions rather than replying to them. Feeding him
          Francesca&apos;s documents is the step after that.
        </p>
        <Link
          href="/admin/assistant"
          className="mt-3 inline-block rounded-lg border border-line/80 px-3.5 py-2 text-[12px]"
        >
          Open his console
        </Link>
      </section>
    </>
  );
}
