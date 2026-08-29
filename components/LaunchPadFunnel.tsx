"use client";

import { useEffect, useMemo, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import type { Funnel, LeadBucket, MirroredLead } from "@/lib/launchpad";

/**
 * The Launch Pad funnel, mirrored into the OS.
 *
 * ── Two windows, one book ─────────────────────────────────────────────────
 *
 * Launch Pad keeps the leads and stays fully usable; this is a second window
 * so the everyday view does not need a second login. Which is why every row
 * opens the lead IN LAUNCH PAD rather than pretending to be it: this slice is
 * the list, and a row that looked editable here would be lying.
 *
 * The buckets are NOT worked out on this side. Uncontacted, Follow-ups and
 * Resting are derived from stage, archived and follow-up date against the
 * clock, and deriving that twice in two codebases is how one window comes to
 * say four and the other six. Launch Pad decides; this renders.
 *
 * ── Desktop only, and it says so ──────────────────────────────────────────
 *
 * James, 29 Aug: "this desktop won't be available on mobile yet... if they
 * want to go to their phone, then we will push them to the PWA."
 *
 * So the phone gets a real answer instead of a squeezed table. That is a
 * deliberate screen, not a missing one — this project has 44 mobile bugs on
 * record, and every one of them started as a desktop layout left to cope.
 */

const BUCKETS: { key: LeadBucket; label: string; blurb: string }[] = [
  { key: "uncontacted", label: "Uncontacted", blurb: "Nobody has tried them yet." },
  { key: "follow-up", label: "Follow-ups", blurb: "Tried, and due back now." },
  { key: "resting", label: "Resting", blurb: "Reminder set for a later date." },
  { key: "won", label: "Booked", blurb: "Appointment made or sent to the CRM." },
];

type Load =
  | { state: "loading" }
  | { state: "denied"; reason: string }
  | { state: "error" }
  | { state: "ready"; funnel: Funnel };

const time = (iso: string | null) => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return null;
  }
};

const day = (iso: string | null) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  } catch {
    return "—";
  }
};

const STAGE_LABEL: Record<string, string> = {
  new: "New",
  attempt1: "Try 1",
  attempt2: "Try 2",
  attempt3: "Try 3",
  nurture: "Marketing funnel",
  converted: "Booked",
  pushed: "In REX",
  lost: "Lost",
};

