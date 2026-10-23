"use client";

import { CHECKING_LABEL } from "@/lib/cert-hold";
import { asOf } from "@/lib/as-of";
import { useCallback, useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import WalkthroughLink from "@/components/showroom/WalkthroughLink";
import ComplianceDrawer from "@/components/ComplianceDrawer";
import ExcelButton from "@/components/ExcelButton";
import StatTile, { toneFor } from "@/components/StatTile";
import {
  BIG_THREE, CERT_META, COMP_BOOK, dueWithin, headlineCerts, isOurs, isStaleRecord, renewalHeld, shownStatus, statusOf,
  type CertKey, type CertStatus, type CompProperty,
} from "@/lib/compliance";
import { searchMatches } from "@/lib/search-match";
import { useNoteVisit } from "@/lib/recent-visits";
import { useNewLook } from "@/lib/use-new-look";
import { Mast, Ico } from "@/components/new-look/Parts";

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
  /* A renewal with the compliance team (lib/cert-hold): not an alarm while they check it. */
  if (cert?.checking && !cert.checking.queried && statusOf(cert) !== "ok" && statusOf(cert) !== "watch") {
    return (
      <span className="figures inline-block whitespace-nowrap rounded-full border border-line/80 px-2.5 py-1 text-[10.5px] font-semibold text-muted" title={`${name ?? ""}: ${CHECKING_LABEL}`}>
        with compliance
      </span>
    );
  }
  const s = shownStatus(cert);
  const text = renewalHeld(cert)
    ? "with council"
    : s === "expired"
      ? `${Math.abs(cert!.expires!)}d over`
      : s === "missing"
        ? isStaleRecord(cert) ? "old record" : "no record"
        : s === "urgent"
          ? `${cert!.expires}d left`
          : s === "watch"
            ? `${cert!.expires}d`
            : "in date";
  return (
    <span
      className={`figures inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[10.5px] font-semibold ${TONE[s]}`}
      title={isStaleRecord(cert) ? `${name}: the last one on file ran out ${Math.round(Math.abs(cert!.expires!) / 30)} months ago and no renewal has reached us` : name}
    >
      {text}
    </span>
  );
}

/* ── The new look's pieces (lib/new-look "compliance", 23 Oct 2026) ──────────
   The same words as CertPill above, drawn as coloured text rather than a
   filled pill (the design's Cell). Nothing is counted differently. */
const noDash = (s: string) => s.replace(/\s*—\s*/g, ", ");

function NlCert({ cert, name }: { cert: CompProperty["certs"][CertKey]; name?: string }) {
  if (cert?.checking && !cert.checking.queried && statusOf(cert) !== "ok" && statusOf(cert) !== "watch") {
    return <span className="nl-cbook-cert is-info" title={`${name ? noDash(name) : ""}: ${CHECKING_LABEL}`}>with compliance</span>;
  }
  const s = shownStatus(cert);
  const held = renewalHeld(cert);
  const text = held
    ? "with council"
    : s === "expired"
      ? `${Math.abs(cert!.expires!)}d over`
      : s === "missing"
        ? isStaleRecord(cert) ? "old record" : "no record"
        : s === "urgent"
          ? `${cert!.expires}d left`
          : s === "watch"
            ? `${cert!.expires}d`
            : "in date";
  const tone = held ? "is-info" : s === "expired" ? "is-over" : s === "missing" ? "is-missing" : s === "urgent" ? "is-soon" : s === "watch" ? "is-watch" : "is-ok";
  return (
    <span
      className={`nl-cbook-cert ${tone}`}
      title={isStaleRecord(cert) ? `${name ? noDash(name) : ""}: the last one on file ran out ${Math.round(Math.abs(cert!.expires!) / 30)} months ago and no renewal has reached us` : name ? noDash(name) : undefined}
    >
      {text}
    </span>
  );
}

/** Two small line icons the shared set doesn't carry: over (a warning) and left (a clock). */
function NlReqIcon({ over }: { over: boolean }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {over ? <path d="M12 4l9 16H3zM12 10v4M12 17h.01" /> : <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>}
    </svg>
  );
}

type Filter = "all" | "expired" | "urgent" | "missing" | "ok";

