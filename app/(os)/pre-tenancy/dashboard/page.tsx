"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import DealFeed, { popOutFeed } from "@/components/DealFeed";
import DesktopInstall from "@/components/DesktopInstall";
import { Pill } from "@/components/Wire";
import { whenAgo } from "@/lib/lead-spine";

/**
 * Kirstie's first screen.
 *
 * James, 5 Sep: "when she logs in, the first thing she'll have is the
 * dashboard, rather than the deal started" - the board is where she works a
 * deal; this is where she sees what needs working. Four things, each one a
 * door: what moved (the feed, live), the packs with compliance and how long
 * they have waited, the deals by stage, and who is moving in this fortnight.
 * Nothing here is a second copy of anything - the feed is the feed, the
 * queue is the queue - so the numbers cannot disagree with the screens they
 * open.
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

function prettyDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

function Card({ title, icon, action, children }: { title: string; icon: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="fade-up flex min-h-[220px] flex-col rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          <DoodleIcon name={icon} size={14} className="text-accent-dark" />
          {title}
        </p>
        {action}
      </div>
      <div className="mt-3 min-h-0 flex-1">{children}</div>
    </section>
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

  const overdue = (data?.queue ?? []).filter((c) => age(c.submittedAt).over).length;

  /* The workspace strips the shell's padding so the ported board can own
     the window; this page is not the board, so it carries its own margins,
     and starts below the pill strip rather than under it. */
  return (
    <div className="mx-auto max-w-6xl px-5 pb-16 pt-4 sm:px-8 lg:pt-14">
      <PageHeader
        title={greeting(data?.firstName ?? "")}
        blurb={
          data?.lastSeenAt
            ? `What moved, what is waiting on you, and who is moving in. Propoly last looked at ${whenAgo(data.lastSeenAt)}.`
            : "What moved, what is waiting on you, and who is moving in."
        }
        search={false}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <DesktopInstall shortcutHref="/api/pretenancy/feed/shortcut?to=dashboard" />
            <Link
              href="/pre-tenancy"
              className="flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page"
            >
              <DoodleIcon name="checklist" size={14} />
              Open the board
            </Link>
          </span>
        }
      />

      {error && <p className="mt-4 text-[12.5px] text-red-700">{error}</p>}

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* ── what moved ── */}
        <Card
          title="What moved"
          icon="bell"
          action={
            <span className="flex items-center gap-3 text-[11px] font-medium text-muted">
              <button type="button" onClick={popOutFeed} className="hover:text-ink">
                Pop out
              </button>
              <Link href="/pre-tenancy/feed" className="hover:text-ink">
                The full feed
              </Link>
            </span>
          }
        >
          <DealFeed compact limit={10} />
        </Card>

        {/* ── the packs ── */}
        <Card
          title="Packs with compliance"
          icon="shield"
          action={
            <Link href="/pre-tenancy/plc" className="text-[11px] font-medium text-muted hover:text-ink">
              The queue
            </Link>
          }
        >
          {!data ? (
            <p className="text-[12px] text-muted">Reading…</p>
          ) : !data.queue.length ? (
            <p className="text-[12.5px] text-muted">Nothing waiting. Every pack handed over has been decided.</p>
          ) : (
            <>
              <p className="text-[12px] text-muted">
                {data.queue.length} waiting
                {overdue > 0 && <span className="text-rose-600"> · {overdue} past {TARGET_HOURS} hours</span>}
              </p>
              <ul className="mt-2 divide-y divide-line/50">
                {data.queue.slice(0, 6).map((c) => {
                  const a = age(c.submittedAt);
                  return (
                    <li key={c.id}>
                      <Link href={`/pre-tenancy/plc?case=${encodeURIComponent(c.id)}`} className="flex items-center gap-3 py-2 transition-colors hover:text-accent-dark">
                        <span className={`figures w-16 shrink-0 text-[12px] ${a.over ? "font-semibold text-rose-600" : "text-muted"}`}>{a.label}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[12.5px]">{c.address}</span>
                          <span className="block text-[10.5px] text-muted">
                            {c.agentName}
                            {c.moveInDate ? ` · moving in ${prettyDay(c.moveInDate)}` : ""}
                          </span>
                        </span>
                        <Pill tone={c.state === "reviewing" ? "accent" : "neutral"}>{c.state}</Pill>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {data.queue.length > 6 && (
                <p className="mt-2 text-[11px] text-muted">and {data.queue.length - 6} more in the queue.</p>
              )}
            </>
          )}
        </Card>

        {/* ── the deals by stage ── */}
        <Card
          title="Deals by stage"
          icon="checklist"
          action={
            <Link href="/pre-tenancy" className="text-[11px] font-medium text-muted hover:text-ink">
              The board
            </Link>
          }
        >
          {!data ? (
            <p className="text-[12px] text-muted">Reading…</p>
          ) : !data.deals ? (
            <p className="text-[12.5px] text-muted">The watcher has not seen a deal yet.</p>
          ) : (
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {STAGE_ORDER.filter((s) => data.byStatus[s] != null).map((s) => (
                <li key={s} className="rounded-xl border border-line/70 bg-card px-3 py-2.5">
                  <span className="figures block text-[20px] leading-none">{data.byStatus[s]}</span>
                  <span className="mt-1 block text-[11px] text-muted">{s}</span>
                </li>
              ))}
              {data.byStatus["Cancelled"] != null && (
                <li className="rounded-xl border border-dashed border-line/70 px-3 py-2.5 opacity-70">
                  <span className="figures block text-[20px] leading-none">{data.byStatus["Cancelled"]}</span>
                  <span className="mt-1 block text-[11px] text-muted">Cancelled</span>
                </li>
              )}
            </ul>
          )}
        </Card>

        {/* ── moving in ── */}
        <Card title="Moving in this fortnight" icon="key">
          {!data ? (
            <p className="text-[12px] text-muted">Reading…</p>
          ) : !data.moveIns.length ? (
            <p className="text-[12.5px] text-muted">No move-in dates inside the next fourteen days.</p>
          ) : (
            <ul className="divide-y divide-line/50">
              {data.moveIns.slice(0, 8).map((m) => (
                <li key={m.dealId}>
                  <Link href={`/pre-tenancy?deal=${encodeURIComponent(m.dealId)}`} className="flex items-center gap-3 py-2 transition-colors hover:text-accent-dark">
                    <span className="figures w-24 shrink-0 text-[12px] text-muted">{prettyDay(m.moveIn)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px]">{m.property}</span>
                      <span className="block text-[10.5px] text-muted">{m.agentName ?? ""}</span>
                    </span>
                    <span className={`text-[10.5px] ${m.status === "complete" ? "text-emerald-700" : "text-amber-600"}`}>
                      {m.status === "complete" ? "ready" : "not complete"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
