"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Lead } from "@/lib/leads-sample";
import { ErrorLine, Sheet, Spinner, TopBar, WhatsAppIcon, dialable, mapsHref, whatsappHref } from "../bits";

/**
 * LEADS (3 Oct 2026). James: "at no point on this app should we ever get
 * through to the actual homepage ... start with the leads page and pull up
 * their own leads". The agent's own leads, from the same ledger and route the
 * desktop board reads (/api/leads, scoped to them), drawn like Properties and
 * People: the same header, four tabs, search with sort, plain rows, and a
 * sheet with WhatsApp, Call, Email and Directions, the facts and their words.
 *
 * READ ONLY - moving a lead on stays on the desk for now. A route that
 * answers "stale" is asked again a few seconds later, as the board does; the
 * sample book is never shown.
 */

type Tab = "today" | "new" | "chasing" | "all";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "today", label: "Today" },
  { id: "new", label: "New" },
  { id: "chasing", label: "Chasing" },
  { id: "all", label: "All" },
];

type Sort = "newest" | "oldest" | "az";
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "newest", label: "Newest First" },
  { id: "oldest", label: "Oldest First" },
  { id: "az", label: "Name, A to Z" },
];

const londonDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(d);
const FINISHED = new Set(["Not proceeding", "Closed"]);