export default function Compliance() {
  const look = useNewLook("compliance");
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  useNoteVisit(openId ? `cert:${openId}` : null);
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
    /** The office sees the whole business; an agent, their own book (4 Oct 2026). */
    scope?: { whole: boolean; label: string };
    /** How old the cached book is - shown, never hidden (lib/as-of). */
    ageMs?: number;
    /* Nothing stands in for the book (18 Sep 2026): the sample homes used to
       show for the whole thirty-second read and again whenever it failed. The
       sample is for a laptop with nothing connected, and the server says so. */
  }>({ properties: [], live: false, loading: true });

  /* Read again after a change made in the drawer (a renewal noted), quietly:
     the rows stay up while it loads. */
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);
  useEffect(() => {
    let gone = false;
    fetch("/api/compliance", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (gone) return;
        if (j.ok && j.live && Array.isArray(j.properties)) {
          setSource({ properties: j.properties, live: true, loading: false, counts: j.counts, ageMs: typeof j.ageMs === "number" ? j.ageMs : undefined, scope: j.scope });
        } else {
          setSource({
            properties: j.ok && j.demo ? COMP_BOOK : [],
            live: false,
            loading: false,
            reason: j.reason ?? j.error ?? "The certificates didn't load. Try again in a minute.",
          });
        }
      })
      .catch(() => { if (!gone) setSource({ properties: [], live: false, loading: false, reason: "The certificates didn't load. Try again in a minute." }); });
    return () => { gone = true; };
  }, [version]);

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
        const statuses = headlineCerts(p).map((k) => shownStatus(p.certs[k]));
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
    if (query.trim() && !searchMatches(query, p.name, p.locality, p.landlord, p.tenant)) return false;
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

  /* ── THE NEW LOOK (lib/new-look "compliance", 23 Oct 2026) ───────────────
     The same book, the same reads, the same four counts and the same drawer,
     drawn the design's way: a type-only header, four quiet tiles that still
     filter the book, the next month as a list, and the book as a table that
     folds into cards on a phone. The old page stays below until the switch
     has bedded in. */
  if (look === null) {
    return (
      <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted">
        <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
        Opening Compliance…
      </p>
    );
  }
  if (look) {
    const failed = !source.loading && !source.live && !source.properties.length;
    const blurb = source.loading
      ? "Reading every certificate on every home…"
      : source.live && source.counts
        ? `Live${source.ageMs != null ? `, ${asOf(source.ageMs).text}` : ""}. ${BOOK.length} ${source.scope && !source.scope.whole ? "homes on your own book" : "homes we manage"}. ${noGas} have no gas supply, from the signed terms or the property's own record; ${gasUnknown} have nobody's answer either way, which is unknown rather than exempt. Let-only and rent collect homes are the landlord's to keep compliant, and homes whose agent has left are not ours, so neither is here. A certificate more than 6 months out of date reads as an old record, not an expiry.`
        : failed
          ? "The certificates didn't load just now, so nothing on this page has been checked."
          : (source.reason ?? "Every certificate on every home, and the button that fixes each one.");
    const tone = (key: Filter, value: number) =>
      source.loading || !source.live ? "" : key === "expired" ? (value > 0 ? " is-accent" : " is-sage") : key === "ok" ? " is-sage" : "";
    const who = (name: string | null | undefined) => (name && name.trim() && name.trim() !== "—" ? name : null);
    const filterLabel = TILES.find((t) => t.key === filter)?.label;
    return (
      <div data-look="new">
        <div className="nl-page nl-rise">
          <Mast
            eyebrow="Portfolio"
            title="Compliance"
            blurb={blurb}
            actions={<WalkthroughLink step="compliance" className="nl-cbook-how" />}
          />

          {/* The four counts. Each is also the filter for the book below. */}
          <div className="nl-cbook-tiles" aria-busy={source.loading}>
            {TILES.map((t) => (
              <button
                key={t.key}
                type="button"
                aria-pressed={filter === t.key}
                onClick={() => setFilter(filter === t.key ? "all" : t.key)}
                className={`nl-cbook-tile${tone(t.key, t.value)}${filter === t.key ? " is-on" : ""}`}
              >
                <span className="nl-cbook-tile-label">{t.label}</span>
                {/* Nothing read is "-", never 0 (bug P-017): a 0 reads as all clear. */}
                {source.loading ? (
                  <span className="nl-cbook-skel" aria-label="Loading" />
                ) : (
                  <b className="nl-cbook-fig">{failed ? "-" : t.value.toLocaleString("en-GB")}</b>
                )}
                <span className="nl-cbook-tile-note">{t.hint}</span>
              </button>
            ))}
          </div>

          {failed && (
            <div className="nl-cbook-fail" role="alert">
              <p className="nl-block-title">The Certificates Didn&rsquo;t Load</p>
              <p className="nl-meta mt-1.5 max-w-xl">
                {source.reason ?? "Nothing on this page has been checked."} Don&rsquo;t read the page as all clear.
              </p>
              <button type="button" onClick={reload} className="nl-btn nl-btn--secondary nl-btn--sm mt-4">Try again</button>
            </div>
          )}

          {/* THE NEXT MONTH: the reason this page exists. The whole row opens the home; nothing is done from here. */}
          <section className="nl-cbook-card">
            <h2 className="nl-section-title nl-cbook-h">Coming Out of Compliance in the Next Month</h2>
            {urgent.length ? (
              <ul className="nl-cbook-soon">
                <li className="nl-cbook-soon-head" aria-hidden>
                  <span>Days</span><span>Property</span><span>Requirement</span><span>Expiry date</span>
                </li>
                {urgent.map(({ p, key, cert, status }) => {
                  const days = cert?.expires ?? null;
                  const over = days == null ? 0 : Math.abs(days);
                  const expiry = days == null ? null : new Date(Date.now() + days * 86400000);
                  const isOver = status === "expired";
                  const landlord = who(p.landlord);
                  return (
                    <li key={`${p.id}:${key}`}>
                      <button type="button" onClick={() => setOpenId(p.id)} className="nl-cbook-soon-row">
                        <span className={`nl-cbook-days${isOver ? " is-over" : ""}`}>
                          {/* Past two years, days stop meaning anything: years instead. */}
                          <b>{!isOver ? days : over > 730 ? Math.floor(over / 365) : over}</b>
                          <small>{!isOver ? "days left" : over > 730 ? "years over" : "days over"}</small>
                        </span>
                        <span className="nl-cbook-prop">
                          <span className="nl-strong">{p.name}</span>
                          <span className="nl-meta">
                            {[p.locality, landlord && `landlord ${landlord}`, p.tenant, p.hmo && "HMO"].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        <span className="nl-cbook-reqcell">
                          <span className={`nl-cbook-req${isOver ? " is-over" : ""}`}>
                            <NlReqIcon over={isOver} />
                            {noDash(CERT_META[key].label)}
                          </span>
                        </span>
                        <span className="nl-cbook-date">
                          {expiry ? expiry.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not recorded"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : source.loading ? (
              /* Never an all-clear before anything has been read (bug P-017). */
              <p className="nl-cbook-wait"><span className="nl-cbook-spin" aria-hidden />Reading every certificate…</p>
            ) : !source.live ? (
              <p className="nl-cbook-bad">
                The certificates didn&rsquo;t load, so nothing here has been checked. Don&rsquo;t read it as all clear - try again in a minute.
              </p>
            ) : (
              <p className="nl-empty">Nothing expires this month. It happens.</p>
            )}
          </section>

          {/* The whole book, one row per home, the big three as columns. */}
          <section className="nl-cbook-card">
            <div className="nl-cbook-bookhead">
              <h2 className="nl-section-title nl-cbook-h">The Book</h2>
              {filter !== "all" && (
                <button type="button" onClick={() => setFilter("all")} className="nl-cbook-chip" aria-label={`Clear the ${filterLabel ?? ""} filter`}>
                  {filterLabel}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
              <span className="nl-cbook-tools">
                <label className="nl-fsearch nl-cbook-search">
                  <Ico name="search" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Property or landlord" aria-label="Search the book" />
                </label>
                {/* Kirstie, 16 Oct 2026: every certificate on the homes shown, with its contractor (lib/exports). */}
                <ExcelButton
                  href="/api/export/certificates"
                  className="nl-cbook-excel"
                  disabled={!source.live || book.length === 0}
                  body={() => ({
                    properties: book.map(({ p }) => p.id),
                    filters: [
                      filter !== "all" && (TILES.find((t) => t.key === filter)?.label ?? filter),
                      query.trim() && `Search "${query.trim()}"`,
                    ].filter(Boolean).join(", "),
                  })}
                />
              </span>
            </div>

            <table className="nl-cbook-table">
              <thead>
                <tr>
                  <th>Property</th>
                  {BIG_THREE.map((k) => <th key={k}>{CERT_META[k].short}</th>)}
                  <th>HMO extras</th>
                  <th>Who&apos;s there</th>
                </tr>
              </thead>
              <tbody>
                {book.map(({ p }) => {
                  const landlord = who(p.landlord);
                  return (
                    <tr key={p.id} onClick={() => setOpenId(p.id)}>
                      <td className="nl-cbook-tprop">
                        <button type="button" onClick={(e) => { e.stopPropagation(); setOpenId(p.id); }} className="nl-strong nl-cbook-open">
                          {p.name}
                        </button>
                        {p.hmo && <span className="nl-cbook-hmo">HMO</span>}
                        <span className="nl-meta block">{p.locality}</span>
                      </td>
                      {BIG_THREE.map((k) => (
                        <td key={k} data-label={CERT_META[k].short}>
                          {k === "gas" && !p.hasGas ? (
                            <span className="nl-cbook-cert is-none">no gas</span>
                          ) : (
                            <NlCert cert={p.certs[k]} name={CERT_META[k].label} />
                          )}
                        </td>
                      ))}
                      <td data-label="HMO extras" className={`nl-cbook-textras${p.hmo ? "" : " is-empty"}`}>
                        {p.hmo ? (
                          <span className="nl-cbook-extras">
                            {(["licence", "fire", "pat"] as CertKey[]).map((k) => (
                              <span key={k}>
                                <i>{CERT_META[k].short}</i>
                                <NlCert cert={p.certs[k]} name={CERT_META[k].label} />
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="nl-meta">-</span>
                        )}
                      </td>
                      <td data-label="Who's there" className="nl-cbook-twho">
                        <span className="nl-cbook-line" title={landlord ?? undefined}>{landlord ?? "No landlord on record"}</span>
                        {p.tenant === null ? (
                          <span className="nl-meta nl-cbook-line" title="No tenant on the listing: either nobody is in, or it has not been recorded">No tenant on record</span>
                        ) : p.tenant ? (
                          <span className="nl-meta nl-cbook-line" title={p.tenant}>{p.tenant}</span>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!book.length && (
              source.loading ? (
                <p className="nl-cbook-wait"><span className="nl-cbook-spin" aria-hidden />Reading the book…</p>
              ) : failed ? (
                <p className="nl-cbook-bad">Nothing to show - the certificates didn&rsquo;t load.</p>
              ) : (
                <p className="nl-empty">Nothing matches. Clear the filter or the search.</p>
              )
            )}

            <p className="nl-cbook-foot">
              <b>Putting one right:</b> open the home and upload the renewed certificate. Compliance checks it,
              and once they have, it goes to the landlord and the tenant for you. If compliance query it, you get
              an email saying what needs fixing.
            </p>
          </section>
        </div>

        <ComplianceDrawer property={open} book={BOOK} onClose={() => setOpenId(null)} onChanged={reload} />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title="Compliance"
        blurb={
          source.loading
            ? "Reading every certificate on every home…"
            : source.live && source.counts
              ? /* The count has to be the homes ON THIS SCREEN. The book REX
                   answers about is wider - every current listing as well as
                   the managed book - and printing that total above a list
                   scoped to what we manage is how the page and Susan's sheet
                   ended up quoting different numbers for the same question. */
                `Live${source.ageMs != null ? `, ${asOf(source.ageMs).text}` : ""}. ${BOOK.length} ${source.scope && !source.scope.whole ? "homes on your own book" : "homes we manage"}. ${noGas} have no gas supply, from the signed terms or the property's own record; ${gasUnknown} have nobody's answer either way, which is unknown rather than exempt. Let-only and rent collect homes are the landlord's to keep compliant, and homes whose agent has left are not ours, so neither is here. A certificate more than 6 months out of date reads as an old record, not an expiry.`
              : !source.properties.length
                ? "The certificates didn't load just now, so nothing on this page has been checked. Try again in a minute."
                : (source.reason ?? "Every certificate on every home, and the button that fixes each one.")
        }
        actions={<WalkthroughLink step="compliance" />}
      />

      {/* ── The four counts. Each is also the filter for the book below. ── */}
      {/* Four tiles, four columns. It was five wide from when Let only had a
          tile of its own; that tile went on 10 Sep and left a gap at xl. */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {/* Portfolio's tile (components/StatTile, 4 Oct 2026). Expired now is
            the one that matters: pink while anything has run out, green when
            nothing has. Each tile still filters the book below. */}
        {TILES.map((t) => (
          <StatTile
            key={t.key}
            label={t.label}
            /* Nothing read is "—", never 0 (bug P-017): a 0 reads as all clear. */
            value={source.loading ? <span className="text-[18px] text-muted">…</span> : !source.live && !source.properties.length ? <span className="text-muted">—</span> : t.value}
            hint={t.hint}
            icon={t.icon}
            tone={t.key === "expired" && !source.loading && source.live ? toneFor(t.value) : undefined}
            active={filter === t.key}
            onClick={() => setFilter(filter === t.key ? "all" : t.key)}
          />
        ))}
      </div>

      {/* ── THE NEXT MONTH — the reason this page exists. ── */}
      <div className="fade-up block-pop mt-6 rounded-[22px] border border-line/50 bg-white p-5 hover:border-ink">
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
        ) : source.loading ? (
          /* Never an all-clear before anything has been read (bug P-017). */
          <p className="flex items-center justify-center gap-2 py-6 text-[12.5px] text-muted">
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
            Reading every certificate…
          </p>
        ) : !source.live ? (
          /* A failed read is not "nothing expires": say it didn't load. */
          <p className="py-6 text-center text-[12.5px] text-accent-dark">
            The certificates didn&rsquo;t load, so nothing here has been checked. Don&rsquo;t read it as all clear - try again in a minute.
          </p>
        ) : (
          <p className="py-6 text-center text-[12.5px] text-muted">
            Nothing expires this month. It happens.
          </p>
        )}
      </div>

      {/* ── The whole book. ── */}
      <div className="fade-up mt-6 rounded-[22px] border border-line/50 bg-white p-5">
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
          <span className="flex flex-wrap items-center gap-2">
          {/* Kirstie, 16 Oct 2026: every certificate on the homes shown, with its contractor (lib/exports). */}
          <ExcelButton
            href="/api/export/certificates"
            disabled={!source.live || book.length === 0}
            body={() => ({
              properties: book.map(({ p }) => p.id),
              filters: [
                filter !== "all" && (TILES.find((t) => t.key === filter)?.label ?? filter),
                query.trim() && `Search "${query.trim()}"`,
              ].filter(Boolean).join(", "),
            })}
          />
          <label className="flex items-center gap-2 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
            <DoodleIcon name="search" size={13} className="shrink-0 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Property or landlord…"
              className="w-44 bg-transparent text-[12px] outline-none placeholder:text-muted/70"
            />
          </label>
          </span>
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
                      <span className="block text-[10.5px] text-muted/70" title="No tenant on the listing: either nobody is in, or it has not been recorded">no tenant on record</span>
                    ) : p.tenant ? (
                      <span className="block max-w-[190px] truncate text-[10.5px] text-muted/70" title={p.tenant}>{p.tenant}</span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!book.length && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-[12px] text-muted">
                    {!source.live && !source.properties.length ? "Nothing to show - the certificates didn't load." : "Nothing matches - clear the filter or the search."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        <span className="font-semibold">Putting one right:</span> open the home and upload the
        renewed certificate. Compliance checks it, and once they have, it goes to the landlord
        and the tenant for you. If compliance query it, you get an email saying what needs fixing.
      </p>

      <ComplianceDrawer
        property={open}
        book={BOOK}
        onClose={() => setOpenId(null)}
        onChanged={reload}
      />

    </>
  );
}
