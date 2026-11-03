"use client";

// My Business tab: Property Management - every part of managing the homes, in
// one place, across the whole business.
//
// Susan Liles, 3 Nov 2026: "can you add the Property management overview that
// we had before to a tab for me? Similar to what I could see on REX PM where it
// shows every property management function and overview, including Works
// Orders, Rent Reviews, property visits, check outs, etc. At the moment I can
// only see the compliance but need oversight of all other PM tasks too."
//
// Nothing here is counted twice. The boxes read the screens the team works
// from, through the routes those screens already use:
//   - /api/overview?business=1   works orders, visits, renewals, move-outs,
//                                arrears - the Overview board's own read, for
//                                the whole business (lib/overview-access)
//   - /api/section-notices/desk  Section 13s and Section 8s - Michael's list
//   - /api/business/compliance-breakdown  the Compliance tab beside this one
// Each box stands alone: one that fails says so and the rest still draw. Every
// figure opens the list it counts.
//
// Stock, not flow: these are as at today. Only the "this month" figures are
// month-scoped, and they read the clock, so they roll over by themselves.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import OverviewPanel, { useOverviewPanel, type PanelId } from "@/components/portfolio/OverviewPanel";
import type { SeedData } from "@/lib/business/seed-data"; // type-only - erased at build
import { monthLabel } from "@/lib/business/format";
import { liveMonth } from "@/lib/business/roster";
import type { Notice, NoticeKind, NoticeStatus } from "@/lib/section-notices-spec"; // type-only

type Tile<T> = { ok: true; data: T } | { ok: false; error: string };

interface Board {
  ok: boolean;
  error?: string;
  at: string;
  maintenance: Tile<{ open: number; overdue: number; emergencies: number; followUp: number; repairs?: number; planned?: number; partial: string | null }>;
  inspections: Tile<{ due: number; overdue: number; booked: number; awaitingTenant: number }>;
  reviews: Tile<{ due: number; overdue: number; doneThisMonth: number; noticeServed: number }>;
  moveOuts: Tile<{ open: number; overdue: number; next30: number; followUp: number; noDate?: number; doneThisMonth?: number }>;
  arrears: Tile<{ tenants: number; owed: number; largest: number }>;
}

interface Compliance {
  homes: number;
  fullyCompliant: number;
  fullyCompliantPct: number | null;
  withExpired: number;
  withNoRecord: number;
  withDueSoon: number;
  asAt: string;
}

type Bucket = "waiting" | "serve" | "legal" | "returned" | "done";
const BUCKET_OF: Record<NoticeStatus, Bucket | null> = {
  draft: null, withdrawn: null,
  submitted: "waiting", approved: "serve", legal: "legal", returned: "returned", declined: "done", served: "done",
};
interface NoticeCounts {
  waiting: number;
  serve: number;
  legal: number;
  returned: number;
  servedThisMonth: number;
  open: number;
}
type Notices = { s13: NoticeCounts; s8: NoticeCounts; tests: number };

const n = (v: number) => v.toLocaleString("en-GB");
const pounds = (v: number) => `£${Math.round(v).toLocaleString("en-GB")}`;
/** The UK month an instant falls in, as YYYY-MM. */
const londonMonth = (d: Date | string) => new Date(d).toLocaleDateString("en-CA", { timeZone: "Europe/London" }).slice(0, 7);

/* A figure is either a link to a screen or opens one of the Overview's boards
   in the pop-out (Inspections, Tenancy Reviews, Move-outs live only there). */
type Go = { href: string } | { panel: PanelId; focus?: string };

/** Read a route and hand back its JSON, or the reason it couldn't be read. */
async function readJson<T>(url: string, what: string): Promise<Tile<T>> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || j.ok === false) return { ok: false, error: (j && typeof j.error === "string" && j.error) || `${what} didn't answer (${r.status}).` };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, error: `${what} didn't answer.` };
  }
}

