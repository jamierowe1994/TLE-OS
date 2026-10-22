"use client";

import { useState } from "react";
import type { Move, WorksOrder } from "@/lib/works-orders";
import { STEPS, stepOf, wasSkipped, type StepId } from "@/lib/works-steps";
import {
  WorksNow, CertificateUpload,
  QuoteStep, TellLandlordStep, ArrangingStep, LandlordFollowUpStep, PickContractorStep, ContractorConfirmStep,
  BookingStep, VisitStep, AftercareStep, PaymentStep, MoneyStep,
} from "@/components/WorksNow";
import { day, stamp } from "@/components/maintenance/works-ui";

/**
 * The stages of a job, across the top of its page, and the form for
 * whichever one is picked (James, 21 Oct 2026: "all of the different stages
 * so they can jump around in that process a little bit").
 *
 * Done is read off the facts, not off where the job is: a date typed in
 * before the contractor confirmed still shows the date as done. The stage
 * the job is on (lib/works-steps stepOf) is the pink one, and its form is the
 * Now card the job sheet has always used. Any other stage opens its own form
 * from the same file (components/WorksNow), so jumping ahead records the real
 * thing rather than faking the steps in between.
 */

type Stage = { id: StepId; label: string; done: boolean; skipped: boolean; when: string };

const SHORT: Partial<Record<StepId, string>> = {
  quote: "Quote",
  tell_landlord: "Landlord told",
  arranging: "Who arranges",
  landlord_follow_up: "Landlord organising",
  pick_contractor: "Contractor",
  contractor_confirm: "Confirmed",
  booking: "Date",
  visit: "Done",
  aftercare: "Tenant happy",
  payment: "Who's paid",
  invoice: "Invoice",
  closed: "Paid",
};

export function stagesOf(o: WorksOrder): Stage[] {
  const ours = o.arranging === "us" && (o.kind === "planned" || o.landlordSkipped);
  const list: Stage[] = [];
  const add = (id: StepId, done: boolean, when: string, skipped = false) => list.push({ id, label: SHORT[id] ?? id, done, skipped, when });
  if (o.quoteRequestedAt || o.quotePence != null) {
    add("quote", o.quotePence != null && o.status !== "approval", o.quotePence != null ? (o.approvedAt ? `Approved ${day(o.approvedAt)}` : o.status === "approval" ? "Waiting on the landlord" : "In") : `Asked ${day(o.quoteRequestedAt)}`);
  }
  if (!o.landlordSkipped) {
    const skipped = wasSkipped(o, "tell_landlord") && !o.landlordToldAt;
    add("tell_landlord", !!o.landlordToldAt || ours, o.landlordToldAt ? day(o.landlordToldAt) : skipped ? "Skipped" : ours ? "Not needed" : "", skipped);
  }
  add("arranging", !!o.arranging, o.arranging === "us" ? "Us" : o.arranging === "landlord" ? "The landlord" : "");
  if (o.arranging === "landlord") {
    add("landlord_follow_up", !!o.landlordResolvedAt, o.landlordResolvedAt ? `Resolved ${day(o.landlordResolvedAt)}` : o.landlordFollowUpAt ? `Follow up ${day(o.landlordFollowUpAt)}` : "");
  } else {
    add("pick_contractor", !!o.contractorId, o.contractorContactedAt ? day(o.contractorContactedAt) : o.contractorName ? "Set" : "");
    add("contractor_confirm", !!o.contractorConfirmedAt, o.contractorConfirmedAt ? day(o.contractorConfirmedAt) : "");
    add("booking", !!o.scheduledAt, o.scheduledAt ? stamp(o.scheduledAt) : "");
  }
  add("visit", !!o.completedAt, o.completedAt ? day(o.completedAt) : "");
  if (o.kind === "repair" && o.arranging !== "landlord") {
    const skipped = wasSkipped(o, "aftercare") && !o.tenantHappy;
    add("aftercare", !!o.tenantHappy, o.tenantHappy ? `${o.tenantHappy === "yes" ? "Yes" : "No"}${o.tenantHappyAt ? ` · ${day(o.tenantHappyAt)}` : ""}` : skipped ? "Skipped" : "", skipped);
  }
  if (o.arranging !== "landlord") {
    add("payment", !!o.payee, o.payee === "agent" ? "The agent" : o.payee === "contractor" ? "Contractor" : "");
    add("invoice", o.invoicePence != null, o.invoicedAt ? day(o.invoicedAt) : "");
    add("closed", o.status === "paid", o.paidAt ? day(o.paidAt) : "");
  }
  return list;
}

