"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ico, Mast } from "@/components/new-look/Parts";
import FloatSheet, { FloatCard, FloatCardHead, FloatFoot } from "@/components/new-look/FloatSheet";
import ExcelButton from "@/components/ExcelButton";
import { DOC_ACCEPT } from "@/lib/doc-types";
import { ACTIONS, GAP_LABEL as GAP, POSITION_LABEL as POSITION, type ActionKey, type Gap, type Position } from "@/lib/deposit-words";

/**
 * Admin > Compliance > Deposits (Susan, 18 Nov 2026, for the annual
 * Propertymark audit): every let home's deposit in one place, what is still
 * missing, and the place to fill it in. Read live from /api/admin/deposits
 * (lib/deposit-audit); nothing here is a copy.
 *
 * Five views over one register:
 *   To Do     - the gaps, grouped in the order Susan's own update put them
 *   Register  - every home, filterable, the audit's deposit register
 *   By Agent  - who still has gaps, and deposits in a leaver's Flatfair branch
 *   By Scheme - the totals Propertymark asks for
 *   Flatfair Only - live Flatfair deposits no home on the book claims
 * A row opens the home's deposit: each value with where it came from, the
 * live Flatfair record, the certificate files, and the fields to fill.
 *
 * Mark as Complete (Michael, 23 Nov 2026): a flagged home nothing more can
 * be done on is signed off with a reason. It leaves To Do, is listed under
 * Complete with a Note, and comes back if something new comes up.
 */

type Val = { value: string | null; source: string | null; at: string | null; by: string | null };
type Flat = {
  id: number; status: string; product: string; provider: string | null; type: string | null; ref: string | null;
  amount: number | null; start: string | null; branch: string | null; managedBy: string | null; piSigned: boolean; regCert: boolean;
  branchLeft?: boolean | null;
};
type Row = {
  id: string; address: string; postcode: string | null; country: "England" | "Scotland" | "Wales";
  service: "managed" | "let_only" | "rent_collect" | "unknown"; paypropNo: string | null;
  agent: string | null; agentLeft: boolean | null; landlord: string | null; tenants: string | null; tenancyStart: string | null;
  position: Position; heldByTle: boolean; status: string | null; ref: string | null; amount: number | null;
  protectedOn: string | null; piServedOn: string | null; piEvidence: "date" | "flatfair" | "file" | null; protectBy: string | null; certOnFile: boolean;
  registeredBy: string | null; notes: string | null;
  values: Partial<Record<"status" | "ref" | "amount" | "protectedOn" | "piServedOn" | "cert" | "registeredBy" | "notes", Val>>;
  flatfair: Flat | null; otherFlats: Flat[]; alsoRecords: { id: string; status: string | null }[];
  newLet: boolean; fromFlatfair: ("ref" | "amount" | "position")[];
  gaps: Gap[]; action: ActionKey | null; done: boolean; lastChecked: { at: string; by: string | null } | null;
  /** What the home is flagged for, signed off or not; action is null once a sign-off covers it. */
  flagged: ActionKey | null;
  signOff: { by: string | null; at: string; reason: string; holds: boolean; since: Gap[] } | null;
};
/** Marked complete by a person, and nothing new has come up since. */
const signed = (r: Row) => Boolean(r.signOff?.holds);
type Unmatched = { id: number; address: string; postcode: string | null; product: string; status: string; ref: string | null; amount: number | null; start: string | null; branch: string | null; branchLeft: boolean | null };
type Data = { at: string; flatfairAt: string | null; recordAt: string | null; leaversKnown: boolean; leavers: string[]; rows: Row[]; unmatched: Unmatched[]; choices: string[] };

/* Where a sum of deposits means money held in a scheme. A no-deposit plan's
   figure is Flatfair's cover, and an archived or not-found home's is whatever
   was last written down: totalling them would read as money we hold. */
const MONEY_HELD = new Set<Position>(["tle_tds", "tle_mds", "landlord_scheme", "transfer"]);
const SERVICE: Record<Row["service"], string> = { managed: "Fully managed", let_only: "Let only", rent_collect: "Rent collect", unknown: "Not recorded" };

type View = "todo" | "register" | "agents" | "schemes" | "flatfair";
const VIEWS: { id: View; label: string }[] = [
  { id: "todo", label: "To Do" },
  { id: "register", label: "Register" },
  { id: "agents", label: "By Agent" },
  { id: "schemes", label: "By Scheme" },
  { id: "flatfair", label: "Flatfair Only" },
];

