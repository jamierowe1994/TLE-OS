"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * MOVED IN, STILL ADVERTISED (Susan Liles, 3 Nov 2026; lib/listings-moved-in).
 *
 * Susan: "a lot of properties that are Let Agreed and still being advertised
 * on the portals". James: a report for the owners first, nothing taken down by
 * itself. So, on Listings for the owners only: every let agreed or let home
 * whose tenant moved in a fortnight ago or more and whose advert the portals
 * are still being sent, with one press to take it down.
 *
 * Take the advert down is the same two calls as Take Offline on the listing
 * (components/listing/AdvertOffline): /api/listings/publish "off", then the
 * OS's Offline marker. Confirmed first, one home at a time. Nothing else is
 * written and nobody is emailed.
 *
 * Renders nothing for anyone but an owner, and nothing while an owner is
 * viewing as somebody else.
 */

type Row = {
  listingId: string;
  address: string;
  agent: string | null;
  stage: "Let agreed" | "Let";
  moveIn: string;
  source: "application" | "propoly" | "let";
  days: number;
  portals: string[];
};
type Report = { rows: Row[]; looked: number; notYet: number; noDate: number; unreadable: number; checkedAt: string; afterDays: number };
type Line = { state: "ask" | "doing" | "failed"; note?: string };

const SOURCE: Record<Row["source"], string> = {
  application: "Start date on the accepted offer",
  propoly: "Move-in date in Propoly",
  let: "Date it was marked let",
};
const SHOW = 6;

const dateWords = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" });
const timeWords = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
/* "Rightmove, Zoopla and OnTheMarket". */
const portalWords = (p: string[]) => (p.length > 1 ? `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}` : p[0] ?? "the portals");

/* The same buttons as Take Offline (AdvertOffline), so they read the same in either look. */
const primary = "press-ring inline-flex items-center justify-center gap-2 rounded-full bg-accent-dark px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50";
const quiet = "press-ring inline-flex items-center justify-center gap-2 rounded-full border border-line/70 bg-white px-3.5 py-1.5 text-[12px] font-semibold disabled:opacity-50";

