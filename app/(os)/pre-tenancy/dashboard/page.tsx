"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import DealFeed from "@/components/DealFeed";
import DesktopInstall from "@/components/DesktopInstall";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import PreTenancyHero from "@/components/pretenancy/Hero";
import { whenAgo } from "@/lib/lead-spine";

/**
 * Kirstie's first screen, to James's mock of 12 Sep 2026, simplified.
 *
 * The greeting beside a photograph of the shelf with a handwritten line on
 * it, then five cards: what needs her today (the one pink card), who is
 * moving in this week, what moved, the packs with compliance, and the
 * pipeline in numbers. Green means fine or done; red means late or not
 * ready. Nothing else is coloured, so the colour is the information.
 *
 * Everything is read from /api/pretenancy/dashboard and the feed. Nothing
 * here is a second copy of anything - the feed is the feed, the queue is the
 * queue - so the numbers cannot disagree with the screens they open. Where
 * the OS holds nothing yet (no deals, no packs), the card says so in green,
 * because an empty queue is the good outcome.
 */

interface Data {
  firstName: string;
  byStatus: Record<string, number>;
  deals: number;
  lastSeenAt: string | null;
  queue: { id: string; address: string; agentName: string; submittedAt: string | null; state: string; moveInDate: string | null }[];
  moveIns: { dealId: string; property: string; agentName: string | null; moveIn: string; status: string }[];
}

const STAGE_ORDER = ["Deal started", "Holding fee", "Referencing", "References back", "Out for signing", "Complete"];
const TARGET_HOURS = 48;

/* The two colours that carry state, and nothing else does. */
const GREEN = "bg-[#f1f4ec] text-[#56634a]";
const RED = "bg-[#fdefec] text-[#9d4340]";
const DOT_GREEN = "bg-[#56634a]";
const DOT_RED = "bg-[#c0504a]";

const card = "rounded-[22px] border border-line/70 bg-card";

function greeting(name: string): string {
  const h = new Date().getHours();
  const who = name ? `, ${name}` : "";
  if (h < 12) return `Good morning${who}`;
  if (h < 17) return `Good afternoon${who}`;
  return `Good evening${who}`;
}

function age(iso: string | null): { label: string; over: boolean } {
  if (!iso) return { label: "not submitted", over: false };
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const over = hours > TARGET_HOURS;
  if (hours < 1) return { label: `${Math.max(1, Math.round(hours * 60))} min`, over };
  if (hours < 48) return { label: `${Math.round(hours)} hrs`, over };
  return { label: `${(hours / 24).toFixed(hours / 24 < 10 ? 1 : 0)} days`, over };
}

function daysFromToday(ymd: string): number {
  const d = new Date(`${ymd}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function prettyDay(ymd: string): string {
  const diff = daysFromToday(ymd);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function Head({ icon, title, sub, href, tone = "neutral" }: { icon: string; title: string; sub?: string; href?: string; tone?: "neutral" | "pink" }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone === "pink" ? "bg-white/80 text-[#9d4340]" : "bg-accent-soft text-accent-dark"}`}>
          <DoodleIcon name={icon} size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 pt-1 text-[12px] font-semibold text-muted transition-colors hover:text-ink">
          View all <DoodleIcon name="trend-up" size={11} />
        </Link>
      )}
    </div>
  );
}

