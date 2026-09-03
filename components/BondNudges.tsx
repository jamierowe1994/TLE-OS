"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { CopyButton } from "@/components/Bits";
import type { AskFocus } from "@/components/BondAsk";

/**
 * Nudges - the call list.
 *
 * People who have dealt with us, whose door the sweep has just seen move:
 * back on the market with someone else, valued by us and listed elsewhere,
 * a year since the valuation. Each card says who, why now, and the line to
 * open with. Called, snoozed or not now, with a note; the outcome lands in
 * Today's feed like everything else in Bond.
 */

type Kind = "win_back" | "former_landlord" | "appraisal_elsewhere" | "appraisal_anniversary" | "lost_instruction";
type Status = "open" | "snoozed" | "done" | "dismissed" | "gone";

interface Nudge {
  id: number;
  kind: Kind;
  source: string;
  property_key: string | null;
  address: string;
  postcode: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  our_agent: string | null;
  headline: string;
  reason: string;
  opener: string;
  detail: { listing?: { agent?: string | null; rent?: number | null }; signals?: string[] };
  score: number;
  status: Status;
  snoozed_until: string | null;
  notes: string;
  done_by: string | null;
  first_seen: string;
}

interface Data {
  nudges: Nudge[];
  counts: Record<Status, number>;
  byKind: Partial<Record<Kind, number>>;
  rex: { synced_at: string | null; doors: number; contactsLeft: number };
}

const KIND: Record<Kind, { label: string; tone: string }> = {
  win_back: { label: "Win back", tone: "bg-[#8d3b72]/12 text-[#8d3b72]" },
  former_landlord: { label: "Former landlord", tone: "bg-[#2f6f9f]/12 text-[#2f6f9f]" },
  appraisal_elsewhere: { label: "Valued, listed elsewhere", tone: "bg-[#b5453c]/12 text-[#b5453c]" },
  appraisal_anniversary: { label: "A year since we valued it", tone: "bg-[#e6b422]/20 text-[#7a5a00]" },
  lost_instruction: { label: "Lost this year", tone: "bg-[#5c5c8a]/12 text-[#5c5c8a]" },
};
const KIND_ORDER: Kind[] = ["win_back", "appraisal_elsewhere", "former_landlord", "appraisal_anniversary", "lost_instruction"];
const TABS: { key: Status; label: string }[] = [
  { key: "open", label: "To call" },
  { key: "snoozed", label: "Snoozed" },
  { key: "done", label: "Called" },
  { key: "dismissed", label: "Not now" },
  { key: "gone", label: "Gone" },
];

function when(iso: string | null): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export default function BondNudges({
  districts,
  openDoor,
  onAsk,
}: {
  districts: string[];
  openDoor: (address: string) => void;
  onAsk: (f: AskFocus) => void;
}) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("open");
  const [kind, setKind] = useState<Kind | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/bond/nudges?districts=${encodeURIComponent(districts.join(","))}&status=${status}`, { cache: "no-store" });
      const j = await r.json();
      if (!j.ok) throw new Error(j.reason ?? "Could not read the call list.");
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the call list.");
    }
  }, [districts, status]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

  async function act(n: Nudge, patch: { status?: Status; snooze_days?: number; notes?: string }) {
    const r = await fetch("/api/bond/nudges", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: n.id, ...patch }) });
    const j = await r.json();
    if (!j.ok) {
      setError(j.error ?? "That did not save.");
      return;
    }
    setData((d) => {
      if (!d) return d;
      const moved = patch.status && patch.status !== status;
      return { ...d, nudges: moved ? d.nudges.filter((x) => x.id !== n.id) : d.nudges.map((x) => (x.id === n.id ? (j.nudge as Nudge) : x)) };
    });
  }

  const shown = (data?.nudges ?? []).filter((n) => !kind || n.kind === kind);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setStatus(t.key)}
            className={`rounded-full px-3.5 py-1.5 text-[12px] ${status === t.key ? "bg-ink text-page" : "border border-line/80 text-muted hover:text-ink"}`}
          >
            {t.label}
            {data && data.counts[t.key] > 0 && <span className="ml-1.5 opacity-70">{data.counts[t.key]}</span>}
          </button>
        ))}
        <p className="ml-auto text-[11px] text-muted">
          {data?.rex.synced_at
            ? `Book read ${when(data.rex.synced_at)} · ${data.rex.doors.toLocaleString("en-GB")} doors${data.rex.contactsLeft ? ` · ${data.rex.contactsLeft} landlords still to read` : ""}`
            : "The book has not been read from REX yet"}
        </p>
      </div>

      {status === "open" && data && Object.keys(data.byKind).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {KIND_ORDER.filter((k) => data.byKind[k]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(kind === k ? null : k)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity ${KIND[k].tone} ${kind && kind !== k ? "opacity-40" : ""}`}
            >
              {KIND[k].label} · {data.byKind[k]}
            </button>
          ))}
        </div>
      )}

      {error && <p className="mt-4 text-[12.5px] text-red-700">{error}</p>}
      {!data && !error && (
        <div className="flex items-center gap-3 py-16 text-[12.5px] text-muted">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Reading the call list...
        </div>
      )}
      {data && shown.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px] text-muted">
          {status === "open"
            ? "Nothing to call right now. Nudges appear when a door we have dealt with moves: back on the market with someone else, a year since we valued it. The list rebuilds after every sweep."
            : "Nothing here."}
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {shown.map((n) => (
          <Card key={n.id} n={n} status={status} act={act} openDoor={openDoor} onAsk={onAsk} />
        ))}
      </ul>
    </div>
  );
}

