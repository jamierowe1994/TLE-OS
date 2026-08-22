"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { FlowTag, Pill } from "@/components/Wire";
import type { ChaseRow, QueuedReminder, TrackerBook } from "@/lib/compliance-tracker";

/**
 * Michael's tracker — the back-office view of compliance.
 *
 * The compliance page answers "is this property compliant". This answers the
 * only question the back office actually has: **across the whole book, what
 * needs a person today, and who do I chase.**
 *
 * Deliberately plain. The data and the states are the work here; the look is
 * James's to rework at the desk.
 */

type Payload = TrackerBook & {
  ok: boolean;
  live: boolean;
  reason?: string;
  stale?: boolean;
  queue: QueuedReminder[];
  error?: string;
};

const cell = "px-3 py-2 align-top";

function Rows({ rows, empty }: { rows: ChaseRow[]; empty: string }) {
  if (!rows.length) return <p className="py-6 text-[12.5px] text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line/70 text-left text-[9.5px] font-bold uppercase tracking-wider text-muted">
            <th className={cell}>Property</th>
            <th className={cell}>Certificate</th>
            <th className={cell}>State</th>
            <th className={cell}>Landlord</th>
            <th className={cell}>Agent</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r) => (
            <tr key={`${r.propertyId}-${r.cert}`} className="border-b border-line/40 last:border-0">
              <td className={cell}>
                <span className="block">{r.property}</span>
                <span className="block text-[10.5px] text-muted">{r.locality}</span>
              </td>
              <td className={cell}>{r.certLabel}</td>
              <td className={cell}>
                <Pill tone={r.status === "expired" || r.status === "missing" ? "accent" : "neutral"}>
                  {r.status === "expired"
                    ? "Expired"
                    : r.status === "missing"
                      ? "No record"
                      : `${r.daysLeft}d`}
                </Pill>
                <span className="mt-1 block max-w-[320px] text-[10.5px] leading-snug text-muted">
                  {r.reason}
                </span>
              </td>
              <td className={cell}>{r.landlord}</td>
              <td className={cell}>
                {r.agent ?? <span className="text-accent-dark">not recorded</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 200 && (
        <p className="mt-2 text-[11px] text-muted">
          Showing the first 200 of {rows.length}, worst first.
        </p>
      )}
    </div>
  );
}

export default function ComplianceTracker() {
  const [d, setD] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"outstanding" | "upcoming" | "queue">("outstanding");

  useEffect(() => {
    let live = true;
    fetch("/api/compliance/tracker")
      .then((r) => r.json())
      .then((p: Payload) => {
        if (!live) return;
        if (p.ok === false) setError(p.error ?? "Couldn't read the compliance book.");
        else setD(p);
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <PageHeader
        title="Compliance tracker"
        blurb="What is outstanding, what is coming, and who to chase — across the whole book."
      />

      <div className="mt-10">
        <FlowTag from="REX" to="here" />
      </div>

      {error && (
        <p className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 text-[12.5px] text-muted">
          {error}
        </p>
      )}
      {!d && !error && (
        <p className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5 text-[12.5px] text-muted">
          Reading the compliance book… the first read of the day takes a while.
        </p>
      )}

      {d && (
        <>
          {!d.live && (
            <p className="fade-up mt-4 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12px] leading-relaxed">
              <span className="font-semibold">Not live.</span> {d.reason} Every figure below
              is from the sample book — do not quote them.
            </p>
          )}

          <div className="fade-up mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {[
              ["Expired", d.counts.expired, "past the date"],
              ["No record", d.counts.missing, "we cannot say"],
              ["30 days", d.counts.band30, "chase due"],
              ["14 days", d.counts.band14, "chase due"],
              ["7 days", d.counts.band7, "chase due"],
              ["No agent", d.counts.noAgent, "cannot chase properly"],
            ].map(([label, n, sub]) => (
              <div key={label as string} className="rounded-2xl border border-line/80 bg-panel p-4">
                <p className="figures text-[22px] leading-none">{n as number}</p>
                <p className="mt-1 text-[10.5px] leading-tight">{label as string}</p>
                <p className="text-[10px] leading-tight text-muted">{sub as string}</p>
              </div>
            ))}
          </div>

          {/* A date with no document behind it is half a record — and EPC is
              the worst offender, measured at zero documents on 100 sampled
              entries. Worth its own line because it looks compliant. */}
          {d.counts.dateWithoutDocument > 0 && (
            <p className="fade-up mt-3 rounded-2xl border border-line/80 bg-panel p-4 text-[11.5px] leading-relaxed text-muted">
              <span className="font-semibold text-ink">
                {d.counts.dateWithoutDocument} certificates are in date but have no document on
                file.
              </span>{" "}
              They read as compliant and we could not produce them if anybody asked.
            </p>
          )}

          <div className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["outstanding", `Outstanding (${d.outstanding.length})`],
                  ["upcoming", `Coming up (${d.upcoming.length})`],
                  ["queue", `Chase queue (${d.queue.length})`],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12px] transition-colors ${
                    tab === id ? "border-accent-dark bg-accent-dark text-white" : "border-line/80"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "outstanding" && (
              <Rows
                rows={d.outstanding}
                empty="Nothing expired and nothing missing. That would be a first."
              />
            )}
            {tab === "upcoming" && (
              <Rows rows={d.upcoming} empty="Nothing falls due in the next 30 days." />
            )}
            {tab === "queue" && (
              <>
                <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
                  What would go out, if sending were wired. It is not.{" "}
                  <span className="font-semibold text-ink">Nothing on this page can send.</span>{" "}
                  Every reminder addresses the landlord and the agent together — an agent must
                  never be surprised by a chase on their own file.
                </p>
                {d.queue.length === 0 ? (
                  <p className="py-6 text-[12.5px] text-muted">Nothing due to be chased today.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.queue.slice(0, 100).map((r) => (
                      <li key={r.key} className="rounded-xl border border-line/70 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[12.5px]">{r.subject}</span>
                          <Pill tone="neutral">{r.band}-day</Pill>
                        </div>
                        <p className="mt-1 text-[11px] text-muted">
                          To: {r.to.landlord}
                          {r.to.agent ? ` and ${r.to.agent}` : ""}
                        </p>
                        {r.blocked && (
                          <p className="mt-1 text-[11px] text-accent-dark">{r.blocked}</p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <ul className="mt-4 space-y-1.5 text-[11px] leading-relaxed text-muted">
            <li>
              Reminders are owed by <span className="font-semibold">band, not by exact day</span> —
              a certificate with 22 days left sits in the 30-day band until it crosses into the
              14-day one. Keying on the exact day would mean one missed run loses that chase
              permanently, and nothing would show it had.
            </li>
            <li>
              Only certificates a property is <span className="font-semibold">required</span> to
              hold are listed. A gasless house is not chased for a gas certificate.
            </li>
            <li>
              <span className="font-semibold">An expired certificate is not in a chase band.</span>{" "}
              It is past chasing and needs a person, so it sits in Outstanding rather than
              queueing quietly as a 7-day reminder.
            </li>
          </ul>
        </>
      )}
    </>
  );
}
