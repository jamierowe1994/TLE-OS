"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import DoodleIcon from "@/components/DoodleIcon";
import OverviewPanel, { useOverviewPanel } from "@/components/portfolio/OverviewPanel";
import { useNewLook } from "@/lib/use-new-look";
import { Mast, Badge, Ico } from "@/components/new-look/Parts";
import { Stat, Meter, Card as NlCard, Failed, Loading, Spin } from "@/components/new-look/backoffice/Bits";
import RecordsDrawer, { type PmRecordKind, type RecordAsk } from "@/components/new-look/dashboard/RecordsDrawer";
import { CountUp } from "@/components/new-look/dashboard/Charts";

/**
 * Overview (1 Oct 2026): property management at a glance, one tile per part
 * of the job, laid out the way the old system's dashboard is so the team
 * finds things where they expect them. Every figure comes from
 * /api/overview, which reads each screen's own route, so a tile always
 * agrees with the page it opens. A tile that cannot be read says so; the
 * rest still draw.
 *
 * James, 21 Oct 2026: Inspections, Tenancy Reviews and Move-outs came off the
 * Portfolio menu and are "hidden within the Overview tab". Their tiles
 * (Upcoming Vacancies is the Move-outs list) open the whole board in a pop-out
 * here rather than navigating - see components/portfolio/OverviewPanel.
 */

type Tile<T> = { ok: true; data: T } | { ok: false; error: string };
interface Board {
  ok: boolean;
  error?: string;
  at: string;
  /** Whole business for Michael and the owners; everyone else, their own homes. */
  scope?: { whole: boolean; label: string };
  properties: Tile<{ managed: number; avgRent: number; landlords: number; rentRoll: number; occupied: number | null; vacant: number | null; upcoming: number | null }>;
  maintenance: Tile<{ open: number; overdue: number; emergencies: number; followUp: number; late: { title: string; where: string; dueOn: string | null }[]; partial: string | null }>;
  inspections: Tile<{ due: number; overdue: number; booked: number; awaitingTenant: number }>;
  reviews: Tile<{ due: number; overdue: number; doneThisMonth: number; noticeServed: number; leaving: { where: string; agreement: string }[] }>;
  moveOuts: Tile<{ open: number; overdue: number; next30: number; followUp: number; next: { where: string; on: string | null }[] }>;
  compliance: Tile<{ expired: number; dueSoon: number; homesAffected: number }>;
  applications: Tile<{ open: number; movingIn: number }>;
  lettings: Tile<{ available: number; letAgreed: number; drafts: number }>;
  arrears: Tile<{ tenants: number; owed: number; largest: number }>;
}

