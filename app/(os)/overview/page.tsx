"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Overview (1 Oct 2026): property management at a glance, one tile per part
 * of the job, laid out the way the old system's dashboard is so the team
 * finds things where they expect them. Every figure comes from
 * /api/overview, which reads each screen's own route, so a tile always
 * agrees with the page it opens. A tile that cannot be read says so; the
 * rest still draw.
 */

type Tile<T> = { ok: true; data: T } | { ok: false; error: string };
interface Board {
  ok: boolean;
  error?: string;
  at: string;
  properties: Tile<{ managed: number; avgRent: number; landlords: number; rentRoll: number }>;
  maintenance: Tile<{ open: number; overdue: number; emergencies: number; followUp: number; late: { title: string; where: string; dueOn: string | null }[]; partial: string | null }>;
  inspections: Tile<{ due: number; overdue: number; booked: number; awaitingTenant: number }>;
  reviews: Tile<{ due: number; overdue: number; doneThisMonth: number; noticeServed: number; leaving: { where: string; agreement: string }[] }>;
  compliance: Tile<{ expired: number; dueSoon: number; homesAffected: number }>;
  applications: Tile<{ open: number; movingIn: number }>;
  lettings: Tile<{ available: number; letAgreed: number; drafts: number }>;
  arrears: Tile<{ tenants: number; owed: number; largest: number }>;
}