function ago(iso?: string): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min ago`;
  const h = Math.round(mins / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const TONE: Record<string, { bg: string; ink: string }> = {
  New: { bg: "var(--m-pink-wash)", ink: "var(--m-coral)" },
  Qualified: { bg: "var(--m-green-wash)", ink: "var(--m-sage-ink)" },
  "Viewing booked": { bg: "var(--m-green-wash)", ink: "var(--m-sage-ink)" },
};
const toneOf = (stage: string) => TONE[stage] ?? { bg: "var(--m-fill)", ink: "var(--m-muted)" };

async function readLeads(again = true): Promise<{ leads: Lead[] } | { error: string }> {
  const r = await fetch("/api/leads", { cache: "no-store" }).catch(() => null);
  const j = r ? ((await r.json().catch(() => null)) as { ok?: boolean; leads?: Lead[]; demo?: boolean; unlinked?: boolean; stale?: boolean; error?: string } | null) : null;
  if (!r?.ok || !j || !Array.isArray(j.leads)) return { error: j?.error ?? "Your leads did not load." };
  if (j.unlinked) return { error: "Your account is not linked to the leads book yet. Ask James to link it." };
  if (j.demo) return { error: "The leads book is not connected here." };
  if (j.stale && again) {
    await new Promise((res) => setTimeout(res, 4000));
    const fresh = await readLeads(false);
    return "leads" in fresh ? fresh : { leads: j.leads };
  }
  return { leads: j.leads };
}

export default function PhoneLeads() {
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("today");
  const [needle, setNeedle] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [sorting, setSorting] = useState(false);
  const [open, setOpen] = useState<Lead | null>(null);

  const load = () => {
    setError(null);
    setLeads(null);
    void readLeads().then((r) => ("leads" in r ? setLeads(r.leads) : setError(r.error)));
  };

  useEffect(() => {
    load();
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "new" || t === "chasing" || t === "all") setTab(t);
  }, []);

  const today = londonDay(new Date());
  const inTab = (l: Lead, t: Tab) => {
    if (t === "today") return Boolean(l.receivedAt) && londonDay(new Date(l.receivedAt!)) === today;
    if (t === "new") return l.stage === "New";
    if (t === "chasing") return !FINISHED.has(l.stage) && l.stage !== "New" && (!l.followUpAt || l.followUpAt <= new Date().toISOString());
    return true;
  };

  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    const nd = n.replace(/\D/g, "");
    const hits = (leads ?? []).filter((l) => {
      if (!inTab(l, tab)) return false;
      if (!n) return true;
      if ([l.name, l.email, l.address, l.area, l.source].some((f) => f && f.toLowerCase().includes(n))) return true;
      return nd.length >= 5 && l.phone.replace(/\D/g, "").includes(nd);
    });
    const at = (l: Lead) => l.receivedAt ?? "";
    const by: Record<Sort, (a: Lead, b: Lead) => number> = {
      newest: (a, b) => at(b).localeCompare(at(a)),
      oldest: (a, b) => at(a).localeCompare(at(b)),
      az: (a, b) => a.name.localeCompare(b.name, "en-GB"),
    };
    return hits.sort(by[sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leads, tab, needle, sort, today]);

  return (
    <main>
      <TopBar />

      {/* Exactly Home's greeting box, as on Properties and People. */}
      <section className="relative -mx-4 mt-2 h-[268px] overflow-hidden px-4">
        <img
          src="/illustrations/app/street-row.webp"
          alt=""
          className="pointer-events-none absolute -right-24 top-6 h-[236px] w-auto max-w-none select-none"
          style={{ maskImage: "linear-gradient(to left, #000 70%, transparent 100%)", WebkitMaskImage: "linear-gradient(to left, #000 70%, transparent 100%)" }}
        />
        <div className="relative w-[56%] pt-4">
          <h1 className="m-title text-[38px] leading-[1.04]">Leads</h1>
          <p className="mt-3 max-w-[170px] text-[14px] leading-snug text-muted">Your enquiries, newest first.</p>
        </div>
      </section>

      <div className="relative z-[1] -mt-5 flex items-center gap-2.5">
        <label className="flex h-[54px] min-w-0 flex-1 items-center gap-3 rounded-full px-5 shadow-[0_10px_30px_-14px_rgba(80,50,40,0.35)]" style={{ background: "var(--m-card)" }}>
          <DoodleIcon name="search" size={18} />
          <input
            type="search"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            placeholder="Name, phone or address..."
            enterKeyHint="search"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
          />
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

      <div className="mt-4 grid grid-cols-4 gap-1 rounded-full p-1" style={{ background: "var(--m-card)" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className="h-10 rounded-full px-1 text-[14px] font-medium transition-colors"
            style={tab === t.id ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mb-2 mt-5 px-1 text-[15px] font-medium">{leads ? `${shown.length} ${shown.length === 1 ? "Lead" : "Leads"}` : "Leads"}</p>

      {error ? (
        <ErrorLine text={error} onRetry={load} />
      ) : !leads ? (
        <Spinner label="Loading your leads" className="py-6" />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] px-6 py-8 text-center" style={{ background: "var(--m-card)" }}>
          <img src="/illustrations/notioly/inbox.svg" alt="" className="m-ill h-[110px] w-auto" />
          <p className="mt-2 text-[16px] font-medium">{tab === "today" && !needle.trim() ? "No New Leads Today Yet" : "Nothing Here"}</p>
          <p className="mt-1 text-[14px] text-muted">{needle.trim() ? `No lead matches "${needle.trim()}".` : "They'll appear here as they come in."}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5">
          {shown.map((l) => {
            const t = toneOf(l.stage);
            return (
              <li key={l.id}>
                <button type="button" onClick={() => setOpen(l)} className="m-press flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left" style={{ background: "var(--m-card)" }}>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="m-title truncate text-[18px]">{l.name || "No name given"}</span>
                      <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: t.bg, color: t.ink }}>
                        {l.stage}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] text-muted">{[l.enquiry, l.address || l.area].filter(Boolean).join(" · ")}</span>
                    <span className="block truncate text-[13px] text-muted">{[ago(l.receivedAt), l.source].filter(Boolean).join(" · ")}</span>
                  </span>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--m-on-card)" }}>
                    <Chevron />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {sorting && (
        <Sheet label="Sort" onClose={() => setSorting(false)}>
          <h2 className="m-title mb-3 px-1 text-[24px]">Sort By</h2>
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

      {open && <Detail l={open} onClose={() => setOpen(null)} />}
    </main>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 shrink-0">
      <path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Detail({ l, onClose }: { l: Lead; onClose: () => void }) {
  const tel = dialable(l.phone);
  const where = l.address || "";
  const t = toneOf(l.stage);
  const actions: Array<{ label: string; icon: string; href: string | null }> = [
    { label: "WhatsApp", icon: "whatsapp", href: whatsappHref(l.phone) },
    { label: "Call", icon: "call", href: tel ? `tel:${tel}` : null },
    { label: "Email", icon: "mail", href: l.email ? `mailto:${l.email}` : null },
    { label: "Directions", icon: "target", href: where ? mapsHref(where) : null },
  ];
  const facts: Array<[string, string, string]> = [
    ["doc", "Enquiry", l.enquiry],
    ["home", "Property", where || l.area],
    ["clock", "Came In", l.receivedAt ? new Date(l.receivedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : l.received],
    ["calendar", "Wants to Move", l.moveDate],
    ["coin", "Budget", l.budget],
    ["target", "Came From", l.source],
    ["bell", "Follow Up", l.followUpAt ? new Date(l.followUpAt).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }) : ""],
  ].filter((f): f is [string, string, string] => Boolean(f[2]));

  return (
    <Sheet label={l.name} onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-title text-[28px] leading-tight">{l.name || "No name given"}</h2>
        <span className="rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: t.bg, color: t.ink }}>
          {l.stage}
        </span>
      </div>
      {(l.phone || l.email) && <p className="mt-1 break-words text-[14.5px] text-muted">{[l.phone, l.email].filter(Boolean).join(" · ")}</p>}

      <div className="mt-4 grid grid-cols-4 gap-2">
        {actions.map((a) => {
          const icon = a.icon === "whatsapp" ? <WhatsAppIcon size={22} /> : <DoodleIcon name={a.icon} size={22} />;
          return a.href ? (
            <a key={a.label} href={a.href} target={a.label === "Directions" ? "_blank" : undefined} rel="noreferrer" className="m-press flex flex-col items-center gap-1.5 rounded-[18px] py-3 text-[12.5px] font-medium" style={{ background: "var(--m-card)" }}>
              {icon}
              {a.label}
            </a>
          ) : (
            <span key={a.label} className="flex flex-col items-center gap-1.5 rounded-[18px] py-3 text-[12.5px] font-medium opacity-35" style={{ background: "var(--m-card)" }}>
              {icon}
              {a.label}
            </span>
          );
        })}
      </div>

      {l.enquiryMessage && (
        <>
          <p className="m-eyebrow mb-2 mt-5 px-1">Their Message</p>
          <p className="whitespace-pre-wrap rounded-[20px] px-4 py-3.5 text-[15px] leading-relaxed" style={{ background: "var(--m-card)" }}>
            {l.enquiryMessage}
          </p>
        </>
      )}

      {facts.length > 0 && (
        <ul className="m-group mt-4">
          {facts.map(([icon, k, v]) => (
            <li key={k} className="m-row flex items-center gap-3 px-4 py-3.5">
              <DoodleIcon name={icon} size={18} className="text-muted" />
              <span className="w-[38%] shrink-0 text-[14.5px] text-muted">{k}</span>
              <span className="min-w-0 truncate text-[15px] font-medium">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
