"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Application } from "@/lib/applications";
import { ErrorLine, Sheet, Spinner, TopBar, WhatsAppIcon, dialable, mapsHref, whatsappHref, HomeHero } from "../bits";
import SlideTabs from "@/components/app/SlideTabs";
import FloatSearch from "@/components/app/FloatSearch";

/**
 * APPLICATIONS (3 Oct 2026), the app's own page - James: "build the
 * applications page next", so Home's Applications tile no longer has to go
 * nowhere. The agent's own applications from the same route and board as the
 * desk (/api/applications, scoped to them), drawn like Leads: the same header,
 * four tabs, search and sort, plain rows, and a sheet with the applicant's
 * buttons, the offer and the household.
 *
 * "Open" is exactly Home's figure: received or communicated, and never one on
 * a home since let or withdrawn (closedReasons). READ ONLY - moving an offer
 * on stays on the desk for now.
 */

type App = Application & { stageLabel?: string; closed?: string | null };

type Tab = "open" | "received" | "offered" | "accepted";
const TABS: Array<{ id: Tab; label: string }> = [
  { id: "open", label: "Open" },
  { id: "received", label: "New" },
  { id: "offered", label: "Offered" },
  { id: "accepted", label: "Accepted" },
];

type Sort = "newest" | "movein" | "offer";
const SORTS: Array<{ id: Sort; label: string }> = [
  { id: "newest", label: "Newest First" },
  { id: "movein", label: "Soonest Move-In" },
  { id: "offer", label: "Highest Offer" },
];

const money = (n: number | null, period: string) => (n == null ? "" : `£${Math.round(n).toLocaleString("en-GB")} ${/week/i.test(period) ? "pw" : "pcm"}`);
const monthly = (a: App) => (a.offerAmount == null ? 0 : /week/i.test(a.offerPeriod) ? (a.offerAmount * 52) / 12 : a.offerAmount);
const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
const received = (a: App) => a.dateReceived ?? (a.createdAt ? new Date(a.createdAt * (a.createdAt < 1e12 ? 1000 : 1)).toISOString() : "");

function who(a: App): string {
  const primary = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  if (!primary) return "No applicant named";
  return a.applicants.length > 1 ? `${primary.name} +${a.applicants.length - 1}` : primary.name;
}

function inTab(a: App, t: Tab): boolean {
  if (a.closed) return false;
  if (t === "open") return a.status === "received" || a.status === "communicated";
  if (t === "received") return a.status === "received";
  if (t === "offered") return a.status === "communicated";
  return a.status === "accepted";
}

const tone = (a: App) =>
  a.status === "accepted"
    ? { bg: "var(--m-green-wash)", ink: "var(--m-sage-ink)" }
    : a.status === "received"
      ? { bg: "var(--m-pink-wash)", ink: "var(--m-coral)" }
      : { bg: "var(--m-fill)", ink: "var(--m-muted)" };

async function readApps(again = true): Promise<{ apps: App[] } | { error: string }> {
  const r = await fetch("/api/applications?limit=300&tests=0", { cache: "no-store" }).catch(() => null);
  const j = r ? ((await r.json().catch(() => null)) as { applications?: App[]; error?: string; unlinked?: boolean; stale?: boolean } | null) : null;
  if (!r || !j) return { error: "Your applications did not load." };
  if (j.unlinked || !r.ok || j.error) return { error: j.error ?? "Your applications did not load." };
  if (j.stale && again) {
    await new Promise((res) => setTimeout(res, 4000));
    const fresh = await readApps(false);
    return "apps" in fresh ? fresh : { apps: j.applications ?? [] };
  }
  return { apps: j.applications ?? [] };
}

