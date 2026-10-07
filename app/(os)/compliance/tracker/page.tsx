"use client";

import { asOf } from "@/lib/as-of";
import { Fragment, useEffect, useRef, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
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
  ageMs?: number;
  queue: QueuedReminder[];
  /** What has actually gone, from the send log. Null = it could not be read. */
  chases?: { key: string; to: string; at: string }[] | null;
  error?: string;
};

const cell = "px-3 py-2 align-top";

type Sent = Map<string, { to: string; at: string }>;

const day = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });


/** REX's certificate types for each tracker key. The first is the default. */
const TYPES: Record<string, { id: string; label: string }[]> = {
  gas: [{ id: "gas_safety", label: "Gas safety record" }],
  eicr: [{ id: "eicr", label: "EICR" }],
  epc: [{ id: "epc", label: "EPC" }],
  pat: [{ id: "portable_appliance_testing", label: "PAT report" }],
  legionella: [{ id: "legionella_risk_assessment", label: "Legionella risk assessment" }],
  fire: [{ id: "emergency_lighting_fire_exit", label: "Fire risk assessment / fire safety" }],
  alarms: [
    { id: "smoke_alarms", label: "Smoke alarms" },
    { id: "co_alarms", label: "CO alarms" },
  ],
  licence: [
    { id: "mandatory_hmo_license", label: "Mandatory HMO licence" },
    { id: "additional_hmo_license", label: "Additional HMO licence" },
    { id: "selective_hmo_license", label: "Selective licence" },
  ],
};

type Read = { expiry: string | null; issue: string | null; expiryDerived: boolean; address: string; postcode: string; confidence: string; notes: string; type: string };

