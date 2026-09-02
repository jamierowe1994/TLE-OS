"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import PortfolioMap from "@/components/PortfolioMap";
import FindingData from "@/components/business/FindingData";
import { Pill } from "@/components/Wire";
import { rexListingUrl } from "@/lib/business/rex-links";
import {
  CERT_META, headlineCerts, statusOf,
  type CertKey, type CertStatus, type CompProperty,
} from "@/lib/compliance";
import type { ManagedBook, ManagedLandlord, ManagedProperty, Party } from "@/lib/portfolio-types";

/**
 * Portfolio — the managed book. Every property the business looks after,
 * every landlord it looks after them for, and where they all are.
 *
 * ── Three views of one list ───────────────────────────────────────────────
 *
 * Properties, Landlords and Map are the same filtered set drawn three ways,
 * so a filter set on one is still set on the next. The search box reads
 * addresses, landlords, tenants and agents at once, because "the Patel one in
 * Filton" is how a property is actually asked for.
 *
 * ── Two fetches, on purpose ───────────────────────────────────────────────
 *
 * The book arrives in seconds; the certificates take minutes the first time
 * each day (see lib/managed-book-cache.ts). So the list is drawn as soon as
 * it exists and the certificate column says "checking" until the second
 * fetch answers, polling until it does. A property needing a look is picked
 * out in the accent everywhere — the row, the map pin, the landlord's card —
 * once that answer is in, and nowhere before it.
 *
 * ── No sample, no fallback ────────────────────────────────────────────────
 *
 * This screen was a wireframe with "568" and "93%" typed into it. Those are
 * gone. If REX cannot be reached the screen says so and offers a retry; it
 * never shows a number it did not just read.
 */

type BookState =
  | { status: "loading" }
  | { status: "ready"; book: ManagedBook; scope: string; everything: boolean; stale: boolean }
  | { status: "failed"; error: string; unlinked?: boolean };

type CertsState =
  | { status: "checking"; tries: number }
  | { status: "ready"; by: Map<string, CompProperty>; stale: boolean }
  | { status: "slow" }
  | { status: "failed"; error: string };

type View = "properties" | "landlords" | "map";

const SORTS = [
  { id: "let-new", label: "Let most recently" },
  { id: "attention", label: "Needs a look first" },
  { id: "address", label: "Address A to Z" },
  { id: "rent-high", label: "Rent, high to low" },
  { id: "rent-low", label: "Rent, low to high" },
  { id: "let-old", label: "Let longest ago" },
];

const CERT_POLL_MS = 6_000;
const CERT_MAX_TRIES = 40; // four minutes, then say it is slow rather than spin

const money = (n: number | null | undefined) =>
  n == null ? "—" : `£${Math.round(n).toLocaleString("en-GB")}`;

const day = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/* ---------------------------------------------------------- certificates -- */

type CertSummary = { worst: CertStatus; label: string; tone: string };

const RANK: Record<CertStatus, number> = { expired: 0, urgent: 1, missing: 2, watch: 3, ok: 4 };
const TONE: Record<CertStatus, string> = {
  expired: "bg-accent-dark text-page",
  urgent: "bg-accent-soft text-accent-dark",
  missing: "border border-dashed border-accent-dark/60 text-accent-dark",
  watch: "border border-line/80 text-muted",
  ok: "border border-line/80 text-muted",
};

function summarise(cp: CompProperty | undefined): CertSummary | null {
  if (!cp) return null;
  const counts: Record<CertStatus, number> = { expired: 0, urgent: 0, missing: 0, watch: 0, ok: 0 };
  for (const k of headlineCerts(cp)) counts[statusOf(cp.certs[k])]++;
  const worst = (Object.keys(RANK) as CertStatus[]).sort((a, b) => RANK[a] - RANK[b]).find((s) => counts[s] > 0) ?? "ok";
  const label =
    worst === "expired" ? `${counts.expired} expired`
    : worst === "urgent" ? `${counts.urgent} due soon`
    : worst === "missing" ? `${counts.missing} no record`
    : worst === "watch" ? `${counts.watch} due in 90 days`
    : "In date";
  return { worst, label, tone: TONE[worst] };
}

