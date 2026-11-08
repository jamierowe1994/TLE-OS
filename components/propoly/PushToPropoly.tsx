"use client";

import { useEffect, useState } from "react";
import FloatSheet, { FloatCard, FloatCardHead } from "@/components/new-look/FloatSheet";
import { propolyDealUrl } from "@/lib/business/propoly-stages";
import { PROPOLY_CHECKLIST } from "@/lib/propoly-checklist";
import type { Handoff } from "@/components/HandoffPanel";

/**
 * PUSH TO PROPOLY, as one pop-out (James, 8 Nov 2026).
 *
 * "We should do a pop-out modal of everything that they need ... call it
 * information ... see all of the information that's going to be pushed over
 * ... make all of that stuff required ... a visual layout that cuts down on
 * the opportunities for people to miss stuff." And then "a really big
 * confirmation that it's gone", with Open in Propoly and the checklist of
 * what to press there, as a PDF too.
 *
 * Left: what goes over - the landlord, the tenants, the certificates and the
 * terms of business - each with a green tick or Needs work, and Edit where
 * it's put right. Right: the deal it starts (the same fields the Next Step
 * card had), what still needs work, and the one Push button. A refusal is
 * said in plain words; success is a screen of its own.
 *
 * The push itself is unchanged (POST /api/handoff): practice mode while the
 * switch is off, the "is this home already in Propoly?" question when it
 * may be, and nothing is created twice.
 */

type Candidate = { uuid: string; address: string; postcode: string };
type RunStep = { id: string; label: string; state: string; detail: string; response?: { candidates?: Candidate[]; ours?: { address: string; postcode: string }; uuid?: string } | null };
type Run = { id: string; mode: "shadow" | "live"; status: "running" | "ok" | "failed" | "blocked"; steps: RunStep[] };
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
  landlordOptOut?: { reason: string | null; by: string; at: string } | null;
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

const gbp = (n: number | null) => (n == null ? "-" : `£${n.toLocaleString("en-GB")}`);
const day = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
};

/** A step's words, said plainly (the translator in the middle). */
function plainStep(s: RunStep | undefined): string {
  if (!s) return "A step didn't finish.";
  const d = s.detail || "";
  if (/email/i.test(d) && /(missing|no |required)/i.test(d)) return `${d} Propoly needs an email for everyone on the deal - add it on their details and push again.`;
  if (/postcode/i.test(d)) return `${d} Check the property's postcode is right on the listing.`;
  if (/429|quota|rate/i.test(d)) return "Propoly asked us to slow down. Wait a minute and push again - nothing is created twice.";
  if (/5\d\d|timeout|timed out|did not answer/i.test(d)) return "Propoly didn't answer in time. Push again in a minute - nothing is created twice.";
  return d.replace(/\bREX\b/g, "the listing");
}

function Tick({ ok, warn }: { ok: boolean; warn?: string }) {
  return ok ? (
    <span className="nl-ptp-ok" aria-label="Done">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
    </span>
  ) : (
    <span className="nl-ptp-warn">{warn ?? "Needs work"}</span>
  );
}

