"use client";

import { useEffect, useState } from "react";
import { Pill } from "@/components/Wire";

/**
 * Offer accepted → the deal.
 *
 * This is the moment the record stops being an application and becomes a
 * tenancy, and it is where things get lost: the deal reaches Kirstie, PLC
 * starts three weeks later, and only then does anybody discover there is no
 * gas certificate on the property.
 *
 * So the panel's job is not to press a button. It is to show the packet BEFORE
 * it goes — who the landlord is, who the tenants are, what paper exists — and
 * to name what is short. Then it runs the handover itself (lib/handover):
 * rehearsed while the switch is off, every step recorded as what it would
 * do; for real once it is on. The last run sits under the button either way.
 */

type Step = {
  id: string;
  label: string;
  state: "ok" | "would" | "blocked" | "failed" | "skipped";
  detail: string;
  at: string;
};
type Run = {
  id: string;
  mode: "shadow" | "live";
  status: "running" | "ok" | "failed" | "blocked";
  steps: Step[];
  triggeredBy: string;
  startedAt: string;
};

type Party = { contactId: string | null; name: string; email: string | null; phone: string | null };

export interface Handoff {
  applicationId: string;
  listingId: number | null;
  property: string;
  landlord: Party | null;
  tenants: (Party & { isPrimary: boolean })[];
  rentPcm: number | null;
  startDate: string | null;
  agreementMonths: number | null;
  documents: { id: number; name: string; kind: string | null; sizeMb: number }[];
  certificates: {
    type: string;
    label: string;
    expiry: string | null;
    attached: boolean;
    validAtStart: boolean;
    required: boolean;
  }[];
  missing: { id: string; label: string; why: string }[];
  unrecognised: string[];
  blockers: string[];
  flowConfigured: boolean;
  mode: "shadow" | "live";
  runs: Run[];
}

const gbp = (n: number | null) => (n == null ? "—" : `£${n.toLocaleString("en-GB")}`);