const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Europe/London" });
const pretty = (ymd: string) =>
  new Date(`${ymd}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

/**
 * Upload the certificate straight from the tracker (James, 7 Oct 2026: "I
 * can't click on it, then open out the file, then upload it").
 *
 * The file goes through the same door as every other certificate
 * (/api/compliance/certificates): into the home's vault, into REX, and -
 * filed by the compliance office - ticked as checked, so the agent's side
 * reads it done without them doing a thing. The date is read off the
 * document first so nobody types it; it is still shown to confirm.
 */
function UploadPanel({ row, onFiled, onClose }: { row: ChaseRow; onFiled: (expiry: string) => void; onClose: () => void }) {
  const types = TYPES[row.cert] ?? [];
  const [type, setType] = useState(types[0]?.id ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [expiry, setExpiry] = useState("");
  const [issue, setIssue] = useState("");
  const [read, setRead] = useState<Read | null>(null);
  const [reading, setReading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const pick = useRef<HTMLInputElement>(null);

  async function choose(f: File) {
    setFile(f);
    setRead(null);
    setMsg(null);
    setReading(true);
    try {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("expect", type);
      const j = await fetch("/api/compliance/certificates/read", { method: "POST", body: fd }).then((r) => r.json());
      if (j.ok && j.read) {
        setRead(j.read);
        if (j.read.expiry) setExpiry(j.read.expiry);
        if (j.read.issue) setIssue(j.read.issue);
      } else setMsg("We couldn't read the date off it. Type it in below.");
    } catch {
      setMsg("We couldn't read the date off it. Type it in below.");
    } finally {
      setReading(false);
    }
  }

  /* The postcode printed on the certificate against the home's. A
     certificate for the wrong flat is the mistake worth catching here. */
  const pc = (read?.postcode ?? "").replace(/\s+/g, "").toUpperCase();
  const home = `${row.property} ${row.locality}`.replace(/\s+/g, "").toUpperCase();
  const wrongHome = Boolean(pc) && !home.includes(pc);

  async function submit() {
    if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return;
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("propertyId", row.propertyId);
    fd.append("propertyName", [row.property, row.locality].filter(Boolean).join(", "));
    fd.append("type", type);
    fd.append("expiry", expiry);
    if (/^\d{4}-\d{2}-\d{2}$/.test(issue)) fd.append("issue", issue);
    fd.append("source", "Compliance tracker");
    try {
      const j = await fetch("/api/compliance/certificates?refresh=1", { method: "POST", body: fd }).then((r) => r.json());
      if (!j.ok) setMsg(j.error || "That certificate did not file.");
      else onFiled(expiry);
    } catch {
      setMsg("That did not file - the OS could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = "rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px] text-ink";
  return (
    <div className="rounded-xl border border-line/70 bg-page p-3.5">
      <div className="flex flex-wrap items-end gap-3">
        {types.length > 1 && (
          <label className="flex flex-col gap-1 text-[10.5px] text-muted">
            Type
            <select value={type} onChange={(e) => setType(e.target.value)} className={field}>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.label}</option>
              ))}
            </select>
          </label>
        )}
        <div className="flex flex-col gap-1 text-[10.5px] text-muted">
          File
          <button type="button" onClick={() => pick.current?.click()} className="rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] text-ink">
            {file ? file.name.slice(0, 40) : "Choose the certificate"}
          </button>
          <input
            ref={pick}
            type="file"
            accept="application/pdf,image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void choose(f);
              e.target.value = "";
            }}
          />
        </div>
        <label className="flex flex-col gap-1 text-[10.5px] text-muted">
          Expires
          <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] text-muted">
          Issued (optional)
          <input type="date" value={issue} onChange={(e) => setIssue(e.target.value)} className={field} />
        </label>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!file || !expiry || busy || reading}
            className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {busy ? "Filing…" : "File it"}
          </button>
        </div>
      </div>
      {reading && (
        <p className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
          Reading the dates off the certificate…
        </p>
      )}
      {read && !reading && (
        <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
          {read.expiry ? (
            <>
              Read off the document: expires <span className="font-semibold text-ink">{pretty(read.expiry)}</span>
              {read.expiryDerived ? " (worked out from the issue date)" : ""}. Check it before filing.
            </>
          ) : (
            "No expiry date could be read off it. Type it in."
          )}
          {read.address && <> Address on it: {read.address}{read.postcode ? `, ${read.postcode}` : ""}.</>}
        </p>
      )}
      {wrongHome && (
        <p className="mt-1.5 text-[11.5px] font-semibold text-accent-dark">
          The postcode on this certificate ({read?.postcode}) isn&apos;t this home&apos;s. Make sure it&apos;s the right file.
        </p>
      )}
      {expiry && expiry < today() && (
        <p className="mt-1.5 text-[11.5px] text-accent-dark">That date has passed, so it will still show as expired once filed.</p>
      )}
      {msg && <p className="mt-1.5 text-[11.5px] text-accent-dark">{msg}</p>}
    </div>
  );
}

/**
 * Not needed on this home (James, 7 Oct 2026): the rule asks for it, and this
 * is one of the few exceptions. A reason is asked for, not required - the
 * name goes on it either way, and it can be undone from the Not needed tab.
 */
function NotNeededPanel({ row, onDone, onClose }: { row: ChaseRow; onDone: (reason: string, by: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const j = await fetch("/api/compliance/not-needed", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ propertyId: row.propertyId, cert: row.cert, reason }),
      }).then((r) => r.json());
      if (!j.ok) setMsg(j.error || "That did not save.");
      else onDone(reason.trim(), j.notNeeded?.by ?? "you");
    } catch {
      setMsg("That did not save - the OS could not be reached. Try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="rounded-xl border border-line/70 bg-page p-3.5">
      <p className="text-[12px] leading-relaxed">
        {row.certLabel} isn&apos;t needed at <span className="font-semibold">{row.property}</span>. It comes off the list
        here and on the agent&apos;s side.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why not? (optional)"
          maxLength={300}
          className="min-w-[220px] flex-1 rounded-lg border border-line/80 bg-white px-2.5 py-1.5 text-[12.5px]"
        />
        <button type="button" onClick={onClose} className="rounded-full border border-line/80 px-3.5 py-1.5 text-[12px]">
          Cancel
        </button>
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy}
          className="rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
        >
          {busy ? "Saving…" : "Mark not needed"}
        </button>
      </div>
      {msg && <p className="mt-1.5 text-[11.5px] text-accent-dark">{msg}</p>}
    </div>
  );
}

/**
 * Agent before landlord, and headed "Chase via". Michael never writes to a
 * landlord: "he will always go through the agent" (James, 20 Sep 2026). The
 * landlord is on the row so he knows whose home it is, not who to ring.
 *
 * `sent` draws the Emailed column, on Coming up only - an expired certificate
 * is past its reminders and is a conversation, not an email. Undefined leaves
 * the column off; null says the log could not be read.
 */
function Rows({
  rows,
  empty,
  sent,
  onFiled,
  onNotNeeded,
  onUndo,
}: {
  rows: ChaseRow[];
  empty: string;
  sent?: Sent | null;
  onFiled: (r: ChaseRow, expiry: string) => void;
  /** Offers Not needed on each row. Left off where the row is not a gap. */
  onNotNeeded?: (r: ChaseRow, reason: string, by: string) => void;
  /** The Not needed tab: Undo instead of Upload. */
  onUndo?: (r: ChaseRow) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [mode, setMode] = useState<"upload" | "na">("upload");
  const [undoing, setUndoing] = useState<string | null>(null);
  if (!rows.length) return <p className="py-6 text-[12.5px] text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[12.5px]">
        <thead>
          <tr className="border-b border-line/70 text-left text-[9.5px] font-bold uppercase tracking-wider text-muted">
            <th className={cell}>Property</th>
            <th className={cell}>Certificate</th>
            <th className={cell}>State</th>
            <th className={cell}>Chase via</th>
            <th className={cell}>Landlord</th>
            {sent !== undefined && <th className={cell}>Agent emailed</th>}
            <th className={cell} />
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 200).map((r) => {
            const k = `${r.propertyId}-${r.cert}`;
            return (
            <Fragment key={k}>
            <tr className={`${open === k ? "" : "border-b border-line/40"} last:border-0`}>
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
              <td className={cell}>
                {r.agent ?? <span className="text-accent-dark">no agent on record</span>}
              </td>
              <td className={cell}>{r.landlord}</td>
              {sent !== undefined && (
                <td className={cell}>
                  {sent === null ? (
                    <span className="text-muted">could not read the log</span>
                  ) : sent.get(`${r.propertyId}:${r.cert}:${r.band}`) ? (
                    <Pill tone="good">{day(sent.get(`${r.propertyId}:${r.cert}:${r.band}`)!.at)}</Pill>
                  ) : (
                    <span className="text-accent-dark">not yet</span>
                  )}
                </td>
              )}
              <td className={`${cell} text-right`}>
                {onUndo ? (
                  <button
                    type="button"
                    disabled={undoing === k}
                    onClick={() => {
                      setUndoing(k);
                      onUndo(r);
                    }}
                    className="whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold disabled:opacity-40"
                  >
                    {undoing === k ? "Undoing…" : "Undo"}
                  </button>
                ) : open === k ? (
                  <button
                    type="button"
                    onClick={() => setOpen(null)}
                    className="whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold"
                  >
                    Close
                  </button>
                ) : (
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setMode("upload");
                        setOpen(k);
                      }}
                      className="whitespace-nowrap rounded-full bg-ink px-3 py-1 text-[11.5px] font-semibold text-white"
                    >
                      Upload
                    </button>
                    {onNotNeeded && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode("na");
                          setOpen(k);
                        }}
                        title="This home doesn't need it"
                        className="whitespace-nowrap rounded-full border border-line/80 px-3 py-1 text-[11.5px] font-semibold"
                      >
                        Not needed
                      </button>
                    )}
                  </div>
                )}
              </td>
            </tr>
            {open === k && (
              <tr className="border-b border-line/40">
                <td colSpan={sent !== undefined ? 7 : 6} className="px-3 pb-3">
                  {mode === "na" && onNotNeeded ? (
                    <NotNeededPanel
                      row={r}
                      onClose={() => setOpen(null)}
                      onDone={(reason, by) => {
                        setOpen(null);
                        onNotNeeded(r, reason, by);
                      }}
                    />
                  ) : (
                    <UploadPanel
                      row={r}
                      onClose={() => setOpen(null)}
                      onFiled={(expiry) => {
                        setOpen(null);
                        onFiled(r, expiry);
                      }}
                    />
                  )}
                </td>
              </tr>
            )}
            </Fragment>
            );
          })}
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
  const [tab, setTab] = useState<"outstanding" | "undated" | "notNeeded" | "upcoming" | "queue">("outstanding");
  const [filed, setFiled] = useState<string[]>([]);
  const [find, setFind] = useState("");

  /* Off the list the moment it is filed, so the number goes down while the
     book rebuilds behind it (a minute or two). A date already past stays:
     the home is still expired, and saying otherwise would be untrue. */
  function onFiled(r: ChaseRow, expiry: string) {
    const label = `${r.certLabel}, ${r.property}`;
    setFiled((f) => [label, ...f].slice(0, 6));
    if (expiry < today()) return;
    setD((cur) => {
      if (!cur) return cur;
      const gone = (x: ChaseRow) => x.propertyId === r.propertyId && x.cert === r.cert;
      const was = cur.outstanding.find(gone);
      return {
        ...cur,
        outstanding: cur.outstanding.filter((x) => !gone(x)),
        undated: (cur.undated ?? []).filter((x) => !gone(x)),
        upcoming: cur.upcoming.filter((x) => !gone(x)),
        counts: {
          ...cur.counts,
          expired: cur.counts.expired - (was?.status === "expired" ? 1 : 0),
          missing: cur.counts.missing - (was?.status === "missing" ? 1 : 0),
        },
      };
    });
  }
  /* Off the list at once; on the Not needed tab with the name on it. */
  function onNotNeeded(r: ChaseRow, reason: string, by: string) {
    const gone = (x: ChaseRow) => x.propertyId === r.propertyId && x.cert === r.cert;
    setD((cur) => {
      if (!cur) return cur;
      const was = cur.outstanding.find(gone);
      const marked: ChaseRow = { ...r, undated: false, reason: `Marked not needed by ${by}${reason ? `: ${reason}` : "."}`, notNeeded: { by, reason, at: new Date().toISOString() } };
      return {
        ...cur,
        outstanding: cur.outstanding.filter((x) => !gone(x)),
        undated: (cur.undated ?? []).filter((x) => !gone(x)),
        notNeeded: [marked, ...(cur.notNeeded ?? []).filter((x) => !gone(x))],
        counts: {
          ...cur.counts,
          expired: cur.counts.expired - (was?.status === "expired" ? 1 : 0),
          missing: cur.counts.missing - (was?.status === "missing" ? 1 : 0),
          notNeeded: (cur.counts.notNeeded ?? 0) + 1,
        },
      };
    });
  }

  /* Back on the list. The page reads the tracker again, which reads the book
     the undo has just put right. */
  async function onUndo(r: ChaseRow) {
    await fetch("/api/compliance/not-needed", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: r.propertyId, cert: r.cert }),
    }).catch(() => null);
    const p = (await fetch("/api/compliance/tracker").then((x) => x.json()).catch(() => null)) as Payload | null;
    if (p && p.ok !== false) setD(p);
  }

  const match = (rows: ChaseRow[]) => {
    const t = find.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.property} ${r.locality} ${r.agent ?? ""} ${r.landlord} ${r.certLabel}`.toLowerCase().includes(t)) : rows;
  };

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

  const sent: Sent | null = d?.chases ? new Map(d.chases.map((c) => [c.key, { to: c.to, at: c.at }])) : null;

  return (
    <>
      <PageHeader
        title="Compliance tracker"
        blurb={`What is overdue, what is coming up, and which agent to chase, across every home we manage.${d?.ageMs != null ? ` Figures ${asOf(d.ageMs).text}.` : ""}`}
      />

      {error && (
        <p className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5 text-[12.5px] text-muted">
          {error}
        </p>
      )}
      {!d && !error && (
        <p className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5 text-[12.5px] text-muted">
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
              ["No agent", d.counts.noAgent, "nobody to chase through"],
            ].map(([label, n, sub]) => (
              <div key={label as string} className="rounded-[22px] border border-line/50 bg-white p-4">
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
            <p className="fade-up mt-3 rounded-[22px] border border-line/50 bg-white p-4 text-[11.5px] leading-relaxed text-muted">
              <span className="font-semibold text-ink">
                {d.counts.dateWithoutDocument} certificates are in date but have no document on
                file.
              </span>{" "}
              They read as compliant and we could not produce them if anybody asked.
            </p>
          )}

          <div className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
            <div className="mb-3 flex flex-wrap gap-2">
              {(
                [
                  ["outstanding", `Outstanding (${d.outstanding.length})`],
                  ...((d.undated?.length ?? 0) > 0 ? [["undated", `On file, no date (${d.undated.length})`] as const] : []),
                  ...((d.notNeeded?.length ?? 0) > 0 ? [["notNeeded", `Not needed (${d.notNeeded.length})`] as const] : []),
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

            {tab !== "queue" && (
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <input
                  value={find}
                  onChange={(e) => setFind(e.target.value)}
                  placeholder="Find an address, agent or landlord"
                  className="w-full max-w-[340px] rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12.5px]"
                />
                {filed.length > 0 && (
                  <p className="text-[11.5px] text-muted">
                    <span className="font-semibold text-ink">Filed:</span> {filed.join(" · ")}. On the home&apos;s file, sent to REX and ticked as checked.
                  </p>
                )}
              </div>
            )}
            {tab === "outstanding" && (
              <Rows
                rows={match(d.outstanding)}
                empty={find ? "Nothing outstanding matches that." : "Nothing expired and nothing missing. That would be a first."}
                onFiled={onFiled}
                onNotNeeded={onNotNeeded}
              />
            )}
            {tab === "notNeeded" && (
              <>
                <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
                  Certificates the rule asks for that someone has marked as not needed on that home. They are off every
                  list, the agent&apos;s included. Undo puts one back.
                </p>
                <Rows rows={match(d.notNeeded ?? [])} empty="Nothing has been marked not needed." onFiled={onFiled} onUndo={(r) => void onUndo(r)} />
              </>
            )}
            {tab === "undated" && (
              <>
                <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
                  The clean sweep found these on file, but nobody has recorded when they run out. They are not
                  counted as outstanding. Upload the certificate with its date to finish each one.
                </p>
                <Rows rows={match(d.undated ?? [])} empty="Every certificate on file has its date." onFiled={onFiled} onNotNeeded={onNotNeeded} />
              </>
            )}
            {tab === "upcoming" && (
              <Rows rows={match(d.upcoming)} empty="Nothing falls due in the next 30 days." sent={sent} onFiled={onFiled} />
            )}
            {tab === "queue" && (
              <>
                <p className="mb-3 text-[11.5px] leading-relaxed text-muted">
                  The reminders owed today, at 30, 14 and 7 days. They go to the agent, who
                  speaks to their landlord.{" "}
                  <span className="font-semibold text-ink">Nothing on this page can send.</span>{" "}
                  The daily run sends them once James turns certificate chases on, and Coming up
                  shows which have gone.
                </p>
                {d.queue.length === 0 ? (
                  <p className="py-6 text-[12.5px] text-muted">Nothing due to be chased today.</p>
                ) : (
                  <ul className="space-y-2">
                    {d.queue.slice(0, 100).map((r) => (
                      <li key={r.key} className="rounded-xl border border-line/70 p-3">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="text-[12.5px]">{r.subject}</span>
                          <Pill tone={r.band === 0 ? "accent" : "neutral"}>{r.band === 0 ? "Expired" : `${r.band}-day`}</Pill>
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
