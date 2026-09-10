"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import ComplianceDrawer from "@/components/ComplianceDrawer";
import {
  BIG_THREE, CERT_META, COMP_BOOK, dueWithin, headlineCerts, isOurs, statusOf,
  type CertKey, type CertStatus, type CompProperty,
} from "@/lib/compliance";

/**
 * Compliance — the page that keeps every home legal and every tenant safe.
 *
 * The order of the page IS the priority order of the job:
 *   1. THE NEXT MONTH: everything expired or expiring inside 30 days - days
 *      over, the home, the requirement, the expiry date. Nothing is booked
 *      or sent from the list (James, 6 Sep 2026): click into the home.
 *   2. The whole book, one row per property, the big three as columns —
 *      so "where are we weak" is a glance, not an audit.
 *
 * The big three (EICR, gas, EPC) lead because they're safety law; HMOs carry
 * their extra set; the quiet duties live in the drawer.
 */

const TONE: Record<CertStatus, string> = {
  expired: "bg-accent-dark text-page",
  urgent: "bg-accent-soft text-accent-dark",
  missing: "border border-dashed border-accent-dark/60 text-accent-dark",
  watch: "border border-line/80 text-muted",
  ok: "border border-line/80 text-muted",
};

function CertPill({ cert, name }: { cert: CompProperty["certs"][CertKey]; name?: string }) {
  const s = statusOf(cert);
  const text =
    s === "expired"
      ? `${Math.abs(cert!.expires!)}d over`
      : s === "missing"
        ? "no record"
        : s === "urgent"
          ? `${cert!.expires}d left`
          : s === "watch"
            ? `${cert!.expires}d`
            : "in date";
  return (
    <span
      className={`figures inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${TONE[s]}`}
      title={name}
    >
      {text}
    </span>
  );
}

type Filter = "all" | "expired" | "urgent" | "missing" | "ok";