const pounds = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "–");
/** £194,833 → "£194.8k": a tile has room for the size of a number, not every digit of it. */
const compact = (n: number) => (n >= 10000 ? `£${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : pounds(n));
const shortDay = (ymd: string | null) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

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
  const { panel, open, closeNow } = useOverviewPanel();
  /* Re-read the tiles once a board closes (by Esc, the button or Back), so a
     review recorded or a visit booked in the pop-out shows on its tile. */
  const hadPanel = useRef(false);
  useEffect(() => {
    if (panel) hadPanel.current = true;
    else if (hadPanel.current) { hadPanel.current = false; load(); }
  }, [panel, load]);
  const look = useNewLook("overview");

  /* ── THE NEW LOOK (lib/new-look "overview", 23 Oct 2026) ──────────────────
     The same /api/overview read, the same pop-outs and links, drawn as the
     design's Overview: four figures across the top, occupancy and what is
     coming up beside it, then a card per part of the job. */
  if (look === null) {
    return <p className="flex items-center gap-2 py-16 text-[12.5px] text-muted"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />Opening Overview…</p>;
  }
  if (look) {
    return <OverviewNew data={data} error={error} reload={() => { setData(null); setError(null); load(); }} open={open} panel={<OverviewPanel panel={panel} onClose={closeNow} />} />;
  }

  return (
    <>
      <PageHeader
        title="Overview"
        blurb="Your homes at a glance: what is late, what is coming up, and where to go next. Every figure is live from the screen it opens."
      />

      {error && <p className="mt-6 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{error}</p>}
      {!data && !error && (
        <p className="mt-6 flex items-center gap-2 text-[12.5px] text-muted">
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
          Reading every board… the first look of the day can take half a minute.
        </p>
      )}

      {data?.scope && (
        <p className="mt-6 flex items-center gap-2 text-[12px] text-muted">
          <DoodleIcon name={data.scope.whole ? "grid" : "user"} size={14} className="text-accent-dark" />
          {data.scope.whole ? "Showing every home across the business." : "Showing the homes on your own book."}
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card icon="home" title="Properties" href="/portfolio" tile={data?.properties}>
          {(d) => (
            <>
              <Big value={d.managed} label="homes we manage" />
              {/* Tenanted, vacant and becoming vacant are the old system's own
                  Tenancy Status, read across with its managed list (2 Oct 2026).
                  Before that read, REX only knows whether a tenant's name is on
                  file, which reads half the book as empty - so no figure. */}
              {d.occupied != null ? (
                <Stats items={[
                  ["Tenanted", pct(d.occupied, d.managed)],
                  ["Becoming vacant", String(d.upcoming ?? 0), (d.upcoming ?? 0) > 0],
                  ["Vacant", String(d.vacant ?? 0), (d.vacant ?? 0) > 0],
                ]} />
              ) : (
                <Stats items={[
                  ["Landlords", String(d.landlords)],
                  ["Rent roll a month", compact(d.rentRoll)],
                  ["Average rent", pounds(d.avgRent)],
                ]} />
              )}
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

        <Card icon="search" title="Inspections" onOpen={() => open("inspections")} tile={data?.inspections}>
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

        <Card icon="file-contract" title="Tenancy Reviews" onOpen={() => open("tenancy-reviews")} tile={data?.reviews}>
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

        <Card icon="key" title="Upcoming Vacancies" onOpen={() => open("move-outs")} tile={data?.moveOuts && data?.lettings ? combine(data.moveOuts, data.lettings) : undefined}>
          {(d) => (
            <>
              <Big value={d.open} label="tenancies ending - the move-outs list" />
              <Stats items={[
                ["Overdue", String(d.overdue), d.overdue > 0],
                ["Next 30 days", String(d.next30)],
                ["On the market", String(d.available)],
                ["Let agreed", String(d.letAgreed)],
              ]} />
              <Rows rows={d.next.map((l) => [l.where, "", l.on ? shortDay(l.on) : ""])} empty="No move-out days ahead." />
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

      <OverviewPanel panel={panel} onClose={closeNow} />
    </>
  );
}

/** Upcoming vacancies needs the move-outs and the lettings figures; it fails if either does. */
function combine(
  m: Board["moveOuts"],
  l: Board["lettings"]
): Tile<{ open: number; overdue: number; next30: number; next: { where: string; on: string | null }[]; available: number; letAgreed: number }> {
  if (!m.ok) return m;
  if (!l.ok) return l;
  return { ok: true, data: { ...m.data, available: l.data.available, letAgreed: l.data.letAgreed } };
}

/**
 * One tile. `href` navigates to the screen it comes from; `onOpen` (21 Oct
 * 2026) opens the board in the Overview's pop-out instead, and then the whole
 * tile is the button, not only View all.
 */
function Card<T>({ icon, title, href, onOpen, openLabel = "View all", tile, quiet, children }: { icon: string; title: string; href?: string; onOpen?: () => void; openLabel?: string; tile: Tile<T> | undefined; quiet?: boolean; children: (d: T) => React.ReactNode }) {
  const pill = "ml-auto shrink-0 whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[11px] font-semibold transition-colors hover:border-ink/40";
  return (
    <section
      onClick={onOpen}
      className={`flex min-w-0 flex-col rounded-[22px] border border-line/50 bg-white p-5 ${onOpen ? "cursor-pointer transition-colors hover:border-ink/30" : ""}`}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
          <DoodleIcon name={icon} size={15} />
        </span>
        <h2 className="min-w-0 truncate text-[15px]">{title}</h2>
        {onOpen ? (
          <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(); }} className={pill}>
            {openLabel}
          </button>
        ) : href ? (
          <Link href={href} className={pill}>
            {openLabel}
          </Link>
        ) : null}
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

/* ── The new look ───────────────────────────────────────────────────────── */

type PanelId = Parameters<ReturnType<typeof useOverviewPanel>["open"]>[0];

function OverviewNew({ data, error, reload, open, panel }: { data: Board | null; error: string | null; reload: () => void; open: (id: PanelId) => void; panel: React.ReactNode }) {
  const p = data?.properties;
  const a = data?.arrears;
  const pd = p?.ok ? p.data : null;
  const ad = a?.ok ? a.data : null;
  const tileErr = (t: Tile<unknown> | undefined) => (t && !t.ok ? t.error : null);
  const reading = !data && !error;
  const vac = data?.moveOuts && data?.lettings ? combine(data.moveOuts, data.lettings) : undefined;

  /* The figure lists (James, 25 Oct 2026: "they should all be clickable tiles,
     and they should open out"): the records behind a figure in the front
     dashboard's pop-out (app/api/overview/records), and the three boards that
     already open here (inspections, reviews, move-outs) as they always did. */
  const [ask, setAsk] = useState<RecordAsk | null>(null);
  const list = (kind: PmRecordKind, title: string, figure: number, columns: [string, string, string, string, string], board: { href: string; label: string }, note: string, empty: string, drift = true) => () =>
    setAsk({ kind, endpoint: "/api/overview/records", title, figure, range: data?.scope ? (data.scope.whole ? "Every home" : "Your homes") : "Now", note, board, columns, empty, drift });
  const md = data?.maintenance?.ok ? data.maintenance.data : null;
  const ind = data?.inspections?.ok ? data.inspections.data : null;
  const rd = data?.reviews?.ok ? data.reviews.data : null;
  const mo = data?.moveOuts?.ok ? data.moveOuts.data : null;
  const cd = data?.compliance?.ok ? data.compliance.data : null;
  const apd = data?.applications?.ok ? data.applications.data : null;
  const ld = data?.lettings?.ok ? data.lettings.data : null;
  const state = (t: Tile<unknown> | undefined) => ({ loading: reading || (!t && !error), error: error ? "Couldn't be read just now" : tileErr(t) });

  return (
    <div data-look="new" className="nl-page nl-rise nl-bo nl-pm">
      <Mast
        eyebrow={data?.scope ? (data.scope.whole ? "Every home across the business" : "The homes on your own book") : "Back office"}
        title="PM Dashboard"
        blurb="Your homes at a glance: what is late, what is coming up, and where to go next. Press any figure to see what is behind it."
      />

      {error && <Failed onRetry={reload}>{error}</Failed>}

      <PmRow title="The Book" sub="The managed homes, who is in them, and the rent they bring.">
        <PmTile label="Managed homes" {...state(p)} value={pd?.managed ?? null}
          sub={pd ? `for ${pd.landlords.toLocaleString("en-GB")} landlord${pd.landlords === 1 ? "" : "s"}` : null}
          strip={pd && pd.occupied != null ? [pd.occupied, (pd.vacant ?? 0) + (pd.upcoming ?? 0)] : null}
          onOpen={pd ? list("managed", "Managed Homes", pd.managed, ["Landlord", "Home", "Let since", "Service", "Tenants"], { href: "/portfolio", label: "Open Portfolio" }, "Every home on the book, A to Z, Let Only and Rent Collect included. The figure on the tile counts homes as property management does.", "No managed homes on the book.", false) : undefined} />
        <PmTile label="Occupancy" {...state(p)} value={pd && pd.occupied != null && pd.managed > 0 ? Math.round((pd.occupied / pd.managed) * 100) : null} suffix="%"
          badge={pd && (pd.vacant ?? 0) > 0 ? { text: `${pd.vacant} vacant`, tone: "warn" } : null}
          sub={pd ? (pd.occupied != null ? `${pd.upcoming ?? 0} becoming vacant` : "tenancy status not read yet") : null}
          strip={pd && pd.occupied != null ? [pd.occupied, pd.vacant ?? 0] : null}
          onOpen={() => open("move-outs")} />
        <PmTile label="Rent roll" {...state(p)} value={pd?.rentRoll ?? null} money
          sub={pd ? `a month · average ${pounds(pd.avgRent)}` : null}
          onOpen={pd ? list("managed", "Managed Homes", pd.managed, ["Landlord", "Home", "Let since", "Service", "Tenants"], { href: "/portfolio", label: "Open Portfolio" }, "Every home on the book, A to Z.", "No managed homes on the book.", false) : undefined} />
        <PmTile label="Arrears" {...state(a)} value={ad?.owed ?? null} money
          badge={ad && ad.tenants > 0 ? { text: `${ad.tenants} tenant${ad.tenants === 1 ? "" : "s"}`, tone: "warn" } : null}
          sub={ad ? (ad.tenants > 0 ? `behind · largest ${pounds(ad.largest)}` : "nobody behind on rent") : null}
          onOpen={ad ? list("arrears", "Arrears", ad.tenants, ["Tenant", "Home", "Last invoice", "", "Owed"], { href: "/finances", label: "Open Finances" }, "Tenants behind on rent, most owed first.", "Nobody is behind on rent.") : undefined} />
      </PmRow>

      <PmRow title="The Work" sub="Jobs, visits and the tenancies that need something doing.">
        <PmTile label="Maintenance" {...state(data?.maintenance)} value={md?.open ?? null}
          badge={md && md.overdue > 0 ? { text: `${md.overdue} overdue`, tone: "warn" } : null}
          sub={md ? `${md.emergencies} emergenc${md.emergencies === 1 ? "y" : "ies"} · ${md.followUp} to follow up` : null}
          strip={md ? [md.open - md.overdue, md.overdue] : null}
          onOpen={md ? list("maintenance", "Open Jobs", md.open, ["Job", "Home", "Due", "Urgency", "Status"], { href: "/maintenance", label: "Open Maintenance" }, "Overdue first, then by when they're due.", "No open jobs.") : undefined} />
        <PmTile label="Inspections due" {...state(data?.inspections)} value={ind?.due ?? null}
          badge={ind && ind.overdue > 0 ? { text: `${ind.overdue} overdue`, tone: "warn" } : null}
          sub={ind ? `${ind.booked} booked · ${ind.awaitingTenant} waiting on the tenant` : null}
          strip={ind ? [ind.due - ind.overdue, ind.overdue] : null}
          onOpen={() => open("inspections")} />
        <PmTile label="Tenancy reviews" {...state(data?.reviews)} value={rd?.due ?? null}
          badge={rd && rd.overdue > 0 ? { text: `${rd.overdue} overdue`, tone: "warn" } : null}
          sub={rd ? `${rd.noticeServed} notice served · ${rd.doneThisMonth} done this month` : null}
          strip={rd ? [rd.due - rd.overdue, rd.overdue] : null}
          onOpen={() => open("tenancy-reviews")} />
        <PmTile label="Move-outs" {...state(data?.moveOuts)} value={mo?.open ?? null}
          badge={mo && mo.overdue > 0 ? { text: `${mo.overdue} overdue`, tone: "warn" } : null}
          sub={mo ? `${mo.next30} in the next 30 days` : null}
          strip={mo ? [mo.open - mo.overdue, mo.overdue] : null}
          onOpen={() => open("move-outs")} />
      </PmRow>

      <PmRow title="Compliance and Lettings" sub="Certificates, and the homes on their way to a tenant.">
        <PmTile label="Certificates expired" {...state(data?.compliance)} value={cd?.expired ?? null}
          badge={cd && cd.dueSoon > 0 ? { text: `${cd.dueSoon} due in 30 days`, tone: "warn" } : null}
          sub={cd ? `on ${cd.homesAffected} home${cd.homesAffected === 1 ? "" : "s"}` : null}
          strip={cd ? [cd.dueSoon, cd.expired] : null}
          onOpen={cd ? list("compliance", "Certificates", cd.expired + cd.dueSoon, ["Certificate", "Home", "Expires", "Landlord", "Status"], { href: "/compliance", label: "Open Compliance" }, "Expired first, then the ones due in the next 30 days.", "Nothing expired or due.") : undefined} />
        <PmTile label="Applications" {...state(data?.applications)} value={apd?.open ?? null}
          sub={apd ? `${apd.movingIn} moving in` : null}
          onOpen={apd ? list("applications", "Open Applications", apd.open, ["Applicants", "Home", "Received", "", "Status"], { href: "/applications", label: "Open Applications" }, "Newest first.", "No open applications.") : undefined} />
        <PmTile label="On the market" {...state(data?.lettings)} value={ld?.available ?? null}
          sub={ld ? `${ld.letAgreed} let agreed · ${ld.drafts} drafts` : null}
          onOpen={ld ? list("market", "On the Market", ld.available, ["Rent", "Home", "Live since", "", "Status"], { href: "/listings", label: "Open Listings" }, "Longest on the market first.", "Nothing on the market.") : undefined} />
        <PmTile label="Let agreed" {...state(data?.lettings)} value={ld?.letAgreed ?? null} sub={ld ? "on their way to a move-in" : null} href="/applications" />
      </PmRow>

      <div className="nl-bo-g2 nl-pm-cards">
        <NlCard title="Occupancy" aside={<Link href="/portfolio" className="nl-link nl-bo-aside">Portfolio</Link>}>
          {!p ? (
            <Loading>Reading the book…</Loading>
          ) : !p.ok ? (
            <p className="nl-bo-err">{p.error}</p>
          ) : p.data.occupied == null ? (
            <p className="nl-meta">Tenanted and vacant come from the tenancy status, which has not been read yet.</p>
          ) : (
            <div className="nl-bo-meters">
              <Meter label="Tenanted" n={p.data.occupied} of={p.data.managed} />
              <Meter label="Vacant" n={p.data.vacant ?? 0} of={p.data.managed} quiet hot={(p.data.vacant ?? 0) > 0} />
              <Meter label="Becoming vacant" n={p.data.upcoming ?? 0} of={p.data.managed} quiet />
            </div>
          )}
        </NlCard>

        <NlCard
          title="Upcoming Vacancies"
          onClick={() => open("move-outs")}
          aside={<button type="button" className="nl-link nl-bo-aside" onClick={(e) => { e.stopPropagation(); open("move-outs"); }}>View all</button>}
        >
          {!vac ? (
            <Loading>Reading the move-outs…</Loading>
          ) : !vac.ok ? (
            <p className="nl-bo-err">{vac.error}</p>
          ) : vac.data.next.length === 0 ? (
            <p className="nl-meta">No move-out days ahead.</p>
          ) : (
            <ul className="nl-bo-list">
              {vac.data.next.map((l, i) => (
                <li key={i}>
                  <span className="nl-strong min-w-0 flex-1 truncate">{l.where}</span>
                  <span className="nl-meta shrink-0">{l.on ? shortDay(l.on) : ""}</span>
                </li>
              ))}
            </ul>
          )}
        </NlCard>
      </div>

      {data && (
        <p className="nl-meta mt-8 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Read at {new Date(data.at).toLocaleTimeString("en-GB", { timeZone: "Europe/London", hour: "2-digit", minute: "2-digit" })}.</span>
          <button type="button" onClick={reload} className="nl-link">Read again</button>
        </p>
      )}

      <RecordsDrawer ask={ask} onClose={() => setAsk(null)} />
      {panel}
    </div>
  );
}

/** A row of figures under its heading, the front dashboard's way. */
function PmRow({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <section className="nl-pm-row">
      <div className="nl-dash-bar-h">
        <div>
          <h2 className="nl-dash-h2">{title}</h2>
          <p className="nl-dash-bar-sub">{sub}</p>
        </div>
      </div>
      <div className="nl-dash-stats">{children}</div>
    </section>
  );
}

/**
 * One figure, drawn as the front dashboard's are: label and badge, the number
 * counting up, what it means, and a strip of what is fine against what is
 * late. Pressing it opens what is behind it; a figure that wasn't read is a
 * dash with the reason, and opens nothing.
 */
function PmTile({
  label, value, loading, error, sub, badge, strip, money, suffix, onOpen, href,
}: {
  label: string; value: number | null; loading: boolean; error: string | null; sub?: React.ReactNode; badge?: { text: string; tone: "warn" | "up" | "flat" } | null;
  strip?: [number, number] | null; money?: boolean; suffix?: string; onOpen?: () => void; href?: string;
}) {
  const ready = !loading && !error && value != null;
  const body = (
    <>
      <span className="nl-dash-stat-top">
        <span>{label}</span>
        {ready && badge && <em className={`nl-dash-badge is-${badge.tone}`}>{badge.text}</em>}
      </span>
      {loading ? (
        <span className="nl-dash-skel" aria-label="Loading"><i /></span>
      ) : !ready ? (
        <>
          <b className="nl-dash-stat-n is-off">-</b>
          <span className="nl-dash-stat-sub nl-dash-warn">{error ?? "Couldn't be read just now"}</span>
        </>
      ) : (
        <>
          <b className="nl-dash-stat-n">
            <CountUp value={value!} format={(n) => (money ? compact(n) : `${Math.round(n).toLocaleString("en-GB")}${suffix ?? ""}`)} />
          </b>
          <span className="nl-dash-stat-sub">{sub}</span>
          {strip && strip[0] + strip[1] > 0 && (
            <span className="nl-dash-strip" aria-hidden>
              <i className="is-ok" style={{ flexGrow: Math.max(0, strip[0]) }} />
              <i className="is-late" style={{ flexGrow: Math.max(0, strip[1]) }} />
            </span>
          )}
        </>
      )}
    </>
  );
  if (ready && onOpen) return <button type="button" className="nl-dash-stat" onClick={onOpen} aria-label={`${label}. Show them.`}>{body}</button>;
  if (ready && href) return <Link href={href} className="nl-dash-stat">{body}</Link>;
  return <div className="nl-dash-stat is-still">{body}</div>;
}

/** One part of the job: its figure, its counts, and where it opens. */
function Part<T>({ title, href, onOpen, tile, children }: { title: string; href?: string; onOpen?: () => void; tile: Tile<T> | undefined; children: (d: T) => React.ReactNode }) {
  return (
    <NlCard
      title={title}
      className="nl-bo-part"
      onClick={onOpen}
      aside={
        onOpen ? (
          <button type="button" className="nl-link nl-bo-aside" onClick={(e) => { e.stopPropagation(); onOpen(); }}>View all</button>
        ) : href ? (
          <Link href={href} className="nl-link nl-bo-aside">View all <Ico name="arrow" size={13} /></Link>
        ) : null
      }
    >
      {!tile ? (
        <p className="nl-bo-fig is-reading"><Spin /> <span className="nl-meta">reading…</span></p>
      ) : !tile.ok ? (
        <p className="nl-bo-err">{tile.error}</p>
      ) : (
        children(tile.data)
      )}
    </NlCard>
  );
}

function Fig({ n, label, hot }: { n: number; label: string; hot?: boolean }) {
  return (
    <p className={`nl-bo-fig${hot ? " is-hot" : ""}`}>
      {n.toLocaleString("en-GB")}
      <span className="nl-meta"> {label}</span>
    </p>
  );
}

function MiniFact({ k, v, hot }: { k: string; v: number; hot?: boolean }) {
  return (
    <div className="min-w-0">
      <span>{k}</span>
      <b className={hot ? "is-hot" : ""}>{v.toLocaleString("en-GB")}</b>
    </div>
  );
}
