"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import type { ChaseRecord, ChaseSettings } from "@/lib/cert-chase";

/**
 * Agent Chases: every follow-up sent to an agent about a certificate, in one
 * list (Josel, ticket 11c8acc9, 11 Nov 2026: Sue "would like this ... to
 * maintain a clear audit trail and ensure we have a record of all follow-ups
 * sent to agents regarding outstanding compliance certificates").
 *
 * Both kinds in one place: the chases sent by hand from Property Compliance
 * and the automatic reminders. Filtered by agent, home, date and kind, and
 * downloadable on the house export rules. The automatic reminder's stages are
 * picked at the foot; whether it sends at all is James's switch.
 */

type Payload = {
  ok: boolean;
  error?: string;
  stored?: boolean;
  reason?: string;
  chases: ChaseRecord[];
  agents: string[];
  settings?: ChaseSettings;
  automatic?: boolean;
};

const CERT_NAMES: Record<string, string> = {
  gas: "Gas Safety",
  eicr: "EICR",
  epc: "EPC",
  licence: "HMO Licence",
  fire: "Fire Risk Assessment",
  pat: "PAT Testing",
  alarms: "Smoke & CO Alarms",
  legionella: "Legionella",
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/London" });
const pretty = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function Settings({ s, automatic, onSaved }: { s: ChaseSettings; automatic: boolean; onSaved: (s: ChaseSettings) => void }) {
  const [before, setBefore] = useState<number[]>(s.before);
  const [onExpiry, setOnExpiry] = useState(s.onExpiry);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const changed = before.join() !== s.before.join() || onExpiry !== s.onExpiry;
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch("/api/compliance/chases", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ before, onExpiry }),
      }).then((r) => r.json());
      if (j.ok) {
        onSaved(j.settings);
        setMsg("Saved.");
      } else setMsg(j.error || "That didn't save.");
    } catch {
      setMsg("That didn't save - the OS could not be reached.");
    } finally {
      setBusy(false);
    }
  }
  const box = (on: boolean, label: string, flip: () => void) => (
    <label key={label} className="flex items-center gap-2 rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12.5px]">
      <input type="checkbox" checked={on} onChange={flip} className="accent-[#7a4b33]" />
      {label}
    </label>
  );
  return (
    <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
      <h2 className="text-[15px]">Automatic Reminders</h2>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Early each morning (6am, 7am in summer) the agent is emailed the certificates on their homes that have reached one of these points,
        once per point for each certificate, and it is recorded here.{" "}
        {automatic ? (
          <span className="font-semibold text-[#2f6b3a]">Switched on.</span>
        ) : (
          <span className="font-semibold text-accent-dark">
            Switched off: nothing is sent until James turns on Certificate chases in Admin, Switches.
          </span>
        )}
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {[30, 14, 7].map((n) =>
          box(before.includes(n), `${n} days before`, () =>
            setBefore((b) => (b.includes(n) ? b.filter((x) => x !== n) : [...b, n].sort((a, c) => c - a)))
          )
        )}
        {box(onExpiry, "On the day it runs out", () => setOnExpiry((v) => !v))}
        <button
          type="button"
          onClick={() => void save()}
          disabled={!changed || busy}
          className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {msg && <span className="text-[11.5px] text-muted">{msg}</span>}
      </div>
      {s.updatedBy && s.updatedAt && (
        <p className="mt-2 text-[11px] text-muted">
          Last changed by {s.updatedBy}, {when(s.updatedAt)}.
        </p>
      )}
    </section>
  );
}

