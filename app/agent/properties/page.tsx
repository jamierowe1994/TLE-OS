"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { PhoneProperty } from "@/app/api/m/properties/route";
import type { PropertyGroup } from "@/lib/m-properties";
import { ErrorLine, ReachButtons, Sheet, Spinner, TopBar, dialable, mapsHref } from "../bits";

/**
 * PROPERTIES (3 Oct 2026), from James's mockup - "make the properties tab a
 * little bit more interesting ... significantly better than that": his
 * painted townhouse, a search across address, postcode and tenant, chips for
 * where each home is, a list or a grid of photo cards, and a sheet with the
 * photographs, the facts, directions and the people.
 *
 * The whole book is read once (/api/m/properties?all=1, the agent's own) and
 * every search, chip and sort happens on the phone. The mockup's beds, baths
 * and square feet are not shown: REX has no bedroom or floor-area field, so
 * the card carries what is true - rent, type, and how long it has been out.
 */

const CHIPS: Array<{ id: "all" | PropertyGroup; label: string }> = [
  { id: "all", label: "All" },
  { id: "market", label: "On Market" },
  { id: "letagreed", label: "Let Agreed" },
  { id: "draft", label: "Not Live" },
  { id: "managed", label: "Managed" },
  { id: "archived", label: "Archived" },
];

type Sort = "az" | "rentHigh" | "rentLow" | "longest";
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "az", label: "Address, A to Z" },
  { id: "rentHigh", label: "Rent, highest first" },
  { id: "rentLow", label: "Rent, lowest first" },
  { id: "longest", label: "Longest on the market" },
];

const STATUS_TONE: Record<PropertyGroup, { bg: string; dot: string }> = {
  market: { bg: "var(--m-pink-wash)", dot: "var(--m-coral)" },
  letagreed: { bg: "var(--m-green-wash)", dot: "var(--m-green)" },
  draft: { bg: "var(--m-fill)", dot: "var(--m-soft)" },
  managed: { bg: "var(--m-fill)", dot: "var(--m-muted)" },
  archived: { bg: "var(--m-fill)", dot: "var(--m-soft)" },
};

/** A rent's monthly worth, for sorting only. */
function monthly(rent: string): number {
  const n = Number(rent.replace(/[^\d.]/g, ""));
  if (!n) return 0;
  return /pw/.test(rent) ? (n * 52) / 12 : n;
}

const VIEW_KEY = "agent-props-view";

