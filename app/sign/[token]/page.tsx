"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ContractView from "@/components/terms/ContractView";
import TermsSignSheet from "@/components/terms/TermsSignSheet";
import SteveFace from "@/components/SteveFace";
import type { DetailField, LandlordDetails, TermsDoc, TermsValues } from "@/lib/terms/types";

/**
 * A landlord's own link to their Terms of Business (lib/terms, 23 Oct 2026).
 *
 * James: "When the landlord goes to sign it, they click the button, and it
 * opens out in front of them... If they haven't put in the information yet,
 * we should ask them before they try to sign the contract."
 *
 * So: the contract written out to read, a bar at the foot to sign from, the
 * details we don't have asked in short steps (you, your registration, and your
 * bank where the edition prints it), then DocuSeal's signature rising over the page. No account; the
 * link is theirs alone.
 */

type View = {
  ok: true;
  doc: TermsDoc;
  values: TermsValues;
  status: "agent" | "sent" | "signed" | "cancelled";
  agentSigned: boolean;
  completedAt: string | null;
  hasCopy: boolean;
  me: { key: string; name: string; details: Partial<LandlordDetails>; signedAt: string | null };
  people: Array<{ key: string; name: string; signed: boolean; you: boolean }>;
  preview: boolean;
};

const STEPS: Array<{ id: DetailField["step"]; title: string; blurb: string }> = [
  { id: "you", title: "About You", blurb: "So the contract is in your name and we can reach you." },
  { id: "registration", title: "Your Landlord Registration", blurb: "Every landlord in Scotland registers with their council. It goes on the adverts and the tenancy." },
  { id: "bank", title: "Where Your Rent Goes", blurb: "The account we pay your rent into, less our fees. Only The Letting Experts sees it." },
];

