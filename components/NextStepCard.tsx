"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * NEXT STEP (9 Oct 2026). James: "rather than having the checklist on there,
 * we can have the next thing you need to do."
 *
 * One thing, with its button, on the application file: Push to Propoly once
 * the offer is accepted, Let the other applicants know once the holding fee
 * is paid, and whatever the journey (lib/application-journey) says is the
 * agent's move after that. The four application checks that used to be the
 * card now sit under it as the smaller jobs they are.
 *
 * The push stops and asks when Propoly may already hold the home: the close
 * matches to pick from, or a yes that it is new (lib/handover). Nothing is
 * created until the agent answers.
 */

export type NextAction = {
  id: string;
  label: string;
  detail: string;
  href: string | null;
  who: "you" | "kirstie" | "landlord" | "tenant";
  test?: "accept" | "decline" | "advance";
  decide?: "accepted" | "declined" | "undo";
  push?: boolean;
  release?: number;
  minor?: boolean;
};

type Candidate = { uuid: string; address: string; postcode: string };
type RunStep = { id: string; label: string; state: string; detail: string; response?: { candidates?: Candidate[]; ours?: { address: string; postcode: string } } };
type Run = { id: string; mode: "shadow" | "live"; status: "running" | "ok" | "failed" | "blocked"; steps: RunStep[] };
type Held = { ref: string; name: string; amount: number | null; people: number };
type DealTerms = {
  rentPcm: number | null;
  moveIn: string | null;
  termMonths: number | null;
  template: string;
  serviceLevel: string | null;
  paymentSchedule: string;
  tenancyType: string;
  depositScheme: string | null;
  zeroDeposit: boolean;
  depositPounds: number | null;
  holdingFeePounds: number | null;
  scotland: boolean;
};
type DealDraft = {
  terms: DealTerms;
  problems: string[];
  templates: string[];
  services: Record<string, string>;
  schedules: Record<string, string>;
  tenancyTypes: Record<string, string>;
  schemes: Record<string, string>;
};
type Party = { name: string; email: string | null; phone: string | null };

const WHO: Record<NextAction["who"], string> = { you: "You", kirstie: "Kirstie", landlord: "The landlord", tenant: "The tenant" };
const gbp = (n: number | null) => (n == null ? "" : ` · £${n.toLocaleString("en-GB")} pcm`);