/** The stage the job is on, as the tracker draws it. A landlord-resolved or cancelled job sits on none. */
export function currentStage(o: WorksOrder): StepId | null {
  const s = stepOf(o);
  if (s !== "closed") return s;
  return o.status === "paid" ? "closed" : null;
}

export function StageTracker({ o, picked, onPick }: { o: WorksOrder; picked: StepId | null; onPick: (s: StepId) => void }) {
  const stages = stagesOf(o);
  const here = currentStage(o);
  return (
    <ol className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]" aria-label="The stages of the job">
      {stages.map((s, i) => {
        const on = s.id === here && o.status !== "cancelled";
        const sel = s.id === picked;
        return (
          <li key={s.id} className="relative min-w-[92px] flex-1">
            {i > 0 && <span aria-hidden className={`absolute right-1/2 top-[15px] h-[2px] w-full ${s.done || on ? "bg-ink/70" : "bg-line/70"}`} />}
            <button
              type="button"
              onClick={() => onPick(s.id)}
              aria-current={on ? "step" : undefined}
              aria-pressed={sel}
              title={`${STEPS.find((x) => x.id === s.id)?.label ?? s.label}${s.skipped ? " (skipped)" : ""}`}
              className={`relative flex w-full flex-col items-center rounded-xl px-1 pb-2 pt-1 text-center transition-colors ${sel ? "bg-accent-soft/60" : "hover:bg-box"}`}
            >
              <span
                className={`relative z-[1] flex h-[22px] w-[22px] items-center justify-center rounded-full text-[10.5px] font-bold ${
                  on ? "bg-accent-dark text-white ring-4 ring-accent-soft" : s.done ? "bg-ink/80 text-white" : s.skipped ? "border-2 border-dashed border-ink/40 bg-white text-ink/50" : "border-2 border-line bg-white text-muted"
                }`}
              >
                {s.done && !on ? "✓" : s.skipped ? "-" : i + 1}
              </span>
              <span className={`mt-1.5 block w-full truncate text-[11.5px] leading-tight ${on ? "font-semibold text-accent-dark" : s.done ? "text-ink" : "text-muted"}`}>{s.label}</span>
              <span className="block h-[15px] w-full truncate text-[10.5px] text-muted">{s.when}</span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The picked stage's form. The stage the job is on gets the Now card; any
 * other gets that stage's form, with a line saying it isn't the step the job
 * is on.
 */
export function StagePanel({ o, stage, move, busy, err, canCorporate, canPayrun, onInvoiceLandlord, onCertificate, onForm, bare = false }: {
  o: WorksOrder;
  /** The caller draws the stage's name and blurb (the job page's Current Stage card). */
  bare?: boolean;
  stage: StepId;
  move: (m: Move) => Promise<unknown>;
  busy: boolean;
  err: string | null;
  canCorporate: boolean;
  canPayrun: boolean;
  onInvoiceLandlord: () => void;
  onCertificate: (fd: FormData) => Promise<string | null>;
  /** Opens one of the page's own forms (components/maintenance/JobForms) for the stages WorksNow has no form for out of turn. */
  onForm: (id: "quote" | "request_quote" | "assign" | "schedule" | "done" | "paid" | "reopen") => void;
}) {
  const here = currentStage(o);
  const mv = async (m: Move) => { await move(m); };
  const meta = STEPS.find((s) => s.id === stage);
  if (stage === here && o.status !== "cancelled") {
    return <WorksNow o={o} move={mv} busy={busy} err={err} canCorporate={canCorporate} canPayrun={canPayrun} onInvoiceLandlord={onInvoiceLandlord} onCertificate={onCertificate} variant={bare ? "bare" : "card"} />;
  }
  const btn = "rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[12px] transition-colors hover:border-ink/40";
  const primary = "rounded-full bg-ink px-4 py-1.5 text-[12px] font-semibold text-page disabled:opacity-50";
  const done = stagesOf(o).find((s) => s.id === stage)?.done ?? false;
  let body: React.ReactNode = null;
  switch (stage) {
    case "quote":
      body = o.status === "approval"
        ? <Stateful render={(sf, ssf) => <QuoteStep o={o} f={sf} setF={ssf} move={mv} busy={busy} />} />
        : (
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onForm("quote")} className={primary}>{o.quotePence != null ? "Change the quote" : "Log a quote"}</button>
            <button type="button" onClick={() => onForm("request_quote")} className={btn}>Ask a contractor for a quote</button>
          </div>
        );
      break;
    case "tell_landlord":
      body = <Stateful render={(sf, ssf) => <TellLandlordStep o={o} f={sf} setF={ssf} move={mv} busy={busy} />} />;
      break;
    case "arranging":
      body = <Stateful render={(sf, ssf) => <ArrangingStep o={o} f={sf} setF={ssf} move={mv} busy={busy} />} />;
      break;
    case "landlord_follow_up":
      body = <Stateful render={(sf, ssf) => <LandlordFollowUpStep o={o} f={sf} setF={ssf} move={mv} busy={busy} />} />;
      break;
    case "pick_contractor":
      body = (
        <div className="space-y-3">
          <PickContractorStep o={o} move={mv} busy={busy} canCorporate={canCorporate} />
          <button type="button" onClick={() => onForm("assign")} className={btn}>Set one without emailing them</button>
        </div>
      );
      break;
    case "contractor_confirm":
      body = o.contractorId
        ? <ContractorConfirmStep o={o} move={mv} busy={busy} canCorporate={canCorporate} />
        : <p className="text-[12.5px] text-muted">Pick a contractor first - there is nobody on the job to confirm.</p>;
      break;
    case "booking":
      body = o.contractorId
        ? <Stateful render={(sf, ssf) => <BookingStep o={o} f={sf} setF={ssf} move={mv} busy={busy} />} />
        : <button type="button" onClick={() => onForm("schedule")} className={primary}>Set the date</button>;
      break;
    case "visit":
      body = o.completedAt
        ? <p className="text-[12.5px]">Done {stamp(o.completedAt)}. {o.completionNote}</p>
        : o.scheduledAt
          ? <Stateful render={(sf, ssf) => <VisitStep o={o} f={sf} setF={ssf} move={mv} busy={busy} onCertificate={o.kind === "planned" ? onCertificate : undefined} />} />
          : (
            <div className="space-y-3">
              <button type="button" onClick={() => onForm("done")} className={primary}>Mark it done</button>
              {o.kind === "planned" && <CertificateUpload o={o} busy={busy} onCertificate={onCertificate} title="Or put the certificate on" />}
            </div>
          );
      break;
    case "aftercare":
      body = o.completedAt
        ? <Stateful render={(sf, ssf) => <AftercareStep o={o} f={sf} setF={ssf} move={mv} busy={busy} />} />
        : <p className="text-[12.5px] text-muted">The tenant is asked once the job is marked done.</p>;
      break;
    case "payment":
      body = <PaymentStep o={o} move={mv} busy={busy} />;
      break;
    case "invoice":
      body = <Stateful render={(sf, ssf) => <MoneyStep o={o} f={sf} setF={ssf} move={mv} busy={busy} onInvoiceLandlord={onInvoiceLandlord} canPayrun={canPayrun} />} />;
      break;
    case "closed":
      body = o.status === "paid"
        ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[12.5px]">Paid {day(o.paidAt)}.</p>
            <button type="button" onClick={() => onForm("reopen")} className={btn}>Reopen</button>
          </div>
        )
        : <button type="button" onClick={() => onForm("paid")} className={primary}>Mark it paid</button>;
      break;
  }
  if (bare) {
    return (
      <div>
        {o.status === "cancelled" && <p className="mb-3 text-[12.5px] text-accent-dark">The job is cancelled. Reopen it from the actions before moving it on.</p>}
        {body}
        {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
      </div>
    );
  }
  return (
    <div className="rounded-2xl border border-line/60 bg-white p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold uppercase tracking-wider ${done ? "bg-sage text-white" : "border border-line/80 text-ink/60"}`}>{done ? "Done" : "Not the step it's on"}</span>
      </div>
      <h3 className="mt-2 text-[17px] leading-tight">{meta?.label ?? stage}</h3>
      {meta?.blurb && <p className="mt-1 max-w-[70ch] text-[12px] leading-relaxed text-muted">{meta.blurb}</p>}
      {o.status === "cancelled" && <p className="mt-2 text-[12.5px] text-accent-dark">The job is cancelled. Reopen it from Actions before moving it on.</p>}
      <div className="mt-3">{body}</div>
      {err && <p className="mt-3 text-[12px] text-accent-dark">{err}</p>}
    </div>
  );
}

/** The WorksNow step forms keep their typing in the caller's hands. */
function Stateful({ render }: { render: (f: Record<string, string>, setF: (f: Record<string, string>) => void) => React.ReactNode }) {
  const [f, setF] = useState<Record<string, string>>({});
  return <>{render(f, setF)}</>;
}
