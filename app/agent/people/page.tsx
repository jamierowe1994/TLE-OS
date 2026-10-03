"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { PhonePerson } from "@/app/api/m/people/route";
import type { NearbyPerson } from "@/app/api/m/nearby/route";
import type { BookPerson } from "@/lib/m-people-book";
import { ErrorLine, Sheet, Spinner, TopBar, dialable, mapsHref, whatsappHref, WhatsAppIcon } from "../bits";
import { RadiusSheet, type RadiusPick } from "../radius";
import SlideTabs from "@/components/app/SlideTabs";
import FloatSearch from "@/components/app/FloatSearch";

/**
 * PEOPLE (3 Oct 2026), from James's mockup - "this is how I would like the
 * page to look for people ... lose the icons for the houses": the same header
 * as Home and Properties, Tenants and Landlords, a search with a customise
 * button, a count with its sort, and plain rows - a name, where they stand,
 * where they live - opening a sheet with message, call and email at the top.
 *
 * The list is the agent's own book (/api/m/people?book=1): open applicants
 * at their real stage, the tenants in the homes we manage, and those homes'
 * landlords. Typing also asks the full contact book, so anybody else is
 * still found (shown under From the Contact Book). The radius search lives
 * behind the customise button.
 */

type Side = "tenant" | "landlord";
type Sort = "recent" | "az" | "stage";
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "recent", label: "Recently Added" },
  { id: "az", label: "Name, A to Z" },
  { id: "stage", label: "Stage" },
];

const TONE: Record<BookPerson["tone"], { bg: string; ink: string }> = {
  new: { bg: "var(--m-pink-wash)", ink: "var(--m-coral)" },
  active: { bg: "var(--m-green-wash)", ink: "var(--m-sage-ink)" },
  neutral: { bg: "var(--m-fill)", ink: "var(--m-muted)" },
};

const sameish = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, " ").trim() === b.toLowerCase().replace(/\s+/g, " ").trim();