const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
/** £194,833 → "£194.8k": a tile has room for the size of a number, not every digit of it. */
const compact = (n: number) => (n >= 10000 ? `£${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : pounds(n));
const shortDay = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");
const endsText = (a: string) => {
  const m = a.match(/expires (.+)$/i);
  return m ? `ends ${m[1]}` : a.split(" | ")[0];
};

export default function Overview() {
  const [data, setData] = useState<Board | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/overview", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => { if (j.ok) { setData(j); setError(null); } else setError(j.error ?? "The overview couldn't be read."); })
      .catch(() => setError("The overview couldn't be read."));
  }, []);
  useEffect(load, [load]);

  return (
    <>
      <PageHeader
        title="Overview"
        blurb="Everything across the managed book at a glance: what is late, what is coming up, and where to go next. Every figure is live from the screen it opens."
        illustration="/illustrations/street.webp"
        hideArtOnPhone
        illustrationHeight={150}
        illustrationAspect={3.11}
        lineBreak="none"
      />

      {error && <p className="mt-6 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {!data && !error && (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading every board… the first look of the day can take half a minute.
        </p>
      )}

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card icon="home" title="Properties" href="/portfolio" tile={data?.properties}>
          {(d) => (
            <>
              <Big value={d.managed} label="homes we manage" />
              {/* No "tenanted" figure: REX only knows whether a tenant's name is
                  on file, which reads half the book as empty. Nothing in the
                  OS records an empty home yet. */}
              <Stats items={[
                ["Landlords", String(d.landlords)],
                ["Rent roll a month", compact(d.rentRoll)],
                ["Average rent", pounds(d.avgRent)],
              ]} />
            </>
          )}
        </Card>

        <Card icon="setting" title="Maintenance" href="/maintenance" tile={data?.maintenance}>
          {(d) => (
            <>
              <Big value={d.open} label="open jobs" />
              <Stats items={[
                ["Overdue", String(d.overdue), d.overdue > 0],
                ["Follow up", String(d.followUp), d.followUp > 0],
                ["Emergencies", String(d.emergencies), d.emergencies > 0],
              ]} />
              <Rows rows={d.late.map((l) => [l.title, l.where, l.dueOn ? `due ${shortDay(l.dueOn)}` : ""])} empty="Nothing late." />
              {d.partial && <p className="mt-2 text-[10.5px] text-accent-dark">{d.partial}</p>}
            </>
          )}
        </Card>

        <Card icon="search" title="Inspections" href="/inspections" tile={data?.inspections}>
          {(d) => (
            <>
              <Big value={d.due} label="visits due" />
              <Stats items={[
                ["Overdue", String(d.overdue), d.overdue > 0],
                ["Booked in", String(d.booked)],
                ["Waiting on tenant", String(d.awaitingTenant)],
              ]} />
            </>
          )}
        </Card>

        <Card icon="file-contract" title="Tenancy Reviews" href="/tenancy-reviews" tile={data?.reviews}>
          {(d) => (
            <>
              <Big value={d.due} label="to review" />
              <Stats items={[
                ["Overdue", String(d.overdue), d.overdue > 0],
                ["Notice served", String(d.noticeServed)],
                ["Done this month", String(d.doneThisMonth)],
              ]} />
            </>
          )}
        </Card>

        <Card icon="shield" title="Compliance" href="/compliance" tile={data?.compliance}>
          {(d) => (
            <>
              <Big value={d.expired} label="certificates expired" hot={d.expired > 0} />
              <Stats items={[
                ["Due in 30 days", String(d.dueSoon), d.dueSoon > 0],
                ["Homes affected", String(d.homesAffected)],
              ]} />
            </>
          )}
        </Card>

        <Card icon="key" title="Upcoming Vacancies" href="/tenancy-reviews" tile={data?.reviews && data?.lettings ? combine(data.reviews, data.lettings) : undefined}>
          {(d) => (
            <>
              <Big value={d.noticeServed} label="tenancies with notice served" />
              <Stats items={[
                ["On the market", String(d.available)],
                ["Let agreed", String(d.letAgreed)],
              ]} />
              <Rows rows={d.leaving.map((l) => [l.where, endsText(l.agreement), ""])} empty="No notices served." />
            </>
          )}
        </Card>

        <Card icon="user" title="Applications" href="/applications" tile={data?.applications}>
          {(d) => (
            <>
              <Big value={d.open} label="open applications" />
              <Stats items={[["Moving in", String(d.movingIn)]]} />
            </>
          )}
        </Card>

        <Card icon="megaphone" title="Lettings" href="/listings" tile={data?.lettings}>
          {(d) => (
            <>
              <Big value={d.available} label="homes on the market" />
              <Stats items={[
                ["Let agreed", String(d.letAgreed)],
                ["Drafts", String(d.drafts)],
              ]} />
            </>
          )}
        </Card>

        <Card icon="coin" title="Rent Arrears" href="/finances" tile={data?.arrears} quiet>
          {(d) => (
            <>
              <Big value={d.tenants} label="tenants behind on rent" hot={d.tenants > 0} />
              <Stats items={[
                ["Owed", compact(d.owed), d.owed > 0],
                ["Largest", pounds(d.largest)],
              ]} />
            </>
          )}
        </Card>
      </div>

      {data && (
        <p className="mt-6 text-[11px] text-muted">
          Read at {new Date(data.at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}.{" "}
          <button type="button" onClick={() => { setData(null); load(); }} className="underline transition-colors hover:text-ink">Read again</button>
        </p>
      )}
    </>
  );
}

/** Upcoming vacancies needs two tiles' figures; it fails if either does. */
function combine(
  r: Board["reviews"],
  l: Board["lettings"]
): Tile<{ noticeServed: number; leaving: { where: string; agreement: string }[]; available: number; letAgreed: number }> {
  if (!r.ok) return r;
  if (!l.ok) return l;
  return { ok: true, data: { noticeServed: r.data.noticeServed, leaving: r.data.leaving, available: l.data.available, letAgreed: l.data.letAgreed } };
}

function Card<T>({ icon, title, href, tile, quiet, children }: { icon: string; title: string; href: string; tile: Tile<T> | undefined; quiet?: boolean; children: (d: T) => React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name={icon} size={15} />
        </span>
        <h2 className="text-[15px]">{title}</h2>
        <Link href={href} className="ml-auto shrink-0 whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40">
          View all
        </Link>
      </div>
      <div className="mt-4 flex-1">
        {!tile ? (
          <>
            <p className="figures text-[34px] leading-none text-muted">•</p>
            <p className="mt-1 text-[11.5px] text-muted">reading…</p>
          </>
        ) : !tile.ok ? (
          <p className={`text-[12px] ${quiet ? "text-muted" : "rounded-xl bg-accent-soft/50 p-3 text-accent-dark"}`}>{tile.error}</p>
        ) : (
          children(tile.data)
        )}
      </div>
    </section>
  );
}

function Big({ value, label, hot }: { value: number; label: string; hot?: boolean }) {
  return (
    <>
      <p className={`figures text-[34px] leading-none ${hot ? "text-accent-dark" : ""}`}>{value.toLocaleString("en-GB")}</p>
      <p className="mt-1 text-[11.5px] text-muted">{label}</p>
    </>
  );
}

function Stats({ items }: { items: ([string, string] | [string, string, boolean])[] }) {
  return (
    <dl className="mt-4 grid grid-cols-3 gap-2 border-t border-line/60 pt-3">
      {items.map(([k, v, hot]) => (
        <div key={k} className="min-w-0">
          <dt className="break-words text-[9.5px] font-bold uppercase leading-tight tracking-wider text-muted">{k}</dt>
          <dd className={`figures mt-0.5 truncate text-[16px] ${hot ? "text-accent-dark" : ""}`}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Rows({ rows, empty }: { rows: [string, string, string][]; empty: string }) {
  if (rows.length === 0) return <p className="mt-3 text-[11px] text-muted">{empty}</p>;
  return (
    <ul className="mt-3 space-y-1.5">
      {rows.map(([a, b, c], i) => (
        <li key={i} className="flex items-baseline gap-2 text-[11.5px]">
          <span className="min-w-0 flex-1 truncate">
            <span className="font-semibold">{a}</span>
            {b ? <span className="text-muted"> · {b}</span> : null}
          </span>
          {c ? <span className="shrink-0 text-[10.5px] text-accent-dark">{c}</span> : null}
        </li>
      ))}
    </ul>
  );
}