function countNotices(list: Notice[]): Notices {
  const blank = (): NoticeCounts => ({ waiting: 0, serve: 0, legal: 0, returned: 0, servedThisMonth: 0, open: 0 });
  const out: Notices = { s13: blank(), s8: blank(), tests: 0 };
  const thisMonth = londonMonth(new Date());
  for (const x of list) {
    /* Test files are on Michael's list with a Test badge; they are not the business. */
    if (x.test) { out.tests++; continue; }
    const c = out[x.kind as NoticeKind];
    if (!c) continue;
    const b = BUCKET_OF[x.status];
    if (!b) continue;
    if (b === "done") {
      if (x.status === "served" && x.servedAt && londonMonth(x.servedAt) === thisMonth) c.servedThisMonth++;
      continue;
    }
    c[b]++;
    c.open++;
  }
  return out;
}

export default function PropertyManagementTab({ month }: { month: string; seed?: SeedData | null }) {
  const [board, setBoard] = useState<Tile<Board> | null>(null);
  const [notices, setNotices] = useState<Tile<Notices> | null>(null);
  const [compliance, setCompliance] = useState<Tile<Compliance> | null>(null);
  const asked = useRef(0);

  const load = useCallback(() => {
    const ask = ++asked.current;
    const land = <T,>(set: (t: Tile<T> | null) => void) => (t: Tile<T>) => { if (ask === asked.current) set(t); };
    setBoard(null);
    setNotices(null);
    setCompliance(null);
    void readJson<Board>("/api/overview?business=1", "The property management figures").then(land(setBoard));
    void readJson<{ notices: Notice[] }>("/api/section-notices/desk", "The Section 8 and 13 list")
      .then((t): Tile<Notices> => (t.ok ? { ok: true, data: countNotices(t.data.notices ?? []) } : t))
      .then(land(setNotices));
    void readJson<Compliance>("/api/business/compliance-breakdown", "Compliance").then(land(setCompliance));
  }, []);
  useEffect(load, [load]);

  /* Re-read once a board in the pop-out closes, so a review recorded or a
     visit booked there shows on its box (as the Overview page does). */
  const { panel, open, closeNow } = useOverviewPanel();
  const hadPanel = useRef(false);
  useEffect(() => {
    if (panel) hadPanel.current = true;
    else if (hadPanel.current) { hadPanel.current = false; load(); }
  }, [panel, load]);

  /* One box's answer: still reading, the board's own failure, or its tile. */
  const tile = <K extends keyof Board>(k: K) => (!board ? undefined : board.ok ? board.data[k] : board) as Board[K] | undefined;

  const go = (g: Go) => ("panel" in g ? { onClick: () => open(g.panel, g.focus) } : { href: g.href });

  return (
    <div className="space-y-6">
      {month !== liveMonth() ? (
        <div className="rounded-2xl border border-line bg-card px-4 py-3 text-[13px] text-muted">
          Everything on this tab is <strong>as at today</strong>, not {monthLabel(month)}. These are the lists as they stand now, so a past month can&apos;t be rebuilt.
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <h2 className="text-sm font-semibold">Every Home We Manage</h2>
          <span className="text-[11px] text-muted">
            Live from the screens the team works from · press any figure to see the list
            {board?.ok ? ` · read ${new Date(board.data.at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}` : ""}
            {" · "}
            <button type="button" onClick={load} className="underline underline-offset-2 hover:text-ink">Read again</button>
          </span>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <Box icon="setting" title="Works Orders" tile={tile("maintenance")} open={go({ href: "/maintenance" })}>
            {(d) => (
              <>
                <Big value={d.open} label="open jobs" to={go({ href: "/maintenance" })} />
                <Figures items={[
                  ["Overdue", n(d.overdue), go({ href: "/maintenance" }), d.overdue > 0],
                  ["Emergencies", n(d.emergencies), go({ href: "/maintenance" }), d.emergencies > 0],
                  ["Follow up due", n(d.followUp), go({ href: "/maintenance" }), d.followUp > 0],
                  ...(d.repairs != null ? [["Repairs", n(d.repairs), go({ href: "/maintenance" })] as Fig] : []),
                  ...(d.planned != null ? [["Planned jobs", n(d.planned), go({ href: "/maintenance?section=planned" })] as Fig] : []),
                ]} />
                {d.partial ? <p className="mt-3 text-[11px] text-red-700">{d.partial}</p> : null}
              </>
            )}
          </Box>

          <Box icon="search" title="Property Visits" tile={tile("inspections")} open={go({ panel: "inspections" })}>
            {(d) => (
              <>
                <Big value={d.due} label="inspections due" to={go({ panel: "inspections" })} />
                <Figures items={[
                  ["Overdue", n(d.overdue), go({ panel: "inspections" }), d.overdue > 0],
                  ["Booked in", n(d.booked), go({ panel: "inspections", focus: "booked" })],
                  ["Awaiting tenant", n(d.awaitingTenant), go({ panel: "inspections", focus: "awaiting" })],
                ]} />
              </>
            )}
          </Box>

          <Box icon="file-contract" title="Renewals" tile={tile("reviews")} open={go({ panel: "tenancy-reviews" })}>
            {(d) => (
              <>
                <Big value={d.due} label="tenancy reviews to do" to={go({ panel: "tenancy-reviews" })} />
                <Figures items={[
                  ["Overdue", n(d.overdue), go({ panel: "tenancy-reviews" }), d.overdue > 0],
                  ["Notice given", n(d.noticeServed), go({ panel: "tenancy-reviews" })],
                  ["Done this month", n(d.doneThisMonth), go({ panel: "tenancy-reviews" })],
                ]} />
              </>
            )}
          </Box>

          <NoticeBox kind="s13" title="Rent Reviews - Section 13" icon="coin" tile={notices} />
          <NoticeBox kind="s8" title="Notices - Section 8" icon="doc" tile={notices} />

          <Box icon="key" title="Check-outs & Move-outs" tile={tile("moveOuts")} open={go({ panel: "move-outs" })}>
            {(d) => (
              <>
                <Big value={d.open} label="tenancies ending" to={go({ panel: "move-outs" })} />
                <Figures items={[
                  ["Overdue", n(d.overdue), go({ panel: "move-outs" }), d.overdue > 0],
                  ["Next 30 days", n(d.next30), go({ panel: "move-outs" })],
                  ...(d.noDate != null ? [["No date yet", n(d.noDate), go({ panel: "move-outs" })] as Fig] : []),
                  ["Follow up due", n(d.followUp), go({ panel: "move-outs" }), d.followUp > 0],
                  ...(d.doneThisMonth != null ? [["Closed this month", n(d.doneThisMonth), go({ panel: "move-outs" })] as Fig] : []),
                ]} />
              </>
            )}
          </Box>

          <Box icon="wallet" title="Rent Arrears" tile={tile("arrears")} open={go({ href: "/company-figures/arrears" })}>
            {(d) => (
              <>
                <Big value={d.tenants} label="tenants behind on rent" to={go({ href: "/company-figures/arrears" })} />
                <Figures items={[
                  ["Owed", pounds(d.owed), go({ href: "/company-figures/arrears" }), d.owed > 0],
                  ["Largest", pounds(d.largest), go({ href: "/company-figures/arrears" })],
                ]} />
              </>
            )}
          </Box>

          <Box icon="shield" title="Compliance" tile={compliance ?? undefined} open={go({ href: "/company-figures/compliance" })}>
            {(d) => (
              <>
                <Big
                  value={d.fullyCompliantPct}
                  suffix="%"
                  label={`fully compliant - ${n(d.fullyCompliant)} of ${n(d.homes)} homes`}
                  to={go({ href: "/company-figures/compliance" })}
                />
                <Figures items={[
                  ["Expired", n(d.withExpired), go({ href: "/compliance" }), d.withExpired > 0],
                  ["Missing", n(d.withNoRecord), go({ href: "/compliance" }), d.withNoRecord > 0],
                  ["Due in 30 days", n(d.withDueSoon), go({ href: "/compliance" })],
                ]} />
                <p className="mt-3 text-[11px] text-muted">Homes with at least one certificate in each state.</p>
              </>
            )}
          </Box>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">How These Are Counted</h2>
        <ul className="list-disc space-y-1 pl-5 text-[12px] leading-relaxed text-muted">
          <li>Works orders include the jobs still being finished in the old system until somebody takes them on here.</li>
          <li>Property visits and renewals follow the old system&rsquo;s own task lists until the team books and records them here; the board says when that list was last copied across.</li>
          <li>A check-out is ticked off on the move-out when the tenant leaves, so it is counted with the move-outs rather than on its own.</li>
          <li>Section 13s and Section 8s are the ones agents have sent to compliance. Drafts an agent hasn&rsquo;t sent yet are not counted.</li>
          <li>Homes let only and rent collection are the landlord&rsquo;s to run, so they are left out of visits, renewals and compliance.</li>
        </ul>
      </section>

      <OverviewPanel panel={panel} onClose={closeNow} />
    </div>
  );
}

/* ------------------------------------------------------------------------ */

type Act = { href: string } | { onClick: () => void };
type Fig = [label: string, value: string, to: Act, hot?: boolean];

function Press({ to, className, label, children }: { to: Act; className: string; label: string; children: React.ReactNode }) {
  return "href" in to ? (
    <Link href={to.href} className={className} aria-label={label}>{children}</Link>
  ) : (
    <button type="button" onClick={to.onClick} className={`${className} text-left`} aria-label={label}>{children}</button>
  );
}

function Box<T>({ icon, title, tile, open, children }: { icon: string; title: string; tile: Tile<T> | undefined | null; open: Act; children: (d: T) => React.ReactNode }) {
  return (
    <div className="card flex h-full min-w-0 flex-col p-5">
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name={icon} size={15} />
        </span>
        <h3 className="min-w-0 truncate text-[15px] text-ink">{title}</h3>
        <Press to={open} label={`Open ${title}`} className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40">
          View all
        </Press>
      </div>
      <div className="mt-4 flex-1">
        {!tile ? (
          <div className="flex items-center gap-2 text-[12.5px] text-muted" aria-busy="true">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-transparent" aria-hidden />
            Reading the figures
          </div>
        ) : !tile.ok ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-[12.5px] text-red-800">
            <span className="font-semibold">Couldn&rsquo;t be read.</span> {tile.error}
          </p>
        ) : (
          children(tile.data)
        )}
      </div>
    </div>
  );
}

function Big({ value, label, to, suffix = "" }: { value: number | null; label: string; to: Act; suffix?: string }) {
  const shown = value == null ? "-" : `${value.toLocaleString("en-GB")}${suffix}`;
  return (
    <Press to={to} label={`${shown} ${label}. Show them.`} className="group block">
      <span className="stat-value stat-value--big block underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-ink/40">{shown}</span>
      <span className="mt-1 block text-xs text-muted">{label}</span>
    </Press>
  );
}

function Figures({ items }: { items: Fig[] }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-1 border-t border-line/60 pt-3 text-[12.5px] sm:grid-cols-3">
      {items.map(([label, value, to, hot]) => (
        <Press key={label} to={to} label={`${label}: ${value}. Show them.`} className="group -mx-1 min-w-0 rounded-md px-1 py-1 transition-colors hover:bg-accent-soft/40">
          <dt className="break-words text-[11px] leading-tight text-muted">{label}</dt>
          <dd className={`tnum font-semibold underline decoration-line underline-offset-4 group-hover:decoration-ink ${hot ? "text-red-700" : "text-ink"}`}>{value}</dd>
        </Press>
      ))}
    </dl>
  );
}

