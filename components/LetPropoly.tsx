"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * A LET AND ITS PROPOLY DEAL (22 Oct 2026).
 *
 * GuarantorsToPropoly   under Guarantors: whether the deal has them, the
 *                       Guarantor details document to look at, Send guarantors
 *                       (Kirstie: deals arrive without them; lib/deal-guarantors).
 * RepushToPropoly       owners only: everything the deal is missing, shown in
 *                       full, ticked, then sent in one press (the Ruskin Place
 *                       call, 20 Oct; lib/propoly-repush).
 * With the switches off both are practice: the same list, nothing sent.
 */

type GPlan = {
  dealId: string | null;
  dealUrl: string | null;
  rentPcm: number | null;
  guarantors: { id: string; name: string; forName: string }[];
  onDeal: { name: string | null; email: string | null }[];
  live: boolean;
  last: { at: string; by: string; mode: string; outcome: string; detail: string; same: boolean } | null;
  blocked: string | null;
  gaps: string[];
};
type Item = { key: string; kind: string; label: string; detail: string; state: "send" | "on-deal" | "sent-before" | "cannot"; why?: string; outcome?: string; result?: string };
type Plan = { letRef: string; address: string; deal: { id: string; url: string; status: string } | null; live: boolean; switches: { key: string; label: string; on: boolean }[]; items: Item[]; notes: string[] };
type History = { at: string; by: string; mode: string; sent: number; would: number; failed: number }[];
type Answer = { ok: boolean; error?: string; guarantors?: GPlan; canRepush?: boolean; history?: History };

const at = (iso: string) => new Date(iso).toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(",", "");
const first = (n: string) => n.split(/\s+/)[0];

async function call(letId: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const url = `/api/applications/${encodeURIComponent(letId)}/propoly`;
  const res = await fetch(url, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" }).catch(() => null);
  return ((await res?.json().catch(() => null)) ?? { ok: false, error: "That didn't work just now. Try again in a minute." }) as Record<string, unknown>;
}

function Spin({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] text-muted">
      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" aria-hidden />
      {label}
    </span>
  );
}

function Practice() {
  return <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-900">Practice - nothing is sent</span>;
}

/* ── guarantors ──────────────────────────────────────────────────────────── */