export default function PhoneApplications() {
  const [apps, setApps] = useState<App[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("open");
  const [needle, setNeedle] = useState("");
  const [sort, setSort] = useState<Sort>("newest");
  const [sorting, setSorting] = useState(false);
  const [open, setOpen] = useState<App | null>(null);

  const load = () => {
    setError(null);
    setApps(null);
    void readApps().then((r) => ("apps" in r ? setApps(r.apps) : setError(r.error)));
  };

  useEffect(() => {
    load();
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "received" || t === "offered" || t === "accepted") setTab(t);
  }, []);

  const shown = useMemo(() => {
    const n = needle.trim().toLowerCase();
    const hits = (apps ?? []).filter((a) => {
      if (!inTab(a, tab)) return false;
      if (!n) return true;
      return [a.property, a.locality, ...a.applicants.map((p) => p.name), ...a.applicants.map((p) => p.email ?? "")].some((f) => f && f.toLowerCase().includes(n));
    });
    const by: Record<Sort, (x: App, y: App) => number> = {
      newest: (x, y) => received(y).localeCompare(received(x)),
      movein: (x, y) => (x.startDate ?? "9999").localeCompare(y.startDate ?? "9999"),
      offer: (x, y) => monthly(y) - monthly(x),
    };
    return hits.sort(by[sort]);
  }, [apps, tab, needle, sort]);

  return (
    <main>
      <TopBar />

      <HomeHero title="Applications" line="Offers on your homes, and where they stand." src="/illustrations/app/home-redbrick.webp" />

      <div className="relative z-[1] -mt-5 flex items-center gap-2.5">
        <FloatSearch
          value={needle}
          onChange={setNeedle}
          placeholder="Applicant or address..."
          items={apps ? shown.map((a) => ({ key: String(a.id), title: who(a), line: [a.property, a.locality].filter(Boolean).join(", "), tag: a.stageLabel ?? a.statusLabel, onPick: () => setOpen(a) })) : null}
        />
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

      <SlideTabs className="mt-4" value={tab} onChange={setTab} options={TABS.map((t) => ({ id: t.id, label: t.label }))} />

      <p className="mb-2 mt-5 px-1 text-[15px] font-medium">{apps ? `${shown.length} ${shown.length === 1 ? "Application" : "Applications"}` : "Applications"}</p>

      {error ? (
        <ErrorLine text={error} onRetry={load} />
      ) : !apps ? (
        <Spinner label="Loading your applications" className="py-6" />
      ) : shown.length === 0 ? (
        <div className="flex flex-col items-center rounded-[22px] px-6 py-8 text-center" style={{ background: "var(--m-card)" }}>
          <img src="/illustrations/app/empty-armchair.webp" alt="" className="h-[120px] w-auto" />
          <p className="mt-2 text-[16px] font-medium">Nothing Here</p>
          <p className="mt-1 text-[14px] text-muted">{needle.trim() ? `No application matches "${needle.trim()}".` : "No applications in this group."}</p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-2.5">
          {shown.map((a) => {
            const t = tone(a);
            return (
              <li key={a.id}>
                <button type="button" onClick={() => setOpen(a)} className="m-press flex w-full items-center gap-3 rounded-[22px] px-4 py-3.5 text-left" style={{ background: "var(--m-card)" }}>
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="m-title truncate text-[18px]">{who(a)}</span>
                      <span className="shrink-0 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: t.bg, color: t.ink }}>
                        {a.stageLabel ?? a.statusLabel}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-[14px] text-muted">{[a.property, a.locality].filter(Boolean).join(", ")}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {[money(a.offerAmount, a.offerPeriod), a.startDate ? `Move in ${day(a.startDate)}` : ""].filter(Boolean).join(" · ")}
                    </span>
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

      {open && <Detail a={open} onClose={() => setOpen(null)} />}
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

/** One application: the home, the applicants with their buttons, the offer and the household. */
function Detail({ a, onClose }: { a: App; onClose: () => void }) {
  const primary = a.applicants.find((p) => p.isPrimary) ?? a.applicants[0];
  const tel = dialable(primary?.phone ?? "");
  const where = [a.property, a.locality].filter(Boolean).join(", ");
  const t = tone(a);
  const actions: Array<{ label: string; icon: string; href: string | null }> = [
    { label: "WhatsApp", icon: "whatsapp", href: whatsappHref(primary?.phone ?? "") },
    { label: "Call", icon: "call", href: tel ? `tel:${tel}` : null },
    { label: "Email", icon: "mail", href: primary?.email ? `mailto:${primary.email}` : null },
    { label: "Directions", icon: "target", href: where ? mapsHref(where) : null },
  ];
  const facts: Array<[string, string, string]> = [
    ["coin", "Offer", money(a.offerAmount, a.offerPeriod)],
    ["calendar", "Move In", a.startDate ? day(a.startDate) : ""],
    ["doc", "Term", a.agreementMonths ? `${a.agreementMonths} ${a.agreementMonths === 1 ? "month" : "months"}` : ""],
    ["user", "Living There", a.occupants != null ? `${a.occupants} ${a.occupants === 1 ? "person" : "people"}${a.dependents ? `, ${a.dependents} dependent${a.dependents === 1 ? "" : "s"}` : ""}` : ""],
    ["home", "Pets", a.hasPets == null ? "" : a.hasPets ? "Yes" : "No"],
    /* REX's total income is MONTHLY: its own affordability is rent over it. */
    ["coin", "Household Income", a.totalIncome ? `£${Math.round(a.totalIncome).toLocaleString("en-GB")} a month` : ""],
    ["checklist", "Affordability", a.affordabilityPct != null ? `${Math.round(a.affordabilityPct)}%` : ""],
    ["key", "Holding Deposit", a.holdingDepositAmount ? `£${Math.round(a.holdingDepositAmount).toLocaleString("en-GB")}` : ""],
    ["clock", "Received", received(a) ? day(received(a)) : ""],
  ].filter((f): f is [string, string, string] => Boolean(f[2]));

  return (
    <Sheet label={who(a)} onClose={onClose}>
      {a.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={a.image} alt="" className="-mt-1 mb-4 h-[170px] w-full rounded-[20px] object-cover" />
      )}
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="m-title text-[26px] leading-tight">{who(a)}</h2>
        <span className="rounded-full px-2.5 py-[3px] text-[12px] font-medium" style={{ background: t.bg, color: t.ink }}>
          {a.stageLabel ?? a.statusLabel}
        </span>
      </div>
      {where && <p className="mt-1 text-[14.5px] text-muted">{where}</p>}
      {a.rightToRentIncomplete && (
        <p className="mt-3 rounded-[16px] px-4 py-2.5 text-[14px] font-medium" style={{ background: "var(--m-pink-wash)", color: "var(--m-coral)" }}>
          Right to Rent check not finished yet.
        </p>
      )}

      <div className="mt-4 grid grid-cols-4 gap-2">
        {actions.map((x) => {
          const icon = x.icon === "whatsapp" ? <WhatsAppIcon size={22} /> : <DoodleIcon name={x.icon} size={22} />;
          return x.href ? (
            <a key={x.label} href={x.href} target={x.label === "Directions" ? "_blank" : undefined} rel="noreferrer" className="m-press flex flex-col items-center gap-1.5 rounded-[18px] py-3 text-[12.5px] font-medium" style={{ background: "var(--m-card)" }}>
              {icon}
              {x.label}
            </a>
          ) : (
            <span key={x.label} className="flex flex-col items-center gap-1.5 rounded-[18px] py-3 text-[12.5px] font-medium opacity-35" style={{ background: "var(--m-card)" }}>
              {icon}
              {x.label}
            </span>
          );
        })}
      </div>

      {facts.length > 0 && (
        <ul className="m-group mt-4">
          {facts.map(([icon, k, v]) => (
            <li key={k} className="m-row flex items-center gap-3 px-4 py-3.5">
              <DoodleIcon name={icon} size={18} className="text-muted" />
              <span className="w-[44%] shrink-0 text-[14.5px] text-muted">{k}</span>
              <span className="min-w-0 truncate text-[15px] font-medium">{v}</span>
            </li>
          ))}
        </ul>
      )}

      {a.applicants.length > 1 && (
        <>
          <p className="m-eyebrow mb-2 mt-5 px-1">Applicants</p>
          <ul className="m-group">
            {a.applicants.map((p, i) => (
              <li key={p.id ?? `${p.name}-${i}`} className="m-row flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15.5px] font-medium">{p.name}</span>
                  {p.isPrimary && <span className="block text-[12.5px] text-muted">Lead applicant</span>}
                </span>
                {dialable(p.phone ?? "") && (
                  <a href={`tel:${dialable(p.phone ?? "")}`} className="m-btn m-btn-primary m-press !h-9 !px-4 !text-[13.5px]">
                    Call
                  </a>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {a.conditions && (
        <>
          <p className="m-eyebrow mb-2 mt-5 px-1">Conditions</p>
          <p className="whitespace-pre-wrap rounded-[20px] px-4 py-3.5 text-[15px] leading-relaxed" style={{ background: "var(--m-card)" }}>
            {a.conditions}
          </p>
        </>
      )}
    </Sheet>
  );
}
