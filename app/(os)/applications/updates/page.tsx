"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import CustomerUpdates from "@/components/CustomerUpdates";

/**
 * /applications/updates - who should hear what (James, 2 Oct 2026).
 *
 * Every landlord and tenant update on a let lands here with the agent rather
 * than going out on its own: email them (read first, sent from your own
 * address), ring them and note it, or mark it not needed. An agent sees
 * their own; the office sees everyone's. ?open=<id> is where the email's
 * button lands, ringed.
 */
export default function UpdatesPageWrapper() {
  return (
    <Suspense fallback={null}>
      <UpdatesPage />
    </Suspense>
  );
}

function UpdatesPage() {
  const sp = useSearchParams();
  const highlight = Number(sp.get("open")) || null;
  const [tab, setTab] = useState<"open" | "all">("open");
  const [count, setCount] = useState<number | null>(null);
  return (
    <div className="px-4 pb-10 md:px-0">
      <PageHeader
        title="Customer Updates"
        blurb="Something happened on a let and a landlord or tenant should hear. Nothing goes to them on its own: email them, ring them, or mark it not needed."
        actions={
          <Link
            href="/applications"
            className="flex items-center rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
          >
            ← Applications
          </Link>
        }
      />
      <div className="fade-up mt-5 flex flex-wrap items-center gap-2">
        {(
          [
            { v: "open", label: "Still to tell" },
            { v: "all", label: "Everything" },
          ] as const
        ).map((o) => (
          <button
            key={o.v}
            type="button"
            onClick={() => setTab(o.v)}
            className={`rounded-full border px-4 py-1.5 text-[12.5px] ${tab === o.v ? "border-ink bg-ink font-semibold text-page" : "border-line/80 hover:border-ink/40"}`}
          >
            {o.label}
            {o.v === "open" && count != null ? ` · ${count}` : ""}
          </button>
        ))}
      </div>
      <section className="fade-up mt-5">
        <CustomerUpdates
          key={tab}
          scope="all"
          openOnly={tab === "open" && !highlight}
          highlight={highlight}
          showProperty
          onCount={tab === "open" ? setCount : undefined}
        />
      </section>
    </div>
  );
}