export function GuarantorsToPropoly({ letId, tick = 0, className = "" }: { letId: string; tick?: string | number; className?: string }) {
  const [g, setG] = useState<GPlan | null>(null);
  const [canRepush, setCanRepush] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ outcome: string; detail: string } | null>(null);

  const load = useCallback(async () => {
    const j = (await call(letId)) as Answer;
    if (!j.ok) { setError(j.error ?? "Couldn't read this just now."); return; }
    setError(null);
    setG(j.guarantors ?? null);
    setCanRepush(Boolean(j.canRepush));
  }, [letId]);
  useEffect(() => { void load(); }, [load, tick]);

  const send = async () => {
    setBusy(true);
    const j = await call(letId, { action: "send-guarantors" });
    setBusy(false);
    if (!j.ok) { setSaid({ outcome: "failed", detail: String(j.error ?? "That didn't work.") }); return; }
    setSaid(j.sent as { outcome: string; detail: string });
    setG(j.guarantors as GPlan);
  };

  if (error) return <p className={`${className} text-[12px] text-accent-dark`}>{error}</p>;
  if (!g) return <div className={className}><Spin label="Checking the Propoly deal" /></div>;
  /* Nothing to say on a let with no guarantor and no owner's repush. */
  if (!g.guarantors.length && !canRepush) return null;

  const sentLive = g.last?.mode === "live" && g.last.outcome === "uploaded";
  return (
    <div className={className} data-steve="let.guarantors-propoly">
      {g.guarantors.length > 0 && (
        <div className="rounded-xl border border-line/60 bg-white px-3.5 py-3 text-[12.5px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 font-semibold">
              <DoodleIcon name="user" size={13} className="text-muted" />
              Guarantors in Propoly
            </p>
            {!g.live && <Practice />}
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-muted">
            {!g.dealId
              ? "No Propoly deal yet. The guarantor details go with Push to Propoly."
              : g.onDeal.length
                ? `The deal lists ${g.onDeal.map((x) => x.name ?? x.email ?? "a guarantor").join(", ")}.`
                : "The Propoly deal has no guarantors on it yet. Propoly can't take them from here, so they go as a Guarantor details document for Kirstie to key in."}
          </p>
          {g.last && (
            <p className="mt-1 text-[11.5px] text-muted">
              {g.last.mode === "live" ? "Sent" : "Practised"} {at(g.last.at)} by {g.last.by}{g.last.same ? "" : " - the details have changed since"}.
            </p>
          )}
          {g.gaps.length > 0 && <p className="mt-1 text-[11.5px] text-accent-dark">{g.gaps.join(" ")}</p>}
          {said && <p className={`mt-2 text-[12px] ${said.outcome === "failed" ? "text-accent-dark" : "text-ink"}`}>{said.detail}</p>}
          {g.dealId && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <a href={`/api/applications/${encodeURIComponent(letId)}/propoly?pdf=guarantors`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[11.5px] font-semibold hover:bg-page">
                <DoodleIcon name="doc" size={11} /> See the document
              </a>
              <button type="button" disabled={busy || (sentLive && g.last?.same)} onClick={() => void send()} className="inline-flex items-center gap-1.5 rounded-full bg-accent-dark px-3.5 py-1 text-[11.5px] font-semibold text-white disabled:opacity-50">
                {busy ? "Sending..." : sentLive && g.last?.same ? "Sent" : g.live ? "Send guarantors" : "Practise sending"}
              </button>
              {g.dealUrl && <a href={g.dealUrl} target="_blank" rel="noreferrer" className="text-[11.5px] font-semibold text-accent-dark hover:underline">Open the deal ↗</a>}
            </div>
          )}
        </div>
      )}
      {canRepush && <RepushToPropoly letId={letId} className={g.guarantors.length ? "mt-3" : ""} onDone={() => void load()} />}
    </div>
  );
}

/* ── the owners' repush ──────────────────────────────────────────────────── */

const STATE_WORDS: Record<Item["state"], string> = { send: "Missing - will send", "on-deal": "Already on the deal", "sent-before": "Sent before", cannot: "Can't send" };
const OUTCOME_WORDS: Record<string, string> = { sent: "Sent", already: "Already there", would: "Practice", failed: "Failed", skipped: "Left out" };
const GROUPS: { title: string; kinds: string[] }[] = [
  { title: "Documents", kinds: ["certificate", "document", "guarantors"] },
  { title: "People", kinds: ["tenant", "landlord"] },
];

