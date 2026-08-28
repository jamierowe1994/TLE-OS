"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";

/**
 * Paid leads and social.
 *
 * Calls the two ported endpoints — /api/business/paid-leads-live and
 * /api/business/social. Both exist; whether they ANSWER depends on six Meta
 * variables, and the page says which are missing rather than showing an empty
 * chart. An empty chart reads as "no spend this month", which is a very
 * different and much worse claim than "we cannot reach Meta".
 */

type Social = { platforms?: Array<{ name: string; followers?: number; error?: string }>; error?: string };
type Leads = { rows?: unknown[]; error?: string; missing?: string[] };

export default function PaidLeads() {
  const [social, setSocial] = useState<Social | null>(null);
  const [leads, setLeads] = useState<Leads | null>(null);

  useEffect(() => {
    fetch("/api/business/social")
      .then((r) => r.json())
      .then(setSocial)
      .catch((e: Error) => setSocial({ error: e.message }));
    fetch("/api/business/paid-leads-live")
      .then((r) => r.json())
      .then(setLeads)
      .catch((e: Error) => setLeads({ error: e.message }));
  }, []);

  return (
    <>
      <PageHeader title="Paid leads & social" blurb="Meta spend, the leads it produced, and the accounts behind it." />

      <section className="fade-up mt-8 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-[15px]">Social accounts</h2>
          <Pill tone={social?.platforms?.length ? "accent" : "neutral"}>
            {social?.platforms?.length ? "Connected" : "Not answering"}
          </Pill>
        </div>
        {social === null ? (
          <p className="mt-2 text-[12.5px] text-muted">Asking Meta…</p>
        ) : social.error || !social.platforms?.length ? (
          <>
            <p className="mt-2 text-[12.5px] leading-relaxed">
              {social.error ?? "Meta returned nothing."}
            </p>
            <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
              This needs six variables on TLE-OS:{" "}
              <span className="font-semibold">
                META_SYSTEM_TOKEN, META_APP_SECRET, META_PAGE_LETTINGS,
                META_AD_ACCOUNT_LETTINGS, ADS_API_BASE, ADS_API_KEY
              </span>
              . Entering the links in Meta isn&apos;t enough on its own — the OS needs its own
              credentials to read them.
            </p>
          </>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {social.platforms.map((p) => (
              <li key={p.name} className="flex items-baseline justify-between border-b border-line/40 py-1.5 text-[12.5px]">
                <span>{p.name}</span>
                <span className="text-muted">
                  {p.error ? p.error : p.followers != null ? `${p.followers.toLocaleString("en-GB")} followers` : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Paid leads</h2>
        {leads === null ? (
          <p className="mt-2 text-[12.5px] text-muted">Loading…</p>
        ) : leads.error ? (
          <p className="mt-2 text-[12.5px] leading-relaxed">{leads.error}</p>
        ) : (
          <p className="mt-2 text-[12.5px]">
            {(leads.rows ?? []).length} row{(leads.rows ?? []).length === 1 ? "" : "s"} returned.
          </p>
        )}
      </section>
    </>
  );
}