function Pill({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold ${tone === "green" ? GREEN : RED}`}>{children}</span>;
}

function Row({ href, dot, title, sub, right }: { href: string; dot?: "green" | "red" | "quiet"; title: string; sub: string; right: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-page">
        {dot && <span className={`h-2 w-2 shrink-0 rounded-full ${dot === "green" ? DOT_GREEN : dot === "red" ? DOT_RED : "bg-line"}`} />}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{title}</span>
          <span className="block text-[12px] leading-snug text-muted">{sub}</span>
        </span>
        {right}
      </Link>
    </li>
  );
}

export default function PreTenancyDashboard() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch("/api/pretenancy/dashboard", { cache: "no-store" })
        .then((r) => r.json())
        .then((j: Data & { ok?: boolean; error?: string }) => {
          if (gone) return;
          if (j.ok === false) setError(j.error ?? "Couldn't read the dashboard.");
          else setData(j);
        })
        .catch(() => !gone && setError("Couldn't read the dashboard."));
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => {
      gone = true;
      clearInterval(t);
    };
  }, []);

  if (!data && !error) return <WorkspaceLoading />;

  const queue = data?.queue ?? [];
  const moveIns = data?.moveIns ?? [];
  const week = moveIns.filter((m) => daysFromToday(m.moveIn) <= 7);

  /* What needs her today: packs past the 48-hour target, and move-ins today
     or tomorrow that are not ready. Both are already on this page in full;
     this is the short list at the top of it. */
  const focus: { href: string; title: string; sub: string; pill: string }[] = [
    ...queue.filter((c) => age(c.submittedAt).over).map((c) => ({
      href: `/pre-tenancy/plc?case=${encodeURIComponent(c.id)}`,
      title: c.address,
      sub: `Pack waiting ${age(c.submittedAt).label} · ${c.agentName}`,
      pill: "Overdue",
    })),
    ...moveIns.filter((m) => daysFromToday(m.moveIn) <= 1 && m.status !== "complete").map((m) => ({
      href: `/pre-tenancy?deal=${encodeURIComponent(m.dealId)}`,
      title: m.property,
      sub: `Not complete · ${m.agentName ?? ""}`.replace(/ · $/, ""),
      pill: daysFromToday(m.moveIn) === 0 ? "Due today" : "Tomorrow",
    })),
  ];

  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5 pb-8">
      {/* ── the greeting, and the shelf ── */}
      <PreTenancyHero
        title={greeting(data?.firstName ?? "")}
        blurb={`What needs you today, who is moving in, and what moved across pre-tenancy.${data?.lastSeenAt ? ` Propoly last looked at ${whenAgo(data.lastSeenAt)}.` : ""}`}
        photo="/brand/photo/commitment.webp"
        line="Great tenancies start with great compliance"
      >
        <p className="flex items-center gap-2 text-[13.5px] text-ink"><DoodleIcon name="calendar" size={15} className="text-accent-dark" />{today}</p>
        <DesktopInstall shortcutHref="/api/pretenancy/feed/shortcut?to=dashboard" />
        {error && <p className="w-full text-[12.5px] text-[#9d4340]">{error}</p>}
      </PreTenancyHero>

      {/* ── today, this week, what moved ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="fade-up flex flex-col rounded-[22px] bg-accent-soft p-5" data-search>
          <Head icon="info" title={focus.length ? `${focus.length} ${focus.length === 1 ? "item needs" : "items need"} your attention` : "Nothing needs you right now"} sub={focus.length ? "Late packs, and move-ins that are not ready." : "Every pack is inside 48 hours and this week's move-ins are ready."} tone="pink" />
          {focus.length > 0 ? (
            <ul className="mt-4 divide-y divide-[#9d4340]/10">
              {focus.slice(0, 5).map((f) => (
                <Row key={f.href} href={f.href} dot="red" title={f.title} sub={f.sub} right={<Pill tone="red">{f.pill}</Pill>} />
              ))}
            </ul>
          ) : (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${GREEN}`}>✓</span>
              <p className="text-[13px] text-ink/80">All clear. The board and the queue are up to date.</p>
            </div>
          )}
          <Link href="/pre-tenancy" className="mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 pt-2.5 text-[13px] font-semibold text-white" style={{ marginTop: "1.25rem" }}>
            Open the board <DoodleIcon name="trend-up" size={13} className="invert" />
          </Link>
        </section>

        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="key" title="Move-ins" sub="Today and the next seven days." href="/pre-tenancy" />
          {week.length === 0 ? (
            <p className="mt-5 text-[13px] text-muted">No move-in dates inside the next seven days.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line/50">
              {week.slice(0, 6).map((m) => (
                <Row
                  key={m.dealId}
                  href={`/pre-tenancy?deal=${encodeURIComponent(m.dealId)}`}
                  dot={m.status === "complete" ? "green" : "red"}
                  title={m.property}
                  sub={m.agentName ?? ""}
                  right={<span className={`figures shrink-0 text-[12px] ${daysFromToday(m.moveIn) <= 1 ? "font-semibold text-ink" : "text-muted"}`}>{prettyDay(m.moveIn)}</span>}
                />
              ))}
            </ul>
          )}
        </section>

        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="bell" title="What moved" sub="Every deal Propoly moved, as it happens." href="/pre-tenancy/feed" />
          <div className="mt-3">
            <DealFeed compact limit={6} />
          </div>
        </section>
      </div>

      {/* ── the packs, and the pipeline ── */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="shield" title="Packs with compliance" sub="Handed over by agents, longest wait first." href="/pre-tenancy/plc" />
          {queue.length === 0 ? (
            <div className="mt-4 flex items-center gap-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${GREEN}`}>✓</span>
              <p className="text-[13px] text-muted">Nothing waiting. Every pack handed over has been decided.</p>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-line/50">
              {queue.slice(0, 6).map((c) => {
                const a = age(c.submittedAt);
                return (
                  <Row
                    key={c.id}
                    href={`/pre-tenancy/plc?case=${encodeURIComponent(c.id)}`}
                    title={c.address}
                    sub={`${c.agentName}${c.moveInDate ? ` · moving in ${prettyDay(c.moveInDate).toLowerCase()}` : ""} · ${c.state}`}
                    right={<Pill tone={a.over ? "red" : "green"}>{a.over ? `${a.label} · past ${TARGET_HOURS} hrs` : a.label}</Pill>}
                  />
                );
              })}
            </ul>
          )}
          {queue.length > 6 && <p className="mt-2 text-[11.5px] text-muted">and {queue.length - 6} more in the queue.</p>}
        </section>

        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="pie" title="Pipeline at a glance" sub="Every live deal, by stage." href="/pre-tenancy" />
          {!data?.deals ? (
            <p className="mt-5 text-[13px] text-muted">The watcher has not seen a deal yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line/50">
              {STAGE_ORDER.filter((s) => data.byStatus[s] != null).map((s) => (
                <li key={s} className="flex items-center gap-4 py-2.5">
                  <span className="figures w-10 text-[24px] font-bold leading-none">{data.byStatus[s]}</span>
                  <span className="text-[13px] text-muted">{s}</span>
                </li>
              ))}
              {data.byStatus["Cancelled"] != null && (
                <li className="flex items-center gap-4 py-2.5 opacity-60">
                  <span className="figures w-10 text-[24px] font-bold leading-none">{data.byStatus["Cancelled"]}</span>
                  <span className="text-[13px] text-muted">Cancelled</span>
                </li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
