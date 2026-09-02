"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import NewLeadPanel from "@/components/NewLeadPanel";
import RadarMap from "@/components/RadarMap";
import { PressButton } from "@/components/Bits";
import { Pill } from "@/components/Wire";
import { ColumnCustomiser, DataTable, useColumns, type ColumnDef } from "@/components/TableColumns";
import {
  SIGNALS,
  SIGNAL_ORDER,
  STAGES,
  STAGE_LABEL,
  STAGE_TONE,
  type Prospect,
  type RadarSummary,
  type SignalKey,
  type Stage,
} from "@/lib/radar-signals";

/**
 * Landlord Radar — the board and the panel beside it.
 *
 * Same shape as Leads on purpose: filters across the top, the table, a panel
 * that opens when a row is picked. An agent who has learnt one has learnt the
 * other. The difference is what a row IS: a property, not a person. Nobody is
 * named here, and the panel's job is to say WHY the property is on the list
 * and let somebody decide what to do about it.
 *
 * Live or nothing. With no database the board shows the reason, never a
 * sample list — the live-figures rule.
 */

type Row = Prospect & { id: string };

/** Stages still being worked. The default view; the rest are a filter away. */
const OPEN_STAGES: Stage[] = ["new", "queued", "contacted", "appraisal_booked"];