export default function PhonePeople() {
  const [book, setBook] = useState<{ tenants: BookPerson[]; landlords: BookPerson[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [side, setSide] = useState<Side>("tenant");
  const [needle, setNeedle] = useState("");
  const [sort, setSort] = useState<Sort>("recent");
  const [customise, setCustomise] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [radius, setRadius] = useState<RadiusPick | null>(null);
  const [near, setNear] = useState<NearbyPerson[] | null>(null);
  const [others, setOthers] = useState<PhonePerson[] | null>(null);
  const [open, setOpen] = useState<BookPerson | null>(null);
  const turn = useRef(0);

  const load = () => {
    setError(null);
    setBook(null);
    fetch("/api/m/people?book=1", { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json().catch(() => ({}))) as { ok?: boolean; tenants?: BookPerson[]; landlords?: BookPerson[]; error?: string };
        if (!r.ok || !j.ok) throw new Error(j.error ?? "Your people did not load.");
        setBook({ tenants: j.tenants ?? [], landlords: j.landlords ?? [] });
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("who") === "landlord") setSide("landlord");
    const q = sp.get("q");
    if (q) setNeedle(q);
  }, []);

  const pickSide = (w: Side) => {
    setSide(w);
    setRadius(null);
    const url = new URL(window.location.href);
    url.searchParams.set("who", w);
    window.history.replaceState(null, "", url);
  };

  /* Typing also asks the whole contact book, for anybody not on the list. */
  useEffect(() => {
    const term = needle.trim();
    const mine = ++turn.current;
    setOthers(null);
    if (term.length < 2) return;
    const t = window.setTimeout(() => {
      const ask = (extra: string) =>
        fetch(`/api/m/people?q=${encodeURIComponent(term)}${extra}`, { cache: "no-store" })
          .then((r) => r.json())
          .then((j: { people?: PhonePerson[] }) => j.people ?? [])
          .catch(() => [] as PhonePerson[]);
      void Promise.all([ask(""), ask("&rex=1")]).then(([a, b]) => mine === turn.current && setOthers([...a, ...b]));
    }, 350);
    return () => window.clearTimeout(t);
  }, [needle]);

  useEffect(() => {
    if (!radius) return setNear(null);
    setNear(null);
    const sp = new URLSearchParams({ who: side, lat: String(radius.lat), lng: String(radius.lng), miles: String(radius.miles) });
    fetch(`/api/m/nearby?${sp.toString()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { people?: NearbyPerson[] }) => setNear(j.people ?? []))
      .catch(() => setNear([]));
  }, [radius, side]);

  const list = useMemo(() => {
    const all = book ? (side === "tenant" ? book.tenants : book.landlords) : [];
    const n = needle.trim().toLowerCase();
    const nd = n.replace(/\D/g, "");
    const hits = all.filter((p) => {
      if (!n) return true;
      if ([p.name, p.address, p.locality, p.email].some((f) => f && f.toLowerCase().includes(n))) return true;
      return nd.length >= 5 && p.phone.replace(/\D/g, "").includes(nd);
    });
    const by: Record<Sort, (a: BookPerson, b: BookPerson) => number> = {
      recent: (a, b) => (b.at ?? "").localeCompare(a.at ?? ""),
      az: (a, b) => a.name.localeCompare(b.name, "en-GB"),
      stage: (a, b) => a.status.localeCompare(b.status, "en-GB") || a.name.localeCompare(b.name, "en-GB"),
    };
    return hits.sort(by[sort]);
  }, [book, side, needle, sort]);

  /* Contact-book finds that are not already on the list, and on this side. */
  const extra = useMemo(() => {
    if (!others) return [];
    const other = side === "tenant" ? /landlord/i : /tenant|applicant/i;
    const seen = new Set<string>();
    return others.filter((o) => {
      if (other.test(o.role)) return false;
      if (list.some((p) => sameish(p.name, o.name))) return false;
      const k = o.name.toLowerCase() + o.phone.replace(/\D/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [others, list, side]);

  const noun = side === "tenant" ? ["Tenant", "Tenants"] : ["Landlord", "Landlords"];

  return (
    <main>
      <TopBar />

      {/* Exactly Home's greeting box, as on Properties. The brick loft from
          the desktop dashboard (James, 3 Oct 2026), cut to the building and
          its clouds with soft sides, set to the right so it clears the title. */}
      <section className="relative -mx-4 mt-2 h-[268px] overflow-hidden px-4">
        <img
          src="/illustrations/app/people-loft.webp"
          alt=""
          className="pointer-events-none absolute -right-[100px] top-[26px] h-[232px] w-auto max-w-none select-none"
        />
        <div className="relative w-[56%] pt-4">
          <h1 className="m-title text-[38px] leading-[1.04]">People</h1>
          <p className="mt-3 max-w-[170px] text-[14px] leading-snug text-muted">Find your tenants and landlords.</p>
        </div>
      </section>

      <SlideTabs
        className="z-[1] -mt-5"
        shadow
        height={44}
        textClass="text-[15px]"
        value={side}
        onChange={pickSide}
        options={[
          { id: "tenant" as const, label: "Tenants" },
          { id: "landlord" as const, label: "Landlords" },
        ]}
      />

      <div className="mt-3 flex items-center gap-2.5">
        <FloatSearch
          value={needle}
          onChange={(v) => {
            setNeedle(v);
            setRadius(null);
          }}
          placeholder="Name, phone or home..."
          shadow={false}
          className="!h-[52px]"
          items={list.map((p) => ({ key: p.key, title: p.name, line: [p.address, p.locality].filter(Boolean).join(", "), tag: p.status, onPick: () => setOpen(p) }))}
        />
        <button
          type="button"
          onClick={() => setCustomise(true)}
          aria-label="Customise"
          className="m-press flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full"
          style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4.5v5M8 14.5v5" />
          </svg>
        </button>
      </div>

      {radius ? (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between px-1">
            <p className="text-[15px] font-medium">
              {near ? `${near.length} ${near.length === 1 ? noun[0] : noun[1]}` : noun[1]} within {radius.miles} {radius.miles === 1 ? "mile" : "miles"}
            </p>
            <button type="button" onClick={() => setRadius(null)} className="text-[14px] font-medium" style={{ color: "var(--m-coral)" }}>
              Clear
            </button>
          </div>
          {near === null ? (
            <Spinner label="Looking around" className="py-4" />
          ) : near.length === 0 ? (
            <p className="py-6 text-center text-[14px] text-muted">Nobody within {radius.miles} miles. Try further out.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5">
              {near.map((p) => (
                <li key={p.key}>
                  <Row
                    name={p.name}
                    chip={{ text: p.miles < 0.1 ? "< 0.1 mi" : `${p.miles} mi`, tone: "neutral" }}
                    line1={p.context || p.role}
                    onClick={() => setOpen(asBook(p, side))}
                  />
                </li>
              ))}
            </ul>
          )}
        </>
      ) : (
        <>
          <div className="mb-2 mt-5 flex items-center justify-between px-1">
            <p className="text-[15px] font-medium">{book ? `${list.length} ${list.length === 1 ? noun[0] : noun[1]}` : noun[1]}</p>
            <button type="button" onClick={() => setCustomise(true)} className="flex items-center gap-1 text-[13.5px]">
              <span className="text-muted">Sort by</span>
              <span className="font-medium">{SORTS.find((s) => s.id === sort)?.label}</span>
              <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
          </div>

          {error ? (
            <ErrorLine text={error} onRetry={load} />
          ) : !book ? (
            <Spinner label={`Loading your ${noun[1].toLowerCase()}`} className="py-6" />
          ) : list.length === 0 && !needle.trim() ? (
            <p className="py-6 text-center text-[14px] text-muted">No {noun[1].toLowerCase()} on your book yet. Search to find anyone in the contact book.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2.5">
              {list.map((p) => (
                <li key={p.key}>
                  <Row name={p.name} chip={{ text: p.status, tone: p.tone }} line1={p.address} line2={p.locality} onClick={() => setOpen(p)} />
                </li>
              ))}
            </ul>
          )}

          {needle.trim().length >= 2 && (
            <>
              <p className="m-eyebrow mb-2 mt-6 px-1">From the Contact Book</p>
              {others === null ? (
                <Spinner label="Checking the contact book" className="py-3" />
              ) : extra.length === 0 ? (
                <p className="px-1 text-[14px] text-muted">{list.length ? "Nobody else." : `Nobody found for "${needle.trim()}".`}</p>
              ) : (
                <ul className="grid grid-cols-1 gap-2.5">
                  {extra.map((p) => (
                    <li key={p.key}>
                      <Row name={p.name} chip={{ text: p.role || "Contact", tone: "neutral" }} line1={p.context} onClick={() => setOpen(asBook(p, side))} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {customise && (
        <Sheet label="Customise" onClose={() => setCustomise(false)}>
          <h2 className="m-title mb-3 px-1 text-[24px]">Sort By</h2>
          <ul className="m-group">
            {SORTS.map((s) => (
              <li key={s.id} className="m-row">
                <button
                  type="button"
                  onClick={() => {
                    setSort(s.id);
                    setCustomise(false);
                  }}
                  className="flex h-[52px] w-full items-center justify-between px-4 text-left text-[15.5px]"
                >
                  {s.label}
                  {sort === s.id && <Tick />}
                </button>
              </li>
            ))}
          </ul>
          <ul className="m-group mt-4">
            <li>
              <button
                type="button"
                onClick={() => {
                  setCustomise(false);
                  setRadiusOpen(true);
                }}
                className="flex h-[52px] w-full items-center gap-3 px-4 text-left text-[15.5px]"
              >
                <DoodleIcon name="target" size={18} />
                <span className="flex-1">Search by Radius</span>
                <Chevron />
              </button>
            </li>
          </ul>
        </Sheet>
      )}

      {radiusOpen && (
        <RadiusSheet
          start={radius}
          onClose={() => setRadiusOpen(false)}
          onPick={(p) => {
            setRadiusOpen(false);
            setNeedle("");
            setRadius(p);
          }}
        />
      )}

      {open && <Detail p={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

/** A contact-book or radius find, shaped like a book row for the detail sheet. */
function asBook(p: PhonePerson, side: Side): BookPerson {
  return { key: p.key, side, name: p.name, phone: p.phone, email: p.email, status: p.role || "Contact", tone: "neutral", address: p.context, locality: "", since: null, tenancyType: null, rent: "", at: null };
}

function Row({ name, chip, line1, line2, onClick }: { name: string; chip: { text: string; tone: BookPerson["tone"] }; line1?: string; line2?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="m-press flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left" style={{ background: "var(--m-card)" }}>
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 items-center gap-2">
          <span className="m-title truncate text-[18px]">{name}</span>
          <Chip text={chip.text} tone={chip.tone} />
        </span>
        {line1 && <span className="mt-0.5 block truncate text-[14px] text-muted">{line1}</span>}
        {line2 && <span className="block truncate text-[13.5px] text-muted">{line2}</span>}
      </span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
        <Chevron />
      </span>
    </button>
  );
}

function Chip({ text, tone }: { text: string; tone: BookPerson["tone"] }) {
  const t = TONE[tone];
  return (
    <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: t.bg, color: t.ink }}>
      {text}
    </span>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Tick() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5" style={{ color: "var(--m-coral)" }} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L19 7" />
    </svg>
  );
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

/** One person: the painting, who and where, four buttons, the facts, and their home. */
/** The Find a Home flow for a tenant: around their home, at about their rent. */
function findHomeHref(p: BookPerson): string {
  const n = Number((p.rent.match(/[\d,.]+/)?.[0] ?? "").replace(/,/g, "")) || 0;
  const monthly = /\bpw\b|week/i.test(p.rent) ? Math.round((n * 52) / 12) : n;
  const q = new URLSearchParams({ name: p.name, email: p.email, near: [p.address, p.locality].filter(Boolean).join(", ") });
  if (monthly) q.set("rent", String(monthly));
  return `/agent/find-home?${q.toString()}`;
}

function Detail({ p, onClose }: { p: BookPerson; onClose: () => void }) {
  const tel = dialable(p.phone);
  const applicant = p.side === "tenant" && p.tone === "new";
  const facts: Array<[string, string, string]> = [
    ["checklist", "Status", p.status],
    ["calendar", applicant ? "Wants to Move In" : p.side === "tenant" ? "Moved In" : "With Us Since", p.since ? day(p.since) : ""],
    ["doc", p.side === "tenant" ? "Tenancy" : "Service", p.tenancyType ?? ""],
    ["coin", applicant ? "Offer" : "Rent", p.rent],
  ].filter((f): f is [string, string, string] => Boolean(f[2]));

  const actions: Array<{ label: string; icon: string; href: string | null }> = [
    { label: "WhatsApp", icon: "whatsapp", href: whatsappHref(p.phone) },
    { label: "Call", icon: "call", href: tel ? `tel:${tel}` : null },
    { label: "Email", icon: "mail", href: p.email ? `mailto:${p.email}` : null },
    { label: "Directions", icon: "target", href: p.address ? mapsHref([p.address, p.locality].filter(Boolean).join(", ")) : null },
  ];

  return (
    <Sheet label={p.name} onClose={onClose}>
      <div className="-mx-1 -mt-1 mb-4 h-[150px] overflow-hidden rounded-[22px]" style={{ background: "var(--m-pink-wash)" }}>
        <img src="/illustrations/app/street-row.webp" alt="" className="ml-auto h-full w-auto max-w-none" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-title text-[28px] leading-tight">{p.name}</h2>
        <Chip text={p.status} tone={p.tone} />
      </div>
      {(p.address || p.locality) && <p className="mt-1 text-[14.5px] text-muted">{[p.address, p.locality].filter(Boolean).join(", ")}</p>}

      <div className="mt-4 grid grid-cols-4 gap-2">
        {actions.map((a) =>
          a.href ? (
            <a key={a.label} href={a.href} target={a.label === "Directions" ? "_blank" : undefined} rel="noreferrer" className="m-press flex flex-col items-center gap-1.5 rounded-[18px] py-3 text-[12.5px] font-medium" style={{ background: "var(--m-card)" }}>
              {a.icon === "whatsapp" ? <WhatsAppIcon size={22} /> : <DoodleIcon name={a.icon} size={22} />}
              {a.label}
            </a>
          ) : (
            <span key={a.label} className="flex flex-col items-center gap-1.5 rounded-[18px] py-3 text-[12.5px] font-medium opacity-35" style={{ background: "var(--m-card)" }}>
              {a.icon === "whatsapp" ? <WhatsAppIcon size={22} /> : <DoodleIcon name={a.icon} size={22} />}
              {a.label}
            </span>
          )
        )}
      </div>

      {/* The other way round from Email the Database (James, 3 Oct 2026):
          the live homes around where this tenant wants to be. */}
      {p.side === "tenant" && (
        <Link href={findHomeHref(p)} className="m-btn m-btn-primary m-press mt-3 w-full">
          <DoodleIcon name="home" size={17} /> Find a Home
        </Link>
      )}

      {facts.length > 0 && (
        <ul className="m-group mt-4">
          {facts.map(([icon, k, v]) => (
            <li key={k} className="m-row flex items-center gap-3 px-4 py-3.5">
              <DoodleIcon name={icon} size={18} className="text-muted" />
              <span className="w-[42%] shrink-0 text-[14.5px] text-muted">{k}</span>
              <span className="flex min-w-0 items-center gap-2 text-[15px] font-medium">
                {k === "Status" && <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: TONE[p.tone].ink }} />}
                <span className="truncate">{v}</span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {p.address && (
        <>
          <p className="m-eyebrow mb-2 mt-5 px-1">{p.side === "landlord" ? "Their Home With Us" : "Property"}</p>
          <Link href={`/agent/properties?q=${encodeURIComponent(p.address)}`} className="m-press flex items-center gap-3 rounded-[22px] px-4 py-3.5" style={{ background: "var(--m-card)" }}>
            <span className="min-w-0 flex-1">
              <span className="m-title block truncate text-[17px]">{p.address}</span>
              {p.locality && <span className="block truncate text-[13.5px] text-muted">{p.locality}</span>}
            </span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
              <Chevron />
            </span>
          </Link>
        </>
      )}
    </Sheet>
  );
}
