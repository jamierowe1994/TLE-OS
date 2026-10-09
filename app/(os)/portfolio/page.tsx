"use client";

import { asOf } from "@/lib/as-of";
import { currentLets } from "@/lib/current-lets";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rememberOrder } from "@/lib/portfolio-order";
import DoodleIcon from "@/components/DoodleIcon";
import StatTile from "@/components/StatTile";
import PageHeader from "@/components/PageHeader";
import PropertyPhoto from "@/components/PropertyPhoto";
import PortfolioMap from "@/components/PortfolioMap";
import FindingData from "@/components/business/FindingData";
import PropertyAnswers from "@/components/PropertyAnswers";
import { Pill } from "@/components/Wire";
import { housesIn, houseByListing, MANAGED_READERS as R, type House } from "@/lib/houses";
import { headlineCerts, isOurs, statusOf, type CertStatus, type CompProperty } from "@/lib/compliance";
import type { ManagedBook, ManagedLandlord, ManagedProperty } from "@/lib/portfolio-types";
import PickOne from "@/components/PickOne";
import PastTenancies from "@/components/portfolio/PastTenancies";
import Segmented from "@/components/Segmented";

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
  | { status: "ready"; book: ManagedBook; scope: string; everything: boolean; stale: boolean; ageMs?: number }
  | { status: "failed"; error: string; unlinked?: boolean };

type CertsState =
  | { status: "checking"; tries: number }
  | { status: "ready"; by: Map<string, CompProperty>; stale: boolean; ageMs?: number }
  | { status: "slow" }
  | { status: "failed"; error: string };

type View = "properties" | "landlords" | "map" | "past";

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

/* "31 Oct", for a leaving day in a pill. */
const shortDay = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
};

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

/* White with a hairline, like the rest of the OS since 11 Sep 2026; the one
   that asks for a hand (certificates to renew) goes pink. */
/* Lifted into components/StatTile (4 Oct 2026) so the other Portfolio pages
   draw exactly this tile too. */