export default function Compliance() {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  /* ?open=<property id> from the search bar or the bell. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("open");
    if (wanted) setOpenId(wanted);
  }, []);

  /* ── The real book, out of REX. Sample stands in until it answers. ── */
  const [source, setSource] = useState<{
    properties: CompProperty[];
    live: boolean;
    loading: boolean;
    reason?: string;
    counts?: { properties: number; withAnyRecord: number; entries: number; withCertificate: number; gasUnknown: number };
  }>({ properties: COMP_BOOK, live: false, loading: true });

  useEffect(() => {
    let gone = false;
    fetch("/api/compliance")
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (j.ok && j.live && Array.isArray(j.properties)) {
          setSource({ properties: j.properties, live: true, loading: false, counts: j.counts });
        } else {
          setSource({ properties: COMP_BOOK, live: false, loading: false, reason: j.reason });
        }
      })
      .catch(() => { if (!gone) setSource((b) => ({ ...b, loading: false, reason: "REX didn't answer — showing the sample book." })); });
    return () => { gone = true; };
  }, []);

  /* The book carries one record per leased listing, so a home let three
     times came three times; the page shows each home once. */
  /* One row per home, and let-only homes are not on this screen at all.
     James, 10 Sep 2026: "if they're let-only, just ignore them completely...
     the idea should be that we're only showing compliance that we'd actually
     need to sort ourselves." A certificate we cannot book an engineer for is
     not a job, and a job list full of things you cannot do stops being read. */
  /* One row per home, and only the homes this agency is answerable for.
     James, 10 Sep 2026: "we shouldn't be including any let-onlys in
     compliance", and the figures here have to match the breakdown sheet
     Susan reads, which is scoped to the REX PM managed book with let-only
     stripped out. Same question asked once - see isOurs(). */
  const BOOK = useMemo(() => {
    const seen = new Set<string>();
    return source.properties.filter((p) =>
      seen.has(p.id) || !isOurs(p) ? false : (seen.add(p.id), true)
    );
  }, [source.properties]);
  const urgent = useMemo(() => dueWithin(30, BOOK), [BOOK]);
  /* Two different things, and they were being reported as one. A home whose
     terms of business say there is no gas is settled; a home nobody has ever
     answered for is a job. Both sit outside the gas figures. */
  const gasUnknown = useMemo(() => BOOK.filter((p) => !p.hasGas && !p.gasAnswered).length, [BOOK]);
  const noGas = useMemo(() => BOOK.filter((p) => !p.hasGas && p.gasAnswered).length, [BOOK]);

  // Per-property worst status, for the tiles and the filter.
  const graded = useMemo(
    () =>
      BOOK.map((p) => {
        const statuses = headlineCerts(p).map((k) => statusOf(p.certs[k]));
        const worst: CertStatus = statuses.includes("expired")
          ? "expired"
          : statuses.includes("urgent")
            ? "urgent"
            : statuses.includes("missing")
              ? "missing"
              : statuses.includes("watch")
                ? "watch"
                : "ok";
        return { p, worst };
      }),
    // MUST depend on BOOK: with an empty list this memo froze on the sample
    // book and left the count tiles disagreeing with the rows beneath them.
    [BOOK]
  );

  const counts = {
    expired: graded.filter((g) => g.worst === "expired").length,
    urgent: graded.filter((g) => g.worst === "urgent").length,
    missing: graded.filter((g) => g.worst === "missing").length,
    ok: graded.filter((g) => g.worst === "ok" || g.worst === "watch").length,
  };

  const book = graded.filter(({ p, worst }) => {
    if (query && !`${p.name} ${p.locality} ${p.landlord} ${p.tenant ?? ""}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (filter === "all") return true;
    if (filter === "ok") return worst === "ok" || worst === "watch";
    return worst === filter;
  });

  const open = BOOK.find((p) => p.id === openId) ?? null;

  const TILES: { key: Filter; label: string; value: number; hint: string; icon: string }[] = [
    { key: "expired", label: "Expired now", value: counts.expired, hint: "stop-everything jobs", icon: "bell" },
    { key: "urgent", label: "Due in 30 days", value: counts.urgent, hint: "book the engineer this week", icon: "clock" },
    { key: "missing", label: "No record", value: counts.missing, hint: "can't prove it's safe", icon: "search" },
    { key: "ok", label: "In date", value: counts.ok, hint: "of the managed book", icon: "shield" },
  ];

  return (
    <>
      <PageHeader
        title="Compliance"
        blurb={
          source.loading
            ? "Reading every certificate on every home from REX…"
            : source.live && source.counts
              ? /* The count has to be the homes ON THIS SCREEN. The book REX
                   answers about is wider - every current listing as well as
                   the managed book - and printing that total above a list
                   scoped to what we manage is how the page and Susan's sheet
                   ended up quoting different numbers for the same question. */
                `Live from REX — ${BOOK.length} homes we manage. ${noGas} have no gas supply, from the signed terms or REX PM's own record; ${gasUnknown} have nobody's answer either way, which is unknown rather than exempt. Let-only homes are the landlord's duty and are not on this screen.`
              : (source.reason ?? "Every certificate on every home, and the button that fixes each one.")
        }
        illustration="/illustrations/notioly/home-caring.svg"
        lineBreak="dip"
      />

      {/* ── The four counts. Each is also the filter for the book below. ── */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-5">
        {TILES.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setFilter(filter === t.key ? "all" : t.key)}
            className={`fade-up block-pop rounded-2xl border bg-box p-5 text-left ${
              filter === t.key ? "border-ink" : "border-line/80 hover:border-ink"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <DoodleIcon name={t.icon} size={19} className="text-accent-dark" />
              <span className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">
                {t.label}
              </span>
            </div>
            <p className="figures mt-3 text-[34px] leading-none">{t.value}</p>
            <p className="mt-1.5 text-[11px] font-medium text-accent-dark">{t.hint}</p>
          </button>
        ))}
      </div>

      {/* ── THE NEXT MONTH — the reason this page exists. ── */}
      <div className="fade-up block-pop mt-6 rounded-2xl border border-line/80 bg-box p-5 hover:border-ink">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px]">Coming out of compliance — the next month</h2>
        </div>
        {urgent.length ? (
          <ul className="divide-y divide-line/40">
            {/* Days over, the home, the requirement in its own box, the date.
                The whole row opens the home; nothing is done from here. */}
            <li className="hidden grid-cols-[74px_minmax(0,1fr)_200px_130px] items-center gap-4 pb-2 text-[10px] font-semibold uppercase tracking-wide text-muted md:grid">
              <span className="text-center">Days</span><span>Property</span><span>Requirement</span><span>Expiry date</span>
            </li>
            {urgent.map(({ p, key, cert, status }) => {
              const ok = `${p.id}:${key}`;
              const days = cert?.expires ?? null;
              const over = days == null ? 0 : Math.abs(days);
              const expiry = days == null ? null : new Date(Date.now() + days * 86400000);
              return (
                <li key={ok}>
                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="grid w-full grid-cols-[74px_minmax(0,1fr)] items-center gap-x-4 gap-y-2 py-3 text-left transition-colors hover:bg-accent-soft/20 md:grid-cols-[74px_minmax(0,1fr)_200px_130px]"
                  >
                    <span className="text-center">
                      {/* Past two years, days stop meaning anything: "3,729
                          days over" reads as a broken number rather than a
                          certificate that ran out in 2016, which is what it
                          is. Years past that point, and the expiry date is in
                          its own column either way. */}
                      <span className={`figures block leading-none ${over > 730 ? "text-[19px]" : "text-[22px]"} ${status === "expired" ? "text-accent-dark" : ""}`}>
                        {status !== "expired" ? days : over > 730 ? Math.floor(over / 365) : over}
                      </span>
                      <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
                        {status !== "expired" ? "days left" : over > 730 ? "years over" : "days over"}
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="hand block truncate text-[13.5px]">{p.name}</span>
                      <span className="block truncate text-[10.5px] text-muted">
                        {p.locality}
                        {p.landlord && p.landlord !== "—" ? ` · landlord ${p.landlord}` : ""}
                        {p.tenant ? ` · ${p.tenant}` : ""}
                        {p.hmo ? " · HMO" : ""}
                      </span>
                    </span>
                    <span className="col-start-2 md:col-start-auto">
                      <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold ${status === "expired" ? "border-accent-dark bg-accent-soft/40 text-accent-dark" : "border-line/80"}`}>
                        <DoodleIcon name={CERT_META[key].icon} size={12} className="text-accent-dark" />
                        {CERT_META[key].label}
                      </span>
                    </span>
                    <span className="figures col-start-2 text-[12.5px] md:col-start-auto">
                      {expiry ? expiry.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-muted">
            Nothing expires this month. It happens.
          </p>
        )}
      </div>

      {/* ── The whole book. ── */}
      <div className="fade-up mt-6 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-[15px]">
            The book{filter !== "all" && (
              <button
                type="button"
                onClick={() => setFilter("all")}
                className="ml-2 rounded-full bg-accent-soft px-2.5 py-1 text-[10.5px] font-semibold text-accent-dark"
              >
                filtered ✕
              </button>
            )}
          </h2>
          <label className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
            <DoodleIcon name="search" size={13} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Property or landlord…"
              className="w-44 bg-transparent text-[12px] outline-none placeholder:text-muted/70"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead>
              <tr className="border-b border-line/70 text-[10px] font-semibold uppercase tracking-wide text-muted">
                <th className="pb-2 pr-4">Property</th>
                {BIG_THREE.map((k) => (
                  <th key={k} className="pb-2 pr-4">{CERT_META[k].short}</th>
                ))}
                <th className="pb-2 pr-4">HMO extras</th>
                <th className="pb-2">Who&apos;s there</th>
              </tr>
            </thead>
            <tbody>
              {book.map(({ p }) => (
                <tr
                  key={p.id}
                  onClick={() => setOpenId(p.id)}
                  className="cursor-pointer border-b border-line/40 transition-colors last:border-0 hover:bg-accent-soft/20"
                >
                  <td className="py-3 pr-4">
                    <span className="hand block whitespace-nowrap text-[13px]">{p.name}</span>
                    <span className="block text-[10.5px] text-muted">
                      {p.locality}
                      {p.hmo && <span className="ml-1.5 font-semibold text-accent-dark">HMO</span>}
                    </span>
                  </td>
                  {BIG_THREE.map((k) => (
                    <td key={k} className="py-3 pr-4">
                      {k === "gas" && !p.hasGas ? (
                        <span className="text-[10.5px] text-muted/60">no gas</span>
                      ) : (
                        <CertPill cert={p.certs[k]} name={CERT_META[k].label} />
                      )}
                    </td>
                  ))}
                  <td className="py-3 pr-4">
                    {p.hmo ? (
                      <span className="flex gap-1.5">
                        {(["licence", "fire", "pat"] as CertKey[]).map((k) => (
                          <CertPill key={k} cert={p.certs[k]} name={CERT_META[k].label} />
                        ))}
                      </span>
                    ) : (
                      <span className="text-[10.5px] text-muted/60">—</span>
                    )}
                  </td>
                  <td className="py-3 text-[12px] text-muted">
                    <span className="block max-w-[190px] truncate" title={p.landlord}>{p.landlord}</span>
                    {p.tenant === null ? (
                      <span className="block text-[10.5px] text-muted/70" title="REX has no tenant on the listing: either nobody is in, or it has not been recorded">no tenant on record</span>
                    ) : p.tenant ? (
                      <span className="block max-w-[190px] truncate text-[10.5px] text-muted/70" title={p.tenant}>{p.tenant}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!book.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[12px] text-muted">
                    Nothing matches — clear the filter or the search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        <span className="font-semibold">What&apos;s real:</span> REX&apos;s compliance entries are
        readable today, certificate files included. The book only started recording them in
        Nov 2025 with no backfill — so &ldquo;no record&rdquo; will be the loudest column at
        first, and that&apos;s the point: this page is where the gaps get closed.
      </p>

      <ComplianceDrawer
        property={open}
        book={BOOK}
        onClose={() => setOpenId(null)}
      />

    </>
  );
}
