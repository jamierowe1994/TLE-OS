"use client";

import { useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import WorksOrderModal, { type OrderTarget } from "@/components/WorksOrder";
import ComplianceDrawer from "@/components/ComplianceDrawer";
import { Pill, FlowTag } from "@/components/Wire";
import { PressButton } from "@/components/Bits";
import {
  BIG_THREE, CERT_META, COMP_BOOK, dueWithin, headlineCerts, statusOf,
  type CertKey, type CertStatus, type CompProperty,
} from "@/lib/compliance";

/**
 * Compliance — the page that keeps every home legal and every tenant safe.
 *
 * The order of the page IS the priority order of the job:
 *   1. THE NEXT MONTH: everything expired or expiring inside 30 days, each
 *      with the button that fixes it (a works order to the right trade).
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
  const [ordering, setOrdering] = useState<OrderTarget | null>(null);
  /** key = `${propertyId}:${cert}` */
  const [orders, setOrders] = useState<Record<string, { contractor: string; when: string }>>({});
  const [reminded, setReminded] = useState<Set<string>>(new Set());

  const urgent = useMemo(() => dueWithin(30), []);

  // Per-property worst status, for the tiles and the filter.
  const graded = useMemo(
    () =>
      COMP_BOOK.map((p) => {
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
    []
  );

  const counts = {
    expired: graded.filter((g) => g.worst === "expired").length,
    urgent: graded.filter((g) => g.worst === "urgent").length,
    missing: graded.filter((g) => g.worst === "missing").length,
    ok: graded.filter((g) => g.worst === "ok" || g.worst === "watch").length,
  };

  const book = graded.filter(({ p, worst }) => {
    if (query && !`${p.name} ${p.locality} ${p.landlord}`.toLowerCase().includes(query.toLowerCase()))
      return false;
    if (filter === "all") return true;
    if (filter === "ok") return worst === "ok" || worst === "watch";
    return worst === filter;
  });

  const open = COMP_BOOK.find((p) => p.id === openId) ?? null;

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
        blurb="Every certificate on every home, and the button that fixes each one. The big three — electrical, gas, EPC — lead, because they're the safety law."
        illustration="/illustrations/notioly/home-caring.svg"
        lineBreak="dip"
      />

      {/* ── The four counts. Each is also the filter for the book below. ── */}
      <div className="mt-10 grid grid-cols-2 gap-4 xl:grid-cols-4">
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
          <FlowTag from="REX compliance entries" />
        </div>
        {urgent.length ? (
          <ul className="divide-y divide-line/40">
            {urgent.map(({ p, key, cert, status }) => {
              const ok = `${p.id}:${key}`;
              const order = orders[ok];
              const days = cert?.expires ?? null;
              return (
                <li key={ok} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
                  {/* The number the whole row is about. */}
                  <span className="w-[74px] shrink-0 text-center">
                    <span
                      className={`figures block text-[22px] leading-none ${
                        status === "expired" ? "text-accent-dark" : ""
                      }`}
                    >
                      {status === "expired" ? Math.abs(days!) : days}
                    </span>
                    <span className="block text-[9px] font-semibold uppercase tracking-wide text-muted">
                      {status === "expired" ? "days over" : "days left"}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => setOpenId(p.id)}
                    className="min-w-[190px] flex-1 text-left transition-opacity hover:opacity-70"
                  >
                    <span className="hand block text-[13.5px]">{p.name}</span>
                    <span className="block text-[10.5px] text-muted">
                      {CERT_META[key].label} · landlord {p.landlord}
                      {p.tenant ? ` · access via ${p.tenant}` : " · vacant, keys held"}
                    </span>
                  </button>

                  <span className="flex shrink-0 items-center gap-2">
                    {order ? (
                      <Pill tone="good">Order out — {order.contractor.split(" (")[0]}, {order.when}</Pill>
                    ) : (
                      <PressButton
                        onClick={() =>
                          setOrdering({ property: p, cert: key })
                        }
                        className="press-ring flex items-center gap-1.5 rounded-full bg-accent-dark px-4 py-2 text-[11.5px] font-semibold text-page"
                      >
                        <DoodleIcon name="setting" size={13} />
                        Book the {CERT_META[key].trade}
                      </PressButton>
                    )}
                    <button
                      type="button"
                      onClick={() => setReminded((cur) => new Set(cur).add(ok))}
                      disabled={reminded.has(ok)}
                      className={`rounded-full border px-3.5 py-2 text-[11px] font-semibold transition-colors ${
                        reminded.has(ok)
                          ? "cursor-default border-line/60 text-muted"
                          : "border-ink/25 hover:border-ink"
                      }`}
                    >
                      {reminded.has(ok) ? "Landlord told ✓" : "Tell the landlord"}
                    </button>
                  </span>
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
                <th className="pb-2">Landlord</th>
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
                  <td className="whitespace-nowrap py-3 text-[12px] text-muted">{p.landlord}</td>
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
        onClose={() => setOpenId(null)}
        orders={orders}
        onOrder={(t) => setOrdering(t)}
      />

      <WorksOrderModal
        target={ordering}
        onClose={() => setOrdering(null)}
        onRaised={(t, contractor, when) => {
          setOrders((cur) => ({ ...cur, [`${t.property.id}:${t.cert}`]: { contractor, when } }));
          setOrdering(null);
        }}
      />
    </>
  );
}
