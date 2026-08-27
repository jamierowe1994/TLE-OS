"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { Pill } from "@/components/Wire";

/**
 * One person's file.
 *
 * The counts come from REX by their user id, which is what makes this real
 * rather than decorative: 83 listings under Rhiannon is a fact about her book,
 * not a number on a card.
 *
 * A failed pull says so. It must never render as 0 — "this agent has no
 * properties" is a very different and much more alarming statement than "we
 * could not reach REX", and an owner would act on the first one.
 */

type Counted = { total: number | null; failed: boolean };
type Data = {
  person: { rexId: string; name: string; email: string; photo: string | null; position: string | null; phone: string | null };
  account: { id: string; role: string; hasPhoto: boolean; createdAt: string } | null;
  book: {
    listings: Counted; onMarket: Counted; managed: Counted;
    properties: Counted; contacts: Counted; leads: Counted;
    appraisals: Counted; applications: Counted;
    recentListings: Array<{ id: string; address: string; status: string | null; rent: number | null }>;
    pulledAt: string;
  };
  audit: Array<{ id: string; kind: string; at: string }>;
};

function Count({ label, c }: { label: string; c: Counted }) {
  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-4">
      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{label}</p>
      {c.failed ? (
        <p className="mt-1.5 text-[12px] leading-snug text-accent-dark">Couldn&apos;t load</p>
      ) : (
        <p className="figures mt-1.5 text-[24px] leading-none">{c.total?.toLocaleString("en-GB")}</p>
      )}
    </div>
  );
}

export default function PersonPage({ params }: { params: Promise<{ rexId: string }> }) {
  const { rexId } = use(params);
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/person/${rexId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then(setD)
      .catch(() => setErr("Couldn't load that person."));
  }, [rexId]);

  async function viewAs() {
    if (!d?.account) return;
    setBusy(true);
    const r = await fetch("/api/admin/view-as", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: d.account.id }),
    });
    const j = (await r.json()) as { ok?: boolean; error?: string };
    setBusy(false);
    if (j.ok) window.location.href = "/dashboard";
    else setErr(j.error ?? "That didn't work.");
  }

  if (err) return <p className="mt-6 text-[12.5px] text-accent-dark">{err}</p>;
  if (!d) return <p className="mt-6 text-[12.5px] text-muted">Loading their book…</p>;

  const p = d.person;

  return (
    <>
      <Link href="/admin/people" className="text-[12.5px] text-muted underline">← People</Link>

      <header className="fade-up mt-3 flex flex-wrap items-start gap-4 rounded-2xl border border-line/80 bg-panel p-6">
        {p.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={p.photo} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[18px]">
            {p.name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="hand text-[24px] leading-tight">{p.name}</h1>
          <p className="mt-1 text-[12.5px] text-muted">
            {p.email} · REX {p.rexId}
            {p.position ? ` · ${p.position}` : ""}
            {p.phone ? ` · ${p.phone}` : ""}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-1.5">
            {d.account ? (
              <>
                <Pill tone="accent">Has an account</Pill>
                {!d.account.hasPhoto && <Pill tone="neutral">No headshot</Pill>}
              </>
            ) : (
              <Pill tone="neutral">Not invited yet</Pill>
            )}
          </p>
        </div>
        {d.account && d.account.role !== "owner" && (
          <button
            type="button"
            onClick={viewAs}
            disabled={busy}
            className="shrink-0 rounded-lg bg-accent-dark px-4 py-2.5 text-[12.5px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Opening…" : `View as ${p.name.split(" ")[0]}`}
          </button>
        )}
      </header>

      <div className="fade-up mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Count label="On the market" c={d.book.onMarket} />
        <Count label="Let & managed" c={d.book.managed} />
        <Count label="Listings, all time" c={d.book.listings} />
        <Count label="Properties" c={d.book.properties} />
        <Count label="Leads assigned" c={d.book.leads} />
        <Count label="Appraisals" c={d.book.appraisals} />
        <Count label="Applications" c={d.book.applications} />
        <Count label="Contacts" c={d.book.contacts} />
      </div>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Their most recent listings</h2>
        {d.book.recentListings.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing came back.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {d.book.recentListings.map((l) => (
              <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-1.5 text-[12.5px]">
                <span>{l.address}</span>
                <span className="shrink-0 text-muted">
                  {l.status ?? "—"}
                  {l.rent ? ` · £${l.rent.toLocaleString("en-GB")}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 border-t border-line/70 pt-2.5 text-[10.5px] leading-relaxed text-muted">
          Live from REX. Listings match on owner or selling agent, leads on who they&apos;re
          assigned to, appraisals on agent 1, applications on the application&apos;s agent.
          <br />
          <span className="font-semibold">Viewings aren&apos;t here on purpose</span> — REX
          calendar events carry no owning agent, so a per-person figure can&apos;t be produced.
          Business-wide only.
          <br />
          These are everything this person touches in REX, which is shared across six
          businesses — a partner who also sells for The Property Experts will show that work
          here too.
        </p>
      </section>
    </>
  );
}