/**
 * "Needs a look" is a DATED problem: expired, or due inside 30 days.
 *
 * Missing is deliberately not in it. REX has no gas record on 373 of the 449
 * managed properties and no EICR on many more (measured 2 Sep 2026) - some of
 * those are houses with no gas, some are certificates nobody filed, and REX
 * cannot tell them apart. Counting them as needing a look made the figure 436
 * of 449, which is a number nobody can act on. They are counted and labelled
 * separately, as "no record", so the deadline figure stays a deadline figure.
 */
const needsLook = (s: CertSummary | null) => !!s && (s.worst === "expired" || s.worst === "urgent");

/* ---------------------------------------------------------------- bits -- */

/** The dropdown chip — same grammar as Listings and Leads. */
function Filter({
  label, options, value, onChange,
}: {
  label: string;
  options: { id: string; label: string }[];
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.id === value);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
          current
            ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
            : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        {current?.label ?? label}
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="fixed inset-0 z-[60] cursor-default" />
          <div className="fade-up absolute left-0 top-full z-[70] mt-1.5 max-h-[60vh] min-w-[200px] overflow-y-auto rounded-2xl border border-line/80 bg-card p-1.5 shadow-[0_16px_40px_-14px_rgba(0,0,0,0.3)]">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className={`block w-full rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent-soft/40 ${value === null ? "font-semibold text-accent-dark" : ""}`}
            >
              {label}
            </button>
            {options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); }}
                className={`block w-full whitespace-nowrap rounded-lg px-3 py-2 text-left text-[12px] transition-colors hover:bg-accent-soft/40 ${value === o.id ? "font-semibold text-accent-dark" : ""}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="fade-up rounded-2xl border border-line/80 bg-panel p-5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <div className="figures mt-2 text-[30px] font-semibold leading-none tracking-tight">{value}</div>
      {hint && <p className="mt-2 text-[11px] leading-relaxed text-muted">{hint}</p>}
    </div>
  );
}

function Contact({ p, muted = false }: { p: Party; muted?: boolean }) {
  return (
    <span className={`flex flex-wrap items-baseline gap-x-2 ${muted ? "text-muted" : ""}`}>
      <span>{p.name}</span>
      {p.phone && <a href={`tel:${p.phone.replace(/\s+/g, "")}`} className="text-[11px] text-muted hover:text-ink">{p.phone}</a>}
      {p.email && <a href={`mailto:${p.email}`} className="truncate text-[11px] text-muted hover:text-ink">{p.email}</a>}
    </span>
  );
}

/* ----------------------------------------------------------- the panel -- */

function PropertyPanel({
  property, cert, certsState, everything, onClose, onStep,
}: {
  property: ManagedProperty;
  cert: CompProperty | undefined;
  certsState: CertsState["status"];
  everything: boolean;
  onClose: () => void;
  onStep: (d: number) => void;
}) {
  const [shown, setShown] = useState(false);
  const [at, setAt] = useState(0);
  const p = property;
  const shots = p.images.length ? p.images : p.image ? [p.image] : [];

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  useEffect(() => { setAt(0); }, [p.listingId]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onStep]);

  const summary = summarise(cert);
  const certRows: Array<{ key: CertKey; status: CertStatus; expires: number | null; attached: boolean }> = cert
    ? [...headlineCerts(cert), ...(["alarms", "legionella"] as CertKey[])].map((key) => {
        const c = cert.certs[key];
        return { key, status: statusOf(c), expires: c?.expires ?? null, attached: c?.attached ?? false };
      })
    : [];

  const fact = (label: string, value: React.ReactNode) => (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-[13px]">{value}</p>
    </div>
  );

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full max-w-xl flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] ${shown ? "translate-x-0" : "translate-x-full"}`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="min-w-0">
            <h2 className="text-[20px] leading-tight">{p.name}</h2>
            <p className="mt-1 text-[12px] text-muted">
              {p.locality || "—"}
              {p.service ? ` · ${p.service}` : " · service not set in REX"}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" aria-label="Previous property" onClick={() => onStep(-1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">‹</button>
            <button type="button" aria-label="Next property" onClick={() => onStep(1)} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">›</button>
            <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink">✕</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="relative overflow-hidden rounded-2xl border border-line/70 bg-box">
            <PropertyPhoto src={shots[at] ?? null} alt="" className="h-[220px] w-full object-cover" />
            {shots.length > 1 && (
              <>
                <button type="button" aria-label="Previous photograph" onClick={() => setAt((n) => (n - 1 + shots.length) % shots.length)} className="absolute left-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[13px] shadow-sm">‹</button>
                <button type="button" aria-label="Next photograph" onClick={() => setAt((n) => (n + 1) % shots.length)} className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-page/90 text-[13px] shadow-sm">›</button>
                <span className="absolute bottom-2 right-3 rounded-full bg-page/90 px-2 py-0.5 text-[10.5px] text-muted">{at + 1} of {shots.length}</span>
              </>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
            {fact("Rent", p.rent == null ? "Not set" : `${money(p.rent)} ${p.rentPeriod === "week" ? "per week" : "pcm"}`)}
            {fact("Let type", p.letType ?? "—")}
            {fact("Let since", day(p.letSince))}
            {fact("On the books since", day(p.onBooksSince))}
            {fact("Agent", p.agent?.name ?? "—")}
            {fact("Postcode", p.postcode ?? "—")}
          </div>

          <section className="mt-6">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">Landlord</p>
            {p.landlord ? (
              <div className="rounded-xl border border-line/70 bg-panel px-4 py-3 text-[13px]"><Contact p={p.landlord} /></div>
            ) : (
              <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">
                No landlord on the REX record. The owner relationship on this listing is empty, so nobody is being guessed at.
              </p>
            )}
          </section>

          <section className="mt-5">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-wide text-muted">
              {p.tenants.length === 1 ? "Tenant" : "Tenants"}
            </p>
            {p.tenants.length ? (
              <ul className="space-y-2">
                {p.tenants.map((t) => (
                  <li key={t.contactId} className="rounded-xl border border-line/70 bg-panel px-4 py-3 text-[13px]"><Contact p={t} /></li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-dashed border-line/80 px-4 py-3 text-[12px] text-muted">
                No tenant on the REX record.
              </p>
            )}
          </section>

          <section className="mt-5">
            <div className="mb-2 flex items-baseline justify-between">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Certificates</p>
              {summary && <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${summary.tone}`}>{summary.label}</span>}
            </div>
            {certsState === "checking" && <FindingData label="Checking REX" className="text-[12px]" />}
            {certsState === "slow" && <p className="text-[12px] text-muted">Still reading certificates from REX. They will appear when it finishes.</p>}
            {certsState === "failed" && <p className="text-[12px] text-accent-dark">Couldn&rsquo;t read certificates from REX.</p>}
            {certsState === "ready" && !cert && (
              <p className="text-[12px] text-muted">REX holds no property record for this listing, so there is nothing to check.</p>
            )}
            {cert && (
              <ul className="space-y-2">
                {certRows.map((r) => (
                  <li key={r.key} className="flex items-center justify-between gap-3 rounded-xl border border-line/70 bg-panel px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-[13px]">{CERT_META[r.key].label}</p>
                      <p className="text-[11px] text-muted">
                        {r.expires == null
                          ? "No record in REX"
                          : r.expires < 0
                            ? `Expired ${Math.abs(r.expires)} days ago`
                            : `Expires in ${r.expires} days`}
                        {r.expires != null && !r.attached ? " · no document attached" : ""}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${TONE[r.status]}`}>
                      {r.status === "ok" ? "In date" : r.status === "watch" ? "Due soon" : r.status === "urgent" ? "Due now" : r.status}
                    </span>
                  </li>
                ))}
                {cert.hmo && <li className="text-[11px] text-muted">Licensed HMO.</li>}
                {!cert.hasGas && <li className="text-[11px] text-muted">No gas record on file: either no gas supply, or gas nobody has certified. REX does not say which.</li>}
              </ul>
            )}
          </section>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <a
              href={rexListingUrl(p.listingId, "leased")}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-ink/80 px-4 py-2 text-[12px] font-semibold transition-colors hover:bg-ink hover:text-page"
            >
              Open in REX
            </a>
            {everything && p.agent && <span className="text-[11.5px] text-muted">Looked after by {p.agent.name}</span>}
          </div>
        </div>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------ the page -- */

export default function Portfolio() {
  const [state, setState] = useState<BookState>({ status: "loading" });
  const [certs, setCerts] = useState<CertsState>({ status: "checking", tries: 0 });
  const [view, setView] = useState<View>("properties");
  const [q, setQ] = useState("");
  const [service, setService] = useState<string | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [town, setTown] = useState<string | null>(null);
  const [lookOnly, setLookOnly] = useState(false);
  const [sort, setSort] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    setState({ status: "loading" });
    fetch("/api/portfolio", { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, j: await r.json() }))
      .then(({ j }) => {
        if (j.ok) {
          setState({
            status: "ready",
            book: { properties: j.properties, landlords: j.landlords, counts: j.counts, pulledAt: j.pulledAt },
            scope: j.scope ?? "",
            everything: Boolean(j.everything),
            stale: Boolean(j.stale),
          });
        } else {
          setState({ status: "failed", error: j.error ?? "REX didn't answer.", unlinked: Boolean(j.unlinked) });
        }
      })
      .catch(() => setState({ status: "failed", error: "REX didn't answer. Try again in a moment." }));
  }, []);

  useEffect(() => { load(); }, [load]);

  /* The certificates, polled until REX has finished reading them. */
  useEffect(() => {
    if (state.status !== "ready") return;
    let gone = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ask = (tries: number) => {
      fetch("/api/portfolio/compliance", { cache: "no-store" })
        .then((r) => r.json())
        .then((j) => {
          if (gone) return;
          if (j.status === "ready" && Array.isArray(j.properties)) {
            setCerts({ status: "ready", by: new Map((j.properties as CompProperty[]).map((p) => [p.id, p])), stale: Boolean(j.stale) });
          } else if (j.status === "pending") {
            if (tries + 1 >= CERT_MAX_TRIES) setCerts({ status: "slow" });
            else {
              setCerts({ status: "checking", tries: tries + 1 });
              timer = setTimeout(() => ask(tries + 1), CERT_POLL_MS);
            }
          } else {
            setCerts({ status: "failed", error: j.error ?? "Couldn't read certificates." });
          }
        })
        .catch(() => { if (!gone) setCerts({ status: "failed", error: "Couldn't read certificates." }); });
    };
    setCerts({ status: "checking", tries: 0 });
    ask(0);
    return () => { gone = true; if (timer) clearTimeout(timer); };
  }, [state.status]);

  const book = state.status === "ready" ? state.book : null;
  const everything = state.status === "ready" && state.everything;
  const certBy = certs.status === "ready" ? certs.by : null;

  const summaryOf = useCallback(
    (p: ManagedProperty) => (certBy && p.propertyId ? summarise(certBy.get(p.propertyId)) : null),
    [certBy]
  );

  const attention = useMemo(() => {
    const s = new Set<string>();
    if (!book || !certBy) return s;
    for (const p of book.properties) if (needsLook(summaryOf(p))) s.add(p.listingId);
    return s;
  }, [book, certBy, summaryOf]);

  /* The certificate position across the book, split three ways. */
  const certTally = useMemo(() => {
    const t = { expired: 0, urgent: 0, missing: 0 };
    if (!book || !certBy) return t;
    for (const p of book.properties) {
      const w = summaryOf(p)?.worst;
      if (w === "expired") t.expired++;
      else if (w === "urgent") t.urgent++;
      else if (w === "missing") t.missing++;
    }
    return t;
  }, [book, certBy, summaryOf]);

  const services = useMemo(
    () => (book ? Object.keys(book.counts.byService).sort().map((s) => ({ id: s, label: s })) : []),
    [book]
  );
  const agents = useMemo(() => {
    if (!book) return [];
    const m = new Map<string, string>();
    for (const p of book.properties) if (p.agent) m.set(p.agent.id, p.agent.name);
    return [...m.entries()].map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label, "en-GB"));
  }, [book]);
  const towns = useMemo(() => {
    if (!book) return [];
    const m = new Map<string, number>();
    for (const p of book.properties) if (p.town) m.set(p.town, (m.get(p.town) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "en-GB")).map(([t, n]) => ({ id: t, label: `${t} (${n})` }));
  }, [book]);

  const filtered = useMemo(() => {
    if (!book) return [] as ManagedProperty[];
    const needle = q.trim().toLowerCase();
    const rows = book.properties.filter((p) => {
      if (service && (p.service ?? "Not set") !== service) return false;
      if (agent && p.agent?.id !== agent) return false;
      if (town && p.town !== town) return false;
      if (lookOnly && !attention.has(p.listingId)) return false;
      if (needle) {
        const hay = [p.address, p.name, p.locality, p.landlord?.name, p.landlord?.email, p.agent?.name, ...p.tenants.map((t) => t.name)]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
    /* Most recently let first by default. "Needs a look first" is offered,
       not imposed: re-sorting the list under somebody the moment the
       certificates arrive would move the row they were reading. */
    const s = sort ?? "let-new";
    const byAddress = (a: ManagedProperty, b: ManagedProperty) => a.address.localeCompare(b.address, "en-GB");
    rows.sort((a, b) => {
      switch (s) {
        case "rent-high": return (b.rentMonthly ?? -1) - (a.rentMonthly ?? -1) || byAddress(a, b);
        case "rent-low": return (a.rentMonthly ?? Infinity) - (b.rentMonthly ?? Infinity) || byAddress(a, b);
        case "let-new": return (b.letSince ?? "").localeCompare(a.letSince ?? "") || byAddress(a, b);
        case "let-old": return (a.letSince ?? "9").localeCompare(b.letSince ?? "9") || byAddress(a, b);
        case "attention": {
          const ra = RANK[summaryOf(a)?.worst ?? "ok"];
          const rb = RANK[summaryOf(b)?.worst ?? "ok"];
          return ra - rb || byAddress(a, b);
        }
        default: return byAddress(a, b);
      }
    });
    return rows;
  }, [book, q, service, agent, town, lookOnly, sort, attention, certBy, summaryOf]);

  const filtering = Boolean(q.trim() || service || agent || town || lookOnly);

  /* Landlords: those with at least one property in the filtered set, or, when
     only the search box is in play, a name or email that matches it. */
  const landlords = useMemo(() => {
    if (!book) return [] as ManagedLandlord[];
    const ids = new Set(filtered.map((p) => p.listingId));
    const needle = q.trim().toLowerCase();
    return book.landlords.filter((l) => {
      if (l.listingIds.some((id) => ids.has(id))) return true;
      if (!filtering) return true;
      if (needle && !service && !agent && !town && !lookOnly) {
        return `${l.name} ${l.email ?? ""} ${l.phone ?? ""}`.toLowerCase().includes(needle);
      }
      return false;
    });
  }, [book, filtered, q, filtering, service, agent, town, lookOnly]);

  const byId = useMemo(() => new Map((book?.properties ?? []).map((p) => [p.listingId, p])), [book]);
  const open = openId ? byId.get(openId) ?? null : null;
  const step = useCallback(
    (d: number) => {
      setOpenId((id) => {
        if (!id || !filtered.length) return id;
        const i = filtered.findIndex((p) => p.listingId === id);
        const next = filtered[(i + d + filtered.length) % filtered.length];
        return next?.listingId ?? id;
      });
    },
    [filtered]
  );
  const close = useCallback(() => setOpenId(null), []);

  const rentRoll = useMemo(() => filtered.reduce((a, p) => a + (p.rentMonthly ?? 0), 0), [filtered]);

  const blurb =
    state.status === "loading" ? "Fetching the managed book from REX…"
    : state.status === "failed" ? state.error
    : `Live from REX — ${state.book.counts.properties} properties under management across ${state.book.counts.towns} towns, for ${state.book.counts.landlords} landlords${state.everything ? "" : ` (${state.scope}'s book)`}.${state.stale ? " Refreshing behind." : ""}`;

  const certsHint =
    certs.status === "checking" ? <FindingData label="Checking REX" />
    : certs.status === "slow" ? "REX is still reading them. Refresh in a few minutes."
    : certs.status === "failed" ? <span className="text-accent-dark">{certs.error}</span>
    : `${certTally.expired} expired · ${certTally.urgent} due in 30 days · ${certTally.missing} with no record in REX${certs.stale ? " · refreshing" : ""}`;

  const pillClass = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-[12px] transition-colors ${on ? "border-ink bg-ink text-page" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`;

  return (
    <>
      <PageHeader title="Portfolio" blurb={blurb} illustration="/illustrations/buildings-street.png" />

      {state.status === "failed" ? (
        <div className="fade-up mt-8 rounded-2xl border border-dashed border-accent-dark/50 bg-panel p-6">
          <p className="text-[14px]">{state.unlinked ? "We can't show you a portfolio yet" : "The book couldn't be read"}</p>
          <p className="mt-1 max-w-[60ch] text-[12.5px] leading-relaxed text-muted">{state.error}</p>
          {!state.unlinked && (
            <button type="button" onClick={load} className="mt-3 rounded-full border border-ink/80 px-4 py-2 text-[12px] font-semibold transition-colors hover:bg-ink hover:text-page">
              Try again
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Properties"
              value={book ? book.counts.properties.toLocaleString("en-GB") : <FindingData label="" />}
              hint={book && Object.entries(book.counts.byService).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · ")}
            />
            <StatCard
              label="Rent roll"
              value={book ? <>{money(book.counts.rentRoll)}<span className="text-[13px] text-muted"> pcm</span></> : <FindingData label="" />}
              hint={book && `REX's agreed rent, not money received. Average ${money(book.counts.avgRent)} pcm.`}
            />
            <StatCard
              label="Landlords"
              value={book ? book.counts.landlords.toLocaleString("en-GB") : <FindingData label="" />}
              hint={book && (book.counts.withoutLandlord ? `${book.counts.withoutLandlord} properties have no landlord on the REX record.` : "Every property has a landlord on record.")}
            />
            <StatCard
              label="Certificates to renew"
              value={certs.status === "ready" ? attention.size.toLocaleString("en-GB") : <span className="text-[18px] text-muted">…</span>}
              hint={book ? certsHint : undefined}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <div className="flex gap-1.5">
              {(["properties", "landlords", "map"] as View[]).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)} className={pillClass(view === v)}>
                  {v === "properties" ? `Properties${book ? ` · ${filtered.length}` : ""}` : v === "landlords" ? `Landlords${book ? ` · ${landlords.length}` : ""}` : "Map"}
                </button>
              ))}
            </div>
            <span className="hidden h-6 w-px bg-line/80 sm:block" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Address, landlord, tenant or agent…"
              className="min-w-[200px] flex-1 rounded-full border border-line/80 bg-box px-4 py-2 text-[12.5px] outline-none focus:border-accent"
            />
            <Filter label="Service" options={services} value={service} onChange={setService} />
            {everything && <Filter label="Agent" options={agents} value={agent} onChange={setAgent} />}
            <Filter label="Town" options={towns} value={town} onChange={setTown} />
            <button
              type="button"
              disabled={certs.status !== "ready"}
              onClick={() => setLookOnly((v) => !v)}
              className={`${pillClass(lookOnly)} disabled:opacity-40`}
              title={certs.status !== "ready" ? "Available once the certificates have been read" : undefined}
            >
              Needs a look
            </button>
            <Filter label="Sort" options={SORTS} value={sort} onChange={setSort} />
          </div>

          {book && filtering && (
            <p className="mt-2 text-[11.5px] text-muted">
              {filtered.length} of {book.counts.properties} properties · {money(rentRoll)} pcm ·{" "}
              <button type="button" onClick={() => { setQ(""); setService(null); setAgent(null); setTown(null); setLookOnly(false); }} className="underline hover:text-ink">
                clear
              </button>
            </p>
          )}

          {/* ---------------------------------------------- properties -- */}
          {view === "properties" && (
            <div className="mt-4">
              {state.status === "loading" ? (
                <div className="rounded-2xl border border-line/70 bg-panel p-8 text-center"><FindingData label="Reading the managed book" /></div>
              ) : filtered.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line/80 p-6 text-center text-[12.5px] text-muted">Nothing matches. Clear a filter.</p>
              ) : (
                <ul className="overflow-hidden rounded-2xl border border-line/70 bg-panel">
                  {/* Three widths. A phone gets photo, address and rent; a
                      laptop adds service, landlord and certificates; agent and
                      let date wait for a wide screen (xl), because at 1100px
                      they were truncating every landlord to a first name. */}
                  <li className="hidden grid-cols-[56px_minmax(0,2fr)_90px_100px_minmax(0,1.3fr)_120px] items-center gap-3 border-b border-line/70 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted md:grid xl:grid-cols-[56px_minmax(0,2.2fr)_90px_100px_minmax(0,1.4fr)_minmax(0,1fr)_100px_120px]">
                    <span /><span>Property</span><span>Rent</span><span>Service</span><span>Landlord</span><span className="hidden xl:block">{everything ? "Agent" : "Tenant"}</span><span className="hidden xl:block">Let since</span><span>Certificates</span>
                  </li>
                  {filtered.map((p) => {
                    const s = summaryOf(p);
                    return (
                      <li key={p.listingId} className="border-b border-line/40 last:border-0">
                        <button
                          type="button"
                          onClick={() => setOpenId(p.listingId)}
                          className="grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-box md:grid-cols-[56px_minmax(0,2fr)_90px_100px_minmax(0,1.3fr)_120px] xl:grid-cols-[56px_minmax(0,2.2fr)_90px_100px_minmax(0,1.4fr)_minmax(0,1fr)_100px_120px]"
                        >
                          <PropertyPhoto src={p.image} alt="" className="h-11 w-14 rounded-lg object-cover" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px]">{p.name}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {p.locality}
                              <span className="md:hidden">{p.landlord ? ` · ${p.landlord.name}` : ""}</span>
                            </span>
                          </span>
                          <span className="figures text-[13px] md:text-[13px]">
                            {money(p.rentMonthly)}<span className="text-[10.5px] text-muted"> pcm</span>
                          </span>
                          <span className="hidden md:block">
                            {p.service ? <Pill tone={p.service === "Managed" ? "good" : "neutral"}>{p.service}</Pill> : <span className="text-[11px] text-muted">Not set</span>}
                          </span>
                          <span className="hidden min-w-0 truncate text-[12px] md:block">
                            {p.landlord ? p.landlord.name : <span className="text-muted">Not on record</span>}
                          </span>
                          <span className="hidden min-w-0 truncate text-[12px] text-muted xl:block">
                            {everything ? (p.agent?.name ?? "—") : (p.tenants[0]?.name ?? "—")}
                          </span>
                          <span className="hidden text-[12px] text-muted xl:block">{day(p.letSince)}</span>
                          <span className="hidden md:block">
                            {s ? (
                              <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                            ) : certs.status === "ready" ? (
                              <span className="text-[11px] text-muted">No property record</span>
                            ) : (
                              <span className="text-[11px] text-muted">Checking…</span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ----------------------------------------------- landlords -- */}
          {view === "landlords" && (
            <div className="mt-4">
              {state.status === "loading" ? (
                <div className="rounded-2xl border border-line/70 bg-panel p-8 text-center"><FindingData label="Reading the managed book" /></div>
              ) : landlords.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line/80 p-6 text-center text-[12.5px] text-muted">No landlord matches.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {landlords.map((l) => {
                    const mine = l.listingIds.map((id) => byId.get(id)).filter((p): p is ManagedProperty => !!p);
                    const flagged = mine.filter((p) => attention.has(p.listingId)).length;
                    const isOpen = expanded.has(l.contactId);
                    return (
                      <li key={l.contactId} className="fade-up rounded-2xl border border-line/70 bg-panel p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[14px]">{l.name}</p>
                            <p className="mt-0.5 flex flex-wrap gap-x-3 text-[11.5px] text-muted">
                              {l.phone && <a href={`tel:${l.phone.replace(/\s+/g, "")}`} className="hover:text-ink">{l.phone}</a>}
                              {l.email && <a href={`mailto:${l.email}`} className="truncate hover:text-ink">{l.email}</a>}
                              {!l.phone && !l.email && <span>No contact details in REX</span>}
                            </p>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="figures text-[15px]">{money(l.rentRoll)}<span className="text-[10.5px] text-muted"> pcm</span></p>
                            <p className="text-[11px] text-muted">
                              {l.listingIds.length} {l.listingIds.length === 1 ? "property" : "properties"}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                          {Object.entries(l.services).map(([s, n]) => (
                            <Pill key={s} tone={s === "Managed" ? "good" : "neutral"}>{s} {n}</Pill>
                          ))}
                          {flagged > 0 && <Pill tone="accent">{flagged} needs a look</Pill>}
                          <button
                            type="button"
                            onClick={() => setExpanded((e) => { const n = new Set(e); if (n.has(l.contactId)) n.delete(l.contactId); else n.add(l.contactId); return n; })}
                            className="ml-auto text-[11.5px] text-muted underline hover:text-ink"
                          >
                            {isOpen ? "Hide properties" : "Show properties"}
                          </button>
                        </div>
                        {isOpen && (
                          <ul className="mt-3 divide-y divide-line/40 rounded-xl border border-line/60 bg-box">
                            {mine.map((p) => {
                              const s = summaryOf(p);
                              return (
                                <li key={p.listingId}>
                                  <button type="button" onClick={() => setOpenId(p.listingId)} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel">
                                    <PropertyPhoto src={p.image} alt="" className="h-9 w-12 rounded-md object-cover" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[12.5px]">{p.name}</span>
                                      <span className="block truncate text-[11px] text-muted">{p.locality}{p.service ? ` · ${p.service}` : ""}</span>
                                    </span>
                                    <span className="figures text-[12.5px]">{money(p.rentMonthly)}</span>
                                    {s && needsLook(s) && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.tone}`}>{s.label}</span>}
                                  </button>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {/* ----------------------------------------------------- map -- */}
          {view === "map" && (
            <div className="mt-4 h-[calc(100vh-380px)] min-h-[420px]">
              {state.status === "loading" ? (
                <div className="flex h-full items-center justify-center rounded-2xl border border-line/70 bg-panel"><FindingData label="Reading the managed book" /></div>
              ) : (
                <PortfolioMap properties={filtered} attention={attention} onOpen={setOpenId} />
              )}
            </div>
          )}
        </>
      )}

      {open && (
        <PropertyPanel
          property={open}
          cert={certBy && open.propertyId ? certBy.get(open.propertyId) : undefined}
          certsState={certs.status}
          everything={everything}
          onClose={close}
          onStep={step}
        />
      )}
    </>
  );
}
