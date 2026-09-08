"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Planning - the landlord before they are a landlord.
 *
 * Every other room in Bond works from an advert. This one works from the
 * council's planning register, which means these doors are not on any portal
 * and no other agent in the patch is looking at them. Somebody has told the
 * council they intend to create rental stock; the advert follows months later.
 *
 * A row here is not yet a prospect. Planning gives an address as the council
 * wrote it, which is not always a front door, so the way onto the board is
 * Look up - the property register resolves the door, and Add to the list puts
 * it there with the application as the reason. That is the same hand-added
 * path a colleague uses after seeing a board on a street, and it keeps one
 * door to one record.
 *
 * Where the sweep already knows the door, the signal is on it already and the
 * row is hidden unless "already on the board" is switched on.
 */

type Kind = "hmo" | "flats" | "to_residential" | "new_homes";

interface Application {
  ref: string;
  authority: string;
  address: string;
  postcode: string;
  district: string | null;
  description: string;
  kind: Kind;
  homes: number | null;
  summary: string | null;
  to_let: boolean | null;
  confident: boolean | null;
  app_state: string | null;
  app_size: string | null;
  started_on: string | null;
  decided_on: string | null;
  council_url: string | null;
  planit_url: string | null;
  property_key: string | null;
}

interface Status {
  authorities: { name: string; covers: string }[];
  held: number;
  unread: number;
  live: number;
  onTheBoard: number;
  notOnTheBoard: number;
  ownerOccupier: number;
  byKind: Record<string, number>;
  byCouncil: Array<{ authority: string; live: number }>;
  lastRun: { authority: string; status: string; rows_read: number; rows_kept: number; error: string | null; started_at: string } | null;
  reader: "ready" | "no key";
}

const KIND: Record<Kind, { label: string; tone: string; why: string }> = {
  hmo: {
    label: "HMO",
    tone: "bg-[#7b2d8e]/12 text-[#7b2d8e]",
    why: "A licence, a fire risk assessment and a council inspection ahead of them. The strongest thing on this list.",
  },
  flats: {
    label: "Into flats",
    tone: "bg-[#4a7fb5]/12 text-[#2f6f9f]",
    why: "One building becoming several homes. Every one of them is a tenancy.",
  },
  to_residential: {
    label: "Into homes",
    tone: "bg-[#2a8a7a]/12 text-[#2a8a7a]",
    why: "Was not a home, is becoming one. Almost always an investment.",
  },
  new_homes: {
    label: "New homes",
    tone: "bg-[#7a5230]/12 text-[#7a5230]",
    why: "New homes on the plot. A small site is usually somebody who will hold a few.",
  },
};
const KIND_ORDER: Kind[] = ["hmo", "flats", "to_residential", "new_homes"];

const when = (d: string | null): string =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "-";

/** The line that goes on the record when a door is added from here. */
export function reasonFor(a: Application): string {
  const what = a.summary?.trim() || `${KIND[a.kind]?.label ?? "Planning"} application`;
  return `${what}. ${a.authority} planning ${a.app_state?.toLowerCase() ?? "application"} ${when(a.started_on)}, reference ${a.ref.split("/").slice(1).join("/") || a.ref}.`;
}