export default function HandoffPanel({ applicationId }: { applicationId: string }) {
  const [h, setH] = useState<Handoff | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [openRun, setOpenRun] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setH(null);
    setError(null);
    fetch(`/api/handoff?application=${encodeURIComponent(applicationId)}`)
      .then((r) => r.json())
      .then((d: Handoff & { error?: string }) => {
        if (!live) return;
        if (d.error) setError(d.error);
        else {
          setH(d);
          setRuns(d.runs ?? []);
        }
      })
      .catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [applicationId]);

  async function send(rehearse: boolean) {
    setSending(true);
    setResult(null);
    try {
      const r = await fetch("/api/handoff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationId, rehearse }),
      });
      const d = (await r.json()) as { ok?: boolean; error?: string; run?: Run };
      if (d.run) {
        setRuns((rs) => [d.run as Run, ...rs].slice(0, 5));
        setOpenRun(d.run.id);
        setResult(
          d.run.mode === "shadow"
            ? d.run.status === "ok"
              ? "Rehearsed. Nothing was written - this is what a live run would do."
              : "Rehearsed, and something would not go through. See the steps."
            : d.run.status === "ok"
              ? "Handed over."
              : d.run.status === "blocked"
                ? "Not sent - something is missing. See above."
                : "Something failed part-way. See the steps."
        );
      } else {
        setResult(d.error ?? "That didn't go through.");
      }
    } catch (e) {
      setResult((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] text-muted">{error}</p>
      </div>
    );
  }
  if (!h) {
    return (
      <div className="rounded-2xl border border-line/80 bg-panel p-5">
        <p className="text-[12.5px] text-muted">Assembling the handover…</p>
      </div>
    );
  }

  const ready = h.blockers.length === 0;

  return (
    <div className="rounded-2xl border border-line/80 bg-panel p-5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Hand over to the deal
        </p>
        <Pill tone={ready ? "accent" : "neutral"}>
          {ready ? "Ready" : `${h.blockers.length} short`}
        </Pill>
      </div>

      {/* Who and what — the packet, in the order the deal needs it. */}
      <dl className="mt-3.5 space-y-2 text-[12.5px]">
        <div className="flex gap-3">
          <dt className="w-[92px] shrink-0 text-muted">Landlord</dt>
          <dd className="min-w-0">
            {h.landlord ? (
              <>
                {h.landlord.name}
                {h.landlord.email ? (
                  <span className="block text-[11px] text-muted">{h.landlord.email}</span>
                ) : (
                  <span className="block text-[11px] text-accent-dark">No email address</span>
                )}
              </>
            ) : (
              <span className="text-accent-dark">Nobody attached to the listing</span>
            )}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-[92px] shrink-0 text-muted">Tenants</dt>
          <dd className="min-w-0">
            {h.tenants.map((t) => (
              <span key={t.name} className="block">
                {t.name}
                {t.isPrimary ? <span className="text-muted"> · lead</span> : null}
              </span>
            ))}
          </dd>
        </div>
        <div className="flex gap-3">
          <dt className="w-[92px] shrink-0 text-muted">Terms</dt>
          <dd className="figures min-w-0">
            {gbp(h.rentPcm)} pcm · {h.agreementMonths ?? "—"} months · from {h.startDate ?? "—"}
          </dd>
        </div>
      </dl>

      {/* The certificates, from REX's compliance register on the property —
          NOT from the listing's uploads, which hold the signed terms and not
          much else. Expiry is judged against the move-in date. */}
      <div className="mt-4 border-t border-line/70 pt-4">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
          Certificates on the property
        </p>
        <ul className="mt-2.5 space-y-1.5 text-[12.5px]">
          {h.certificates.map((c) => {
            // Only a REQUIRED certificate has to be attached and in date. The
            // rest are shown because they're there, not judged.
            const good = c.required ? c.validAtStart && c.attached : true;
            return (
              <li key={c.type} className="flex items-start gap-2">
                <span
                  className={`mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-[4px] border-[1.5px] text-[8px] ${
                    good ? "border-accent-dark bg-accent-dark text-white" : "border-line text-muted"
                  }`}
                >
                  {good ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className={good ? "text-muted line-through" : ""}>{c.label}</span>
                  <span className="ml-1.5 text-[11px] text-muted">
                    {c.expiry ? `to ${c.expiry}` : c.required ? "no expiry recorded" : "on file"}
                    {!c.attached ? " · no scan" : ""}
                  </span>
                </span>
              </li>
            );
          })}
          {h.missing
            .filter((m) => !h.certificates.some((c) => c.label === m.label))
            .map((m) => (
              <li key={m.id} className="flex items-start gap-2">
                <span className="mt-0.5 h-[15px] w-[15px] shrink-0 rounded-[4px] border-[1.5px] border-line" />
                <span>
                  {m.label}
                  <span className="ml-1.5 text-[11px] text-muted">{m.why}</span>
                </span>
              </li>
            ))}
        </ul>
      </div>

      {/* Uploads on the listing — a different place, holding different paper. */}
      {h.documents.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
            Files on the listing
          </p>
          <ul className="mt-2.5 space-y-1 text-[12.5px] text-muted">
            {h.documents.slice(0, 6).map((d) => (
              <li key={d.id} className="truncate">
                {d.name}
                {d.kind ? <span className="text-accent-dark"> · will attach</span> : null}
              </li>
            ))}
          </ul>
          {h.unrecognised.length > 0 && (
            <p className="mt-2 text-[11px] leading-snug text-muted">
              Uploaders name these themselves, so an unrecognised file means we couldn&apos;t
              place it — not that it isn&apos;t there.
            </p>
          )}
        </div>
      )}

      {/* What's stopping it. */}
      {h.blockers.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
            Before this goes
          </p>
          <ul className="mt-2 space-y-1 text-[12.5px] leading-snug">
            {h.blockers.map((b) => (
              <li key={b}>· {b}</li>
            ))}
          </ul>
        </div>
      )}

      {h.mode === "live" ? (
        <>
          <button
            type="button"
            onClick={() => void send(false)}
            disabled={!ready || sending}
            className="mt-4 w-full rounded-lg bg-accent-dark px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {sending ? "Handing over…" : "Hand over to the deal"}
          </button>
          <button
            type="button"
            onClick={() => void send(true)}
            disabled={sending}
            className="mt-2 w-full rounded-lg border border-line/80 px-3.5 py-2 text-[12px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40"
          >
            Rehearse first
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => void send(true)}
            disabled={sending}
            className="mt-4 w-full rounded-lg bg-accent-dark px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {sending ? "Rehearsing…" : "Rehearse the handover"}
          </button>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            Rehearsal only: the OS works out every step against Propoly and REX and writes
            nothing. Howard&apos;s flow still does the real handover. When the rehearsals match
            what his flow does, the switch in Admin turns this into the real thing.
          </p>
        </>
      )}
      {result && <p className="mt-2 text-[11.5px] leading-relaxed text-muted">{result}</p>}

      {/* The last few runs, each with its steps. This is the record. */}
      {runs.length > 0 && (
        <div className="mt-4 border-t border-line/70 pt-4">
          <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">Runs</p>
          <ul className="mt-2 space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="rounded-xl border border-line/70 bg-card">
                <button
                  type="button"
                  onClick={() => setOpenRun((o) => (o === r.id ? null : r.id))}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
                >
                  <span className="min-w-0 text-[12px]">
                    <span className="font-semibold">{r.mode === "shadow" ? "Rehearsal" : "Live"}</span>
                    <span className="text-muted">
                      {" "}· {new Date(r.startedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {r.triggeredBy}
                    </span>
                  </span>
                  <Pill tone={r.status === "ok" ? "good" : r.status === "running" ? "neutral" : "accent"}>
                    {r.status === "ok" ? (r.mode === "shadow" ? "would go" : "done") : r.status}
                  </Pill>
                </button>
                {openRun === r.id && (
                  <ul className="border-t border-line/60 px-3 py-2">
                    {r.steps.map((s) => (
                      <li key={s.id} className="flex gap-2 py-1 text-[11.5px] leading-snug">
                        <span
                          className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${
                            s.state === "ok" ? "bg-emerald-600" : s.state === "would" ? "bg-accent-dark" : s.state === "skipped" ? "bg-line" : "bg-red-600"
                          }`}
                        />
                        <span className="min-w-0">
                          <span className="font-semibold">{s.label}</span>
                          <span className="text-muted"> — {s.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
