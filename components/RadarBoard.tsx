"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import NewLeadPanel from "@/components/NewLeadPanel";
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
  const [fSignal, setFSignal] = useState<string | null>(null);
  const [fDistrict, setFDistrict] = useState<string | null>(null);
  const [fAgent, setFAgent] = useState<string | null>(null);
  const [fStage, setFStage] = useState<string | null>(null);

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
  const signalsPresent = useMemo(
    () => SIGNAL_ORDER.filter((k) => rows.some((r) => r.signals.some((s) => s.key === k))),
    [rows]
  );

  const book = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (fStage ? r.stage !== fStage : !OPEN_STAGES.includes(r.stage)) return false;
      if (!fStage && r.score === 0) return false;
      if (fSignal && !r.signals.some((s) => s.key === fSignal)) return false;
      if (fDistrict && r.district !== fDistrict) return false;
      if (fAgent && r.agent !== fAgent) return false;
      if (needle) {
        const hay = `${r.address} ${r.street ?? ""} ${r.postcode} ${r.agent ?? ""} ${r.notes}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, q, fSignal, fDistrict, fAgent, fStage]);

  useEffect(() => { setPage(0); }, [q, fSignal, fDistrict, fAgent, fStage, perPage]);

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
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="flex min-w-44 flex-1 items-center gap-2.5 rounded-full border border-line/80 px-3.5 py-2 focus-within:border-ink">
              <DoodleIcon name="search" size={14} className="shrink-0 text-muted" />
              <input
                type="text"
                placeholder="Search address, postcode or agent..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="w-full bg-transparent text-[12px] outline-none placeholder:text-muted/70"
              />
            </label>
            <Filter
              label="All signals"
              options={signalsPresent}
              value={fSignal}
              onChange={setFSignal}
              render={(k) => SIGNALS[k as SignalKey].label}
            />
            <Filter label="All districts" options={districts} value={fDistrict} onChange={setFDistrict} />
            <Filter label="All agents" options={agents} value={fAgent} onChange={setFAgent} />
            <Filter
              label="Open"
              options={[...STAGES]}
              value={fStage}
              onChange={setFStage}
              render={(s) => STAGE_LABEL[s as Stage]}
            />
            <ColumnCustomiser cols={cols} />
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