export default function MovedInStillAdvertised({ className = "" }: { className?: string }) {
  const [owner, setOwner] = useState<boolean | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  /* Let agreed first: Susan's own words. Let is the listings already marked let. */
  const [filter, setFilter] = useState<"all" | "Let agreed" | "Let">("Let agreed");
  const [all, setAll] = useState(false);
  const [lines, setLines] = useState<Record<string, Line>>({});
  const [done, setDone] = useState<string | null>(null);

  /* Owners and Susan, decided on the actor (as the Tools grid does). */
  useEffect(() => {
    let alive = true;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { actor?: { role?: string } | null; viewingAs?: boolean } | null) => {
        if (!alive) return;
        const role = j?.actor?.role;
        setOwner((role === "owner" || role === "super_admin") && !j?.viewingAs);
      })
      .catch(() => alive && setOwner(false));
    return () => {
      alive = false;
    };
  }, []);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/listings/moved-in${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string } & Partial<Report>;
      if (!j.ok || !Array.isArray(j.rows)) throw new Error(j.error ?? "The list could not be checked. Try again in a minute.");
      setReport(j as Report);
    } catch (e) {
      /* Never the last list: an error state instead (live figures only). */
      setReport(null);
      setError(e instanceof Error ? e.message : "The list could not be checked. Try again in a minute.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (owner) void load();
  }, [owner, load]);

  async function takeDown(row: Row) {
    setLines((l) => ({ ...l, [row.listingId]: { state: "doing" } }));
    setDone(null);
    const post = async (url: string, body: unknown) => {
      const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      return (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    };
    /* The portals first. If that fails nothing else is done: the advert is still up. */
    const off = await post("/api/listings/publish", { id: Number(row.listingId), action: "off" }).catch(() => null);
    if (!off?.ok) {
      setLines((l) => ({ ...l, [row.listingId]: { state: "failed", note: off?.error ?? "The connection dropped. Nothing was changed." } }));
      return;
    }
    /* Then the OS's own marker, as Take Offline does. */
    await post("/api/listings/offline", { listingId: row.listingId, action: "offline" }).catch(() => null);
    setReport((r) => (r ? { ...r, rows: r.rows.filter((x) => x.listingId !== row.listingId) } : r));
    setLines((l) => {
      const n = { ...l };
      delete n[row.listingId];
      return n;
    });
    setDone(`${row.address}: taken off ${portalWords(row.portals)}. It goes from the portals within about 10 minutes.`);
  }

  if (!owner) return null;

  const rows = report?.rows ?? [];
  const counts = { all: rows.length, "Let agreed": rows.filter((r) => r.stage === "Let agreed").length, Let: rows.filter((r) => r.stage === "Let").length };
  const shown = rows.filter((r) => filter === "all" || r.stage === filter);
  const visible = all ? shown : shown.slice(0, SHOW);
  const after = report?.afterDays ?? 14;

  return (
    <section className={`rounded-[22px] border border-line/60 bg-white p-5 sm:p-6 ${className}`} aria-label="Moved in and still advertised">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-[260px]">
          <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
            <DoodleIcon name="megaphone" size={13} className="text-accent-dark" /> Owners only
          </p>
          <h2 className="mt-1.5 text-[19px] font-normal leading-tight tracking-normal">
            Moved In and Still Advertised
            {report && <span className="figures ml-2 text-muted">{rows.length}</span>}
          </h2>
          <p className="mt-1.5 max-w-[640px] text-[12.5px] leading-relaxed text-muted">
            Let agreed or let, the tenant moved in {after} days ago or more, and the listing system is still sending the advert to the portals as on the market. Rightmove and OnTheMarket take some let adverts down by themselves, so not every one here is still showing there.
          </p>
        </div>
        {report && !loading && (
          <button type="button" onClick={() => void load(true)} className={quiet}>
            Check again
          </button>
        )}
      </div>

      {loading && (
        <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted" role="status">
          <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Checking each let home's advert on the portals. This can take up to a minute.
        </p>
      )}

      {!loading && error && (
        <div className="mt-4 rounded-xl bg-accent-soft px-4 py-3" role="alert">
          <p className="text-[12.5px] font-medium text-accent-dark">{error}</p>
          <button type="button" onClick={() => void load(true)} className={`${quiet} mt-2.5`}>
            Try again
          </button>
        </div>
      )}

      {!loading && report && (
        <>
          {done && <p className="mt-4 rounded-xl bg-[#eef2ea] px-4 py-2.5 text-[12.5px] text-[#3f5a32]" role="status">{done}</p>}

          {rows.length === 0 ? (
            <p className="mt-4 text-[13px]">Nothing to take down. No home that moved in {after} days ago or more is still being sent to the portals.</p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-1.5" role="group" aria-label="Show">
                {(["Let agreed", "Let", "all"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={filter === f}
                    onClick={() => setFilter(f)}
                    className={`rounded-full border px-3 py-1 text-[12px] transition ${filter === f ? "border-ink bg-ink text-white" : "border-line bg-white text-ink hover:border-accent"}`}
                  >
                    {f === "all" ? "All" : f} <span className="figures opacity-70">{counts[f]}</span>
                  </button>
                ))}
              </div>

              {shown.length === 0 && <p className="mt-3 text-[12.5px] text-muted">None here. The other tab has the rest.</p>}
              <ul className={`mt-3 divide-y divide-line/60 ${shown.length ? "border-y border-line/60" : ""}`}>
                {visible.map((r) => {
                  const line = lines[r.listingId];
                  return (
                    <li key={r.listingId} className="py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                        <div className="min-w-0 flex-1 basis-[240px]">
                          <Link href={`/listings/${r.listingId}`} className="block truncate text-[13.5px] font-medium hover:underline">
                            {r.address}
                          </Link>
                          <p className="mt-0.5 text-[11.5px] text-muted">
                            {r.stage} · {r.agent ?? "No agent named"}
                          </p>
                        </div>
                        <div className="w-[150px] shrink-0 text-[12px]" title={SOURCE[r.source]}>
                          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted">Moved in</span>
                          <span className="figures">{dateWords(r.moveIn)}</span>
                          <span className="figures text-muted"> · {r.days} days</span>
                        </div>
                        <div className="w-[190px] shrink-0 text-[12px]">
                          <span className="block text-[9.5px] font-semibold uppercase tracking-[0.06em] text-muted">Still sent to</span>
                          {portalWords(r.portals)}
                        </div>
                        <div className="shrink-0">
                          {line?.state !== "doing" && (
                            <button type="button" disabled={Boolean(line)} onClick={() => setLines((l) => ({ ...l, [r.listingId]: { state: "ask" } }))} className={quiet}>
                              Take the advert down
                            </button>
                          )}
                          {line?.state === "doing" && (
                            <span className="flex items-center gap-2 text-[12px] text-muted">
                              <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
                              Taking it down…
                            </span>
                          )}
                        </div>
                      </div>
                      {line?.state === "ask" && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl border border-line/60 px-3.5 py-2.5">
                          <p className="min-w-0 flex-1 basis-[220px] text-[12.5px]">Take it off {portalWords(r.portals)}? It stays in the listing system, off every portal.</p>
                          <button type="button" onClick={() => void takeDown(r)} className={primary}>
                            Yes, take it down
                          </button>
                          <button
                            type="button"
                            onClick={() => setLines((l) => { const n = { ...l }; delete n[r.listingId]; return n; })}
                            className={quiet}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                      {line?.state === "failed" && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-xl bg-accent-soft px-3.5 py-2.5">
                          <p className="min-w-0 flex-1 basis-[220px] text-[12.5px] font-medium text-accent-dark">{line.note}</p>
                          <button type="button" onClick={() => setLines((l) => { const n = { ...l }; delete n[r.listingId]; return n; })} className={quiet}>
                            Close
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>

              {shown.length > SHOW && (
                <button type="button" onClick={() => setAll((a) => !a)} className={`${quiet} mt-3`}>
                  {all ? "Show fewer" : `Show all ${shown.length}`}
                </button>
              )}
            </>
          )}

          <p className="mt-3 text-[11.5px] text-muted">
            Checked at {timeWords(report.checkedAt)}.
            {report.noDate > 0 && ` ${report.noDate} let agreed or let ${report.noDate === 1 ? "home has" : "homes have"} no move-in date on file, so ${report.noDate === 1 ? "it isn't" : "they aren't"} on this list.`}
            {report.unreadable > 0 && ` ${report.unreadable} could not be checked just now.`}
          </p>
        </>
      )}
    </section>
  );
}
