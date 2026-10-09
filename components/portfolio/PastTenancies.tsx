"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import FindingData from "@/components/business/FindingData";
import { Pill } from "@/components/Wire";

/**
 * Past tenancies (James, 9 Oct 2026): every let Portfolio has shown, kept
 * after the home leaves it, so a tenant who left owing can still be found.
 * Reads /api/portfolio/archive (lib/tenancy-archive).
 *
 * Two uses: the whole archive under Portfolio, searched by the page's own
 * search box, and one home's lets on its page (`propertyId`).
 */

interface Tenancy {
  listingId: string;
  propertyId: string | null;
  name: string;
  locality: string;
  tenants: string;
  landlord: string;
  agentName: string;
  rentMonthly: number | null;
  letSince: string | null;
  owed: number | null;
  owedTenants: Array<{ name: string; owed: number; lastPayment: string | null }> | null;
  owedCheckedAt: string | null;
  firstSeen: string;
  lastSeen: string;
  gone: boolean;
  held?: boolean;
}

const money = (n: number | null) => (n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`);
const day = (iso: string | null) =>
  iso ? new Date(iso.length === 10 ? `${iso}T00:00:00` : iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default function PastTenancies({ search = "", propertyId = null, compact = false }: { search?: string; propertyId?: string | null; compact?: boolean }) {
  const [state, setState] = useState<{ status: "loading" } | { status: "ready"; rows: Tenancy[] } | { status: "error"; message: string }>({ status: "loading" });
  const [goneOnly, setGoneOnly] = useState(!propertyId);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const sp = new URLSearchParams();
      if (propertyId) sp.set("property", propertyId);
      if (search.trim()) sp.set("q", search.trim());
      if (goneOnly) sp.set("left", "1");
      fetch(`/api/portfolio/archive?${sp}`, { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (!live) return;
          setState(j?.ok ? { status: "ready", rows: j.tenancies as Tenancy[] } : { status: "error", message: j?.error ?? "Past tenancies couldn't be read." });
        })
        .catch(() => live && setState({ status: "error", message: "Past tenancies couldn't be read." }));
    }, search ? 250 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [search, propertyId, goneOnly]);

  if (state.status === "loading") return <div className="rounded-2xl border border-line/70 bg-card p-8 text-center"><FindingData label="Reading past tenancies" /></div>;
  if (state.status === "error") return <p className="rounded-2xl border border-line/70 bg-card p-6 text-center text-[12.5px] text-accent-dark">{state.message}</p>;

  const rows = state.rows;
  return (
    <div>
      {!propertyId && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="max-w-[70ch] text-[12px] leading-relaxed text-muted">
            Every let Portfolio has shown, kept after the home leaves it: who the tenants were, the rent, the landlord, and what they owed when PayProp was last read. Use the search box above to find a tenant, a landlord or an address.
          </p>
          <span className="flex gap-1.5">
            <button type="button" onClick={() => setGoneOnly(true)} className={`rounded-full border px-3 py-1.5 text-[12px] ${goneOnly ? "border-ink bg-ink text-page" : "border-line/80 bg-white"}`}>Left the book</button>
            <button type="button" onClick={() => setGoneOnly(false)} className={`rounded-full border px-3 py-1.5 text-[12px] ${!goneOnly ? "border-ink bg-ink text-page" : "border-line/80 bg-white"}`}>Every let</button>
          </span>
        </div>
      )}
      {rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-line/80 p-6 text-center text-[12.5px] text-muted">
          {propertyId
            ? "No earlier lets on record for this home yet. The archive started on 9 October 2026 and fills as the book is read."
            : search.trim()
              ? "Nothing in the archive matches that."
              : goneOnly
                ? "No let has left the book since the archive started on 9 October 2026."
                : "The archive is empty. It fills as Portfolio is read."}
        </p>
      ) : (
        <ul className="overflow-hidden rounded-2xl border border-line/70 bg-card">
          {rows.map((r) => {
            const owes = r.owed != null && r.owed >= 1;
            const status = (
              <div className="min-w-0 text-[12px]">
                {r.held ? <Pill tone="accent">Held until they move out</Pill> : r.gone ? <Pill tone="neutral">Off the book · last seen {day(r.lastSeen)}</Pill> : <Pill tone="good">On the book</Pill>}
                {owes ? (
                  <p className="mt-1 font-semibold text-accent-dark">Owed {money(r.owed)} at {day(r.owedCheckedAt)}</p>
                ) : r.owed != null ? (
                  <p className="mt-1 text-muted">Nothing owed at {day(r.owedCheckedAt)}</p>
                ) : (
                  <p className="mt-1 text-muted">No PayProp figure on record</p>
                )}
              </div>
            );
            /* On a home's own page the column is narrow: who and when on the
               left, the rent and what was owed on the right. */
            const body = compact ? (
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold">{r.tenants || <span className="font-normal text-muted">No tenant named</span>}</p>
                  <p className="text-[11.5px] text-muted">Let since {day(r.letSince)} · {money(r.rentMonthly)} pcm{r.landlord ? ` · landlord ${r.landlord}` : ""}</p>
                </div>
                {status}
              </div>
            ) : (
              <div className="grid gap-x-4 gap-y-1 px-4 py-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_110px_minmax(0,1.2fr)]">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold">{r.name}</p>
                  <p className="truncate text-[11.5px] text-muted">{[r.locality, r.landlord ? `landlord ${r.landlord}` : null, r.agentName || null].filter(Boolean).join(" · ")}</p>
                </div>
                <div className="min-w-0 text-[12.5px]">
                  <p className="truncate">{r.tenants || <span className="text-muted">No tenant named</span>}</p>
                  <p className="text-[11.5px] text-muted">Let since {day(r.letSince)}</p>
                </div>
                <p className="figures text-[13px]">{money(r.rentMonthly)}<span className="text-[10.5px] text-muted"> pcm</span></p>
                {status}
              </div>
            );
            return (
              <li key={r.listingId} className="border-b border-line/40 last:border-0">
                {r.gone && !r.held ? body : <Link href={`/portfolio/${encodeURIComponent(r.listingId)}`} className="block transition-colors hover:bg-panel">{body}</Link>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