export default function AgentChases() {
  const [d, setD] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agent, setAgent] = useState("");
  const [home, setHome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [how, setHow] = useState("");
  const [cert, setCert] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const qs = () => {
    const sp = new URLSearchParams();
    for (const [k, v] of [["agent", agent], ["home", home], ["from", from], ["to", to], ["how", how], ["cert", cert]] as const) if (v.trim()) sp.set(k, v.trim());
    return sp.toString();
  };

  /* Read again a moment after the filters stop changing. */
  useEffect(() => {
    let live = true;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/compliance/chases?${qs()}`)
        .then((r) => r.json())
        .then((j: Payload) => {
          if (!live) return;
          if (j.ok === false) setError(j.error ?? "The chase record couldn't be read.");
          else {
            setError(null);
            setD(j);
          }
        })
        .catch(() => live && setError("The OS could not be reached. Try again in a minute."))
        .finally(() => live && setLoading(false));
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent, home, from, to, how, cert]);

  const field = "w-full rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12.5px] sm:w-auto";
  const rows = d?.chases ?? [];
  const filtered = Boolean(agent || home || from || to || how || cert);

  return (
    <>
      <PageHeader
        title="Agent Chases"
        blurb="Every time an agent has been chased about a certificate, by hand from Property Compliance or by the automatic reminder. Newest first."
        search={false}
      />

      <div className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent" className={`${field} sm:max-w-[220px]`}>
            <option value="">Every agent</option>
            {(d?.agents ?? []).map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <select value={cert} onChange={(e) => setCert(e.target.value)} aria-label="Certificate" className={`${field} sm:max-w-[200px]`}>
            <option value="">Every certificate</option>
            {Object.entries(CERT_NAMES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select value={how} onChange={(e) => setHow(e.target.value)} aria-label="How" className={`${field} sm:max-w-[190px]`}>
            <option value="">By hand and automatic</option>
            <option value="hand">By hand only</option>
            <option value="auto">Automatic only</option>
          </select>
          <input value={home} onChange={(e) => setHome(e.target.value)} placeholder="Find a home" aria-label="Home" className={`${field} sm:max-w-[220px]`} />
          <label className="flex w-full items-center gap-1.5 text-[11.5px] text-muted sm:w-auto">
            From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="min-w-0 flex-1 rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12.5px] text-ink" />
          </label>
          <label className="flex w-full items-center gap-1.5 text-[11.5px] text-muted sm:w-auto">
            To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="min-w-0 flex-1 rounded-full border border-line/80 bg-white px-3 py-1.5 text-[12.5px] text-ink" />
          </label>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setAgent("");
                setHome("");
                setFrom("");
                setTo("");
                setHow("");
                setCert("");
              }}
              className="text-[12px] text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Clear
            </button>
          )}
          <a
            href={`/api/compliance/chases?${qs()}${qs() ? "&" : ""}format=xlsx`}
            className={`ml-auto rounded-full border border-line/80 px-3.5 py-1.5 text-[12px] font-semibold ${rows.length ? "" : "pointer-events-none opacity-40"}`}
          >
            Download as Excel
          </a>
        </div>

        {error && <p className="mt-4 text-[12.5px] text-accent-dark">{error}</p>}
        {d && d.stored === false && <p className="mt-4 text-[12.5px] text-muted">{d.reason}</p>}
        {loading && !d && (
          <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
            Reading the chase record…
          </p>
        )}

        {d && d.stored !== false && (
          <>
            <p className="mt-4 flex items-center gap-2 text-[11.5px] text-muted">
              {loading && <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />}
              {rows.length === 0
                ? filtered
                  ? "No chase matches that."
                  : "Nobody has been chased yet. Chase the Agent is on each certificate in Property Compliance."
                : `${rows.length}${rows.length >= 2000 ? "+" : ""} chase${rows.length === 1 ? "" : "s"}${filtered ? " matching" : ""}.`}
            </p>
            {/* A phone gets one card per chase: the table is too wide to read sideways. */}
            {rows.length > 0 && (
              <ul className="mt-2 space-y-2 sm:hidden">
                {rows.map((c) => (
                  <li key={c.id} className="rounded-xl border border-line/60 p-3">
                    <button type="button" onClick={() => setOpen(open === c.id ? null : c.id)} className="block w-full text-left">
                      <span className="flex items-start justify-between gap-2">
                        <span className="text-[12.5px] font-semibold">{c.property}</span>
                        {c.sent ? <Pill tone="good">{c.via === "mailbox" ? "Their Outlook" : "Sent"}</Pill> : <Pill tone="accent">Did not go</Pill>}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-muted">
                        {c.certLabel}, {c.certState === "expired" ? "expired" : c.certState === "missing" ? "no record" : "due"}
                        {c.expiry ? ` ${pretty(c.expiry)}` : ""}
                      </span>
                      <span className="mt-1 block text-[11.5px]">
                        {c.how === "auto"
                          ? `Automatic reminder to ${c.agentName}${c.stage === 0 ? ", on expiry" : c.stage != null ? `, ${c.stage} days before` : ""}`
                          : `${c.byName} chased ${c.agentName}`}
                      </span>
                      <span className="block text-[11px] text-muted">{when(c.at)}</span>
                    </button>
                    {open === c.id && (
                      <div className="mt-2 border-t border-line/50 pt-2">
                        {!c.sent && c.note && <p className="mb-1.5 text-[11.5px] text-accent-dark">It did not go: {c.note}.</p>}
                        <p className="text-[12px] font-semibold">{c.subject}</p>
                        <p className="mt-1 whitespace-pre-wrap break-words text-[12px] leading-relaxed text-muted">{c.message}</p>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {rows.length > 0 && (
              <div className="mt-2 hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line/70 text-left text-[9.5px] font-bold uppercase tracking-wider text-muted">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Home</th>
                      <th className="px-3 py-2">Certificate</th>
                      <th className="px-3 py-2">Agent</th>
                      <th className="px-3 py-2">How</th>
                      <th className="px-3 py-2">Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <Fragment key={c.id}>
                        <tr
                          className={`cursor-pointer align-top hover:bg-page ${open === c.id ? "" : "border-b border-line/40"}`}
                          onClick={() => setOpen(open === c.id ? null : c.id)}
                        >
                          <td className="whitespace-nowrap px-3 py-2">{when(c.at)}</td>
                          <td className="px-3 py-2">{c.property}</td>
                          <td className="px-3 py-2">
                            <span className="block">{c.certLabel}</span>
                            <span className="block text-[10.5px] text-muted">
                              {c.certState === "expired" ? "Expired" : c.certState === "missing" ? "No record" : "Due"}
                              {c.expiry ? ` ${pretty(c.expiry)}` : ""}
                            </span>
                          </td>
                          <td className="px-3 py-2">{c.agentName}</td>
                          <td className="px-3 py-2">
                            {c.how === "auto" ? (
                              <>
                                <span className="block">Automatic</span>
                                <span className="block text-[10.5px] text-muted">{c.stage === 0 ? "on expiry" : c.stage != null ? `${c.stage} days before` : ""}</span>
                              </>
                            ) : (
                              <>
                                <span className="block">By hand</span>
                                <span className="block text-[10.5px] text-muted">{c.byName}</span>
                              </>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {c.sent ? (
                              <Pill tone="good">{c.via === "mailbox" ? "Their Outlook" : "Sent"}</Pill>
                            ) : (
                              <Pill tone="accent">Did not go</Pill>
                            )}
                          </td>
                        </tr>
                        {open === c.id && (
                          <tr className="border-b border-line/40">
                            <td colSpan={6} className="px-3 pb-3">
                              <div className="rounded-xl border border-line/70 bg-page p-3.5">
                                {!c.sent && c.note && <p className="mb-2 text-[11.5px] text-accent-dark">It did not go: {c.note}.</p>}
                                <p className="text-[12px] font-semibold">{c.subject}</p>
                                <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-muted">{c.message}</p>
                                <Link
                                  href={`/compliance-desk/properties?cert=${encodeURIComponent(c.cert)}`}
                                  className="mt-2 inline-block text-[11.5px] font-semibold text-accent-dark underline-offset-2 hover:underline"
                                >
                                  Open in Property Compliance
                                </Link>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {d?.settings && <Settings s={d.settings} automatic={Boolean(d.automatic)} onSaved={(s) => setD((cur) => (cur ? { ...cur, settings: s } : cur))} />}
    </>
  );
}