export function RepushToPropoly({ letId, className = "", onDone }: { letId: string; className?: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const look = async () => {
    setOpen(true); setBusy("look"); setError(null); setDone(false);
    const j = await call(letId, { action: "repush-plan" });
    setBusy(null);
    if (!j.ok) { setError(String(j.error ?? "Couldn't work it out just now.")); return; }
    const p = j.plan as Plan;
    setPlan(p);
    setTicked(new Set(p.items.filter((i) => i.state === "send").map((i) => i.key)));
  };
  const send = async () => {
    setBusy("send"); setError(null);
    const j = await call(letId, { action: "repush", keys: [...ticked] });
    setBusy(null);
    if (!j.ok) { setError(String(j.error ?? "That didn't work.")); return; }
    setPlan(j.plan as Plan);
    setDone(true);
    onDone?.();
  };

  const toSend = plan?.items.filter((i) => i.state === "send") ?? [];
  const n = toSend.filter((i) => ticked.has(i.key)).length;
  return (
    <div className={className} data-steve="let.repush">
      {!open ? (
        <button type="button" onClick={() => void look()} className="inline-flex items-center gap-1.5 rounded-full border border-accent-dark/50 bg-white px-3.5 py-1.5 text-[11.5px] font-semibold text-accent-dark hover:bg-accent-soft">
          <DoodleIcon name="upload" size={12} /> Repush to Propoly
        </button>
      ) : (
        <div className="rounded-xl border border-accent-dark/30 bg-white px-4 py-3.5 text-[12.5px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">Repush to Propoly <span className="ml-1 text-[10.5px] font-medium uppercase tracking-wide text-muted">Owners only</span></p>
            <div className="flex items-center gap-2">
              {plan && !plan.live && <Practice />}
              <button type="button" onClick={() => setOpen(false)} className="rounded-full px-2 py-0.5 text-[11px] font-semibold text-muted hover:text-ink">Close</button>
            </div>
          </div>
          {busy === "look" && <div className="mt-2"><Spin label="Working out what the deal is missing" /></div>}
          {error && <p className="mt-2 text-[12px] text-accent-dark">{error}</p>}
          {plan && busy !== "look" && (
            <>
              <p className="mt-1 text-[12px] text-muted">
                {plan.deal ? <>Deal: <a href={plan.deal.url} target="_blank" rel="noreferrer" className="font-semibold text-accent-dark hover:underline">{plan.address} ↗</a>, {plan.deal.status}.</> : plan.address}
                {" "}{done ? (plan.live ? "This is what was sent." : "Practice: this is what would have been sent. Nothing went to Propoly.") : "This is exactly what will go. Untick anything to leave out."}
              </p>
              {GROUPS.map((grp) => {
                const list = plan.items.filter((i) => grp.kinds.includes(i.kind));
                if (!list.length) return null;
                return (
                  <div key={grp.title} className="mt-3">
                    <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">{grp.title}</p>
                    <ul className="mt-1.5 divide-y divide-line/60 rounded-lg border border-line/60">
                      {list.map((i) => (
                        <li key={i.key} className="flex items-start gap-2.5 px-3 py-2">
                          {i.state === "send" && !done ? (
                            <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[var(--color-accent-dark)]" checked={ticked.has(i.key)} onChange={(e) => setTicked((t) => { const x = new Set(t); if (e.target.checked) x.add(i.key); else x.delete(i.key); return x; })} aria-label={`Send ${i.label}`} />
                          ) : (
                            <DoodleIcon name={i.outcome === "sent" || i.outcome === "already" || i.state === "on-deal" || i.state === "sent-before" ? "checklist" : i.outcome === "failed" || i.state === "cannot" ? "info" : "upload"} size={13} className={`mt-0.5 shrink-0 ${i.outcome === "failed" || i.state === "cannot" ? "text-accent-dark" : "text-muted"}`} />
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                              <p className="font-semibold">{i.label}</p>
                              <span className={`text-[11px] font-semibold ${i.state === "send" ? "text-accent-dark" : "text-muted"}`}>{i.outcome ? OUTCOME_WORDS[i.outcome] ?? i.outcome : STATE_WORDS[i.state]}</span>
                            </div>
                            <p className="text-[11.5px] text-muted">{i.detail}</p>
                            {(i.result || (i.state !== "send" && i.why)) && <p className={`mt-0.5 text-[11.5px] ${i.outcome === "failed" || i.state === "cannot" ? "text-accent-dark" : "text-ink/80"}`}>{i.result ?? i.why}</p>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {plan.notes.length > 0 && <ul className="mt-3 space-y-1 text-[11.5px] text-muted">{plan.notes.map((x) => <li key={x}>{x}</li>)}</ul>}
              <p className="mt-3 text-[11px] text-muted">
                Switches: {plan.switches.map((s) => `${s.label} ${s.on ? "on" : "off"}`).join(" · ")}
              </p>
              {!done && plan.deal && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button type="button" disabled={!n || busy === "send"} onClick={() => void send()} className="inline-flex items-center gap-1.5 rounded-full bg-accent-dark px-4 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">
                    {busy === "send" ? "Sending..." : !toSend.length ? "Nothing missing" : `${plan.live ? "Send" : "Practise sending"} ${n} to Propoly`}
                  </button>
                </div>
              )}
              {done && <button type="button" onClick={() => void look()} className="mt-3 rounded-full border border-line px-3 py-1 text-[11.5px] font-semibold hover:bg-page">Check again</button>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