const okFor = (f: DetailField, v: string) => {
  const t = v.trim();
  if (!t) return !f.required;
  if (f.kind === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
  if (f.kind === "sortcode") return /^\d{2}-?\d{2}-?\d{2}$/.test(t.replace(/\s/g, ""));
  if (f.kind === "account") return /^\d{6,10}$/.test(t.replace(/\s/g, ""));
  return true;
};

export default function SignPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [details, setDetails] = useState<Partial<LandlordDetails>>({});
  const [asking, setAsking] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [askErr, setAskErr] = useState<string | null>(null);
  const [signSrc, setSignSrc] = useState<string | null>(null);
  const [done, setDone] = useState<{ all: boolean } | null>(null);

  const load = useCallback(async () => {
    const j = await fetch(`/api/sign/${encodeURIComponent(token)}`, { cache: "no-store" }).then((r) => r.json()).catch(() => null);
    if (!j?.ok) return setProblem(j?.error ?? "This link didn't open. Try again in a moment.");
    setView(j);
    setDetails(j.me.details ?? {});
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  const fields = view?.doc.details ?? [];
  /* Only the steps this edition asks anything in: October 2026 has no bank step. */
  const steps = STEPS.filter((s) => fields.some((f) => f.step === s.id));
  const missing = useMemo(() => fields.filter((f) => !okFor(f, String(details[f.key] ?? ""))), [fields, details]);
  const stepFields = (i: number) => fields.filter((f) => f.step === steps[i].id);

  async function startSigning() {
    if (missing.length) {
      setAskErr(null);
      setAsking(Math.max(0, steps.findIndex((s) => missing.some((f) => f.step === s.id))));
      return;
    }
    await saveAndSign();
  }

  async function saveAndSign() {
    setSaving(true);
    setAskErr(null);
    const j = await fetch(`/api/sign/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "details", details }) })
      .then((r) => r.json())
      .catch(() => null);
    setSaving(false);
    if (!j?.ok) return setAskErr(j?.error ?? "That didn't save. Try again in a moment.");
    setAsking(null);
    setSignSrc(j.embedSrc);
  }

  async function signed(name?: string): Promise<string | null> {
    const j = await fetch(`/api/sign/${encodeURIComponent(token)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "signed", name }) })
      .then((r) => r.json())
      .catch(() => null);
    if (!j?.ok) return j?.error ?? "Your signature didn't reach us. Try again in a moment.";
    setSignSrc(null);
    setDone({ all: Boolean(j.done) });
    window.scrollTo({ top: 0, behavior: "smooth" });
    await load();
    return null;
  }

  if (problem) return <Frame><div className="nl-sign-hero"><h1 className="nl-title">This Link Didn&apos;t Open</h1><p className="nl-blurb">{problem}</p></div></Frame>;
  if (!view) return <Frame><p className="nl-meta flex items-center gap-2 py-24"><span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--ink)]" aria-hidden />Opening your terms…</p></Frame>;

  const { doc, values } = view;
  const others = view.people.filter((p) => !p.you);
  const youSigned = Boolean(view.me.signedAt);
  const waitingOn = others.filter((p) => !p.signed);

  return (
    <Frame agent={values.agentName}>
      <header className="nl-sign-hero">
        <span className="nl-eyebrow">Terms of Business · {doc.subtitle}</span>
        <h1 className="nl-title">{doc.title}</h1>
        <p className="nl-blurb">
          For <strong className="text-[var(--ink)]">{values.propertyAddress}</strong>.{" "}
          {view.status === "cancelled"
            ? "These terms were withdrawn. Your agent will send you a fresh set."
            : !view.agentSigned
              ? `${values.agentName} is still preparing these. You'll get an email when they're ready.`
              : youSigned
                ? "Your signed terms are below to read again whenever you like."
                : `${values.agentName} has signed for The Letting Experts. Read them through, then sign from the bar at the foot.`}
        </p>
        {(done || youSigned) && (
          <div className="nl-sign-done">
            <SteveFace size={34} mood="happy" />
            <div>
              <b>{view.status === "signed" ? "All signed." : "Signed. Thank you."}</b>
              <p className="nl-meta">
                {view.status === "signed"
                  ? view.hasCopy
                    ? "Everyone has signed, so we're ready to get started. Download your copy here; it's in your inbox too."
                    : "Everyone has signed, so we're ready to get started. Your copy is on its way by email."
                  : waitingOn.length
                    ? `We're waiting for ${waitingOn.map((p) => p.name).join(" and ")} to sign. You'll get your copy by email as soon as they have.`
                    : "Your copy is on its way by email."}
              </p>
              {view.status === "signed" && view.hasCopy && (
                <a className="nl-btn nl-btn--secondary nl-btn--sm mt-2" href={`/api/sign/${encodeURIComponent(token)}/document`}>Download your signed copy</a>
              )}
            </div>
          </div>
        )}
      </header>

      <div className="nl-sign-layout">
        <nav className="nl-sign-toc" aria-label="Contents">
          <span className="nl-eyebrow">Contents</span>
          {doc.sections.map((s) => (
            <a key={`${s.n ?? ""}${s.title}`} href={`#clause-${s.n ?? s.title.toLowerCase().replace(/\W+/g, "-")}`}>{s.n ? `${s.n}. ` : ""}{s.title}</a>
          ))}
        </nav>
        <ContractView doc={doc} values={values} people={view.people} reader={{ key: view.me.key, details }} />
      </div>

      {view.status !== "cancelled" && view.agentSigned && !youSigned && !done && asking === null && !signSrc && (
        <div className="nl-sign-bar">
          <span className="min-w-0 flex-1">
            <b>Ready to sign?</b>
            <span className="nl-meta block">{missing.length ? "A few details first, then your signature. About two minutes." : "About a minute."}</span>
          </span>
          <button type="button" className="nl-btn nl-btn--primary" onClick={() => void startSigning()} disabled={saving}>
            {saving ? "Getting it ready…" : "Sign the terms"}
          </button>
        </div>
      )}

      {asking !== null && (
        <div data-look="new" className="nl-drawer-wrap" role="dialog" aria-modal="true" aria-label="Before you sign">
          <button type="button" className="nl-drawer-scrim" aria-label="Close" onClick={() => !saving && setAsking(null)} />
          <div className="nl-drawer">
            <div className="nl-drawer-head">
              <div className="min-w-0 flex-1">
                <span className="nl-eyebrow">Before you sign · {asking + 1} of {steps.length}</span>
                <h2 className="nl-drawer-title mt-1">{steps[asking].title}</h2>
                <p className="nl-meta mt-1">{steps[asking].blurb}</p>
              </div>
            </div>
            <div key={asking} className="nl-drawer-body nl-step-slide">
              {stepFields(asking).map((f) => {
                const v = String(details[f.key] ?? "");
                const bad = v.trim() !== "" && !okFor(f, v);
                return (
                  <label key={f.key} className="nl-field">
                    <span>{f.label}{f.required ? "" : " (optional)"}</span>
                    <input
                      type={f.kind === "email" ? "email" : f.kind === "tel" ? "tel" : f.kind === "date" ? "date" : "text"}
                      inputMode={f.kind === "sortcode" || f.kind === "account" ? "numeric" : undefined}
                      value={v}
                      onChange={(e) => setDetails((d) => ({ ...d, [f.key]: e.target.value }))}
                      autoComplete={f.key === "email" ? "email" : f.key === "phone" ? "tel" : f.key === "name" ? "name" : f.key === "address" ? "street-address" : "off"}
                    />
                    {bad ? <small className="is-bad">{f.kind === "sortcode" ? "Six numbers, like 12-34-56." : f.kind === "account" ? "Your account number is usually eight numbers." : "That doesn't look right."}</small> : f.hint ? <small>{f.hint}</small> : null}
                  </label>
                );
              })}
              {askErr && <p className="nl-meta text-[var(--accent-dark)]">{askErr}</p>}
            </div>
            <div className="nl-drawer-foot">
              <button type="button" className="nl-btn nl-btn--quiet" disabled={saving} onClick={() => (asking === 0 ? setAsking(null) : setAsking(asking - 1))}>
                {asking === 0 ? "Not now" : "Back"}
              </button>
              {asking < steps.length - 1 ? (
                <button type="button" className="nl-btn nl-btn--primary" disabled={stepFields(asking).some((f) => !okFor(f, String(details[f.key] ?? "")))} onClick={() => setAsking(asking + 1)}>
                  Next
                </button>
              ) : (
                <button type="button" className="nl-btn nl-btn--primary" disabled={saving || missing.length > 0} onClick={() => void saveAndSign()}>
                  {saving ? "Saving…" : "Save and sign"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {signSrc && <TermsSignSheet src={signSrc} email={details.email ?? null} who="Sign your terms" onSigned={signed} onClose={() => setSignSrc(null)} />}
    </Frame>
  );
}

function Frame({ children, agent }: { children: React.ReactNode; agent?: string }) {
  return (
    <div data-look="new" className="nl-sign">
      <div className="nl-sign-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/tle-logo-coral.png" alt="The Letting Experts" className="h-7 w-auto" />
        {agent && <span className="nl-meta">Prepared by {agent}</span>}
      </div>
      <main className="nl-sign-main">{children}</main>
    </div>
  );
}
