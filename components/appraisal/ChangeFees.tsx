"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { SERVICE_LEVELS, type MarketAppraisal, type ServiceLevel } from "@/lib/market-appraisal";
import { toast } from "@/lib/toast";

/**
 * CHANGE THE FEES on a post-appraisal presentation that has already gone
 * (James Crumpton, 14 Oct 2026: the landlord and the agent agree a different
 * fee or service after the first conversation).
 *
 * Two screens, the way James likes a form with more than a couple of
 * questions: the new figures, then a check of what moves before anything is
 * saved - with what it means for the terms of business said plainly on the
 * check screen, not discovered afterwards.
 *
 * Saving changes the record the terms are drawn up from, the deck behind the
 * landlord's existing link ("Updated <date>" on the figure page), and writes
 * a note on the lead. See app/api/appraisals/[id]/fees.
 */

type Figures = {
  serviceLevel: ServiceLevel | null;
  feePct: number | null;
  setupFee: number | null;
  otherFees: string | null;
};

type TermsState = {
  drawnUp: boolean;
  sentAt: string | null;
  sentTo: string | null;
  signed: boolean;
  signedAt: string | null;
};

type Loaded = {
  figures: Figures;
  rent: number | null;
  landlord: string;
  deck: { token: string; url: string; figuresUpdatedAt: string | null; opens: number } | null;
  terms: TermsState;
};

const VAT = 0.2;
const STEPS = ["The New Figures", "Check and Save", "Saved"];
const INPUT =
  "h-11 w-full min-w-0 rounded-xl border border-line/70 bg-white px-3.5 text-[15px] outline-none transition-colors focus:border-ink";

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/London" }) : null;
const money = (n: number) => `£${n.toLocaleString("en-GB", { maximumFractionDigits: 2 })}`;
const label = (v: ServiceLevel | null) => SERVICE_LEVELS.find((s) => s.id === v)?.label ?? "Not set";

/** Before VAT, the way the terms of business state each one. */
const say = {
  serviceLevel: (v: Figures["serviceLevel"]) => label(v),
  feePct: (v: number | null) => (v == null ? "None" : `${v}% + VAT`),
  setupFee: (v: number | null) => (v == null ? "Standard" : v === 0 ? "None" : `${money(v)} + VAT`),
  otherFees: (v: string | null) => v || "None",
};
const ROWS: { key: keyof Figures; name: string }[] = [
  { key: "serviceLevel", name: "Service" },
  { key: "feePct", name: "Management fee" },
  { key: "setupFee", name: "Set-up fee" },
  { key: "otherFees", name: "Other fees" },
];

function Field({ name, hint, children }: { name: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1.5 block text-[12.5px] font-semibold">{name}</span>
      {children}
      {hint && <span className="mt-1.5 block text-[11.5px] leading-relaxed text-muted">{hint}</span>}
    </label>
  );
}

export default function ChangeFees({
  appraisalId,
  className,
  children,
  onSaved,
}: {
  appraisalId: string;
  /** The trigger's classes, so it matches whatever row it sits in. */
  className: string;
  children?: React.ReactNode;
  onSaved?: (next: MarketAppraisal) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className} data-steve="appraisal.change-fees">
        {children ?? "Change the fees"}
      </button>
      {open && (
        <ChangeFeesSheet
          appraisalId={appraisalId}
          onClose={() => setOpen(false)}
          onSaved={(next) => onSaved?.(next)}
        />
      )}
    </>
  );
}