function Rows({ leads }: { leads: MirroredLead[] }) {
  if (leads.length === 0) {
    return <p className="px-1 py-6 text-[12.5px] text-muted">Nothing in here right now.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-[12.5px]">
        <thead>
          <tr className="border-b border-line/60 text-left text-[10px] font-bold uppercase tracking-wider text-muted">
            <th className="py-2 pr-3 font-bold">Name</th>
            <th className="py-2 pr-3 font-bold">Came from</th>
            <th className="py-2 pr-3 font-bold">Stage</th>
            <th className="py-2 pr-3 font-bold">Received</th>
            <th className="py-2 pr-3 font-bold">Due back</th>
            <th className="py-2 font-bold" />
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id} className="border-b border-line/40">
              <td className="py-2.5 pr-3">
                <span className="text-ink">{l.name || "No name given"}</span>
                {l.phone ? <span className="ml-2 text-[11px] text-muted">{l.phone}</span> : null}
              </td>
              <td className="py-2.5 pr-3 text-muted">{l.adName || l.source}</td>
              <td className="py-2.5 pr-3 text-muted">{STAGE_LABEL[l.stage] ?? l.stage}</td>
              <td className="py-2.5 pr-3 tnum text-muted">{day(l.receivedAt)}</td>
              <td className="py-2.5 pr-3 tnum text-muted">{day(l.followUpAt)}</td>
              <td className="py-2.5 text-right">
                {/* Straight to the lead's own file. Working a lead still
                    happens in Launch Pad, so this must land on the record and
                    not on a list they then have to search. */}
                <a
                  href={l.deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="whitespace-nowrap rounded-lg border border-line/80 px-2.5 py-1 text-[11.5px] text-muted transition-colors hover:text-ink"
                >
                  Open
                </a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function LaunchPadFunnel() {
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [tab, setTab] = useState<LeadBucket>("uncontacted");

  useEffect(() => {
    let alive = true;
    fetch("/api/tools/launchpad-leads", { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!alive) return;
        if (r.status === 403) {
          setLoad({ state: "denied", reason: j?.reason ?? "not-pro" });
          return;
        }
        /* A funnel we could not fetch must never render as an empty one. An
           agent shown zero leads believes it and stops looking. */
        if (!r.ok || !j?.funnel) {
          setLoad({ state: "error" });
          return;
        }
        setLoad({ state: "ready", funnel: j.funnel as Funnel });
      })
      .catch(() => alive && setLoad({ state: "error" }));
    return () => {
      alive = false;
    };
  }, []);

  const shown = useMemo(
    () => (load.state === "ready" ? load.funnel.leads.filter((l) => l.bucket === tab) : []),
    [load, tab]
  );

  if (load.state === "loading") {
    return <p className="mt-8 text-[12.5px] text-muted">Loading your funnel…</p>;
  }

  if (load.state === "denied") {
    return (
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5">
        <p className="text-[13.5px]">
          {load.reason === "unknown-person"
            ? "We cannot find your licence record."
            : load.reason === "unavailable"
              ? "We cannot check your licence just now."
              : "Launch Pad is not part of your licence."}
        </p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          {load.reason === "unknown-person"
            ? "Ask the office to check it, and this will open up on its own."
            : load.reason === "unavailable"
              ? "Nothing is wrong with your account. Try again shortly."
              : "Speak to Susan about going Pro."}
        </p>
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5">
        <p className="text-[13.5px]">Couldn&apos;t load your funnel.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your leads are safe in Launch Pad. This is the link between the two, not the leads
          themselves. Try again in a moment.
        </p>
      </div>
    );
  }

  const { funnel } = load;

  if (!funnel.found) {
    return (
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5">
        <p className="text-[13.5px]">You have not set Launch Pad up yet.</p>
        <p className="mt-1 text-[12.5px] leading-relaxed text-muted">
          Your licence covers it. Once your account is running, your leads appear here
          automatically.
        </p>
        {funnel.appUrl ? (
          <a
            href={funnel.appUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg border border-line/80 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            Set it up
          </a>
        ) : null}
      </div>
    );
  }

  const at = time(funnel.computedAt);

  return (
    <>
      {/* The phone gets a real screen, not a squeezed table. */}
      <div className="fade-up mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-5 lg:hidden">
        <div className="flex items-center gap-2.5">
          <DoodleIcon name="rocket" size={18} />
          <p className="text-[13.5px]">Use the app on your phone</p>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          This view is built for a desktop screen. On a phone the Launch Pad app is the better
          place to work leads, and it can notify you the moment one lands.
        </p>
        {funnel.appUrl ? (
          <a
            href={funnel.appUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-block rounded-lg border border-line/80 px-3 py-1.5 text-[12px] text-muted transition-colors hover:text-ink"
          >
            Open Launch Pad
          </a>
        ) : null}
      </div>

      <div className="hidden lg:block">
        <div className="fade-up mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BUCKETS.map((b) => {
            const on = tab === b.key;
            return (
              <button
                key={b.key}
                type="button"
                onClick={() => setTab(b.key)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  on ? "border-ink bg-panel" : "border-line/80 bg-panel hover:border-ink"
                }`}
              >
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  {b.label}
                </p>
                <p className="figures mt-1.5 text-[24px] leading-none">
                  {funnel.counts[b.key] ?? 0}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">{b.blurb}</p>
              </button>
            );
          })}
        </div>

        <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-[15px]">{BUCKETS.find((b) => b.key === tab)?.label}</h2>
            {/* Named as Launch Pad's judgement rather than implied as live.
                Resting depends on the clock: due at 08:00 is resting at 07:59. */}
            {at ? (
              <span className="text-[11px] text-muted">As Launch Pad saw it at {at}</span>
            ) : null}
          </div>
          <div className="mt-2">
            <Rows leads={shown} />
          </div>
        </section>
      </div>
    </>
  );
}
