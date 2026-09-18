"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PropertyPhoto from "@/components/PropertyPhoto";
import HomesMap from "@/components/tenant/HomesMap";
import { fits, milesBetween, type HomeFilter, type MarketHome } from "@/lib/market-homes";

/**
 * FIND A HOME - every home on the market, inside the tenant's own area
 * (James, 18 Sep 2026). Search from their house by radius, then bedrooms,
 * rent and type; open any home for its photos and to enquire; and ask to be
 * told when new ones come on, with a tick that says they are happy to get
 * the emails.
 *
 * The filtering happens here, over the whole book the page was handed, with
 * the same `fits` the alert matching uses on the server.
 */

export type Origin = { lat: number; lng: number; label: string };
export type SavedAlert = { place: string | null; radiusMiles: number | null; minBeds: number | null; maxRent: number | null; type: "house" | "flat" | null } | null;

const card = "rounded-[22px] border border-line/60 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const RADII = [1, 3, 5, 10, 20] as const;
const BEDS = [1, 2, 3, 4] as const;
const RENTS = [600, 800, 1000, 1250, 1500, 2000] as const;
const DAY = 24 * 3600 * 1000;

export const rentWords = (h: Pick<MarketHome, "rent" | "rentPeriod">) =>
  `£${Math.round(h.rent).toLocaleString("en-GB")} ${h.rentPeriod === "week" ? "a week" : "a month"}`;
export const milesWords = (m: number) => (m < 0.2 ? "Right nearby" : `${m < 10 ? m.toFixed(1) : Math.round(m)} miles away`);
const pounds = (n: number) => `£${n.toLocaleString("en-GB")}`;