function NoticeBox({ kind, title, icon, tile }: { kind: NoticeKind; title: string; icon: string; tile: Tile<Notices> | null }) {
  const at = (bucket?: Bucket) => ({ href: `/compliance-desk/sections?kind=${kind}${bucket ? `&bucket=${bucket}` : ""}` });
  const mine: Tile<Notices> | undefined = tile ?? undefined;
  return (
    <Box icon={icon} title={title} tile={mine} open={at()}>
      {(all) => {
        const d = all[kind];
        return (
          <>
            <Big value={d.open} label={kind === "s13" ? "rent increase notices in hand" : "possession notices in hand"} to={at()} />
            <Figures items={[
              ["To decide", n(d.waiting), at("waiting"), d.waiting > 0],
              ...(kind === "s8" ? [["Legal review", n(d.legal), at("legal")] as Fig] : []),
              ["To serve", n(d.serve), at("serve"), d.serve > 0],
              ["With the agent", n(d.returned), at("returned")],
              ["Served this month", n(d.servedThisMonth), at("done")],
            ]} />
            {all.tests > 0 && kind === "s8" ? (
              <p className="mt-3 text-[11px] text-muted">{n(all.tests)} test {all.tests === 1 ? "file is" : "files are"} left out of both boxes.</p>
            ) : null}
          </>
        );
      }}
    </Box>
  );
}