export default function BondPlanning({
  districts,
  lookUp,
}: {
  districts: string[];
  lookUp: (address: string, reason: string) => void;
}) {
  const [data, setData] = useState<{ applications: Application[]; status: Status } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<Kind | "all">("all");
  const [council, setCouncil] = useState("");
  const [showOnBoard, setShowOnBoard] = useState(false);

  const key = useMemo(() => districts.join(","), [districts]);

  const load = useCallback(() => {
    setData(null);
    setError(null);
    const p = new URLSearchParams({ districts: key });
    if (showOnBoard) p.set("all", "1");
    if (council) p.set("council", council);
    fetch(`/api/bond/planning?${p}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => (j.ok ? setData({ applications: j.applications, status: j.status }) : setError(j.reason ?? "Could not read the planning register.")))
      .catch(() => setError("Could not read the planning register."));
  }, [key, showOnBoard, council]);

  useEffect(load, [load]);

  const shown = (data?.applications ?? []).filter((a) => kind === "all" || a.kind === kind);
  const counts = data?.status.byKind ?? {};

  return (
    <div>
      {data && (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {[
            ["Live in your patch", data.status.live, "Applications in the last eighteen months that are permitted or still undecided."],
            ["Not on the board yet", data.status.notOnTheBoard, "No advert anywhere. Nobody else is looking at these."],
            ["Already flagged", data.status.onTheBoard, "The sweep knows this door too, so it carries the signal already."],
            ["Waiting to be read", data.status.unread, "Held, but nothing has decided what they are yet."],
          ].map(([label, n, hint]) => (
            <div key={label as string} className="rounded-2xl border border-line/80 bg-panel p-3.5" title={hint as string}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label as string}</p>
              <p className="figures mt-1 text-[22px] font-semibold leading-none">{n as number}</p>
            </div>
          ))}
        </div>
      )}

      {data && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setKind("all")}
            className={`rounded-full px-3.5 py-1.5 text-[12px] ${kind === "all" ? "bg-ink text-page" : "border border-line/80 bg-panel"}`}
          >
            Everything
          </button>
          {KIND_ORDER.filter((k) => (counts[k] ?? 0) > 0).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              title={KIND[k].why}
              className={`rounded-full px-3.5 py-1.5 text-[12px] ${kind === k ? "bg-ink text-page" : "border border-line/80 bg-panel"}`}
            >
              {KIND[k].label}
              <span className={kind === k ? "ml-1.5 opacity-70" : "ml-1.5 text-muted"}>{counts[k]}</span>
            </button>
          ))}
          {(data.status.byCouncil.length > 1 || council) && (
            <select
              value={council}
              onChange={(e) => setCouncil(e.target.value)}
              title="The register is national. Narrow it to one council."
              className="rounded-full border border-line/80 bg-panel px-3 py-1.5 text-[12px]"
            >
              <option value="">Every council</option>
              {data.status.byCouncil.map((c) => (
                <option key={c.authority} value={c.authority}>
                  {c.authority} ({c.live})
                </option>
              ))}
            </select>
          )}
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-[12px] text-muted">
            <input type="checkbox" checked={showOnBoard} onChange={(e) => setShowOnBoard(e.target.checked)} className="h-3.5 w-3.5 accent-current" />
            Include doors already on the board
          </label>
        </div>
      )}

      {error && <p className="mt-4 text-[12.5px] text-red-700">{error}</p>}
      {!data && !error && (
        <div className="flex items-center gap-3 py-16 text-[12.5px] text-muted">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Reading the planning register...
        </div>
      )}

      {data && data.status.reader === "no key" && data.status.unread > 0 && (
        <p className="mt-4 rounded-2xl border border-dashed border-line/80 p-4 text-[12.5px] text-muted">
          {data.status.unread} applications are held but unread. Bond reads each description to work out whether it actually creates
          homes, and that needs ANTHROPIC_API_KEY set. Until then they carry no signal, because guessing from the words alone put
          garage conversions on the list.
        </p>
      )}

      {data && shown.length === 0 && (
        <div className="mt-4 rounded-2xl border border-dashed border-line/80 p-6 text-[12.5px] text-muted">
          {data.status.held === 0
            ? "Nothing read yet. The whole country is read once a week."
            : "Nothing here for this filter. Try Everything, or include the doors already on the board."}
        </div>
      )}

      <ul className="mt-4 space-y-3">
        {shown.map((a) => (
          <Card key={a.ref} a={a} lookUp={lookUp} />
        ))}
      </ul>

      {data && shown.length >= 300 && (
        <p className="mt-5 text-[11.5px] text-muted">
          The strongest 300 are listed. Narrow it with a kind, or with your patch in the rail.
        </p>
      )}
      {data && data.status.ownerOccupier > 0 && (
        <p className="mt-5 text-[11.5px] text-muted">
          {data.status.ownerOccupier} more applications are self builds, replacement houses or a home somebody is putting up for
          themselves. They are held, but they are not on this list: nobody there is looking for an agent.
        </p>
      )}
      {data?.status.lastRun && (
        <p className="mt-2 text-[11px] text-muted">
          Last read: {data.status.lastRun.authority}, {when(data.status.lastRun.started_at)}, {data.status.lastRun.rows_kept} kept of{" "}
          {data.status.lastRun.rows_read} looked at.
          {data.status.lastRun.error ? ` ${data.status.lastRun.error}` : ""}
        </p>
      )}
    </div>
  );
}

function Card({ a, lookUp }: { a: Application; lookUp: (address: string, reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const k = KIND[a.kind] ?? { label: a.kind, tone: "bg-box text-muted", why: "" };

  return (
    <li className="rounded-2xl border border-line/80 bg-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold ${k.tone}`} title={k.why}>
              {k.label}
            </span>
            {a.homes && a.homes > 1 ? <span className="text-[11px] text-muted">{a.homes} homes</span> : null}
            <span className="text-[11px] text-muted">
              {a.app_state} {when(a.started_on)}
            </span>
            {a.property_key && <span className="rounded-full bg-box px-2 py-0.5 text-[10.5px] text-muted">already on the board</span>}
            {a.confident === false && (
              <span className="text-[10.5px] text-muted" title="The description was not explicit; read it before you act on it.">
                worth a read
              </span>
            )}
          </div>
          <h3 className="mt-1.5 text-[15.5px] leading-snug">{a.summary || a.description.slice(0, 110)}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">
            {a.address}
            {a.district ? ` · ${a.district}` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => lookUp(a.postcode ? `${a.address}` : a.address, reasonFor(a))}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-page"
          title="Find this door on the property register, then put it on the board with this application as the reason"
        >
          <DoodleIcon name="home" size={13} className="invert" />
          Look up the door
        </button>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3 text-[11.5px]">
        <button type="button" onClick={() => setOpen(!open)} className="text-accent-dark underline-offset-2 hover:underline">
          {open ? "Hide what they applied for" : "What they applied for"}
        </button>
        {a.council_url && (
          <a href={a.council_url} target="_blank" rel="noreferrer" className="text-muted underline-offset-2 hover:underline">
            {a.authority} register
          </a>
        )}
        <span className="text-muted">{a.app_size} scheme</span>
      </div>

      {open && <p className="mt-2 rounded-xl border border-line/70 bg-page px-3.5 py-2.5 text-[12px] leading-relaxed">{a.description}</p>}
    </li>
  );
}