export default function PhoneProperties() {
  const [book, setBook] = useState<PhoneProperty[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [needle, setNeedle] = useState("");
  const [chip, setChip] = useState<(typeof CHIPS)[number]["id"]>("all");
  const [sort, setSort] = useState<Sort>("az");
  const [grid, setGrid] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [open, setOpen] = useState<PhoneProperty | null>(null);

  const load = () => {
    setError(null);
    setBook(null);
    fetch("/api/m/properties?all=1", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; properties?: PhoneProperty[]; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Your properties did not load.");
        setBook(j.properties ?? []);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setNeedle(q);
    try {
      setGrid(localStorage.getItem(VIEW_KEY) === "grid");
    } catch {
      /* List it is. */
    }
  }, []);

  const pickView = (g: boolean) => {
    setGrid(g);
    try {
      localStorage.setItem(VIEW_KEY, g ? "grid" : "list");
    } catch {
      /* Remembered for this visit only. */
    }
  };

  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    const hits = (book ?? []).filter((p) => {
      if (chip !== "all" && p.group !== chip) return false;
      if (!n) return true;
      return [p.name, p.locality, p.postcode, ...p.tenants.map((t) => t.name), p.landlord?.name].some((f) => f && f.toLowerCase().includes(n));
    });
    const by: Record<Sort, (a: PhoneProperty, b: PhoneProperty) => number> = {
      az: (a, b) => a.name.localeCompare(b.name, "en-GB", { numeric: true }),
      rentHigh: (a, b) => monthly(b.rent) - monthly(a.rent),
      rentLow: (a, b) => (monthly(a.rent) || Infinity) - (monthly(b.rent) || Infinity),
      longest: (a, b) => (b.daysOnMarket ?? -1) - (a.daysOnMarket ?? -1),
    };
    return hits.sort(by[sort]);
  }, [book, needle, chip, sort]);

  const countOf = (id: (typeof CHIPS)[number]["id"]) => (book ?? []).filter((p) => id === "all" || p.group === id).length;

  return (
    <main>
      <TopBar />

      <section className="relative -mx-4 mt-1 h-[190px] overflow-hidden px-4">
        <img
          src="/illustrations/app/townhouse.webp"
          alt=""
          className="pointer-events-none absolute -right-8 top-0 h-[196px] w-auto max-w-none select-none"
          style={{ maskImage: "linear-gradient(to left, #000 72%, transparent 100%)", WebkitMaskImage: "linear-gradient(to left, #000 72%, transparent 100%)" }}
        />
        <div className="relative w-[58%] pt-6">
          <h1 className="m-title text-[38px] leading-[1.04]">Properties</h1>
          <p className="mt-2.5 max-w-[180px] text-[14px] leading-snug text-muted">A quick view of all your properties.</p>
        </div>
      </section>

      <div className="relative z-[1] -mt-2 flex items-center gap-2.5">
        <label className="flex h-[54px] min-w-0 flex-1 items-center gap-3 rounded-full px-5 shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]" style={{ background: "var(--m-card)" }}>
          <DoodleIcon name="search" size={18} />
          <input
            type="search"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder="Address, postcode or tenant..."
            enterKeyHint="search"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
          {needle && (
            <button type="button" onClick={() => setNeedle("")} aria-label="Clear" className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-muted">
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          )}
        </label>
        <button
          type="button"
          onClick={() => setSorting(true)}
          aria-label="Sort"
          className="m-press flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />
          </svg>
        </button>
      </div>

      <div className="mt-4 flex gap-1 overflow-x-auto rounded-full p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" style={{ background: "var(--m-card)" }}>
        {CHIPS.map((c) => {
          const on = chip === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => setChip(c.id)}
              aria-pressed={on}
              className="h-10 shrink-0 rounded-full px-4 text-[14px] font-medium transition-colors"
              style={on ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : { color: "var(--m-ink)" }}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="mb-3 mt-5 flex items-center justify-between">
        <h2 className="m-title text-[22px]">{book ? `${shown.length} ${shown.length === 1 ? "Property" : "Properties"}` : "Properties"}</h2>
        <div className="flex gap-2">
          <ViewButton on={!grid} label="List" onClick={() => pickView(false)}>
            <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
          </ViewButton>
          <ViewButton on={grid} label="Grid" onClick={() => pickView(true)}>
            <path d="M4.5 4.5h6v6h-6zM13.5 4.5h6v6h-6zM4.5 13.5h6v6h-6zM13.5 13.5h6v6h-6z" />
          </ViewButton>
        </div>
      </div>

      {error ? (
        <ErrorLine text={error} onRetry={load} />
      ) : !book ? (
        <Spinner label="Loading your properties" className="py-8" />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] px-6 py-8 text-center" style={{ background: "var(--m-card)" }}>
          <img src="/illustrations/notioly/place-search.svg" alt="" className="m-ill h-[120px] w-auto" />
          <p className="mt-2 text-[16px] font-medium">Nothing Here</p>
          <p className="mt-1 text-[14px] text-muted">
            {needle.trim() ? `No property matches "${needle.trim()}".` : countOf(chip) === 0 ? "None of your properties are in this group." : "Nothing matches."}
          </p>
        </div>
      ) : grid ? (
        <ul className="grid grid-cols-2 gap-3">
          {shown.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => setOpen(p)} className="m-press block w-full overflow-hidden rounded-[22px] text-left" style={{ background: "var(--m-card)" }}>
                <Photo p={p} className="aspect-[4/3] w-full" />
                <span className="block p-3">
                  <Status p={p} />
                  <span className="mt-1.5 block truncate text-[15px] font-semibold">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-muted">{p.rent || p.locality}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid grid-cols-1 gap-3">
          {shown.map((p) => (
            <li key={p.key}>
              <button type="button" onClick={() => setOpen(p)} className="m-press flex w-full items-stretch gap-3 rounded-[22px] p-2 text-left" style={{ background: "var(--m-card)" }}>
                <Photo p={p} className="h-[124px] w-[118px] shrink-0 rounded-[16px]" />
                <span className="flex min-w-0 flex-1 flex-col justify-center py-1 pr-1">
                  <Status p={p} />
                  <span className="mt-1.5 block truncate text-[16.5px] font-semibold leading-snug">{p.name}</span>
                  <span className="block truncate text-[13.5px] text-muted">{[p.locality, p.postcode && !p.locality.includes(p.postcode) ? p.postcode : ""].filter(Boolean).join(", ")}</span>
                  <span className="mt-2 flex items-center gap-3 overflow-hidden whitespace-nowrap text-[12.5px] text-muted">
                    {p.rent && <Fact icon="coin">{p.rent}</Fact>}
                    {p.group === "market" && p.daysOnMarket != null ? (
                      <Fact icon="clock">{p.daysOnMarket} days</Fact>
                    ) : (
                      p.propertyType && <Fact icon="home">{p.propertyType}</Fact>
                    )}
                  </span>
                </span>
                <span className="mr-1 flex items-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
                    <Chevron />
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {sorting && (
        <Sheet label="Sort" onClose={() => setSorting(false)}>
          <h2 className="m-title mb-3 px-1 text-[24px]">Sort</h2>
          <ul className="m-group">
            {SORTS.map((s) => (
              <li key={s.id} className="m-row">
                <button
                  type="button"
                  onClick={() => {
                    setSort(s.id);
                    setSorting(false);
                  }}
                  className="flex h-[52px] w-full items-center justify-between px-4 text-left text-[15.5px]"
                >
                  {s.label}
                  {sort === s.id && (
                    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" style={{ color: "var(--m-coral)" }} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5L19 7" />
                    </svg>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      )}

      {open && <Detail p={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function ViewButton({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className="flex h-10 w-10 items-center justify-center rounded-[14px]"
      style={on ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : { background: "var(--m-card)", color: "var(--m-ink)" }}
    >
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function Photo({ p, className }: { p: PhoneProperty; className: string }) {
  return p.image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={p.image} alt="" loading="lazy" className={`${className} object-cover`} />
  ) : (
    <span className={`${className} flex items-end justify-center overflow-hidden`} style={{ background: "var(--m-pink-wash)" }}>
      <img src="/illustrations/app/townhouse.webp" alt="" className="h-[85%] w-auto max-w-none translate-x-[18%] opacity-90" />
    </span>
  );
}

function Status({ p }: { p: PhoneProperty }) {
  const tone = STATUS_TONE[p.group ?? "managed"];
  return (
    <span className="inline-flex h-[24px] max-w-full items-center gap-1.5 self-start rounded-full px-2.5 text-[12px] font-medium" style={{ background: tone.bg }}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone.dot }} />
      <span className="truncate">{p.status}</span>
    </span>
  );
}

function Fact({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5">
      <DoodleIcon name={icon} size={14} />
      {children}
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One home: its photographs, the facts, directions, and who to ring. */
function Detail({ p, onClose }: { p: PhoneProperty; onClose: () => void }) {
  const photos = p.images?.length ? p.images : p.image ? [p.image] : [];
  const facts: Array<[string, string]> = [
    ["Rent", p.rent],
    ["Status", p.status],
    ["Type", p.propertyType ?? ""],
    ["Service", p.service ?? ""],
    ["Available", p.availableFrom ? fmtDate(p.availableFrom) : ""],
    ["On the Market", p.group === "market" && p.daysOnMarket != null ? `${p.daysOnMarket} days` : ""],
  ].filter((f): f is [string, string] => Boolean(f[1]));

  return (
    <Sheet label={p.name} onClose={onClose}>
      {photos.length > 0 ? (
        <div className="m-rail -mt-1 mb-4">
          {photos.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src + i} src={src} alt="" loading={i > 1 ? "lazy" : "eager"} className="h-[210px] w-[86%] rounded-[20px] object-cover" />
          ))}
        </div>
      ) : (
        <div className="mb-4">
          <Photo p={p} className="h-[180px] w-full rounded-[20px]" />
        </div>
      )}
      <Status p={p} />
      <h2 className="m-title mt-2 text-[26px] leading-tight">{p.name}</h2>
      <p className="mt-0.5 text-[14.5px] text-muted">{[p.locality, p.postcode && !p.locality.includes(p.postcode) ? p.postcode : ""].filter(Boolean).join(", ")}</p>

      <a href={mapsHref(`${p.name}, ${p.locality}`, p.lat, p.lng)} target="_blank" rel="noreferrer" className="m-btn m-btn-primary m-press mt-4 w-full">
        <DoodleIcon name="target" size={17} /> Directions
      </a>

      {facts.length > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-2.5">
          {facts.map(([k, v]) => (
            <div key={k} className="rounded-[18px] px-4 py-3" style={{ background: "var(--m-card)" }}>
              <dt className="text-[12px] text-muted">{k}</dt>
              <dd className="mt-0.5 text-[15px] font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      )}

      <p className="m-eyebrow mb-2 mt-5 px-1">Living There</p>
      <div className="m-group p-4">
        {p.tenants.length === 0 ? (
          <p className="text-[14px] text-muted">No tenant on the record.</p>
        ) : (
          p.tenants.map((t) => (
            <div key={t.name} className="flex items-center justify-between gap-3 py-1">
              <span className="text-[15.5px] font-medium">{t.name}</span>
              {dialable(t.phone) && (
                <a href={`tel:${dialable(t.phone)}`} className="m-btn m-btn-primary m-press !h-9 !px-4 !text-[13.5px]">
                  Call
                </a>
              )}
            </div>
          ))
        )}
      </div>

      {p.landlord && (
        <>
          <p className="m-eyebrow mb-2 mt-5 px-1">Landlord</p>
          <div className="m-group p-4">
            <p className="text-[16px] font-semibold">{p.landlord.name}</p>
            <ReachButtons phone={p.landlord.phone} email={p.landlord.email} />
          </div>
        </>
      )}
    </Sheet>
  );
}