const gbp = (n: number | null | undefined) => {
  if (n == null) return "-";
  const r = Math.round(n * 100) / 100;
  return `£${r.toLocaleString("en-GB", { minimumFractionDigits: r % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
};
/** A total: whole pounds. */
const gbp0 = (n: number) => `£${Math.round(n).toLocaleString("en-GB")}`;
const day = (s: string | null | undefined) => (s ? new Date(`${s.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-");
const ago = (s: string | null) => {
  if (!s) return "never";
  const mins = Math.round((Date.now() - new Date(s).getTime()) / 60000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins} minutes ago`;
  return new Date(s).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
};
/** The postcode, unless the address already ends with it. */
const pcIfNew = (r: { address: string; postcode: string | null }) =>
  r.postcode && !r.address.replace(/\s+/g, "").toUpperCase().includes(r.postcode.replace(/\s+/g, "").toUpperCase()) ? r.postcode : null;
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const tone = (p: Position) =>
  p === "not_found" || p === "check" ? "bad" : p === "transfer" ? "warn" : p === "tle_tds" || p === "tle_mds" ? "good" : "quiet";

export default function DepositsNew() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("todo");
  const [search, setSearch] = useState("");
  const [country, setCountry] = useState<"all" | "England" | "Scotland">("all");
  const [service, setService] = useState<"all" | "managed" | "let_only">("all");
  const [position, setPosition] = useState<"all" | Position>("all");
  const [agent, setAgent] = useState<string>("all");
  const [onlyGaps, setOnlyGaps] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/deposits", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j?.ok) throw new Error(j?.error ?? "The deposit register couldn't be read just now.");
      setData(j as Data);
    } catch (e) {
      const why = e instanceof Error ? e.message : "The deposit register couldn't be read just now.";
      /* Never leave older figures on show under a failure (the live-only rule),
         not even after a save: the save itself has landed. */
      setError(quiet ? `Your change saved, but the register couldn't be re-read. ${why}` : why);
      setData(null);
      setOpenId(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const rows = data?.rows ?? [];
  const agents = useMemo(() => [...new Set(rows.map((r) => r.agent?.trim() || "No agent on record"))].sort(), [rows]);

  const shown = useMemo(() => {
    const t = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (country !== "all" && r.country !== country) return false;
      if (service !== "all" && r.service !== service) return false;
      if (position !== "all" && r.position !== position) return false;
      if (agent !== "all" && (r.agent?.trim() || "No agent on record") !== agent) return false;
      if (onlyGaps && !r.action) return false;
      if (t && ![r.address, r.postcode, r.ref, r.landlord, r.tenants, r.agent, r.paypropNo].some((v) => (v ?? "").toLowerCase().includes(t))) return false;
      return true;
    });
  }, [rows, search, country, service, position, agent, onlyGaps]);

  const figs = useMemo(() => {
    const held = rows.filter((r) => r.heldByTle);
    return {
      homes: rows.length,
      done: rows.filter((r) => !r.action).length,
      todo: rows.filter((r) => r.action).length,
      urgent: rows.filter((r) => r.action === "urgent").length,
      signed: rows.filter(signed).length,
      heldN: held.length,
      heldGbp: held.reduce((s, r) => s + (r.amount ?? 0), 0),
      newLets: rows.filter((r) => r.newLet).length,
    };
  }, [rows]);

  const filtersLine = [
    country !== "all" && country, service !== "all" && SERVICE[service], position !== "all" && POSITION[position],
    agent !== "all" && agent, onlyGaps && "With something to do", search.trim() && `Search "${search.trim()}"`,
  ].filter(Boolean).join(", ");

  const open = rows.find((r) => r.id === openId) ?? null;
  const failed = !loading && !data;

  return (
    <div data-look="new">
      <div className="nl-page nl-rise nl-dep">
        <Mast
          eyebrow="Compliance"
          title="Deposits"
          blurb={
            loading && !data
              ? "Reading every let home's deposit..."
              : data
                ? <>Every let home&rsquo;s deposit for the Propertymark audit: where it&rsquo;s protected, the reference, the amount, the date and the certificate. Flatfair read {ago(data.flatfairAt)}. Scotland and landlords&rsquo; own schemes have no live feed, so they show what the team last recorded here.</>
                : "Every let home's deposit for the Propertymark audit."
          }
          actions={
            <ExcelButton
              href="/api/export/deposits"
              disabled={!data || !shown.length}
              body={() => ({ homes: shown.map((r) => r.id), filters: filtersLine })}
              label="Download the Register"
            />
          }
        />

        <div className="nl-dep-tiles" aria-busy={loading}>
          <Tile label="Let Homes" value={figs.homes} note="On the book now" loading={loading} failed={failed} />
          <Tile label="Complete" value={figs.done} note={data ? `${pct(figs.done, figs.homes)}% need nothing more${figs.signed ? `, ${figs.signed} with a note` : ""}` : "Nothing more needed"} loading={loading} failed={failed} tone="sage" onClick={() => { setView("register"); setOnlyGaps(false); }} />
          <Tile label="To Do" value={figs.todo} note={`${figs.urgent} urgent`} loading={loading} failed={failed} tone={figs.urgent ? "accent" : undefined} onClick={() => setView("todo")} />
          <Tile label="Held by TLE" value={gbp0(figs.heldGbp)} note={`${figs.heldN} deposits in TDS and mydeposits`} loading={loading} failed={failed} />
        </div>

        {error && (
          <div className="nl-dep-fail" role="alert">
            <p className="nl-block-title">The Deposit Register Didn&rsquo;t Load</p>
            <p className="nl-meta">{error} Nothing is shown rather than an old figure.</p>
            <button type="button" onClick={() => load()} className="nl-btn nl-btn--secondary nl-btn--sm">Try again</button>
          </div>
        )}

        {loading && !data && (
          <p className="nl-dep-wait"><span className="nl-adm-spin" aria-hidden /> Reading the register, Flatfair and each home&rsquo;s record</p>
        )}

        {data && (
          <>
            <div className="nl-tabs nl-adm-chips nl-dep-views" role="tablist" aria-label="View">
              {VIEWS.map((v) => (
                <button key={v.id} type="button" role="tab" aria-selected={view === v.id} onClick={() => setView(v.id)} className={`nl-tab${view === v.id ? " is-on" : ""}`}>
                  {v.label}
                  <span className="nl-tab-n">
                    {v.id === "todo" ? figs.todo : v.id === "register" ? rows.length : v.id === "flatfair" ? data.unmatched.length : v.id === "agents" ? agents.length : ""}
                  </span>
                </button>
              ))}
            </div>

            {view !== "flatfair" && view !== "schemes" && (
              <div className="nl-filters nl-dep-filters">
                <label className="nl-fsearch">
                  <Ico name="search" size={15} />
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Address, postcode, reference, landlord or tenant" aria-label="Search" />
                </label>
                <Sel label="Country" value={country} onChange={(v) => setCountry(v as typeof country)} options={[["all", "England and Scotland"], ["England", "England"], ["Scotland", "Scotland"]]} />
                <Sel label="Service" value={service} onChange={(v) => setService(v as typeof service)} options={[["all", "Every service"], ["managed", "Fully managed"], ["let_only", "Let only"]]} />
                <Sel label="Agent" value={agent} onChange={setAgent} options={[["all", "Every agent"], ...agents.map((a) => [a, a] as [string, string])]} />
                {view === "register" && (
                  <>
                    <Sel label="Where it is" value={position} onChange={(v) => setPosition(v as typeof position)} options={[["all", "Wherever it is"], ...(Object.keys(POSITION) as Position[]).map((p) => [p, POSITION[p]] as [string, string])]} />
                    <label className="nl-dep-check">
                      <input type="checkbox" checked={onlyGaps} onChange={(e) => setOnlyGaps(e.target.checked)} /> Only with something to do
                    </label>
                  </>
                )}
              </div>
            )}

            {view === "todo" && <TodoView rows={shown} onOpen={setOpenId} />}
            {view === "register" && <RegisterView rows={shown} total={rows.length} onOpen={setOpenId} />}
            {view === "agents" && <AgentView rows={shown} unmatched={data.unmatched} leaversKnown={data.leaversKnown} leavers={data.leavers} onPick={(a) => { setAgent(a); setView("register"); }} />}
            {view === "schemes" && <SchemeView rows={rows} />}
            {view === "flatfair" && <FlatfairView list={data.unmatched} />}
          </>
        )}
      </div>

      {open && data && (
        <HomeSheet
          key={open.id}
          row={open}
          choices={data.choices}
          onClose={() => setOpenId(null)}
          onSaved={() => load(true)}
        />
      )}
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────── */

function Tile({ label, value, note, loading, failed, tone, onClick }: {
  label: string; value: number | string; note: string; loading: boolean; failed: boolean; tone?: "sage" | "accent"; onClick?: () => void;
}) {
  const inner = (
    <>
      <span className="nl-dep-tile-label">{label}</span>
      {loading ? <span className="nl-dep-skel" aria-label="Loading" /> : <b className="nl-dep-fig">{failed ? "-" : typeof value === "number" ? value.toLocaleString("en-GB") : value}</b>}
      <span className="nl-dep-tile-note">{loading || failed ? " " : note}</span>
    </>
  );
  const cls = `nl-dep-tile${tone && !loading && !failed ? ` is-${tone}` : ""}`;
  return onClick ? <button type="button" className={cls} onClick={onClick}>{inner}</button> : <div className={cls}>{inner}</div>;
}

function Sel({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <span className={`nl-fsel${value !== "all" ? " is-set" : ""}`}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </span>
  );
}

function Where({ r }: { r: Row }) {
  return <span className={`nl-dep-where is-${tone(r.position)}`}>{POSITION[r.position]}</span>;
}

const BAD_GAPS = new Set<Gap>(["late", "unfunded", "no_record", "wrong_plan", "flat_live", "dup_ref", "ref_elsewhere"]);

function Gaps({ r }: { r: Row }) {
  if (!r.gaps.length) return <span className="nl-meta">Nothing missing</span>;
  return (
    <span className="nl-dep-gaps">
      {r.gaps.map((g) => <span key={g} className={`nl-dep-gap${BAD_GAPS.has(g) ? " is-bad" : ""}`}>{GAP[g]}</span>)}
    </span>
  );
}

/* ── Views ──────────────────────────────────────────────────────────── */

function TodoView({ rows, onOpen }: { rows: Row[]; onOpen: (id: string) => void }) {
  const groups = ACTIONS.map((a) => ({ ...a, rows: rows.filter((r) => r.action === a.key) })).filter((g) => g.rows.length);
  const signedOff = rows.filter(signed);
  if (!groups.length && !signedOff.length) return <p className="nl-empty nl-dep-empty">Nothing to do on the homes shown. Every deposit is accounted for.</p>;
  return (
    <div className="nl-dep-groups">
      {!groups.length && <p className="nl-empty nl-dep-empty">Nothing to do on the homes shown.</p>}
      {groups.map((g, i) => (
        <section key={g.key} className="nl-dep-group">
          <h2 className="nl-section-title nl-dep-h">
            <span className="nl-dep-n">{i + 1}</span> {g.title} <span className="nl-count">{g.rows.length}</span>
          </h2>
          <p className="nl-meta nl-dep-says">{g.says}</p>
          <ul className="nl-dep-list">
            {g.rows.map((r) => (
              <li key={r.id}>
                <button type="button" className="nl-dep-item" onClick={() => onOpen(r.id)}>
                  <span className="nl-dep-item-main">
                    <b>{r.address}</b>
                    <span className="nl-meta">
                      {[pcIfNew(r), r.agent, r.landlord ? `Landlord ${r.landlord}` : null].filter(Boolean).join(" · ")}
                      {r.newLet && <span className="nl-dep-new">New let</span>}
                    </span>
                  </span>
                  <span className="nl-dep-item-side"><Where r={r} /><Gaps r={r} /></span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {signedOff.length > 0 && (
        <section className="nl-dep-group">
          <h2 className="nl-section-title nl-dep-h">
            <span className="nl-dep-n is-done"><Ico name="check" size={13} /></span> Complete with a Note <span className="nl-count">{signedOff.length}</span>
          </h2>
          <p className="nl-meta nl-dep-says">Flagged, then marked complete by a person because nothing more can be done. Not counted in To Do. Each comes back if something new comes up on the home.</p>
          <ul className="nl-dep-list">
            {signedOff.map((r) => (
              <li key={r.id}>
                <button type="button" className="nl-dep-item" onClick={() => onOpen(r.id)}>
                  <span className="nl-dep-item-main">
                    <b>{r.address}</b>
                    <span className="nl-meta nl-dep-why">{r.signOff!.reason}</span>
                  </span>
                  <span className="nl-dep-item-side">
                    <span className="nl-dep-signed">Complete with a note</span>
                    <span className="nl-meta">{[r.signOff!.by, day(r.signOff!.at)].filter(Boolean).join(" · ")}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function RegisterView({ rows, total, onOpen }: { rows: Row[]; total: number; onOpen: (id: string) => void }) {
  const [limit, setLimit] = useState(150);
  if (!rows.length) return <p className="nl-empty nl-dep-empty">No home matches these filters.</p>;
  return (
    <>
      <p className="nl-meta nl-dep-shown">{rows.length} of {total} homes</p>
      <div className="nl-adm-tablewrap nl-dep-tablewrap">
        <table className="nl-adm-table nl-dep-table">
          <thead>
            <tr>
              <th>Property</th><th>Where it is</th><th>Reference</th><th className="is-num">Amount</th>
              <th>Tenancy start</th><th>Protected</th><th>Certificate</th><th>What&rsquo;s missing</th>
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((r) => (
              <tr key={r.id} className={r.action ? "" : "is-quiet"} onClick={() => onOpen(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onOpen(r.id); }}>
                <td data-label="Property">
                  <b className="nl-dep-addr">{r.address}</b>
                  <span className="nl-meta">{[pcIfNew(r), r.agent].filter(Boolean).join(" · ")}{r.newLet && <span className="nl-dep-new">New let</span>}</span>
                </td>
                <td data-label="Where it is"><Where r={r} /></td>
                <td data-label="Reference" className="nl-mono">{r.ref ?? "-"}</td>
                <td data-label="Amount" className="is-num">{gbp(r.amount)}</td>
                <td data-label="Tenancy start">{day(r.tenancyStart)}</td>
                <td data-label="Protected">{day(r.protectedOn)}</td>
                <td data-label="Certificate">{r.certOnFile ? "On file" : r.heldByTle || r.position === "landlord_scheme" ? <span className="nl-dep-bad">Missing</span> : "-"}</td>
                <td data-label="What's missing">{signed(r) ? <span className="nl-dep-signed">Complete with a note</span> : <Gaps r={r} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm nl-dep-more" onClick={() => setLimit((n) => n + 300)}>
          Show {Math.min(300, rows.length - limit)} more
        </button>
      )}
    </>
  );
}

function AgentView({ rows, unmatched, leaversKnown, leavers, onPick }: { rows: Row[]; unmatched: Unmatched[]; leaversKnown: boolean; leavers: string[]; onPick: (a: string) => void }) {
  const list = useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const k = r.agent?.trim() || "No agent on record";
      m.set(k, [...(m.get(k) ?? []), r]);
    }
    return [...m.entries()].map(([name, set]) => ({
      name, set,
      left: set.some((r) => r.agentLeft),
      held: set.filter((r) => r.heldByTle),
      todo: set.filter((r) => r.action).length,
      urgent: set.filter((r) => r.action === "urgent").length,
    })).sort((a, b) => b.todo - a.todo || b.set.length - a.set.length);
  }, [rows]);
  /* Deposits still registered in a leaver's Flatfair branch: the home is on the book, the branch is theirs. */
  const leaverBranch = rows.filter((r) => r.flatfair?.branchLeft && r.flatfair.product === "traditional_deposit");
  const leaverLoose = unmatched.filter((u) => u.branchLeft);
  return (
    <>
      <div className="nl-adm-tablewrap nl-dep-tablewrap">
        <table className="nl-adm-table nl-dep-table">
          <thead>
            <tr><th>Agent</th><th className="is-num">Homes</th><th className="is-num">Held by TLE</th><th className="is-num">To do</th><th className="is-num">Urgent</th><th>Complete</th></tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.name} onClick={() => onPick(a.name)} tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") onPick(a.name); }}>
                <td data-label="Agent"><b>{a.name}</b>{a.left && <span className="nl-dep-left">Left</span>}</td>
                <td data-label="Homes" className="is-num">{a.set.length}</td>
                <td data-label="Held by TLE" className="is-num">{a.held.length} <span className="nl-meta">{gbp0(a.held.reduce((s, r) => s + (r.amount ?? 0), 0))}</span></td>
                <td data-label="To do" className="is-num">{a.todo}</td>
                <td data-label="Urgent" className="is-num">{a.urgent ? <span className="nl-dep-bad">{a.urgent}</span> : 0}</td>
                <td data-label="Complete">
                  <span className="nl-dep-bar" aria-label={`${pct(a.set.length - a.todo, a.set.length)}% complete`}>
                    <i style={{ width: `${pct(a.set.length - a.todo, a.set.length)}%` }} />
                  </span>
                  <span className="nl-meta"> {pct(a.set.length - a.todo, a.set.length)}%</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section className="nl-dep-group">
        <h2 className="nl-section-title nl-dep-h">Deposits in a Leaver&rsquo;s Flatfair Branch <span className="nl-count">{leaverBranch.length + leaverLoose.length}</span></h2>
        <p className="nl-meta nl-dep-says">
          {leaversKnown
            ? `TDS deposits still registered under the Flatfair branch of an agent who has left. Move each to a current agent's branch in Flatfair and tell the landlord and tenant who looks after them now. Left, as REX has it: ${leavers.join(", ") || "nobody"}.`
            : "Who has left isn't known just now (the compliance book hasn't been built), so this list can't be drawn."}
        </p>
        {leaversKnown && (leaverBranch.length + leaverLoose.length ? (
          <ul className="nl-dep-list">
            {leaverBranch.map((r) => (
              <li key={`h${r.id}`} className="nl-dep-item is-flat">
                <span className="nl-dep-item-main"><b>{r.address}</b><span className="nl-meta">{r.postcode} · branch {r.flatfair!.branch} · now with {r.agent ?? "nobody on record"}</span></span>
                <span className="nl-dep-item-side nl-mono">{r.flatfair!.ref ?? "-"}</span>
              </li>
            ))}
            {leaverLoose.map((u) => (
              <li key={`u${u.id}`} className="nl-dep-item is-flat">
                <span className="nl-dep-item-main"><b>{u.address}</b><span className="nl-meta">{u.postcode} · branch {u.branch} · not matched to a home on the book</span></span>
                <span className="nl-dep-item-side nl-mono">{u.ref ?? "-"}</span>
              </li>
            ))}
          </ul>
        ) : <p className="nl-empty">None.</p>)}
      </section>
    </>
  );
}

function SchemeView({ rows }: { rows: Row[] }) {
  const lines = (Object.keys(POSITION) as Position[]).flatMap((p) =>
    (["England", "Scotland", "Wales"] as const).map((c) => {
      const set = rows.filter((r) => r.position === p && r.country === c);
      return set.length ? {
        key: `${p}-${c}`, p, c, n: set.length, total: MONEY_HELD.has(p) ? set.reduce((s, r) => s + (r.amount ?? 0), 0) : null,
        ref: set.filter((r) => r.ref).length, date: set.filter((r) => r.protectedOn).length,
        cert: set.filter((r) => r.certOnFile).length, late: set.filter((r) => r.gaps.includes("late")).length,
      } : null;
    }).filter((x): x is NonNullable<typeof x> => Boolean(x))
  );
  return (
    <>
      <p className="nl-meta nl-dep-says">Every let home on the book, whatever the filters above. Late means more than 30 days (England) or 30 working days (Scotland) from the tenancy start to the date protected.</p>
      <div className="nl-adm-tablewrap nl-dep-tablewrap">
        <table className="nl-adm-table nl-dep-table">
          <thead>
            <tr><th>Where it is</th><th>Country</th><th className="is-num">Homes</th><th className="is-num">Total</th><th className="is-num">With reference</th><th className="is-num">With date</th><th className="is-num">With certificate</th><th className="is-num">Late</th></tr>
          </thead>
          <tbody>
            {lines.map((l) => (
              <tr key={l.key}>
                <td data-label="Where it is"><b>{POSITION[l.p]}</b></td>
                <td data-label="Country">{l.c}</td>
                <td data-label="Homes" className="is-num">{l.n}</td>
                <td data-label="Total" className="is-num">{l.total != null ? gbp0(l.total) : "-"}</td>
                <td data-label="With reference" className="is-num">{l.ref}</td>
                <td data-label="With date" className="is-num">{l.date}</td>
                <td data-label="With certificate" className="is-num">{l.cert}</td>
                <td data-label="Late" className="is-num">{l.late ? <span className="nl-dep-bad">{l.late}</span> : 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FlatfairView({ list }: { list: Unmatched[] }) {
  return (
    <>
      <p className="nl-meta nl-dep-says">
        Live deposits and no-deposit plans in Flatfair that no let home on the book claims. Each is a home missing from the OS, a tenancy that has ended and should be closed in Flatfair, or an address spelt differently: search the register for the postcode first. This covers deposits registered through Flatfair only; a TDS deposit registered straight with TDS needs the TDS member report.
      </p>
      {list.length ? (
        <div className="nl-adm-tablewrap nl-dep-tablewrap">
          <table className="nl-adm-table nl-dep-table">
            <thead><tr><th>Flatfair address</th><th>Kind</th><th>Reference</th><th className="is-num">Amount</th><th>Start</th><th>Branch</th></tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className="is-static">
                  <td data-label="Flatfair address"><b>{u.address}</b><span className="nl-meta">{u.postcode}</span></td>
                  <td data-label="Kind">{u.product === "flatbond" ? "No-deposit plan" : "Deposit (TDS)"}</td>
                  <td data-label="Reference" className="nl-mono">{u.ref ?? "-"}</td>
                  <td data-label="Amount" className="is-num">{gbp(u.amount)}</td>
                  <td data-label="Start">{day(u.start)}</td>
                  <td data-label="Branch">{u.branch ?? "-"}{u.branchLeft && <span className="nl-dep-left">Left</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="nl-empty nl-dep-empty">Every live Flatfair record matches a home on the book.</p>}
    </>
  );
}

/* ── One home ───────────────────────────────────────────────────────── */

type Field = "deposit_status" | "deposit_ref" | "deposit_amount" | "deposit_protected_on" | "deposit_pi_served_on" | "deposit_registered_by" | "deposit_notes";

function HomeSheet({ row: r, choices, onClose, onSaved }: { row: Row; choices: string[]; onClose: () => void; onSaved: () => void }) {
  const [said, setSaid] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [files, setFiles] = useState<{ key: string; name: string }[] | null>(null);
  const [filesError, setFilesError] = useState(false);
  const picker = useRef<HTMLInputElement | null>(null);

  const loadFiles = useCallback(async () => {
    setFilesError(false);
    try {
      const res = await fetch(`/api/admin/deposits/${encodeURIComponent(r.id)}`, { cache: "no-store" });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error();
      setFiles(j.files);
    } catch {
      setFilesError(true);
    }
  }, [r.id]);
  useEffect(() => { loadFiles(); }, [loadFiles]);

  async function save(field: Field, value: string) {
    setBusy(field);
    setSaid(null);
    try {
      const res = await fetch(`/api/admin/deposits/${encodeURIComponent(r.id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ field, value }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "That didn't save.");
      setSaid({ ok: true, text: "Saved" });
      onSaved();
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(null);
    }
  }

  async function markChecked() {
    setBusy("checked");
    setSaid(null);
    try {
      const res = await fetch(`/api/admin/deposits/${encodeURIComponent(r.id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ checked: true }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "That didn't save.");
      setSaid({ ok: true, text: "Marked as checked" });
      onSaved();
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(null);
    }
  }

  /* Mark as Complete, and taking it back. */
  const [why, setWhy] = useState(r.signOff && !r.signOff.holds ? r.signOff.reason : r.notes ?? "");
  async function signOff(body: { complete: true; reason: string } | { reopen: true }) {
    setBusy("signoff");
    setSaid(null);
    try {
      const res = await fetch(`/api/admin/deposits/${encodeURIComponent(r.id)}`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "That didn't save.");
      setSaid({ ok: true, text: "complete" in body ? "Marked as complete" : "Back in To Do" });
      onSaved();
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "That didn't save." });
    } finally {
      setBusy(null);
    }
  }

  async function upload(file: File) {
    setBusy("file");
    setSaid(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("field", "doc_deposit_cert");
      const res = await fetch(`/api/clean-sweep/${encodeURIComponent(r.id)}/file`, { method: "POST", body: fd });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.ok) throw new Error(j?.error ?? "The file didn't upload.");
      setSaid({ ok: true, text: "Certificate uploaded" });
      await loadFiles();
      onSaved();
    } catch (e) {
      setSaid({ ok: false, text: e instanceof Error ? e.message : "The file didn't upload." });
    } finally {
      setBusy(null);
      if (picker.current) picker.current.value = "";
    }
  }

  const src = (v?: Val) => (v ? `${v.source === "manual" ? `Typed in by ${v.by ?? "someone"}` : v.source ?? "Unknown source"}${v.at ? `, ${day(v.at)}` : ""}` : null);
  const flat = r.flatfair;

  return (
    <FloatSheet
      title={r.address}
      onClose={onClose}
      size="lg"
      dismissible={!busy}
      question={POSITION[r.position]}
      lede={[r.postcode, r.country, SERVICE[r.service], r.agent ? `Agent ${r.agent}${r.agentLeft ? " (left)" : ""}` : null].filter(Boolean).join(" · ")}
      foot={
        <FloatFoot left={said ? <span className={`nl-dep-said${said.ok ? "" : " is-bad"}`} role="status">{said.text}</span> : r.lastChecked ? <span className="nl-meta">Last checked {day(r.lastChecked.at)}{r.lastChecked.by ? ` by ${r.lastChecked.by}` : ""}</span> : <span className="nl-meta">Not checked on this screen yet</span>}>
          <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={markChecked} disabled={Boolean(busy)}>
            {busy === "checked" ? "Saving..." : "Mark as Checked"}
          </button>
          <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={onClose} disabled={Boolean(busy)}>Done</button>
        </FloatFoot>
      }
    >
      {signed(r) && (
        <FloatCard>
          <FloatCardHead
            title="Complete with a Note"
            aside={
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => signOff({ reopen: true })} disabled={Boolean(busy)}>
                {busy === "signoff" ? "Saving..." : "Reopen"}
              </button>
            }
          />
          <p className="nl-dep-signed-by"><Ico name="check" size={15} /> Marked complete{r.signOff!.by ? ` by ${r.signOff!.by}` : ""} on {day(r.signOff!.at)}</p>
          <p className="nl-dep-reason">{r.signOff!.reason}</p>
          <p className="nl-meta nl-dep-says">Counted as complete, not as to do. What was flagged stays on the register below. If something new comes up on this home, it goes back to To Do.</p>
        </FloatCard>
      )}

      {(r.gaps.length > 0 || r.action) && (
        <FloatCard>
          <FloatCardHead title={signed(r) ? "What Was Flagged" : "What's Missing"} />
          {r.action && <p className="nl-dep-says">{ACTIONS.find((a) => a.key === r.action)?.says}</p>}
          <Gaps r={r} />
          {r.newLet && <p className="nl-meta nl-dep-says">A new let: Flatfair started a tenancy here on {day(flat?.start)}, after the deposit on record. The details below are the new tenancy&rsquo;s.</p>}
        </FloatCard>
      )}

      {r.action && (
        <FloatCard>
          <FloatCardHead title="Mark as Complete" />
          {r.signOff && !r.signOff.holds && (
            <p className="nl-dep-says nl-dep-lapsed">
              Marked complete{r.signOff.by ? ` by ${r.signOff.by}` : ""} on {day(r.signOff.at)}, but {r.signOff.since.length ? `something new has come up since (${r.signOff.since.map((g) => GAP[g].toLowerCase()).join(", ")})` : "the home has changed since"}, so it is back in To Do.
            </p>
          )}
          <p className="nl-meta nl-dep-says">If nothing more can be done on this home, say why and mark it complete. It leaves To Do and shows on the register and in the download as complete with a note. If something new comes up here, it comes back.</p>
          <div className="nl-dep-complete">
            <label className="nl-dep-field">
              <span className="nl-dep-field-label">Why nothing more can be done</span>
              <span className="nl-dep-field-row">
                <textarea value={why} rows={3} maxLength={1000} onChange={(e) => setWhy(e.target.value)} placeholder="For example: management transfer, the previous agent was slow to move the deposit to us" />
              </span>
              {why.trim() !== "" && why.trim() === (r.notes ?? "").trim() && <span className="nl-dep-from">Filled in from the note on this home. Change it if you need to.</span>}
            </label>
            <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" onClick={() => signOff({ complete: true, reason: why })} disabled={Boolean(busy) || why.trim().length < 3}>
              <Ico name="check" size={14} /> {busy === "signoff" ? "Saving..." : "Mark as Complete"}
            </button>
          </div>
        </FloatCard>
      )}

      <FloatCard>
        <FloatCardHead title="The Deposit" />
        <div className="nl-dep-fields">
          <Pick label="Where it is" value={r.status ?? ""} choices={choices} busy={busy === "deposit_status"} onSave={(v) => save("deposit_status", v)} from={r.fromFlatfair.includes("position") ? `From Flatfair: ${POSITION[r.position]}` : src(r.values.status)} />
          <Edit label="Scheme reference" value={r.fromFlatfair.includes("ref") ? "" : r.ref ?? ""} placeholder={r.fromFlatfair.includes("ref") ? `${r.ref} (Flatfair)` : "For example EW12345678"} busy={busy === "deposit_ref"} onSave={(v) => save("deposit_ref", v)} from={r.fromFlatfair.includes("ref") ? "From Flatfair, live" : src(r.values.ref)} />
          <Edit label="Amount (£)" value={r.fromFlatfair.includes("amount") || r.amount == null ? "" : String(r.amount)} placeholder={r.fromFlatfair.includes("amount") ? `${r.amount} (Flatfair)` : "950"} inputMode="decimal" busy={busy === "deposit_amount"} onSave={(v) => save("deposit_amount", v)} from={r.fromFlatfair.includes("amount") ? "From Flatfair, live" : src(r.values.amount)} />
          <Edit label="Date protected" type="date" value={r.protectedOn ?? ""} busy={busy === "deposit_protected_on"} onSave={(v) => save("deposit_protected_on", v)} from={src(r.values.protectedOn) ?? (r.tenancyStart ? `Tenancy started ${day(r.tenancyStart)}` : null)} />
          <Edit label="Prescribed information served" type="date" value={r.piServedOn ?? ""} busy={busy === "deposit_pi_served_on"} onSave={(v) => save("deposit_pi_served_on", v)} from={src(r.values.piServedOn) ?? (r.piEvidence === "flatfair" ? "Flatfair holds the signed prescribed information" : r.piEvidence === "file" ? "No date typed in; the certificate file on the home is the evidence" : null)} />
          <Pick label="Registered by" value={r.registeredBy ?? ""} choices={["agent", "landlord"]} words={{ agent: "Us (the agent)", landlord: "The landlord" }} busy={busy === "deposit_registered_by"} onSave={(v) => save("deposit_registered_by", v)} from={src(r.values.registeredBy)} />
        </div>
      </FloatCard>

      <FloatCard>
        <FloatCardHead
          title="Certificate and Prescribed Information"
          aside={
            <>
              <input ref={picker} type="file" accept={DOC_ACCEPT} hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
              <button type="button" className="nl-btn nl-btn--secondary nl-btn--sm" onClick={() => picker.current?.click()} disabled={Boolean(busy)}>
                <Ico name="upload" size={14} /> {busy === "file" ? "Uploading..." : "Upload"}
              </button>
            </>
          }
        />
        {files == null && !filesError && <p className="nl-meta"><span className="nl-adm-spin" aria-hidden /> Looking for files</p>}
        {filesError && <p className="nl-dep-bad">The files couldn&rsquo;t be listed just now. <button type="button" className="nl-link" onClick={loadFiles}>Try again</button></p>}
        {files && (files.length ? (
          <ul className="nl-dep-files">
            {files.map((f) => (
              <li key={f.key}><a className="nl-link" href={`/api/r2/file?key=${encodeURIComponent(f.key)}`} target="_blank" rel="noreferrer">{f.name}</a></li>
            ))}
          </ul>
        ) : <p className="nl-meta">No file on the home yet.{flat?.piSigned ? " Flatfair holds the signed prescribed information for this deposit." : ""}</p>)}
        {r.values.cert && <p className="nl-meta">{src(r.values.cert)}</p>}
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="Flatfair, Live" />
        {flat ? (
          <dl className="nl-dep-dl">
            <dt>Kind</dt><dd>{flat.product === "flatbond" ? "No-deposit plan" : flat.product === "traditional_deposit" ? `Deposit, ${flat.provider?.toUpperCase() ?? "scheme"} ${flat.type ?? ""}` : "Not chosen yet"}</dd>
            <dt>Status</dt><dd>{flat.status.replace(/_/g, " ")}</dd>
            <dt>Reference</dt><dd className="nl-mono">{flat.ref ?? "-"}</dd>
            <dt>Amount</dt><dd>{gbp(flat.amount)}</dd>
            <dt>Tenancy start</dt><dd>{day(flat.start)}</dd>
            <dt>Branch</dt><dd>{flat.branch ?? "-"}{flat.branchLeft ? " (left)" : ""}</dd>
            <dt>Documents</dt><dd>{[flat.regCert && "Registration certificate", flat.piSigned && "Signed prescribed information"].filter(Boolean).join(", ") || "None yet"}</dd>
          </dl>
        ) : null}
        {r.otherFlats.length > 0 && (
          <div className="nl-dep-older">
            <p className="nl-dep-field-label">Also live at this address in Flatfair</p>
            <ul className="nl-dep-files">
              {r.otherFlats.map((o) => (
                <li key={o.id}>
                  <span className="nl-mono">{o.ref ?? (o.product === "flatbond" ? "No-deposit plan" : "No reference")}</span>
                  <span className="nl-meta"> {gbp(o.amount)}, tenancy from {day(o.start)}, {o.status.replace(/_/g, " ")}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!flat && (
          <p className="nl-meta">{r.country === "Scotland" ? "Scottish deposits don't go through Flatfair. mydeposits Scotland has no feed, so the record above is what the team entered." : "No live Flatfair record at this address."}</p>
        )}
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="The Let" />
        <dl className="nl-dep-dl">
          <dt>Landlord</dt><dd>{r.landlord ?? "-"}</dd>
          <dt>Tenants</dt><dd>{r.tenants ?? "-"}</dd>
          <dt>Tenancy start</dt><dd>{day(r.tenancyStart)}</dd>
          <dt>PayProp</dt><dd>{r.paypropNo ?? "-"}</dd>
          <dt>Status as recorded</dt><dd>{r.status ?? "-"}</dd>
          {r.alsoRecords.length > 0 && (
            <>
              <dt>Also on the OS</dt>
              <dd>{r.alsoRecords.map((a) => `${a.id}${a.status ? ` (${a.status})` : " (no deposit recorded)"}`).join("; ")}. One home held twice: archive the spare record.</dd>
            </>
          )}
        </dl>
      </FloatCard>

      <FloatCard>
        <FloatCardHead title="Notes" />
        <Edit label="Notes" multiline value={r.notes ?? ""} placeholder="Who you spoke to, what they said, what happens next" busy={busy === "deposit_notes"} onSave={(v) => save("deposit_notes", v)} from={src(r.values.notes)} />
      </FloatCard>
    </FloatSheet>
  );
}

function Edit({ label, value, onSave, busy, from, type = "text", placeholder, inputMode, multiline }: {
  label: string; value: string; onSave: (v: string) => void; busy: boolean; from?: string | null;
  type?: "text" | "date"; placeholder?: string; inputMode?: "decimal"; multiline?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const dirty = v.trim() !== value.trim();
  return (
    <label className="nl-dep-field">
      <span className="nl-dep-field-label">{label}</span>
      <span className="nl-dep-field-row">
        {multiline
          ? <textarea value={v} rows={3} onChange={(e) => setV(e.target.value)} placeholder={placeholder} />
          : <input type={type} value={v} onChange={(e) => setV(e.target.value)} placeholder={placeholder} inputMode={inputMode} onKeyDown={(e) => { if (e.key === "Enter" && dirty) onSave(v); }} />}
        {dirty && <button type="button" className="nl-btn nl-btn--primary nl-btn--sm" disabled={busy} onClick={() => onSave(v)}>{busy ? "Saving..." : "Save"}</button>}
      </span>
      {from && <span className="nl-dep-from">{from}</span>}
    </label>
  );
}

function Pick({ label, value, choices, words, onSave, busy, from }: {
  label: string; value: string; choices: string[]; words?: Record<string, string>; onSave: (v: string) => void; busy: boolean; from?: string | null;
}) {
  const list = value && !choices.includes(value) ? [value, ...choices] : choices;
  return (
    <label className="nl-dep-field">
      <span className="nl-dep-field-label">{label}</span>
      <span className="nl-dep-field-row">
        <span className="nl-fsel nl-dep-fsel">
          <select value={value} disabled={busy} onChange={(e) => onSave(e.target.value)}>
            <option value="">Not recorded</option>
            {list.map((c) => <option key={c} value={c}>{words?.[c] ?? c}</option>)}
          </select>
        </span>
        {busy && <span className="nl-adm-spin" aria-hidden />}
      </span>
      {from && <span className="nl-dep-from">{from}</span>}
    </label>
  );
}