const StatCard = StatTile;

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
  /* Homes REX CRM has no property for: the OS holds them from REX PM (6 Sep 2026). */
  const [notOnRexOnly, setNotOnRexOnly] = useState(false);
  /* Homes whose tenants have given notice (lib/portfolio-notice). */
  const [reletOnly, setReletOnly] = useState(false);
  const [sort, setSort] = useState<string | null>(null);
  const router = useRouter();
  /* ?open=<listing id> from the search bar: straight to the home's own page. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get("open");
    if (!wanted) return;
    /* A notice from the bell (&notice=) opens on the Tenancy section. */
    const notice = new URLSearchParams(window.location.search).get("notice");
    router.replace(`/portfolio/${encodeURIComponent(wanted)}${notice ? `?tab=tenancy&notice=${encodeURIComponent(notice)}` : ""}`);
  }, [router]);
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
            ageMs: typeof j.ageMs === "number" ? j.ageMs : undefined,
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
            setCerts({ status: "ready", by: new Map((j.properties as CompProperty[]).map((p) => [p.id, p])), stale: Boolean(j.stale), ageMs: typeof j.ageMs === "number" ? j.ageMs : undefined });
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
  /* Shared houses: one row in the list, rooms as tabs in the drawer. */
  const houses = useMemo(() => housesIn(book?.properties ?? [], R), [book]);
  const houseOf = useMemo(() => houseByListing(houses, R), [houses]);

  const summaryOf = useCallback(
    (p: ManagedProperty) => (certBy && p.propertyId ? summarise(certBy.get(p.propertyId)) : null),
    [certBy]
  );

  /* Only the homes we are answerable for (James, 18 Sep 2026). The book
     here is every REX listing ever let - let-only homes, homes REX PM no
     longer manages, the books of agents who have left - and counting their
     certificates put 116 on this card when Compliance, asking the same
     question, said 75. isOurs() is the one scope both screens use. */
  const oursHome = useCallback(
    (p: ManagedProperty) => {
      const cp = certBy && p.propertyId ? certBy.get(p.propertyId) : undefined;
      return Boolean(cp && isOurs(cp));
    },
    [certBy]
  );

  const attention = useMemo(() => {
    const s = new Set<string>();
    if (!book || !certBy) return s;
    for (const p of book.properties) if (oursHome(p) && needsLook(summaryOf(p))) s.add(p.listingId);
    return s;
  }, [book, certBy, summaryOf, oursHome]);

  /* The certificate position across the book, split three ways - counted
     per HOME, not per listing: a house let by the room is several listings
     on one property, and its one gas certificate was being counted once a
     room. */
  const certTally = useMemo(() => {
    const t = { expired: 0, urgent: 0, missing: 0, toRenew: 0 };
    if (!book || !certBy) return t;
    const seen = new Set<string>();
    for (const p of book.properties) {
      if (!p.propertyId || seen.has(p.propertyId) || !oursHome(p)) continue;
      seen.add(p.propertyId);
      const w = summaryOf(p)?.worst;
      if (w === "expired") t.expired++;
      else if (w === "urgent") t.urgent++;
      else if (w === "missing") t.missing++;
    }
    t.toRenew = t.expired + t.urgent;
    return t;
  }, [book, certBy, summaryOf, oursHome]);

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
      if (notOnRexOnly && p.onRex !== false && p.rexLet !== false) return false;
      if (reletOnly && !p.notice) return false;
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
    /* A tester's own test home sits at the top, whatever the order. */
    return [...rows.filter((p) => p.test), ...rows.filter((p) => !p.test)];
  }, [book, q, service, agent, town, lookOnly, notOnRexOnly, reletOnly, sort, attention, certBy, summaryOf]);

  const filtering = Boolean(q.trim() || service || agent || town || lookOnly || notOnRexOnly || reletOnly);
  const relets = useMemo(() => (book ? currentLets(book.properties).filter((p) => p.notice).length : 0), [book]);

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


  /* Counted and added up on each home's latest let only (lib/current-lets);
     the list itself still shows every let. */
  const filteredHomes = useMemo(() => currentLets(filtered.filter((p) => !p.test)), [filtered]);
  const rentRoll = useMemo(() => filteredHomes.reduce((a, p) => a + (p.rentMonthly ?? 0), 0), [filteredHomes]);
  /* The list: a shared house once, in place of its first room. */
  const listRows = useMemo(() => {
    const seen = new Set<string>();
    const out: Array<{ p: ManagedProperty; house: House | null }> = [];
    for (const p of filtered) {
      const h = houseOf.get(String(p.listingId));
      if (!h) { out.push({ p, house: null }); continue; }
      if (seen.has(h.key)) continue;
      seen.add(h.key);
      out.push({ p: h.house ?? h.rooms[0], house: h });
    }
    return out;
  }, [filtered, houseOf]);

  /* Keyed as text: listing ids arrive as strings from links and the search bar. */
  const byId = useMemo(() => new Map((book?.properties ?? []).map((p) => [String(p.listingId), p])), [book]);
  /* The home opens on its own page (James, 7 Oct 2026). The list's order goes
     with it, so ‹ › there steps through what was on screen here. */
  const remember = useCallback(() => rememberOrder(listRows.map((r) => String(r.p.listingId))), [listRows]);
  const openHome = useCallback(
    (id: string) => {
      remember();
      router.push(`/portfolio/${encodeURIComponent(id)}`);
    },
    [remember, router]
  );

  const blurb =
    state.status === "loading" ? "Fetching the managed book from REX…"
    : state.status === "failed" ? state.error
    : `Live from REX — ${state.book.counts.homes ?? state.book.counts.properties} properties under management across ${state.book.counts.towns} towns, for ${state.book.counts.landlords} landlords${state.everything ? "" : ` (${state.scope}'s book)`}.${state.ageMs != null ? ` Figures ${asOf(state.ageMs).text}.` : state.stale ? " Refreshing behind." : ""}`;

  const certsHint =
    certs.status === "checking" ? <FindingData label="Checking REX" />
    : certs.status === "slow" ? "REX is still reading them. Refresh in a few minutes."
    : certs.status === "failed" ? <span className="text-accent-dark">{certs.error}</span>
    : `Homes we manage: ${certTally.expired} expired · ${certTally.urgent} due in 30 days · ${certTally.missing} with no current record${certs.ageMs != null ? ` · certificates ${asOf(certs.ageMs).text}` : certs.stale ? " · refreshing" : ""}`;

  const pillClass = (on: boolean) =>
    `rounded-full border px-3.5 py-2 text-[12px] transition-colors ${on ? "border-accent-dark bg-accent-soft text-accent-dark" : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"}`;

  return (
    <>
      <PageHeader
        title="Properties"
        blurb={blurb}
        /* A street, so it is short and wide rather than tall - 3.11 against
           the roughly 1.2 of the scene pages. Sized by WIDTH rather than the
           shared 250 height: at 250 it would run 777px across and squeeze the
           blurb into a column. 200 puts it at 622, which leaves the text its
           full measure.

           Pushed down 4% so the pavement runs into the line and is erased by
           it, the same as the other scenes. */
        illustration="/illustrations/street.webp"
        /* Pinned to the corner and a little smaller (1 Oct 2026). `seat`
           (which sinks the pavement into the line) also gives a seated
           figure's 166px inset - room for dangling feet to clear the search
           row's button - and the header reserved that as well as the street.
           With the sidebar open on a laptop that left the blurb a 60px
           column, one word a line. A street has no feet and this row has no
           button, so it sits in the corner, and at 180 tall it leaves the
           blurb room on a 1280 screen as well as a big one. */
        illustrationHeight={180}
        flushRight
        illustrationAspect={3.11}
        seat={0.96}
        illustrationCrop
        /* The bar under the header IS the book's filter - one search per
           page (James, 6 Sep 2026), not a global bar above and a second box
           in the pill row. */
        searchValue={q}
        onSearch={setQ}
        searchPlaceholder="Address, landlord, tenant or agent…"
      />

      {state.status === "failed" ? (
        <div className="fade-up mt-8 rounded-[22px] border border-dashed border-accent-dark/50 bg-white p-6">
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
              icon="home"
              label="Properties"
              /* Counted the way the old system counts its managed homes (2 Oct
                 2026): every room let on its own is a home. The list below
                 keeps rooms under their house, so it can run shorter. */
              value={book ? (book.counts.homes ?? book.counts.properties).toLocaleString("en-GB") : <FindingData label="" />}
              hint={book && (book.counts.homes != null
                ? `${(book.counts.homesOccupied ?? 0).toLocaleString("en-GB")} occupied · ${book.counts.homesVacant ?? 0} vacant · ${book.counts.upcomingVacancies ?? 0} becoming vacant. Rooms let separately count as homes; below they sit under their house.`
                : Object.entries(book.counts.byService).sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s} ${n}`).join(" · "))}
            />
            <StatCard
              icon="coin"
              label="Rent roll"
              value={book ? <>{money(book.counts.rentRoll)}<span className="text-[13px] text-muted"> pcm</span></> : <FindingData label="" />}
              hint={book && `${money(book.counts.managedRentRoll)} on homes we manage or collect rent for. REX's agreed rent on each home's current let${book.counts.rentsFromPayProp ? `, or PayProp's where REX has none (${book.counts.rentsFromPayProp} homes)` : ""}. Average ${money(book.counts.avgRent)} pcm.`}
            />
            <StatCard
              icon="user"
              label="Landlords"
              value={book ? book.counts.landlords.toLocaleString("en-GB") : <FindingData label="" />}
              hint={book && (book.counts.withoutLandlord ? `${book.counts.withoutLandlord} properties have no landlord on the REX record.` : "Every property has a landlord on record.")}
            />
            <StatCard
              icon="shield"
              tone={certs.status === "ready" && certTally.toRenew > 0 ? "pink" : undefined}
              label="Certificates to renew"
              value={certs.status === "ready" ? certTally.toRenew.toLocaleString("en-GB") : <span className="text-[18px] text-muted">…</span>}
              hint={book ? certsHint : undefined}
            />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-2">
            <Segmented
              value={view}
              onChange={setView}
              options={[
                { id: "properties" as const, label: book ? `Properties · ${filteredHomes.length}` : "Properties", icon: <DoodleIcon name="list" size={14} /> },
                { id: "landlords" as const, label: book ? `Landlords · ${landlords.length}` : "Landlords", icon: <DoodleIcon name="user" size={14} /> },
                { id: "map" as const, label: "Map", icon: <DoodleIcon name="target" size={14} /> },
                { id: "past" as const, label: "Archive", icon: <DoodleIcon name="clock" size={14} /> },
              ]}
            />
            <span className="hidden h-6 w-px bg-line/80 sm:block" />
            <PickOne label="Service" options={services} value={service} onChange={setService} />
            {everything && <PickOne label="Agent" options={agents} value={agent} onChange={setAgent} />}
            <PickOne label="Town" options={towns} value={town} onChange={setTown} />
            <button
              type="button"
              disabled={certs.status !== "ready"}
              onClick={() => setLookOnly((v) => !v)}
              className={`${pillClass(lookOnly)} disabled:opacity-40`}
              title={certs.status !== "ready" ? "Available once the certificates have been read" : undefined}
            >
              Needs a look
            </button>
            <button type="button" onClick={() => setNotOnRexOnly((v) => !v)} className={pillClass(notOnRexOnly)} title="Homes REX PM manages that REX either has no property for, or does not mark as let">
              Not on REX
            </button>
            <button type="button" onClick={() => setReletOnly((v) => !v)} className={pillClass(reletOnly)} title="Tenants have given notice: the home stays here until they move out">
              Relet{relets ? ` · ${relets}` : ""}
            </button>
            <PickOne label="Sort" options={SORTS} value={sort} onChange={setSort} />
          </div>

          {book && filtering && (
            <p className="mt-2 text-[11.5px] text-muted">
              {filteredHomes.length} of {book.counts.properties} properties · {money(rentRoll)} pcm ·{" "}
              <button type="button" onClick={() => { setQ(""); setService(null); setAgent(null); setTown(null); setLookOnly(false); setNotOnRexOnly(false); setReletOnly(false); }} className="underline hover:text-ink">
                clear
              </button>
            </p>
          )}

          {/* ---------------------------------------------- properties -- */}
          {view === "properties" && (
            <div className="mt-4">
              {state.status === "loading" ? (
                <div className="rounded-2xl border border-line/70 bg-card p-8 text-center"><FindingData label="Reading the managed book" /></div>
              ) : filtered.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line/80 p-6 text-center text-[12.5px] text-muted">Nothing matches. Clear a filter.</p>
              ) : (
                <ul className="overflow-hidden rounded-2xl border border-line/70 bg-card">
                  {/* Three widths. A phone gets photo, address and rent; a
                      laptop adds service, landlord and certificates; agent and
                      let date wait for a wide screen (xl), because at 1100px
                      they were truncating every landlord to a first name. */}
                  <li className="hidden grid-cols-[56px_minmax(0,2fr)_90px_100px_minmax(0,1.3fr)_120px] items-center gap-3 border-b border-line/70 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-wide text-muted md:grid xl:grid-cols-[56px_minmax(0,2.2fr)_90px_100px_minmax(0,1.4fr)_minmax(0,1fr)_100px_120px]">
                    <span /><span>Property</span><span>Rent</span><span>Service</span><span>Landlord</span><span className="hidden xl:block">{everything ? "Agent" : "Tenant"}</span><span className="hidden xl:block">Let since</span><span>Certificates</span>
                  </li>
                  {listRows.map(({ p, house }) => {
                    const s = summaryOf(p);
                    const letRooms = house ? house.rooms.filter((r) => r.tenants.length > 0).length : 0;
                    const rent = house && house.kind === "rooms" ? house.rooms.reduce((a, r) => a + (r.rentMonthly ?? 0), 0) : p.rentMonthly;
                    const landlord = house ? house.house?.landlord ?? house.rooms.find((r) => r.landlord)?.landlord ?? null : p.landlord;
                    const notice = house ? house.rooms.find((r) => r.notice)?.notice ?? null : p.notice ?? null;
                    return (
                      <li key={house ? house.key : p.listingId} className="border-b border-line/40 last:border-0">
                        <Link
                          href={`/portfolio/${encodeURIComponent(p.listingId)}`}
                          onClick={remember}
                          className="grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-panel md:grid-cols-[56px_minmax(0,2fr)_90px_100px_minmax(0,1.3fr)_120px] xl:grid-cols-[56px_minmax(0,2.2fr)_90px_100px_minmax(0,1.4fr)_minmax(0,1fr)_100px_120px]"
                        >
                          <PropertyPhoto src={p.image ?? house?.rooms.find((r) => r.image)?.image ?? null} alt="" className="h-11 w-14 rounded-lg object-cover" />
                          <span className="min-w-0">
                            <span className="block truncate text-[13px]">{house ? house.name : p.name}{p.test && <span className="ml-1.5 text-[11px] font-semibold text-accent-dark md:hidden">Test</span>}</span>
                            <span className="block truncate text-[11px] text-muted">
                              {house ? `${house.locality} · ${house.kind === "lets" ? `${house.rooms.length} lets on record` : `${house.rooms.length} rooms, ${letRooms} let`}` : p.locality}
                              {notice && <span className="font-semibold text-accent-dark md:hidden"> · Relet{notice.leavingOn ? ` ${shortDay(notice.leavingOn)}` : ""}</span>}
                              <span className="md:hidden">{landlord ? ` · ${landlord.name}` : ""}</span>
                            </span>
                          </span>
                          <span className="figures text-[13px] md:text-[13px]">
                            {money(rent)}<span className="text-[10.5px] text-muted"> pcm</span>
                          </span>
                          <span className="hidden md:block">
                            {p.service ? <Pill tone={p.service === "Managed" ? "good" : "neutral"}>{p.service}</Pill> : <span className="text-[11px] text-muted">Not set</span>}
                            {p.test ? <Pill tone="accent">Test</Pill> : p.onRex === false && <Pill tone="accent">Not on REX</Pill>}
                            {p.onRex !== false && p.rexLet === false && !p.held && <Pill tone="neutral">Not let in REX</Pill>}
                            {notice && <Pill tone="accent">Relet{notice.leavingOn ? ` · ${shortDay(notice.leavingOn)}` : ""}</Pill>}
                          </span>
                          <span className="hidden min-w-0 truncate text-[12px] md:block">
                            {landlord ? landlord.name : <span className="text-muted">Not on record</span>}
                          </span>
                          <span className="hidden min-w-0 truncate text-[12px] text-muted xl:block">
                            {house ? `${new Set(house.rooms.flatMap((r) => r.tenants.map((t) => t.contactId))).size} tenants` : everything ? (p.agent?.name ?? "—") : (p.tenants[0]?.name ?? "—")}
                          </span>
                          <span className="hidden text-[12px] text-muted xl:block">{house ? "—" : day(p.letSince)}</span>
                          <span className="hidden md:block">
                            {s ? (
                              <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${s.tone}`}>{s.label}</span>
                            ) : certs.status === "ready" ? (
                              <span className="text-[11px] text-muted">No property record</span>
                            ) : (
                              <span className="text-[11px] text-muted">Checking…</span>
                            )}
                          </span>
                        </Link>
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
                <div className="rounded-2xl border border-line/70 bg-card p-8 text-center"><FindingData label="Reading the managed book" /></div>
              ) : landlords.length === 0 ? (
                <p className="rounded-2xl border border-dashed border-line/80 p-6 text-center text-[12.5px] text-muted">No landlord matches.</p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {landlords.map((l) => {
                    const mine = l.listingIds.map((id) => byId.get(id)).filter((p): p is ManagedProperty => !!p);
                    const flagged = mine.filter((p) => attention.has(p.listingId)).length;
                    const isOpen = expanded.has(l.contactId);
                    return (
                      <li key={l.contactId} className="fade-up rounded-2xl border border-line/70 bg-card p-4">
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
                          <ul className="mt-3 divide-y divide-line/40 rounded-xl border border-line/60 bg-card">
                            {mine.map((p) => {
                              const s = summaryOf(p);
                              return (
                                <li key={p.listingId}>
                                  <Link href={`/portfolio/${encodeURIComponent(p.listingId)}`} onClick={remember} className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-panel">
                                    <PropertyPhoto src={p.image} alt="" className="h-9 w-12 rounded-md object-cover" />
                                    <span className="min-w-0 flex-1">
                                      <span className="block truncate text-[12.5px]">{p.name}</span>
                                      <span className="block truncate text-[11px] text-muted">{p.locality}{p.service ? ` · ${p.service}` : ""}</span>
                                    </span>
                                    <span className="figures text-[12.5px]">{money(p.rentMonthly)}</span>
                                    {s && needsLook(s) && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${s.tone}`}>{s.label}</span>}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                        {/* WHAT THIS LANDLORD TOLD US, across every home of
                            theirs at once. On their file rather than only on
                            each property because the useful questions here are
                            about the person - how to reach them, how far we can
                            go on a repair without ringing - and those are the
                            same answer on all of their properties. */}
                        {isOpen && (
                          <div className="mt-3">
                            <PropertyAnswers
                              propertyIds={mine.map((p) => p.propertyId).filter((x): x is string => Boolean(x))}
                              title={`What ${l.name.split(" ")[0]} told us`}
                              showAddress={mine.length > 1}
                            />
                          </div>
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
                <div className="flex h-full items-center justify-center rounded-2xl border border-line/70 bg-card"><FindingData label="Reading the managed book" /></div>
              ) : (
                <PortfolioMap properties={filtered} attention={attention} onOpen={openHome} />
              )}
            </div>
          )}

          {/* ------------------------------------ the archive: past tenancies -- */}
          {view === "past" && (
            <div className="mt-4">
              <PastTenancies search={q} />
            </div>
          )}
        </>
      )}

    </>
  );
}