function Filter({
  label,
  options,
  value,
  onChange,
  render = (v) => v,
}: {
  label: string;
  options: string[];
  value: string | null;
  onChange: (v: string | null) => void;
  render?: (v: string) => string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-2 whitespace-nowrap rounded-full border px-3.5 py-2 text-[12px] transition-colors ${
          value
            ? "border-accent-dark bg-accent-soft/50 font-semibold text-accent-dark"
            : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
        }`}
      >
        {value ? render(value) : label}
        <span className="text-[9px]">▾</span>
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-[60] cursor-default"
          />
          <div className="absolute left-0 top-full z-[70] mt-1.5 max-h-72 min-w-44 overflow-y-auto rounded-2xl border border-line/80 bg-page p-1.5 shadow-lg">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="block w-full rounded-xl px-3 py-1.5 text-left text-[12px] text-muted hover:bg-panel"
            >
              {label}
            </button>
            {options.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => { onChange(o); setOpen(false); }}
                className={`block w-full rounded-xl px-3 py-1.5 text-left text-[12px] hover:bg-panel ${
                  o === value ? "font-semibold text-accent-dark" : ""
                }`}
              >
                {render(o)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Great-circle distance in miles. Close enough at this scale. */
function milesBetween(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3958.8;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function daysOn(listed: string | null): number | null {
  if (!listed) return null;
  const t = new Date(listed).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86_400_000)) : null;
}

function pounds(n: number | null): string {
  return n == null ? "-" : `£${n.toLocaleString("en-GB")}`;
}

function when(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function fullAddress(p: Prospect): string {
  const a = (p.address || p.street || "").trim();
  return a.toUpperCase().includes(p.postcode.toUpperCase()) ? a : `${a}, ${p.postcode}`.replace(/^, /, "");
}

function SignalPills({ signals, max = 3 }: { signals: Prospect["signals"]; max?: number }) {
  const shown = signals.slice(0, max);
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((s) => (
        <span
          key={s.key}
          title={s.detail}
          className="whitespace-nowrap rounded-full border border-line/70 px-2 py-0.5 text-[10.5px] text-ink"
        >
          {SIGNALS[s.key].label}
        </span>
      ))}
      {signals.length > max && (
        <span className="whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10.5px] text-muted">
          +{signals.length - max}
        </span>
      )}
    </span>
  );
}

export default function RadarBoard() {
  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<RadarSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [perPage, setPerPage] = useState(25);
  const [q, setQ] = useState("");
  /* Which signals they care about. Empty means all. Remembered per browser,
     because a person who only works OpenRent should not have to say so
     every morning. */
  const [signalsOn, setSignalsOn] = useState<Set<SignalKey>>(() => new Set());
  const [fDistrict, setFDistrict] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [fStage, setFStage] = useState<string | null>(null);
  /* The map is the front door; the list is a view of the same book. */
  const [view, setView] = useState<"map" | "list">("map");
  /* What the map currently holds, and the area somebody asked to list. */
  const [inView, setInView] = useState<string[]>([]);
  const [area, setArea] = useState<Set<string> | null>(null);
  /* An address and a radius. James, 2 Sep: "punch in an address and a
     radius search", because the whole patch on one map is too much to read
     and too many pins to move. */
  const [nearQuery, setNearQuery] = useState("");
  const [radius, setRadius] = useState(1);
  const [near, setNear] = useState<{ label: string; lat: number; lon: number } | null>(null);
  const [nearBusy, setNearBusy] = useState(false);
  const [nearError, setNearError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("radar.signals");
      if (raw) {
        const keys = (JSON.parse(raw) as string[]).filter((k): k is SignalKey => k in SIGNALS);
        setSignalsOn(new Set(keys));
      }
    } catch {
      /* A browser that will not remember is a browser that starts on all. */
    }
  }, []);

  function toggleSignal(k: SignalKey) {
    setSignalsOn((cur) => {
      const next = new Set(cur);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      try {
        localStorage.setItem("radar.signals", JSON.stringify([...next]));
      } catch {
        /* see above */
      }
      return next;
    });
  }

  async function lookUpNear(e?: React.SyntheticEvent) {
    e?.preventDefault();
    const qy = nearQuery.trim();
    if (!qy) {
      setNear(null);
      return;
    }
    setNearBusy(true);
    setNearError(null);
    try {
      const r = await fetch(`/api/radar/near?q=${encodeURIComponent(qy)}`, { cache: "no-store" });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setNearError(j.error ?? "Could not place that address.");
        return;
      }
      setNear({ label: j.label, lat: j.lat, lon: j.lon });
      setArea(null);
    } catch {
      setNearError("Could not place that address.");
    } finally {
      setNearBusy(false);
    }
  }

  useEffect(() => {
    let gone = false;
    setLoading(true);
    fetch("/api/radar/prospects", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (gone) return;
        if (j.ok && Array.isArray(j.prospects)) {
          setRows((j.prospects as Prospect[]).map((p) => ({ ...p, id: p.property_key })));
          setSummary(j.summary ?? null);
          setError(null);
        } else {
          setError(j.reason ?? "Radar did not answer.");
        }
      })
      .catch(() => {
        if (!gone) setError("Radar did not answer.");
      })
      .finally(() => {
        if (!gone) setLoading(false);
      });
    return () => { gone = true; };
  }, []);

  const districts = useMemo(() => [...new Set(rows.map((r) => r.district).filter(Boolean) as string[])].sort(), [rows]);
  const agents = useMemo(() => [...new Set(rows.map((r) => r.agent).filter(Boolean) as string[])].sort(), [rows]);
  const signalCounts = useMemo(() => {
    const m = new Map<SignalKey, number>();
    for (const r of rows) {
      if (r.score === 0) continue;
      for (const s of r.signals) m.set(s.key, (m.get(s.key) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const book = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStage ? r.stage !== fStage : !OPEN_STAGES.includes(r.stage)) return false;
      if (!fStage && r.score === 0) return false;
      if (signalsOn.size > 0 && !r.signals.some((s) => signalsOn.has(s.key))) return false;
      if (fDistrict && r.district !== fDistrict) return false;
      if (fAgent && r.agent !== fAgent) return false;
      if (area && !area.has(r.property_key)) return false;
      if (near) {
        if (r.lat == null || r.lon == null) return false;
        if (milesBetween(near.lat, near.lon, r.lat, r.lon) > radius) return false;
      }
      if (needle) {
        const hay = `${r.address} ${r.street ?? ""} ${r.postcode} ${r.agent ?? ""} ${r.notes}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, signalsOn, fDistrict, fAgent, fStage, area, near, radius]);

  useEffect(() => { setPage(0); }, [q, signalsOn, fDistrict, fAgent, fStage, perPage, area, near, radius]);

  /* NEVER THE WHOLE PATCH ON THE MAP. 1,875 pins is unreadable and slow to
     drag. Without an address or a map area the map gets the strongest 150;
     the list underneath still pages through everything. */
  const MAP_CAP = 150;
  const mapList = useMemo(() => (near || area ? book : book.slice(0, MAP_CAP)), [book, near, area]);

  /* The map reports on every pan. Only re-render when the set changed. */
  const inViewSig = inView.join("|");
  const onInView = (keys: string[]) => {
    if (keys.join("|") !== inViewSig) setInView(keys);
  };

  const open = book.find((r) => r.id === openId) ?? rows.find((r) => r.id === openId) ?? null;

  const defs = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        key: "address", label: "Property", required: true,
        render: (r) => (
          <span className="hand block max-w-[26rem] truncate text-[13px]" title={fullAddress(r)}>
            {r.address || r.street || r.postcode}
          </span>
        ),
      },
      { key: "postcode", label: "Postcode", cell: "whitespace-nowrap text-muted", render: (r) => r.postcode },
      { key: "agent", label: "Listed by", cell: "whitespace-nowrap", render: (r) => r.agent ?? "-" },
      { key: "rent", label: "Rent", cell: "figures whitespace-nowrap", render: (r) => (r.rent == null ? "-" : `${pounds(r.rent)} pcm`) },
      { key: "beds", label: "Beds", optional: true, cell: "figures whitespace-nowrap text-muted", render: (r) => r.beds ?? "-" },
      {
        key: "listed", label: "On market", cell: "whitespace-nowrap text-muted",
        render: (r) => {
          const d = daysOn(r.listed_on);
          return d == null ? "-" : `${d} day${d === 1 ? "" : "s"}`;
        },
      },
      { key: "signals", label: "Why", render: (r) => <SignalPills signals={r.signals} /> },
      { key: "score", label: "Score", cell: "figures whitespace-nowrap font-semibold", render: (r) => r.score },
      {
        key: "stage", label: "Stage", cell: "whitespace-nowrap",
        render: (r) => <Pill tone={STAGE_TONE[r.stage]}>{STAGE_LABEL[r.stage]}</Pill>,
      },
      { key: "assigned", label: "Assigned", optional: true, cell: "whitespace-nowrap text-muted", render: (r) => r.assigned_to ?? "-" },
    ],
    []
  );
  const cols = useColumns<Row>("radar", defs);

  const pages = Math.max(1, Math.ceil(book.length / perPage));
  const visible = book.slice(page * perPage, page * perPage + perPage);

  function patched(p: Prospect) {
    setRows((rs) => rs.map((r) => (r.property_key === p.property_key ? { ...p, id: p.property_key } : r)));
  }

  const areas = summary
    ? [...new Set(summary.districtList.map((d) => d.replace(/\d.*$/, "")))].join(" and ")
    : "";
  const blurb = loading
    ? "Reading the latest sweep..."
    : error
      ? error
      : summary
        ? `Watching ${summary.districts} districts across ${areas || "the patch"}. ${
            summary.lastRun ? `Last swept ${when(summary.lastRun)}.` : "Not swept yet."
          } ${summary.active.toLocaleString("en-GB")} properties flagged, ${summary.newToday.toLocaleString("en-GB")} new today.`
        : "Properties whose landlord looks ready to move agent, read off the daily market sweep.";

  return (
    <>
      <PageHeader
        title="Landlord Radar"
        blurb={blurb}
        illustration="/illustrations/notioly/paper-airplane.png"
      />

      <div className="mt-4">
        <div className="fade-up min-w-0 rounded-2xl border border-line/80 bg-panel p-5">
          {/* The signals, as switches. Pick the ones you work; none picked is all. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {SIGNAL_ORDER.filter((k) => (signalCounts.get(k) ?? 0) > 0).map((k) => {
              const on = signalsOn.has(k);
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => toggleSignal(k)}
                  title={SIGNALS[k].why}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11.5px] transition-colors ${
                    on
                      ? "border-ink bg-ink text-page"
                      : "border-line/80 text-muted hover:border-ink/40 hover:text-ink"
                  }`}
                >
                  {SIGNALS[k].label}
                  <span className={`figures text-[10px] ${on ? "text-page/70" : "text-muted/80"}`}>
                    {(signalCounts.get(k) ?? 0).toLocaleString("en-GB")}
                  </span>
                </button>
              );
            })}
            {signalsOn.size > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSignalsOn(new Set());
                  try { localStorage.removeItem("radar.signals"); } catch { /* fine */ }
                }}
                className="rounded-full px-2.5 py-1.5 text-[11px] text-muted underline-offset-2 hover:underline"
              >
                Show all
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <form onSubmit={lookUpNear} className="flex min-w-64 flex-1 items-center gap-2">
              <label className="flex flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
                <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
                <input
                  type="text"
                  placeholder="Address or postcode to search around..."
                  value={nearQuery}
                  onChange={(e) => setNearQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void lookUpNear(e);
                  }}
                  className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
                />
              </label>
              <select
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                title="Radius"
                className="rounded-full border border-line/80 bg-transparent px-2.5 py-2 text-[12px] outline-none"
              >
                {[0.25, 0.5, 1, 2, 3, 5].map((m) => (
                  <option key={m} value={m}>{m} mile{m === 1 ? "" : "s"}</option>
                ))}
              </select>
              {/* A real submit, so Return in the box and a press on the button
                  are the same action. PressButton is type=button by design. */}
              <button
                type="submit"
                disabled={nearBusy}
                className="press-wobble rounded-full bg-ink px-4 py-2 text-[12px] font-semibold text-page disabled:opacity-40"
              >
                {nearBusy ? "Placing..." : "Search"}
              </button>
            </form>
            {near && (
              <button
                type="button"
                onClick={() => { setNear(null); setNearQuery(""); }}
                title="Clear the address search"
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-accent-dark bg-accent-soft/50 px-3.5 py-2 text-[12px] font-semibold text-accent-dark"
              >
                Within {radius} mile{radius === 1 ? "" : "s"} of {near.label} <span className="text-[10px]">✕</span>
              </button>
            )}
            {nearError && <span className="text-[11.5px] text-red-700">{nearError}</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2.5">
            <label className="flex min-w-44 flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
              <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
              <input
                type="text"
                placeholder="Filter by address, postcode or agent..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
              />
            </label>
            <Filter label="All districts" options={districts} value={fDistrict} onChange={setFDistrict} />
            <Filter label="All agents" options={agents} value={fAgent} onChange={setFAgent} />
            <Filter
              label="Open"
              options={[...STAGES]}
              value={fStage}
              onChange={setFStage}
              render={(s) => STAGE_LABEL[s as Stage]}
            />
            {area && (
              <button
                type="button"
                onClick={() => setArea(null)}
                title="Clear the map area"
                className="flex items-center gap-2 whitespace-nowrap rounded-full border border-accent-dark bg-accent-soft/50 px-3.5 py-2 text-[12px] font-semibold text-accent-dark"
              >
                Map area · {area.size} <span className="text-[10px]">✕</span>
              </button>
            )}
            <span className="ml-auto flex items-center gap-1 rounded-full border border-line/80 p-0.5">
              {(["map", "list"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-full px-3.5 py-1.5 text-[12px] transition-colors ${
                    view === v ? "bg-ink text-page" : "text-muted hover:text-ink"
                  }`}
                >
                  {v === "map" ? "Map" : "List"}
                </button>
              ))}
            </span>
            {view === "list" && <ColumnCustomiser cols={cols} />}
          </div>

          {loading ? (
            <div className="flex items-center gap-3 py-16 text-[12.5px] text-muted">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
              Reading the latest sweep...
            </div>
          ) : error ? (
            <div className="mt-4 rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px]">
              <p className="text-ink">Radar could not read its data.</p>
              <p className="mt-1 text-muted">{error}</p>
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px] text-muted">
              Nothing flagged yet. The first sweep of the patch fills this in; signals that need history, like a rent
              cut or a switched agent, arrive over the following weeks.
            </div>
          ) : view === "map" ? (
            <>
              <div className="mt-4 h-[calc(100vh-380px)] min-h-[420px]">
                <RadarMap prospects={mapList} openId={openId} onOpen={setOpenId} onInView={onInView} />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11.5px] text-muted">
                <span>
                  {mapList.length < book.length
                    ? `Showing the ${MAP_CAP} strongest of ${book.length.toLocaleString("en-GB")}. Search an address to see everything around it.`
                    : `${book.length.toLocaleString("en-GB")} properties match`}
                  {" · "}
                  {inView.length.toLocaleString("en-GB")} in view
                </span>
                <PressButton
                  onClick={() => {
                    setArea(new Set(inView));
                    setView("list");
                  }}
                  disabled={inView.length === 0}
                  className="rounded-full border border-line/80 px-4 py-1.5 text-[11.5px] text-ink disabled:opacity-40"
                  title="Open the properties inside the map as a list"
                >
                  List these {inView.length ? `(${inView.length.toLocaleString("en-GB")})` : ""}
                </PressButton>
              </div>
            </>
          ) : (
            <>
              <div className="mt-4">
                <DataTable
                  cols={cols}
                  rows={visible}
                  activeId={openId}
                  onRowClick={(r) => setOpenId(r.id === openId ? null : r.id)}
                />
              </div>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line/70 pt-4">
                <p className="flex items-center gap-2.5 text-[11px] text-muted">
                  Showing {book.length ? page * perPage + 1 : 0}-{Math.min((page + 1) * perPage, book.length)} of{" "}
                  {book.length} properties
                  <select
                    value={perPage}
                    onChange={(e) => setPerPage(Number(e.target.value))}
                    className="rounded-full border border-line/80 bg-transparent px-2.5 py-1 text-[11px] outline-none transition-colors hover:border-ink/40"
                    title="Properties per page"
                  >
                    {[25, 50, 100].map((n) => (
                      <option key={n} value={n}>{n} a page</option>
                    ))}
                  </select>
                </p>
                <div className="flex items-center gap-2">
                  <PressButton
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] disabled:opacity-40"
                  >
                    Previous
                  </PressButton>
                  <span className="text-[11px] text-muted">
                    {page + 1} of {pages}
                  </span>
                  <PressButton
                    onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                    disabled={page >= pages - 1}
                    className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] disabled:opacity-40"
                  >
                    Next
                  </PressButton>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {open && <ProspectPanel key={open.id} prospect={open} onClose={() => setOpenId(null)} onPatched={patched} />}
    </>
  );
}

function ProspectPanel({
  prospect,
  onClose,
  onPatched,
}: {
  prospect: Row;
  onClose: () => void;
  onPatched: (p: Prospect) => void;
}) {
  const [shown, setShown] = useState(false);
  const [stage, setStage] = useState<Stage>(prospect.stage);
  const [assigned, setAssigned] = useState(prospect.assigned_to ?? "");
  const [notes, setNotes] = useState(prospect.notes);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [booking, setBooking] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const dirty = stage !== prospect.stage || assigned !== (prospect.assigned_to ?? "") || notes !== prospect.notes;

  async function save(patch?: { stage?: Stage }) {
    setSaving(true);
    setSaveError(null);
    try {
      const r = await fetch("/api/radar/prospects", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          property_key: prospect.property_key,
          stage: patch?.stage ?? stage,
          assigned_to: assigned,
          notes,
        }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        setSaveError(j.error ?? "That did not save.");
        return;
      }
      if (patch?.stage) setStage(patch.stage);
      onPatched(j.prospect as Prospect);
      setSavedAt(Date.now());
    } catch {
      setSaveError("That did not save.");
    } finally {
      setSaving(false);
    }
  }

  const days = daysOn(prospect.listed_on);
  const address = fullAddress(prospect);

  return (
    <div className="fixed inset-0 z-[120]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] sm:w-[520px] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 px-6 pt-5">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-line/80 text-[13px] text-muted transition-colors hover:text-ink"
            title="Close (Esc)"
          >
            ✕
          </button>
          <Pill tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Pill>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8 pt-4">
          <p className="text-[11px] uppercase tracking-wider text-muted">Property</p>
          <h2 className="mt-1 text-[20px] leading-snug">{address}</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            {[
              prospect.beds != null ? `${prospect.beds} bed` : null,
              prospect.property_type,
              prospect.rent != null ? `${pounds(prospect.rent)} pcm` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>

          <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
            <div>
              <dt className="text-[11px] text-muted">Listed by</dt>
              <dd>{prospect.agent ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Status</dt>
              <dd className="capitalize">{prospect.status ?? "-"}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Listed on</dt>
              <dd>
                {when(prospect.listed_on)}
                {days != null ? <span className="text-muted"> · {days} days</span> : null}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Flagged</dt>
              <dd>{when(prospect.first_flagged)}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">District</dt>
              <dd>{prospect.district ?? "-"}{prospect.sector ? <span className="text-muted"> · {prospect.sector}</span> : null}</dd>
            </div>
            <div>
              <dt className="text-[11px] text-muted">Property id</dt>
              <dd className="text-muted">{prospect.uprn ? `UPRN ${prospect.uprn}` : "No UPRN in the feed"}</dd>
            </div>
          </dl>

          <section className="mt-6 rounded-2xl border border-line/80 bg-panel p-4">
            <h3 className="flex items-center justify-between text-[13px]">
              <span>Why it is here</span>
              <span className="figures text-[15px] font-semibold">{prospect.score}</span>
            </h3>
            <ul className="mt-3 space-y-2.5">
              {prospect.signals.length === 0 ? (
                <li className="text-[12px] text-muted">The signals have cleared. It stays here because somebody worked it.</li>
              ) : (
                prospect.signals.map((s) => (
                  <li key={s.key} className="text-[12.5px]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold">{SIGNALS[s.key].label}</span>
                      <span className="figures text-[11px] text-muted">+{SIGNALS[s.key].weight}</span>
                    </div>
                    <p className="text-ink">{s.detail}</p>
                    <p className="text-[11px] text-muted">{SIGNALS[s.key].why}</p>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="mt-6 space-y-4">
            <label className="block text-[12px]">
              <span className="text-[11px] text-muted">Stage</span>
              <select
                value={stage}
                onChange={(e) => setStage(e.target.value as Stage)}
                className="mt-1 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none focus:border-ink"
              >
                {STAGES.map((s) => (
                  <option key={s} value={s}>{STAGE_LABEL[s]}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12px]">
              <span className="text-[11px] text-muted">Assigned to</span>
              <input
                value={assigned}
                onChange={(e) => setAssigned(e.target.value)}
                placeholder="Who is working this"
                className="mt-1 w-full rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none placeholder:text-muted/70 focus:border-ink"
              />
            </label>
            <label className="block text-[12px]">
              <span className="text-[11px] text-muted">Notes</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                placeholder="What was done, what was said, when to look again"
                className="mt-1 w-full resize-y rounded-xl border border-line/80 bg-transparent px-3 py-2 text-[12.5px] outline-none placeholder:text-muted/70 focus:border-ink"
              />
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              <PressButton
                onClick={() => save()}
                disabled={!dirty || saving}
                className="rounded-full bg-ink px-5 py-2.5 text-[13px] font-semibold text-page disabled:opacity-40"
              >
                {saving ? "Saving..." : "Save"}
              </PressButton>
              <PressButton
                onClick={() => setBooking(true)}
                className="rounded-full border border-line/80 px-5 py-2.5 text-[13px]"
                title="Open a landlord lead for this property"
              >
                Book appraisal
              </PressButton>
              {saveError ? (
                <span className="text-[12px] text-red-700">{saveError}</span>
              ) : savedAt ? (
                <span className="text-[12px] text-muted">Saved</span>
              ) : null}
            </div>
            {prospect.last_action_at ? (
              <p className="text-[11px] text-muted">Last worked {when(prospect.last_action_at)}</p>
            ) : null}
          </section>
        </div>
      </aside>

      <NewLeadPanel
        open={booking}
        onClose={() => setBooking(false)}
        initialKind="landlord"
        initial={{
          address,
          enquiry: "Valuation",
          source: "Landlord Radar",
          notes: prospect.signals.map((s) => s.detail).join(". "),
        }}
        onCreated={() => {
          setBooking(false);
          void save({ stage: "appraisal_booked" });
        }}
      />
    </div>
  );
}
