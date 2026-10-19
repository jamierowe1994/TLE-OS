"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PreTenancyHero from "@/components/pretenancy/Hero";
import PageHeader from "@/components/PageHeader";
import { PressButton } from "@/components/Bits";
import type { RtrShown } from "@/components/RightToRentField";

/**
 * RIGHT TO RENT RENEWALS (Kirstie Mulholland, 16 Oct 2026, ticket 066bb29e:
 * "myself and the agents need to be able to put in expiry for right to rent
 * if overseas so they can chase the renewals - I will need to verify all").
 *
 * Every expiry recorded on a let or a home (lib/application-rtr), newest per
 * tenant: an agent sees their own tenants, the office everybody's. Three
 * groups in the order the work comes - to check (Kirstie's), running out in
 * the next two months or already gone (the agent's chase), then the rest.
 * Mark as checked is the office's; each row opens its let or home.
 */

type Row = RtrShown & { applicationId: string; listingId?: string | null; property?: string; agentName?: string };

const card = "rounded-[22px] border border-line/70 bg-card";
const niceDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const daysTo = (ymd: string) => Math.round((new Date(`${ymd}T12:00:00Z`).getTime() - new Date(`${today()}T12:00:00Z`).getTime()) / 86_400_000);
const hrefOf = (r: Row) =>
  r.applicationId.startsWith("home:") ? `/portfolio/${encodeURIComponent(r.applicationId.slice(5))}` : `/applications/${encodeURIComponent(r.applicationId)}`;

export default function RightToRentList({ office: inOffice = false }: { office?: boolean }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [office, setOffice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/right-to-rent", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (!live) return;
        if (!j?.ok) { setError(j?.error ?? "The right to rent dates couldn't be read."); return; }
        setRows(j.records ?? []);
        setOffice(Boolean(j.office));
      })
      .catch(() => live && setError("The right to rent dates couldn't be read."));
    return () => { live = false; };
  }, []);

  async function verify(r: Row) {
    setBusy(r.id);
    const j = await fetch("/api/right-to-rent", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: r.id }) })
      .then((x) => x.json()).catch(() => null);
    setBusy(null);
    if (!j?.ok) { setError(j?.error ?? "That couldn't be saved just now."); return; }
    setRows((all) => (all ?? []).map((x) => (x.id === r.id ? { ...x, ...(j.record as Row) } : x)));
  }

  const toCheck = (rows ?? []).filter((r) => !r.verifiedAt);
  const chase = (rows ?? []).filter((r) => r.rightUntil && daysTo(r.rightUntil) <= 60).sort((a, b) => a.rightUntil!.localeCompare(b.rightUntil!));
  /* The office already sees an unchecked one under To check; it isn't listed twice. */
  const later = (rows ?? []).filter((r) => r.rightUntil && daysTo(r.rightUntil) > 60 && !(office && !r.verifiedAt));

  const line = (r: Row, opts: { verify?: boolean } = {}) => {
    const d = r.rightUntil ? daysTo(r.rightUntil) : null;
    return (
      <li key={`${opts.verify ? "v" : "c"}-${r.id}`} className="grid grid-cols-1 gap-x-4 gap-y-1.5 py-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] md:items-center">
        <span className="min-w-0">
          <Link href={hrefOf(r)} className="block truncate text-[14px] font-semibold hover:underline">{r.tenant}</Link>
          <span className="block truncate text-[12px] text-muted">{[r.property || "No home recorded", office ? r.agentName : null].filter(Boolean).join(" · ")}</span>
        </span>
        <span className="text-[12.5px]">
          {r.noTimeLimit ? "No time limit" : r.rightUntil ? `Until ${niceDay(r.rightUntil)}` : "No date"}
          {r.followUpOn && <span className="block text-[11.5px] text-muted">Follow-up check by {niceDay(r.followUpOn)}</span>}
        </span>
        <span className="flex flex-wrap items-center gap-2 md:justify-end">
          {d != null && d <= 60 && (
            <span className={`rounded-full px-3 py-1 text-[11.5px] font-semibold ${d < 0 ? "bg-accent-dark text-white" : "bg-accent-soft text-accent-dark"}`}>
              {d < 0 ? `Ran out ${-d} days ago` : d === 0 ? "Runs out today" : `${d} days left`}
            </span>
          )}
          {r.verifiedAt ? (
            <span className="rounded-full border border-line/80 px-2.5 py-1 text-[11px] text-muted">Checked by {r.verifiedBy ?? "pre-tenancy"}</span>
          ) : office && opts.verify ? (
            <PressButton onClick={() => void verify(r)} disabled={busy === r.id} className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page disabled:opacity-40">
              {busy === r.id ? "Saving…" : "Mark as checked"}
            </PressButton>
          ) : (
            <span className="rounded-full border border-accent-dark/40 px-2.5 py-1 text-[11px] text-accent-dark">Waiting to be checked</span>
          )}
        </span>
      </li>
    );
  };

  return (
    <div className="space-y-5 pb-8">
      {inOffice ? (
        <PreTenancyHero
          eyebrow="Right to Rent"
          title="Renewals"
          blurb="Every overseas tenant's right to rent expiry, added by the agents on the let or the home. Check each one against the share code or document, then chase the renewal before it runs out."
        />
      ) : (
        <PageHeader
          title="Right to Rent Renewals"
          blurb="Overseas tenants' right to rent, soonest first. Ask for the new share code before the date and add the new expiry on their let or home. Pre-tenancy checks each one."
          actions={
            <Link
              href="/applications"
              className="flex items-center rounded-full border border-line/80 px-4 py-2 text-[12px] font-medium text-muted transition-colors hover:border-ink hover:text-ink"
            >
              ← Applications
            </Link>
          }
        />
      )}
      {error && <p className="rounded-2xl border border-line/80 bg-panel p-4 text-[12.5px] text-accent-dark">{error}</p>}
      {rows === null && !error && (
        <p className="flex items-center gap-2 text-[13px] text-muted"><span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />Reading the dates…</p>
      )}

      {rows && rows.length === 0 && (
        <section className={`${card} p-5`}>
          <h2 className="text-[17px] leading-tight">Nothing recorded yet</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Add an overseas tenant&apos;s expiry on their let (open the tenant, Right to rent expiry) or on the home&apos;s page under the tenants. It lands here to chase.
          </p>
        </section>
      )}

      {rows && rows.length > 0 && (
        <>
          {(office ? toCheck.length > 0 : false) && (
            <section className="fade-up rounded-[22px] bg-accent-soft p-5">
              <h2 className="text-[17px] leading-tight">{toCheck.length} to check</h2>
              <p className="mt-0.5 text-[12px] text-muted">Added by an agent, not yet checked against the share code or document.</p>
              <ul className="mt-2 divide-y divide-accent-dark/10">{toCheck.map((r) => line(r, { verify: true }))}</ul>
            </section>
          )}
          <section className={`${card} fade-up p-5`}>
            <h2 className="text-[17px] leading-tight">{chase.length ? `${chase.length} to chase` : "Nothing to chase"}</h2>
            <p className="mt-0.5 text-[12px] text-muted">Running out in the next two months, or already gone. Ask for the new share code now.</p>
            {chase.length > 0 && <ul className="mt-2 divide-y divide-line/50">{chase.map((r) => line(r))}</ul>}
          </section>
          {later.length > 0 && (
            <section className={`${card} fade-up p-5`}>
              <h2 className="text-[17px] leading-tight">Later</h2>
              <ul className="mt-2 divide-y divide-line/50">{later.map((r) => line(r))}</ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