function ChangeFeesSheet({
  appraisalId,
  onClose,
  onSaved,
}: {
  appraisalId: string;
  onClose: () => void;
  onSaved: (next: MarketAppraisal) => void;
}) {
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null | undefined>(undefined);
  const [readError, setReadError] = useState<string | null>(null);
  const [level, setLevel] = useState<ServiceLevel | "">("");
  const [fee, setFee] = useState("");
  const [setup, setSetup] = useState("");
  const [other, setOther] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ termsLine: string; noted: boolean; deckUpdated: boolean; when: string | null } | null>(null);

  useEffect(() => {
    let gone = false;
    fetch(`/api/appraisals/${appraisalId}/fees`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Loaded & { ok?: boolean; error?: string }) => {
        if (gone) return;
        if (!j.ok) {
          setReadError(j.error ?? "Couldn't read the file just now.");
          setLoaded(null);
          return;
        }
        setLoaded(j);
        setLevel(j.figures.serviceLevel ?? "");
        setFee(j.figures.feePct != null ? String(j.figures.feePct) : "");
        setSetup(j.figures.setupFee != null ? String(j.figures.setupFee) : "");
        setOther(j.figures.otherFees ?? "");
      })
      .catch(() => {
        if (gone) return;
        setReadError("Couldn't read the file just now.");
        setLoaded(null);
      });
    return () => {
      gone = true;
    };
  }, [appraisalId]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !saving && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose, saving]);

  /* What the boxes say now, read the way the server will read them. */
  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[£,%\s]/g, "")));
  const next: Figures = {
    serviceLevel: level || null,
    feePct: num(fee),
    setupFee: num(setup),
    otherFees: other.trim() && !/^none\.?$/i.test(other.trim()) ? other.trim().replace(/\s+/g, " ") : null,
  };
  const feeBad = next.feePct != null && !(Number.isFinite(next.feePct) && next.feePct > 0 && next.feePct <= 100);
  const setupBad = next.setupFee != null && !(Number.isFinite(next.setupFee) && next.setupFee >= 0);
  const was = loaded?.figures ?? null;
  const moved = was ? ROWS.filter((r) => was[r.key] !== next[r.key]) : [];

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/appraisals/${appraisalId}/fees`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ serviceLevel: level, feePct: fee, setupFee: setup, otherFees: other, reason }),
      });
      const j = (await r.json()) as {
        ok?: boolean;
        error?: string;
        appraisal?: MarketAppraisal;
        termsLine?: string;
        noted?: boolean;
        deck?: { figuresUpdatedAt: string | null } | null;
      };
      if (!j.ok || !j.appraisal) {
        setError(j.error ?? "Couldn't save the new fees.");
        return;
      }
      setDone({ termsLine: j.termsLine ?? "", noted: Boolean(j.noted), deckUpdated: Boolean(j.deck), when: j.deck?.figuresUpdatedAt ?? null });
      setStep(2);
      toast("New fees saved");
      onSaved(j.appraisal);
    } catch {
      setError("Couldn't save the new fees just now. Nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  const terms = loaded?.terms ?? null;
  const landlord = loaded?.landlord ?? "the landlord";
  /* The warning, in the order that matters: signed beats sent beats drawn up. */
  const warning: { tone: "stop" | "act" | "calm"; title: string; body: string } | null = !terms
    ? null
    : terms.signed
      ? {
          tone: "stop",
          title: `${landlord} has already signed the terms`,
          body: `They signed${terms.signedAt ? ` on ${day(terms.signedAt)}` : ""} on the old figures. Signed terms are never changed - saving here updates the presentation and the file only. If these figures stand, new terms will be needed: speak to the office before anything else goes to ${landlord}.`,
        }
      : terms.sentAt
        ? {
            tone: "act",
            title: "The terms need sending again",
            body: `The terms sent to ${terms.sentTo ?? landlord} on ${day(terms.sentAt)} carry the old figures. After saving, go to Prepare and send: draw them up again with the new figures and sign your half, then nudge ${landlord} from the file so they sign the new ones. Until then no nudge goes, by hand or automatic.`,
          }
        : terms.drawnUp
          ? {
              tone: "act",
              title: "The terms need drawing up again",
              body: "They were drawn up on the old figures but have not gone yet. Prepare and send will ask you to draw them up again and sign before they go.",
            }
          : { tone: "calm", title: "The terms will carry these figures", body: "They have not been drawn up yet, so when they are, the new figures are the ones on them." };

  const primary = "rounded-full bg-accent-dark px-6 py-3 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";
  const ghost = "rounded-full border border-line/80 px-5 py-3 text-[13px] font-semibold transition-colors hover:border-ink/40";

  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-ink/50 p-3 backdrop-blur-sm sm:p-6" onClick={() => !saving && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change the fees"
        onClick={(e) => e.stopPropagation()}
        className="popout-in flex max-h-full w-full max-w-2xl flex-col overflow-hidden rounded-[28px] border border-line bg-page shadow-2xl"
      >
        <div className="flex items-start gap-4 border-b border-line/70 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">Change the fees · post-appraisal presentation</p>
            <h2 className="hand mt-1 text-[22px] leading-tight">{STEPS[step]}</h2>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="shrink-0 rounded-full border border-line/70 px-3 py-1.5 text-[11.5px] transition-colors hover:border-ink/30">
            Close
          </button>
        </div>

        <div className="flex gap-1.5 px-6 pt-3">
          {STEPS.map((s, i) => (
            <span key={s} className="h-1.5 flex-1 rounded-full transition-colors" style={{ background: i <= step ? "#56423e" : "rgba(86,66,62,0.15)" }} />
          ))}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {loaded === undefined && (
            <p className="flex items-center gap-2.5 py-10 text-[13px] text-muted">
              <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
              Reading the file…
            </p>
          )}
          {loaded === null && <p className="py-10 text-[13px] leading-relaxed text-accent-dark">{readError}</p>}

          {loaded && !loaded.deck && (
            <p className="py-6 text-[13px] leading-relaxed text-muted">
              There is no post-appraisal presentation on this file yet. Build it first - it carries whatever is on the file.
            </p>
          )}

          {loaded && loaded.deck && step === 0 && (
            <div className="space-y-5">
              <p className="text-[12.5px] leading-relaxed text-muted">
                Agreed something different with {landlord}? Change it here. The presentation they already have updates at the same link
                {loaded.rent ? `, and the rent stays at ${money(loaded.rent)} pcm` : ""}.
              </p>

              <div>
                <span className="mb-1.5 block text-[12.5px] font-semibold">Service</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {SERVICE_LEVELS.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setLevel(s.id)}
                      aria-pressed={level === s.id}
                      className={`rounded-xl border px-3.5 py-3 text-left text-[13.5px] transition-colors ${
                        level === s.id ? "border-accent-dark bg-accent-soft font-semibold" : "border-line/70 bg-white hover:border-ink/40"
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  name="Management fee, % of rent"
                  hint={
                    feeBad
                      ? <span className="text-accent-dark">A percentage between 0 and 100.</span>
                      : next.feePct != null
                        ? `Before VAT. The landlord sees ${Math.round(next.feePct * (1 + VAT) * 100) / 100}% including VAT.`
                        : level === "tenant_find"
                          ? "Tenant find has no management fee - leave it blank."
                          : "Before VAT. Blank if there isn't one."
                  }
                >
                  <input className={INPUT} inputMode="decimal" placeholder="12" value={fee} onChange={(e) => setFee(e.target.value)} />
                </Field>
                <Field
                  name="Set-up fee, £"
                  hint={
                    setupBad
                      ? <span className="text-accent-dark">Pounds, before VAT. 0 if there isn&apos;t one.</span>
                      : next.setupFee != null && next.setupFee > 0
                        ? `Before VAT. The landlord sees ${money(Math.round(next.setupFee * (1 + VAT)))} including VAT.`
                        : next.setupFee === 0
                          ? "No set-up fee. The presentation and the terms say None."
                          : "Before VAT. 0 if there isn't one; blank uses the standard fee."
                  }
                >
                  <input className={INPUT} inputMode="decimal" placeholder="750" value={setup} onChange={(e) => setSetup(e.target.value)} />
                </Field>
              </div>

              <Field name="Other fees agreed" hint="Anything on top, in plain words. It goes on the presentation and in the Additional Fees box on the terms. Blank is None.">
                <input className={INPUT} placeholder="For example: inventory £120 + VAT" value={other} maxLength={400} onChange={(e) => setOther(e.target.value)} />
              </Field>

              <Field name="Why it changed" hint="For the note on the lead. The landlord never sees this.">
                <textarea
                  className={`${INPUT} h-auto py-2.5`}
                  rows={2}
                  placeholder="For example: agreed 10% on the phone to keep the instruction"
                  value={reason}
                  maxLength={600}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
            </div>
          )}

          {loaded && loaded.deck && step === 1 && was && (
            <div className="space-y-5">
              <div className="overflow-hidden rounded-2xl border border-line/60 bg-white">
                <div className="grid grid-cols-[1fr_1fr_1fr] gap-3 border-b border-line/60 px-4 py-2.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">
                  <span />
                  <span>Before</span>
                  <span>Now</span>
                </div>
                {ROWS.map((r) => {
                  const changed = was[r.key] !== next[r.key];
                  return (
                    <div key={r.key} className={`grid grid-cols-[1fr_1fr_1fr] gap-3 px-4 py-3 text-[13px] ${changed ? "bg-accent-soft/60" : ""}`}>
                      <span className="text-muted">{r.name}</span>
                      <span className="text-muted" style={changed ? { textDecoration: "line-through", textDecorationColor: "rgba(0,0,0,0.3)" } : undefined}>{say[r.key](was[r.key] as never)}</span>
                      <span className={changed ? "font-semibold" : "text-muted"}>{say[r.key](next[r.key] as never)}</span>
                    </div>
                  );
                })}
              </div>
              {reason.trim() && <p className="text-[12px] leading-relaxed text-muted">Why: {reason.trim()}</p>}

              <p className="text-[12.5px] leading-relaxed text-muted">
                {landlord} opens the same link and sees the new figures, with &ldquo;Updated {day(new Date().toISOString())}&rdquo; on the figure page. The change is noted on the lead.
              </p>

              {warning && (
                <div
                  className={`rounded-2xl px-4 py-3.5 ${warning.tone === "calm" ? "border border-line/60 bg-white" : "border border-accent-dark/35 bg-accent-soft"}`}
                  role={warning.tone === "calm" ? undefined : "alert"}
                >
                  <p className={`text-[13.5px] font-semibold ${warning.tone === "calm" ? "" : "text-accent-dark"}`}>{warning.title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed">{warning.body}</p>
                </div>
              )}
            </div>
          )}

          {step === 2 && done && (
            <div className="space-y-4">
              <p className="text-[14px] font-semibold">
                {done.deckUpdated
                  ? `Saved. ${landlord}'s presentation now shows the new figures, marked Updated ${day(done.when)}.`
                  : "Saved on the file. The presentation has no figure page to update - Update presentation will add it."}
              </p>
              <p className="text-[12.5px] leading-relaxed text-muted">
                {done.noted ? "The change is noted on the lead." : "This file has no lead, so the change is kept on the file only."}
              </p>
              {warning && warning.tone !== "calm" && (
                <div className="rounded-2xl border border-accent-dark/35 bg-accent-soft px-4 py-3.5">
                  <p className="text-[13.5px] font-semibold text-accent-dark">{warning.title}</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed">{done.termsLine}</p>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-line/70 px-6 py-3.5">
          {step === 1 && (
            <button type="button" onClick={() => setStep(0)} disabled={saving} className={ghost}>
              ← Back
            </button>
          )}
          {error && <span className="text-[11.5px] leading-snug text-accent-dark">{error}</span>}
          {step === 1 && !error && moved.length > 0 && (
            <span className="hidden text-[11.5px] text-muted sm:inline">
              {moved.length} change{moved.length === 1 ? "" : "s"}
            </span>
          )}
          <span className="ml-auto" />
          {step === 0 && loaded?.deck && (
            <button
              type="button"
              onClick={() => setStep(1)}
              disabled={!level || feeBad || setupBad || moved.length === 0}
              className={primary}
              title={moved.length === 0 ? "Nothing has changed yet" : undefined}
            >
              {moved.length === 0 ? "Nothing changed yet" : "Check the changes"} <span aria-hidden>→</span>
            </button>
          )}
          {step === 1 && (
            <button type="button" onClick={() => void save()} disabled={saving} className={primary}>
              {saving ? "Saving…" : warning?.tone === "stop" ? "Save anyway" : "Save the new fees"}
            </button>
          )}
          {step === 2 && (
            <>
              {terms && !terms.signed && (terms.sentAt || terms.drawnUp) && (
                <Link href={`/market-appraisals/${appraisalId}/send`} className={ghost}>
                  Go to Prepare and send
                </Link>
              )}
              <button type="button" onClick={onClose} className={primary}>
                Done
              </button>
            </>
          )}
          {(loaded === null || (loaded && !loaded.deck)) && (
            <button type="button" onClick={onClose} className={primary}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