export default function HomesBrowser({
  homes,
  error,
  home,
  base,
  q = "",
  sample = false,
  alert,
  askedAbout,
}: {
  homes: MarketHome[] | null;
  error: string | null;
  /** Their house, from the passport, when it could be placed. */
  home: Origin | null;
  base: string;
  q?: string;
  sample?: boolean;
  alert: SavedAlert;
  askedAbout: string | null;
}) {
  const [from, setFrom] = useState<Origin | null>(home);
  /* The first radius: the tightest that still shows a handful of homes, so
     nobody opens the page onto "nothing near you" when there is plenty a
     little further out. */
  const [radius, setRadius] = useState<number | null>(() => {
    if (!home || !homes) return null;
    const dist = homes.filter((h) => h.lat != null && h.lng != null).map((h) => milesBetween(home, { lat: h.lat!, lng: h.lng! }));
    return RADII.find((r) => dist.filter((m) => m <= r).length >= 6) ?? null;
  });
  const [minBeds, setMinBeds] = useState<number | null>(null);
  const [maxRent, setMaxRent] = useState<number | null>(null);
  const [type, setType] = useState<"house" | "flat" | null>(null);
  const [sort, setSort] = useState<"near" | "new" | "cheap">(home ? "near" : "new");
  /* A phone shows one or the other; from a laptop up, both side by side. */
  const [view, setView] = useState<"list" | "map">("list");
  const [hovered, setHovered] = useState<string | null>(null);

  const filter: HomeFilter = { lat: from?.lat ?? null, lng: from?.lng ?? null, radiusMiles: radius, minBeds, maxRent, type };
  const shown = useMemo(() => {
    const list = (homes ?? [])
      .filter((h) => fits(h, filter))
      .map((h) => ({ h, miles: from && h.lat != null && h.lng != null ? milesBetween(from, { lat: h.lat, lng: h.lng }) : null }));
    if (sort === "near" && from) list.sort((a, b) => (a.miles ?? 1e9) - (b.miles ?? 1e9));
    else if (sort === "cheap") list.sort((a, b) => a.h.rentPcm - b.h.rentPcm);
    else list.sort((a, b) => (b.h.publishedAt ?? "").localeCompare(a.h.publishedAt ?? ""));
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [homes, from, radius, minBeds, maxRent, type, sort]);

  const nextRadius = radius ? RADII.find((r) => r > radius) ?? null : null;

  return (
    <div className="space-y-6">
      <div className="pt-2">
        <p className={eyebrow}>Find a home</p>
        <h1 className="mt-2 text-[44px] leading-[1.05]">Homes to Rent</h1>
        <p className="mt-3 max-w-xl text-[14.5px] text-muted">
          {homes ? `Every home we have on the market, ${homes.length} right now. ` : ""}
          {home ? "Search out from your house, or from anywhere else." : "Search by area, bedrooms and rent."}
        </p>
      </div>

      {/* ── the search ── */}
      <div className={`${card} space-y-5 p-5 sm:p-6`}>
        <Where from={from} home={home} sample={sample} onPlace={(o) => { setFrom(o); if (o && !radius) setRadius(10); if (o) setSort("near"); }} />
        <div className="flex flex-wrap items-end gap-x-10 gap-y-5">
          <Row label="Within">
            {RADII.map((r) => (
              <Chip key={r} on={radius === r} disabled={!from} onClick={() => setRadius(r)}>{r} {r === 1 ? "mile" : "miles"}</Chip>
            ))}
            <Chip on={radius === null} onClick={() => setRadius(null)}>Any distance</Chip>
          </Row>
          <Row label="Bedrooms">
            <Chip on={minBeds === null} onClick={() => setMinBeds(null)}>Any</Chip>
            {BEDS.map((b) => (
              <Chip key={b} on={minBeds === b} onClick={() => setMinBeds(b)}>{b}+</Chip>
            ))}
          </Row>
          <div className="grid w-full grid-cols-3 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end sm:gap-x-5 sm:gap-y-4">
            <Pick label="Rent up to" value={maxRent ?? ""} onChange={(v) => setMaxRent(v ? Number(v) : null)}>
              <option value="">Any rent</option>
              {RENTS.map((r) => <option key={r} value={r}>{pounds(r)} a month</option>)}
            </Pick>
            <Pick label="Type" value={type ?? ""} onChange={(v) => setType(v === "house" || v === "flat" ? v : null)}>
              <option value="">All types</option>
              <option value="house">Houses</option>
              <option value="flat">Flats</option>
            </Pick>
            <Pick label="Sort" value={sort} onChange={(v) => setSort(v === "near" || v === "cheap" ? v : "new")}>
              {from && <option value="near">Nearest</option>}
              <option value="new">Newest</option>
              <option value="cheap">Lowest rent</option>
            </Pick>
          </div>
        </div>
      </div>

      {/* List or map, on a phone. */}
      <div className="flex gap-2 lg:hidden">
        {(["list", "map"] as const).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => setView(v)}
            className={`flex flex-1 items-center justify-center gap-2 rounded-full border py-2.5 text-[13px] font-semibold ${view === v ? "border-accent-dark bg-accent-dark text-white" : "border-line/80 bg-white"}`}
          >
            <DoodleIcon name={v === "list" ? "list" : "target"} size={14} className={view === v ? "invert" : ""} />
            {v === "list" ? "List" : "Map"}
          </button>
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        {/* ── the homes ── */}
        <section className={`space-y-5 ${view === "map" ? "hidden lg:block" : ""}`}>
          <Alerts filter={filter} place={from ? (from === home ? "your home" : from.label) : null} saved={alert} sample={sample} />
          {error ? (
            <div className={`${card} flex items-start gap-4 p-6`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-panel text-muted"><DoodleIcon name="info" size={17} /></span>
              <div>
                <p className="text-[15px] font-semibold">{error}</p>
                <p className="mt-1 text-[13px] text-muted">Try again in a minute. If it keeps happening, message your agent and they will send you what is on.</p>
              </div>
            </div>
          ) : (
            <div>
              <p className="px-1 text-[13.5px] text-muted">
                <span className="font-semibold text-ink">{shown.length} {shown.length === 1 ? "home" : "homes"}</span>
                {radius && from ? ` within ${radius} ${radius === 1 ? "mile" : "miles"} of ${from === home ? "your home" : from.label}` : ""}
              </p>
              {shown.length ? (
                <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                  {shown.map(({ h, miles }) => (
                    <div key={h.id} onMouseEnter={() => setHovered(h.id)} onMouseLeave={() => setHovered(null)}>
                      <HomeCard h={h} miles={miles} href={`${base}/homes/${h.id}${q}`} asked={askedAbout === h.id} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className={`${card} mt-4 p-8 text-center`}>
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name="search" size={20} /></span>
                  <p className="mt-4 text-[17px] font-semibold">Nothing that fits right now</p>
                  <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">New homes come on every week. Widen the search, or turn on alerts and we will email you when one fits.</p>
                  {nextRadius && (
                    <button type="button" onClick={() => setRadius(nextRadius)} className="mt-5 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white">
                      Widen to {nextRadius} miles
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        {/* ── the map ── */}
        <aside className={`h-[70vh] lg:sticky lg:top-6 lg:block lg:h-[calc(100vh-3rem)] ${view === "list" ? "hidden" : ""}`}>
          <HomesMap
            homes={shown.map((x) => x.h)}
            centre={from ? { lat: from.lat, lng: from.lng } : null}
            centreIsHome={Boolean(home) && from === home}
            radiusMiles={from ? radius : null}
            hovered={hovered}
            hrefFor={(id) => `${base}/homes/${id}${q}`}
            onSearchHere={(at) => {
              setFrom({ ...at, label: "the area on the map" });
              if (!radius) setRadius(3);
              setSort("near");
            }}
          />
        </aside>
      </div>
    </div>
  );
}

/* ── Where they search from ─────────────────────────────────────────────── */

function Where({ from, home, sample, onPlace }: { from: Origin | null; home: Origin | null; sample: boolean; onPlace: (o: Origin | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function look(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    if (sample) return setErr("In the sample, distances are from Sophie's home.");
    setBusy(true);
    setErr("");
    const r = await fetch(`/api/tenant/homes/place?q=${encodeURIComponent(text.trim())}`).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "We couldn't find that place. Try a postcode.");
    onPlace(r.at as Origin);
    setEditing(false);
    setText("");
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark"><DoodleIcon name="target" size={19} /></span>
      <div className="min-w-0">
        <p className={eyebrow}>Searching from</p>
        <p className="text-[17px] font-semibold leading-tight">
          {from ? (from === home ? <>Your home <span className="font-normal text-muted">· {from.label}</span></> : from.label) : "Everywhere we let"}
        </p>
      </div>
      {editing ? (
        <form onSubmit={look} className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
          <input
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A postcode or town"
            className="min-w-0 flex-1 rounded-full border border-line/80 bg-white px-4 py-2 text-[13.5px] outline-none focus:border-accent-dark sm:w-56 sm:flex-none"
          />
          <button type="submit" disabled={busy} className="rounded-full bg-accent-dark px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">
            {busy ? "Finding…" : "Search here"}
          </button>
          <button type="button" onClick={() => { setEditing(false); setErr(""); }} className="px-2 text-[13px] text-muted hover:text-ink">Cancel</button>
          {err && <p className="w-full text-[12.5px] text-[#9d4340]">{err}</p>}
        </form>
      ) : (
        <div className="flex flex-wrap gap-2 sm:ml-auto">
          {home && from !== home && (
            <button type="button" onClick={() => onPlace(home)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink">
              Back to my home
            </button>
          )}
          <button type="button" onClick={() => setEditing(true)} className="rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink">
            Search somewhere else
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="w-full min-w-0 sm:w-auto">
      <p className={`${eyebrow} mb-2`}>{label}</p>
      {/* One scrolling line on a phone; wrapped rows from a tablet up. */}
      <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">{children}</div>
    </div>
  );
}

function Chip({ on, disabled = false, onClick, children }: { on: boolean; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-[12.5px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        on ? "border-accent-dark bg-accent-dark font-semibold text-white" : "border-line/80 hover:border-ink"
      }`}
    >
      {children}
    </button>
  );
}

function Pick({ label, value, onChange, children }: { label: string; value: string | number; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className={`${eyebrow} mb-2 block truncate`}>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12.5px] outline-none focus:border-accent-dark sm:w-auto sm:px-4">
        {children}
      </select>
    </label>
  );
}

/* ── One home ───────────────────────────────────────────────────────────── */

function HomeCard({ h, miles, href, asked }: { h: MarketHome; miles: number | null; href: string; asked: boolean }) {
  const fresh = h.publishedAt ? Date.now() - new Date(h.publishedAt).getTime() < 7 * DAY : false;
  return (
    <Link href={href} className={`${card} group block overflow-hidden p-3 transition-colors hover:border-ink/40`}>
      <div className="relative">
        <PropertyPhoto src={h.photo} alt="" className="h-[190px] w-full rounded-[14px] transition-transform duration-500 group-hover:scale-[1.015]" />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          {asked && <span className="rounded-full bg-accent-dark px-2.5 py-1 text-[11px] font-semibold text-white">You asked about this</span>}
          {!asked && fresh && <span className="rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-ink">New this week</span>}
        </div>
        {h.photoCount > 1 && (
          <span className="absolute bottom-2.5 right-2.5 flex items-center gap-1 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white">
            <DoodleIcon name="camera" size={12} className="invert" /> {h.photoCount}
          </span>
        )}
      </div>
      <div className="px-1 pb-1 pt-3">
        <p className="text-[18px] font-bold leading-tight">{rentWords(h)}</p>
        <p className="mt-1 text-[14px] font-semibold leading-snug">{h.name}</p>
        <p className="mt-0.5 text-[12.5px] text-muted">{h.locality}</p>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px] text-muted">
          {h.beds != null && <span className="flex items-center gap-1.5"><DoodleIcon name="bed.png" size={14} />{h.beds === 0 ? "Studio" : `${h.beds} bed`}</span>}
          {h.propertyType && <span>{h.propertyType}</span>}
          {miles != null && <span className="flex items-center gap-1"><DoodleIcon name="target" size={12} />{milesWords(miles)}</span>}
        </p>
      </div>
    </Link>
  );
}

/* ── New-home alerts ────────────────────────────────────────────────────── */

function describe(f: { radiusMiles: number | null; minBeds: number | null; maxRent: number | null; type: "house" | "flat" | null }, place: string | null) {
  const what = [f.minBeds ? `${f.minBeds}+ bed` : null, f.type === "house" ? "houses" : f.type === "flat" ? "flats" : "homes"].filter(Boolean).join(" ");
  return [
    what.charAt(0).toUpperCase() + what.slice(1),
    f.radiusMiles && place ? `within ${f.radiusMiles} ${f.radiusMiles === 1 ? "mile" : "miles"} of ${place}` : "anywhere we let",
    f.maxRent ? `up to ${pounds(f.maxRent)} a month` : null,
  ].filter(Boolean).join(", ");
}

function Alerts({ filter, place, saved, sample }: { filter: HomeFilter; place: string | null; saved: SavedAlert; sample: boolean }) {
  const [on, setOn] = useState<SavedAlert>(saved);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(!saved);

  async function save() {
    if (!consent) return setErr("Tick the box to say you're happy to get the emails.");
    setErr("");
    const next = { place, radiusMiles: filter.radiusMiles, minBeds: filter.minBeds, maxRent: filter.maxRent, type: filter.type };
    if (sample) {
      setOn(next);
      setEditing(false);
      return;
    }
    setBusy(true);
    const r = await fetch("/api/tenant/homes/alert", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...next, lat: filter.lat, lng: filter.lng, consent: true }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(r?.error ?? "That didn't save. Try again in a moment.");
    setOn(next);
    setEditing(false);
    setConsent(false);
  }

  async function stop() {
    if (!sample) {
      setBusy(true);
      await fetch("/api/tenant/homes/alert", { method: "DELETE" }).catch(() => null);
      setBusy(false);
    }
    setOn(null);
    setEditing(true);
  }

  return (
    <div className="relative flex gap-4 overflow-hidden rounded-[22px] bg-accent-soft p-5">
      <div aria-hidden className="pointer-events-none absolute -bottom-24 -right-14 h-52 w-52 rounded-full bg-accent-dark/10" />
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-accent-dark"><DoodleIcon name="bell" size={18} /></span>
      <div className="relative min-w-0 flex-1">
      {on && !editing ? (
        <div className="relative">
          <h2 className="text-[18px] font-bold leading-tight">Your alerts are on</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/70">We will email you when a new home comes on that fits: <span className="font-semibold text-ink">{describe(on, on.place)}</span></p>
          {sample && <p className="mt-2 text-[12px] text-muted">This is the sample, so nothing is saved.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => setEditing(true)} className="rounded-full bg-accent-dark px-4 py-2 text-[12.5px] font-semibold text-white">Use this search instead</button>
            <button type="button" disabled={busy} onClick={stop} className="rounded-full border border-ink/20 bg-white/60 px-4 py-2 text-[12.5px] font-semibold disabled:opacity-50">Stop the emails</button>
          </div>
        </div>
      ) : (
        <div className="relative">
          <h2 className="text-[18px] font-bold leading-tight">Be First to New Homes</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-ink/70">Good homes go in days. We will email you the moment one comes on that fits: <span className="font-semibold text-ink">{describe(filter, place)}</span></p>
          <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl bg-white/70 p-3">
            <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErr(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent-dark)]" />
            <span className="text-[12.5px] leading-snug">I&apos;m happy to get emails from The Letting Experts about new homes that match. I can stop them at any time.</span>
          </label>
          {err && <p className="mt-2 text-[12.5px] text-[#9d4340]">{err}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy} onClick={save} className={`rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white transition-opacity disabled:opacity-50 ${consent ? "" : "opacity-60"}`}>
              {busy ? "Saving…" : on ? "Update my alerts" : "Turn on alerts"}
            </button>
            {on && <button type="button" onClick={() => setEditing(false)} className="text-[12.5px] text-muted hover:text-ink">Keep what I had</button>}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