function Card({
  n,
  status,
  act,
  openDoor,
  onAsk,
}: {
  n: Nudge;
  status: Status;
  act: (n: Nudge, patch: { status?: Status; snooze_days?: number; notes?: string }) => Promise<void>;
  openDoor: (address: string) => void;
  onAsk: (f: AskFocus) => void;
}) {
  const [notes, setNotes] = useState(n.notes);
  const [open, setOpen] = useState(false);
  const k = KIND[n.kind] ?? { label: n.kind, tone: "bg-box text-muted" };
  const first = (n.contact_name ?? "").split(/\s+/)[0];

  return (
    <li className="rounded-2xl border border-line/80 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${k.tone}`}>{k.label}</span>
            <span className="text-[11px] text-muted">score {n.score}</span>
            {n.status === "snoozed" && n.snoozed_until && <span className="text-[11px] text-muted">until {when(n.snoozed_until)}</span>}
            {n.status === "done" && n.done_by && <span className="text-[11px] text-muted">called by {n.done_by}</span>}
          </div>
          <h3 className="mt-1.5 text-[16px] leading-snug">
            {n.contact_name ?? "Landlord not on the record"}
            <span className="text-muted"> · {n.headline}</span>
          </h3>
          <button type="button" onClick={() => openDoor(n.address)} className="mt-0.5 text-left text-[12.5px] text-accent-dark underline-offset-2 hover:underline" title="Find this door on the board">
            {n.address}
          </button>
        </div>
        <div className="flex flex-col items-end gap-1 text-[12.5px]">
          {n.contact_phone ? (
            <a href={`tel:${n.contact_phone.replace(/\s+/g, "")}`} className="flex items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-page">
              <DoodleIcon name="call" size={13} className="invert" />
              {n.contact_phone}
            </a>
          ) : (
            <span className="text-[11px] text-muted">No number on the record</span>
          )}
          {n.contact_email && (
            <a href={`mailto:${n.contact_email}`} className="text-[11.5px] text-muted underline-offset-2 hover:underline">
              {n.contact_email}
            </a>
          )}
          {n.our_agent && <span className="text-[10.5px] text-muted">was with {n.our_agent}</span>}
        </div>
      </div>

      <p className="mt-3 text-[12.5px] leading-relaxed">{n.reason}</p>

      <div className="mt-3 rounded-xl border border-line/70 bg-page px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted">Open with{first ? `, to ${first}` : ""}</p>
          <CopyButton value={n.opener} label="the opener" />
        </div>
        <p className="mt-1 text-[12.5px] leading-relaxed">{n.opener}</p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {status === "open" || status === "snoozed" ? (
          <>
            <button type="button" onClick={() => act(n, { status: "done" })} className="press-wobble rounded-full bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-page">
              Called
            </button>
            <button type="button" onClick={() => act(n, { status: "snoozed", snooze_days: 30 })} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink">
              Snooze 30 days
            </button>
            <button type="button" onClick={() => act(n, { status: "dismissed" })} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink">
              Not now
            </button>
          </>
        ) : (
          <button type="button" onClick={() => act(n, { status: "open" })} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink">
            Reopen
          </button>
        )}
        {n.property_key && (
          <button
            type="button"
            onClick={() => onAsk({ kind: "door", key: n.property_key as string, label: n.address })}
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] text-muted hover:text-ink"
          >
            Ask Bond
          </button>
        )}
        <button type="button" onClick={() => setOpen((o) => !o)} className="ml-auto text-[11.5px] text-muted underline-offset-2 hover:underline">
          {open ? "Hide note" : n.notes ? "Note" : "Add a note"}
        </button>
      </div>
      {(open || n.notes) && (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== n.notes && act(n, { notes })}
          rows={2}
          placeholder="How did the call go?"
          className="mt-2 w-full resize-none rounded-xl border border-line/80 bg-page px-3 py-2 text-[12.5px] outline-none focus:border-ink"
        />
      )}
    </li>
  );
}