export default function NextStepCard({
  applicationId,
  actions,
  loading,
  checks,
  onPlay,
  playing,
  confirming,
  onChanged,
}: {
  applicationId: string;
  actions: NextAction[] | null;
  loading: boolean;
  checks: { label: string; done: boolean; note?: string }[];
  onPlay: (a: NextAction) => void;
  playing: string | null;
  confirming: string | null;
  /** Something moved: read the journey (and the updates) again. */
  onChanged: () => void;
}) {
  /* The journey lists actions in the order of the process: the first that
     is not a reminder IS the next step, whoever's move it is. */
  const next = actions?.find((a) => !a.minor) ?? actions?.[0] ?? null;
  const then = (actions ?? []).filter((a) => a !== next && !a.minor).slice(0, 2);
  const mine = next?.who === "you";
  const open = checks.filter((c) => !c.done);

  /* ── the push ── */
  const [pushing, setPushing] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const match = run?.status === "blocked" ? run.steps.find((s) => s.id === "property-match" && s.state === "blocked" && s.response?.candidates) ?? null : null;
  const candidates = match?.response?.candidates ?? [];

  /* ── the deal it will start (switch handover_deal), checked first ── */
  const [draft, setDraft] = useState<DealDraft | null>(null);
  const [terms, setTerms] = useState<DealTerms | null>(null);
  const [tenants, setTenants] = useState<Party[]>([]);
  /* A deal an earlier push started: pushing again finishes the rest and uses it. */
  const [priorDeal, setPriorDeal] = useState(false);
  useEffect(() => {
    if (!next?.push) return;
    let live = true;
    fetch(`/api/handoff?application=${encodeURIComponent(applicationId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { deal?: DealDraft | null; tenants?: Party[]; runs?: Run[] }) => {
        if (!live) return;
        setPriorDeal(Boolean(j.runs?.some((r) => r.mode === "live" && r.steps.some((x) => x.id === "deal" && x.state === "ok"))));
        setDraft(j.deal ?? null);
        setTerms(j.deal?.terms ?? null);
        setTenants(j.tenants ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [applicationId, next?.push]);
  const set = (k: keyof DealTerms, v: unknown) => setTerms((t) => (t ? { ...t, [k]: v } : t));
  /* The holding fee follows the rent, as the server works it out. */
  const holding = terms ? (terms.scotland ? 0 : terms.rentPcm ? Math.floor(((terms.rentPcm * 12) / 52) * 100) / 100 : null) : null;
  const agentProblems = [
    ...(terms && !terms.rentPcm ? ["Add the agreed rent."] : []),
    ...(terms && !terms.moveIn ? ["Add the move-in date."] : []),
    ...(terms && !terms.termMonths ? ["Add the term."] : []),
    ...(terms && !terms.serviceLevel ? ["Pick the service."] : []),
    ...(terms && !terms.depositScheme ? ["Pick the deposit scheme."] : []),
    ...tenants.filter((t) => !t.email).map((t) => `${t.name} has no email, and Propoly needs one.`),
  ];
  const dealStarted = priorDeal || Boolean(run?.mode === "live" && run.steps.some((x) => x.id === "deal" && x.state === "ok"));

  async function push(extra: { propertyUuid?: string; newProperty?: boolean } = {}) {
    setPushing(true);
    setPushError(null);
    try {
      const r = await fetch("/api/handoff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, ...extra, ...(terms && !dealStarted ? { deal: terms } : {}) }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; run?: Run };
      if (j.run) {
        setRun(j.run);
        setPick(null);
        if (j.run.status === "ok") onChanged();
      } else setPushError(j.error ?? "That didn't go through.");
    } catch {
      setPushError("That didn't go through - the connection dropped. Nothing was sent twice; try again.");
    } finally {
      setPushing(false);
    }
  }

  /* ── the others, once the fee is in ── */
  const [held, setHeld] = useState<Held[] | null>(null);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [releasing, setReleasing] = useState(false);
  const [released, setReleased] = useState<string | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  useEffect(() => {
    if (!next?.release) return;
    let live = true;
    fetch(`/api/offers/release-others?application=${encodeURIComponent(applicationId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; offers?: Held[]; error?: string }) => {
        if (!live) return;
        const o = j.ok ? (j.offers ?? []) : [];
        setHeld(o);
        setChosen(new Set(o.map((x) => x.ref)));
        if (!j.ok) setReleaseError(j.error ?? "Couldn't read the other offers.");
      })
      .catch(() => live && setReleaseError("Couldn't read the other offers."));
    return () => {
      live = false;
    };
  }, [applicationId, next?.release]);

  async function release() {
    if (!chosen.size) return;
    setReleasing(true);
    setReleaseError(null);
    try {
      const r = await fetch("/api/offers/release-others", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applicationId, refs: [...chosen] }),
      });
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; declined?: number };
      if (!j.ok) setReleaseError(j.error ?? "That didn't save.");
      else {
        setReleased(`${j.declined} offer${j.declined === 1 ? "" : "s"} let go. Each "not this one" is ready above to read and send.`);
        onChanged();
      }
    } catch {
      setReleaseError("That didn't save - the connection dropped. Try again.");
    } finally {
      setReleasing(false);
    }
  }

  const primary = "press-ring inline-flex items-center justify-center gap-2 rounded-full bg-[var(--brown)] px-4 py-2.5 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";
  const quiet = "press-ring inline-flex items-center justify-center gap-2 rounded-full border border-line/60 bg-white px-4 py-2.5 text-[12.5px] font-semibold transition-colors hover:border-ink/40 disabled:opacity-40";

  return (
    <section className="rounded-[22px] border border-line/50 bg-white p-5" data-steve="application.next-step">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="hand flex items-center gap-2.5 text-[15px]">
          <DoodleIcon name="rocket" size={15} className="text-accent-dark" />
          Next Step
        </h3>
        {next && <span className="text-[11px] text-muted">{WHO[next.who]}</span>}
      </div>

      {loading ? (
        <p className="flex items-center gap-2 text-[12.5px] text-muted">
          <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
          Working out the next step&hellip;
        </p>
      ) : !next ? (
        <p className="text-[13px] leading-relaxed text-muted">Nothing to do on this one right now.</p>
      ) : (
        <>
          <p className="text-[15px] font-semibold leading-snug">{next.label}</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-muted">{next.detail}</p>

          {/* PUSH TO PROPOLY */}
          {next.push && (
            <div className="mt-4">
              {!match && terms && !dealStarted && (
                <div className="mb-3 rounded-2xl border border-line/60 bg-accent-soft/25 p-4" data-steve="application.deal-terms">
                  <p className="text-[13px] font-semibold">The Deal It Will Start in Propoly</p>
                    <>
                      <p className="mt-0.5 text-[12px] leading-snug text-muted">From the accepted offer. Check it - Propoly builds the agreement from this.</p>
                      <div className="mt-3 grid grid-cols-2 gap-2.5 text-[12px]">
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Rent (£ pcm)</span>
                          <input type="number" min={0} step="0.01" inputMode="decimal" value={terms.rentPcm ?? ""} onChange={(e) => set("rentPcm", e.target.value === "" ? null : Number(e.target.value))} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Move in</span>
                          <input type="date" value={terms.moveIn ?? ""} onChange={(e) => set("moveIn", e.target.value || null)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Term (months)</span>
                          <input type="number" min={1} max={60} step={1} value={terms.termMonths ?? ""} onChange={(e) => set("termMonths", e.target.value === "" ? null : Number(e.target.value))} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5" />
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">{terms.zeroDeposit ? "Flatfair cover (£)" : "Deposit (£)"}</span>
                          <input type="number" min={0} step="0.01" inputMode="decimal" value={terms.depositPounds ?? ""} onChange={(e) => set("depositPounds", e.target.value === "" ? null : Number(e.target.value))} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5" />
                        </label>
                        <label className="col-span-2 flex flex-col gap-1">
                          <span className="text-muted">Agreement</span>
                          <select value={terms.template} onChange={(e) => set("template", e.target.value)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5">
                            {(draft?.templates ?? []).map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </select>
                        </label>
                        <label className="col-span-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line/70 bg-white px-2.5 py-2">
                          <input type="checkbox" className="mt-0.5" checked={terms.zeroDeposit} onChange={(e) => set("zeroDeposit", e.target.checked)} />
                          <span>
                            Landlord opted into zero deposit
                            <span className="block text-[11px] text-muted">
                              {terms.zeroDeposit ? "Flatfair instead of a deposit. Propoly's Flatfair clause stays on the deal." : "A deposit held with TDS. Propoly adds its Flatfair clause to every deal - you'll be told to take it off."}
                            </span>
                          </span>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Tenancy</span>
                          <select value={terms.tenancyType} onChange={(e) => set("tenancyType", e.target.value)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5">
                            {Object.entries(draft?.tenancyTypes ?? {}).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Deposit scheme</span>
                          <select value={terms.depositScheme ?? ""} onChange={(e) => set("depositScheme", e.target.value || null)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5">
                            <option value="">Pick one</option>
                            {Object.entries(draft?.schemes ?? {}).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Service</span>
                          <select value={terms.serviceLevel ?? ""} onChange={(e) => set("serviceLevel", e.target.value || null)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5">
                            <option value="">Pick one</option>
                            {Object.entries(draft?.services ?? {}).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </label>
                        <label className="flex flex-col gap-1">
                          <span className="text-muted">Rent paid</span>
                          <select value={terms.paymentSchedule} onChange={(e) => set("paymentSchedule", e.target.value)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5">
                            {Object.entries(draft?.schedules ?? {}).map(([k, v]) => (
                              <option key={k} value={k}>{v}</option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <p className="mt-2.5 text-[12px] text-muted">
                        Holding fee: {terms.scotland ? "none in Scotland" : holding != null ? `£${holding.toLocaleString("en-GB", { minimumFractionDigits: holding % 1 ? 2 : 0, maximumFractionDigits: 2 })} (one week's rent)` : "worked out from the rent"}
                      </p>
                      {tenants.length > 0 && (
                        <ul className="mt-2 space-y-1 border-t border-line/50 pt-2 text-[12px] leading-snug">
                          {tenants.map((t) => (
                            <li key={`${t.name}-${t.email ?? ""}`}>
                              <span className="font-semibold">{t.name}</span>
                              <span className="text-muted"> · {t.email ?? "no email"} · {t.phone ?? "no mobile"}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {agentProblems.length > 0 && <p className="mt-2 text-[12px] leading-snug text-accent-dark">{agentProblems.join(" ")}</p>}
                    </>
                </div>
              )}

              {!match && (
                <button type="button" onClick={() => void push()} disabled={pushing || (Boolean(terms) && !dealStarted && agentProblems.length > 0)} className={`${primary} w-full`}>
                  <DoodleIcon name="rocket" size={14} />
                  {pushing ? "Pushing to Propoly…" : "Push to Propoly"}
                </button>
              )}

              {match && (
                <div className="rounded-2xl border border-accent/60 bg-accent-soft/40 p-4">
                  <p className="text-[13px] font-semibold">Is this home already in Propoly?</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-muted">
                    {candidates.length
                      ? "These are close. Pick the one that is this home, so the deal goes on the record Propoly already has."
                      : "Nothing in Propoly looks like it. Confirm it's a new home and it will be created."}
                    {match.response?.ours ? ` This home: ${match.response.ours.address}, ${match.response.ours.postcode}.` : ""}
                  </p>
                  <ul className="mt-3 space-y-1.5">
                    {candidates.map((c) => (
                      <li key={c.uuid}>
                        <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-[12.5px] ${pick === c.uuid ? "border-accent-dark bg-white" : "border-line/60 bg-white/70"}`}>
                          <input type="radio" name="propoly-pick" className="mt-0.5" checked={pick === c.uuid} onChange={() => setPick(c.uuid)} />
                          <span>
                            {c.address}
                            <span className="block text-[11px] text-muted">{c.postcode}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                    <li>
                      <label className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 text-[12.5px] ${pick === "new" ? "border-accent-dark bg-white" : "border-line/60 bg-white/70"}`}>
                        <input type="radio" name="propoly-pick" className="mt-0.5" checked={pick === "new"} onChange={() => setPick("new")} />
                        <span>{candidates.length ? "None of these - it's a new home" : "Yes, it's a new home"}</span>
                      </label>
                    </li>
                  </ul>
                  <button
                    type="button"
                    disabled={!pick || pushing}
                    onClick={() => void push(pick === "new" ? { newProperty: true } : { propertyUuid: pick ?? undefined })}
                    className={`${primary} mt-3 w-full`}
                  >
                    {pushing ? "Pushing to Propoly…" : pick === "new" ? "Create it and push" : "Use this one and push"}
                  </button>
                </div>
              )}

              {run && !match && (
                <p className={`mt-2.5 text-[12px] leading-snug ${run.status === "ok" ? "text-ink" : "text-accent-dark"}`}>
                  {run.mode === "shadow"
                    ? run.status === "ok"
                      ? "Practice run: every step would go through. Nothing was written."
                      : `Practice run: it would stop at ${run.steps.find((s) => s.state === "failed" || s.state === "blocked")?.label.toLowerCase() ?? "a step"}. Nothing was written.`
                    : run.status === "ok"
                      ? run.steps.some((x) => x.id === "deal" && x.state === "ok")
                        ? `Deal started in Propoly with the tenants on it. ${run.steps.find((x) => x.id === "deal-check")?.detail ?? ""}`.trim()
                        : "In Propoly. Start the deal there next."
                      : dealStarted
                        ? `The deal is in Propoly, but one step didn't finish: ${run.steps.find((s) => s.state === "failed" || s.state === "blocked")?.detail ?? "a step didn't finish."} Push again to finish it - the deal isn't doubled.`
                        : `Stopped: ${run.steps.find((s) => s.state === "failed" || s.state === "blocked")?.detail ?? "a step didn't finish."}`}
                </p>
              )}
              {pushError && <p className="mt-2.5 text-[12px] text-accent-dark">{pushError}</p>}
            </div>
          )}

          {/* LET THE OTHERS KNOW */}
          {next.release ? (
            <div className="mt-4">
              {released ? (
                <p className="text-[12.5px] leading-snug">{released}</p>
              ) : held === null && !releaseError ? (
                <p className="text-[12px] text-muted">Reading the other offers…</p>
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {(held ?? []).map((h) => (
                      <li key={h.ref}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-line/60 px-3 py-2 text-[12.5px]">
                          <input
                            type="checkbox"
                            className="mt-0.5"
                            checked={chosen.has(h.ref)}
                            onChange={(e) =>
                              setChosen((s) => {
                                const n = new Set(s);
                                if (e.target.checked) n.add(h.ref);
                                else n.delete(h.ref);
                                return n;
                              })
                            }
                          />
                          <span>
                            {h.name}
                            <span className="text-muted">{gbp(h.amount)}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <button type="button" onClick={() => void release()} disabled={releasing || !chosen.size} className={`${primary} mt-3 w-full`}>
                    {releasing ? "Saving…" : `Let ${chosen.size === 1 ? "them" : `these ${chosen.size}`} know`}
                  </button>
                  <p className="mt-2 text-[11px] leading-snug text-muted">Nothing is sent yet. You read each email and send it, or ring instead.</p>
                </>
              )}
              {releaseError && <p className="mt-2 text-[12px] text-accent-dark">{releaseError}</p>}
            </div>
          ) : null}

          {/* Accept / Decline and the rest the journey can play. */}
          {mine && (next.decide || next.test) && (
            <button type="button" onClick={() => onPlay(next)} disabled={playing !== null} className={`${next.decide === "declined" || next.test === "decline" ? quiet : primary} mt-4 w-full`}>
              {playing === next.id ? "Working…" : confirming === next.id ? "Yes, decline it" : next.label}
            </button>
          )}
          {!next.push && !next.release && !next.decide && !next.test && next.href && (
            <a href={next.href} {...(/^https?:/.test(next.href) ? { target: "_blank", rel: "noreferrer" } : {})} className={`${mine ? primary : quiet} mt-4 w-full`}>
              {/^https?:/.test(next.href) ? "Open in Propoly" : next.label}
            </a>
          )}

          {then.length > 0 && (
            <div className="mt-4 border-t border-line/50 pt-3">
              <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">After That</p>
              <ul className="mt-1.5 space-y-1 text-[12px] leading-snug">
                {then.map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-line" />
                    <span>
                      {a.label}
                      {a.who !== "you" && <span className="text-muted"> · {WHO[a.who]}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {open.length > 0 && (
        <div className="mt-4 border-t border-line/50 pt-3">
          <p className="text-[10.5px] font-semibold uppercase tracking-wide text-muted">Still to Tick</p>
          <ul className="mt-1.5 space-y-1.5">
            {open.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-[12px] leading-snug">
                <span aria-hidden className="mt-0.5 h-[14px] w-[14px] shrink-0 rounded-full border-[1.5px] border-line bg-white" />
                <span>
                  <span className="font-semibold">{c.label}</span>
                  {c.note ? <span className="block text-[11px] text-muted">{c.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