export default function PushToPropoly({
  applicationId,
  address,
  onClose,
  onChanged,
  onEdit,
}: {
  applicationId: string;
  address: string;
  onClose: () => void;
  onChanged: () => void;
  /** Put something right where it lives: the pop-out closes and that opens. */
  onEdit?: (what: "landlord" | "tenant" | "deal" | "documents", index?: number) => void;
}) {
  const [h, setH] = useState<Handoff | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pushing, setPushing] = useState(false);
  const [run, setRun] = useState<Run | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [draft, setDraft] = useState<DealDraft | null>(null);
  const [terms, setTerms] = useState<DealTerms | null>(null);
  const [tenants, setTenants] = useState<Party[]>([]);
  const [priorDeal, setPriorDeal] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const primary = "nl-btn nl-btn--primary";

  useEffect(() => {
    let live = true;
    fetch(`/api/handoff?application=${encodeURIComponent(applicationId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Handoff & { error?: string; deal?: DealDraft | null; tenants?: Party[]; runs?: Run[] }) => {
        if (!live) return;
        if (j.error) return setLoadError(j.error);
        setH(j);
        setPriorDeal(Boolean(j.runs?.some((r) => r.mode === "live" && r.steps.some((x) => x.id === "deal" && x.state === "ok"))));
        setDraft(j.deal ?? null);
        setTerms(j.deal?.terms ?? null);
        setTenants(j.tenants ?? []);
      })
      .catch(() => live && setLoadError("The details for Propoly couldn't be read just now. Close this and try again."));
    return () => {
      live = false;
    };
  }, [applicationId]);

  const match = run?.status === "blocked" ? run.steps.find((s) => s.id === "property-match" && s.state === "blocked" && s.response?.candidates) ?? null : null;
  const candidates = match?.response?.candidates ?? [];
  const set = (k: keyof DealTerms, v: unknown) => setTerms((t) => (t ? { ...t, [k]: v } : t));
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

  const landed = run?.status === "ok";
  const dealUuid = run?.steps.find((s) => s.id === "deal" && s.state === "ok")?.response?.uuid ?? null;
  const propolyHref = propolyDealUrl(dealUuid);

  /* The checklist as a page to print or save as a PDF. */
  const printChecklist = () => {
    const w = window.open("", "_blank", "width=820,height=1000");
    if (!w) return;
    const rows = PROPOLY_CHECKLIST.map((c) => `<li><span class="box"></span><div><b>${c.label}</b><p>${c.detail}</p></div></li>`).join("");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>In Propoly - ${address.replace(/</g, "")}</title><style>
      body{font-family:Inter,Helvetica,Arial,sans-serif;color:#141413;margin:48px;}
      h1{font-size:26px;letter-spacing:.02em;text-transform:uppercase;margin:0 0 4px} .sub{color:#63625b;margin:0 0 28px}
      ul{list-style:none;padding:0;margin:0} li{display:flex;gap:14px;padding:14px 0;border-top:1px solid #e3ded6}
      .box{flex:none;width:16px;height:16px;border:1.5px solid #56423e;margin-top:3px} b{font-size:15px} p{margin:4px 0 0;color:#63625b;font-size:13px}
      .foot{margin-top:28px;color:#87867f;font-size:12px}</style></head><body>
      <h1>In Propoly: what to press</h1><p class="sub">${address.replace(/</g, "")}</p><ul>${rows}</ul>
      <p class="foot">From TLE OS. Tick each one as you go.</p><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`);
    w.document.close();
  };

  /* ── what goes over, each line ticked or needing work ── */
  const certs = (h?.certificates ?? []).filter((c) => c.required);
  const tob = (h?.documents ?? []).find((d) => /terms|tob/i.test(`${d.kind ?? ""} ${d.name}`));
  const landlords = h?.landlord ? [h.landlord, ...(h.otherLandlords ?? [])] : [];
  const sideProblems = [
    ...(h?.blockers ?? []),
    ...(h && !h.landlord && !applicationId.startsWith("swap:") ? ["There's no landlord on this let."] : []),
    ...landlords.filter((l) => !l.email).map((l) => `${l.name} (landlord) has no email.`),
  ];
  const problems = [...new Set([...sideProblems, ...agentProblems])];
  /* The home's paper: it doesn't stop the push, but the PLC check needs it
     before move-in, so it's named here rather than discovered later. */
  const certLabels = new Set(certs.map((c) => c.label.toLowerCase()));
  const extraMissing = (h?.missing ?? []).filter((m) => !certLabels.has(m.label.toLowerCase()));
  const stillToGet = [
    ...certs.filter((c) => !(c.attached && c.validAtStart)).map((c) => `${c.label}: ${c.attached ? "runs out before the move-in" : "not on the file"}`),
    ...(tob ? [] : ["Terms of business: not on the file"]),
    ...extraMissing.map((m) => `${m.label}: ${m.why.replace(/\.$/, "").toLowerCase()}`),
  ];
  const ready = h !== null && problems.length === 0;

  return (
    <FloatSheet
      title="Push to Propoly"
      size="xl"
      onClose={onClose}
      dismissible={!pushing}
      screenKey={landed ? "landed" : "info"}
      question={landed ? (run?.mode === "shadow" ? "Practice Run: It Would All Go Through" : "It's in Propoly") : "Information for Propoly"}
      lede={
        landed
          ? run?.mode === "shadow"
            ? "The push is in practice mode, so nothing was written. Every step would have gone through."
            : "The landlord, the home and the deal with its tenants are in Propoly. Open it, run down the list on the right, then push the deal on there."
          : "Everything below goes over. Each line is ticked or needs work - put right what needs work, then push."
      }
    >
      {loadError ? (
        <FloatCard>
          <p className="nl-fs-err">{loadError}</p>
        </FloatCard>
      ) : !h ? (
        <FloatCard>
          <p className="nl-fs-reading">
            <span aria-hidden className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" /> Gathering everything that goes to Propoly…
          </p>
        </FloatCard>
      ) : landed ? (
        <div className="nl-ptp nl-ptp--landed">
          <div className="nl-ptp-landed">
            <span className="nl-ptp-burst" aria-hidden>
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </span>
            <p className="nl-ptp-landed-t">{address}</p>
            <p className="nl-ptp-landed-s">{plainStep(run?.steps.find((x) => x.id === "deal-check")) === "A step didn't finish." ? "" : run?.steps.find((x) => x.id === "deal-check")?.detail ?? ""}</p>
            <div className="nl-ptp-landed-acts">
              <a href={propolyHref} target="_blank" rel="noreferrer" className="nl-btn nl-btn--primary" data-steve="propoly.open">
                Open in Propoly
              </a>
              <button type="button" className="nl-btn nl-btn--secondary" onClick={printChecklist} data-steve="propoly.checklist-pdf">
                Download the checklist (PDF)
              </button>
            </div>
          </div>
          <FloatCard>
            <FloatCardHead title="Now, in Propoly" aside={`${ticked.size} of ${PROPOLY_CHECKLIST.length}`} />
            <ul className="nl-ptp-check">
              {PROPOLY_CHECKLIST.map((c) => (
                <li key={c.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={ticked.has(c.id)}
                      onChange={(e) => setTicked((t) => {
                        const n = new Set(t);
                        if (e.target.checked) n.add(c.id);
                        else n.delete(c.id);
                        return n;
                      })}
                    />
                    <span>
                      <b>{c.label}</b>
                      <small>{c.detail}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </FloatCard>
        </div>
      ) : (
        <div className="nl-ptp">
          <div className="nl-ptp-info">
            <FloatCard>
              <FloatCardHead title={landlords.length > 1 ? "Landlords" : "Landlord"} aside={onEdit && landlords.length ? <button type="button" className="nl-appt-edit" onClick={() => onEdit("landlord", 0)}>Edit</button> : undefined} />
              {landlords.length ? (
                <ul className="nl-ptp-lines">
                  {landlords.map((l) => (
                    <li key={l.name}>
                      <span><b>{l.name}</b><small>{[l.email ?? "No email", l.phone ?? "No mobile"].join(" · ")}</small></span>
                      <Tick ok={Boolean(l.email)} warn="No email" />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="nl-ptp-none">{applicationId.startsWith("swap:") ? "A change of tenants: the landlord is already in Propoly." : "No landlord on this let yet."}</p>
              )}
            </FloatCard>
            <FloatCard>
              <FloatCardHead title={tenants.length > 1 ? "Tenants" : "Tenant"} aside={onEdit && tenants.length ? <button type="button" className="nl-appt-edit" onClick={() => onEdit("tenant", 0)}>Edit</button> : undefined} />
              <ul className="nl-ptp-lines">
                {tenants.map((t, i) => (
                  <li key={`${t.name}-${i}`}>
                    <span><b>{t.name}</b><small>{[t.email ?? "No email", t.phone ?? "No mobile"].join(" · ")}</small></span>
                    <Tick ok={Boolean(t.email)} warn="No email" />
                  </li>
                ))}
                {!tenants.length && <li><span>No tenant on this let.</span><Tick ok={false} /></li>}
              </ul>
            </FloatCard>
            <FloatCard>
              <FloatCardHead title="The Home" aside={onEdit ? <button type="button" className="nl-appt-edit" onClick={() => onEdit("documents")}>Documents</button> : undefined} />
              <ul className="nl-ptp-lines">
                {certs.map((c) => (
                  <li key={c.type}>
                    <span>
                      <b>{c.label}</b>
                      <small>{c.attached ? (c.expiry ? `Expires ${day(c.expiry)}` : "On file") : "Not on file"}{c.attached && !c.validAtStart ? " - runs out before the move-in" : ""}</small>
                    </span>
                    <Tick ok={c.attached && c.validAtStart} warn={!c.attached ? "Missing" : "Out of date"} />
                  </li>
                ))}
                <li>
                  <span><b>Terms of business</b><small>{tob ? tob.name : "Not on the file"}</small></span>
                  <Tick ok={Boolean(tob)} warn="Missing" />
                </li>
                {extraMissing.map((m) => (
                  <li key={m.id}>
                    <span><b>{m.label}</b><small>{m.why}</small></span>
                    <Tick ok={false} />
                  </li>
                ))}
              </ul>
            </FloatCard>
          </div>
          <div className="nl-ptp-act">
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
                        {/* Every landlord is opted in under the terms of business and the
                            tenant chooses (21 Oct 2026). One the agent recorded as opted out
                            on their file gets a deposit, and the tick is locked. */}
                        {terms.landlordOptOut ? (
                          <div className="col-span-2 flex items-start gap-2.5 rounded-lg border border-line/70 bg-white px-2.5 py-2">
                            <input type="checkbox" className="mt-0.5" checked={false} disabled aria-label="Tenant is using zero deposit" />
                            <span>
                              Landlord opted out of zero deposit
                              <span className="block text-[11px] text-muted">
                                {`A deposit held with ${terms.scotland ? "MyDeposits Scotland" : "TDS"}. Recorded on the landlord's file by ${terms.landlordOptOut.by}. Propoly adds its Flatfair clause to every deal - you'll be told to take it off.`}
                              </span>
                            </span>
                          </div>
                        ) : (
                          <label className="col-span-2 flex cursor-pointer items-start gap-2.5 rounded-lg border border-line/70 bg-white px-2.5 py-2">
                            <input type="checkbox" className="mt-0.5" checked={terms.zeroDeposit} onChange={(e) => set("zeroDeposit", e.target.checked)} />
                            <span>
                              Tenant is using zero deposit (Flatfair)
                              <span className="block text-[11px] text-muted">
                                {terms.zeroDeposit ? "Flatfair instead of a deposit. Propoly's Flatfair clause stays on the deal." : `A deposit held with ${terms.scotland ? "MyDeposits Scotland" : "TDS"}. Propoly adds its Flatfair clause to every deal - you'll be told to take it off.`}
                              </span>
                            </span>
                          </label>
                        )}
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
                          {terms.scotland ? (
                            <span className="rounded-lg border border-line/70 bg-line/10 px-2.5 py-1.5" title="Every Scottish home uses MyDeposits Scotland">MyDeposits Scotland</span>
                          ) : (
                            <select value={terms.depositScheme ?? ""} onChange={(e) => set("depositScheme", e.target.value || null)} className="rounded-lg border border-line/70 bg-white px-2.5 py-1.5">
                              <option value="">Pick one</option>
                              {Object.entries(draft?.schemes ?? {}).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          )}
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
                    className={`${primary} mt-3`}
                  >
                    {pushing ? "Pushing to Propoly…" : pick === "new" ? "Create it and push" : "Use this one and push"}
                  </button>
                </div>
              )}
            {!match && (
              <FloatCard>
                <FloatCardHead title={problems.length ? "Needs Work Before You Push" : "Ready to Push"} />
                {problems.length ? (
                  <ul className="nl-ptp-todo">
                    {problems.map((p) => <li key={p}>{p}</li>)}
                  </ul>
                ) : (
                  <p className="nl-ptp-ready">Everything Propoly needs is here.{h.mode === "shadow" ? " The push is in practice mode, so pressing it checks every step and writes nothing." : ""}</p>
                )}
                <div className="nl-ptp-go">
                  <button type="button" onClick={() => void push()} disabled={pushing || !ready} className={primary} data-steve="propoly.push">
                    {pushing ? "Pushing to Propoly…" : "Push to Propoly"}
                  </button>
                </div>
              </FloatCard>
            )}
            {stillToGet.length > 0 && !match && (
              <FloatCard>
                <FloatCardHead title="Still to Get" aside="Doesn't stop the push" />
                <ul className="nl-ptp-todo is-soft">
                  {stillToGet.map((p) => <li key={p}>{p}</li>)}
                </ul>
                <p className="nl-ptp-note">The PLC check needs these before anyone moves in.</p>
              </FloatCard>
            )}
            {run && !match && run.status !== "ok" && (
              <FloatCard>
                <FloatCardHead title={run.mode === "shadow" ? "Practice Run" : "It Didn't Go Through"} />
                <p className="nl-ptp-why">
                  {run.mode === "shadow"
                    ? `It would stop at ${run.steps.find((s) => s.state === "failed" || s.state === "blocked")?.label.toLowerCase() ?? "a step"}: ${plainStep(run.steps.find((s) => s.state === "failed" || s.state === "blocked"))}`
                    : dealStarted
                      ? `The deal is in Propoly, but one step didn't finish. ${plainStep(run.steps.find((s) => s.state === "failed" || s.state === "blocked"))} Push again to finish it - the deal isn't doubled.`
                      : plainStep(run.steps.find((s) => s.state === "failed" || s.state === "blocked"))}
                </p>
              </FloatCard>
            )}
            {pushError && (
              <FloatCard>
                <FloatCardHead title="It Didn't Go Through" />
                <p className="nl-ptp-why">{pushError}</p>
              </FloatCard>
            )}
          </div>
        </div>
      )}
    </FloatSheet>
  );
}
