"use client";

import { useEffect, useState } from "react";
import { Badge, Ico, Tabs } from "@/components/new-look/Parts";

/**
 * UNDER SIGNED TERMS: TWO TABS (James, 11 Nov 2026).
 *
 * "When we click on the signed Terms of Business and it says Copy on file, it
 * has another part there... so there are two tabs: Questionnaire, Terms of
 * Business." Rhiannon Dodge could open the signed contract on Flat 6 Grand
 * Banks and see nothing else the landlord had given.
 *
 *   Terms of Business   who signed and when, and the signed copy
 *   Questionnaire       each landlord's details, the bank account (last four;
 *                       the whole number is on the signed contract), and every
 *                       answer about the home, with Download to keep the lot
 *
 * A contract on a wording that never asked for bank details or the questions
 * says so, in a sentence, rather than showing nothing.
 *
 * It finds the home's signed terms itself when it isn't handed them, so the
 * listing's own signed banner can carry it too. It draws nothing for a home
 * whose terms were not signed through the OS: there is nothing behind those.
 */

type Party = { key: string; name: string; email: string; signedAt: string | null };
export type SignedTerms = { id: string; status: string; completedAt: string | null; signedR2Key: string | null; parties: Party[] };

type Row = { label: string; value: string; by?: "landlord" | "agent"; at?: string };
type View = {
  wording: string;
  asksQuestions: boolean;
  asksBank: boolean;
  people: Array<{ key: string; name: string; signedAt: string | null; details: Row[]; bank: Row[] }>;
  home: Array<{ title: string; rows: Row[] }>;
};

const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "");

function Rows({ rows }: { rows: Row[] }) {
  return (
    <dl className="nl-tq-rows">
      {rows.map((r) => (
        <div key={r.label}>
          <dt>{r.label}</dt>
          <dd>
            {r.value}
            {r.by ? <small>{r.by === "landlord" ? "From the landlord" : "From the agent"}{r.at ? `, ${day(r.at)}` : ""}</small> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function SignedTermsTabs({
  terms,
  listingId = null,
  propertyId = null,
  appraisalId = null,
}: {
  /** The signed terms, when the caller already holds them; left out, the home's are read. */
  terms?: SignedTerms | null;
  listingId?: string | null;
  propertyId?: string | null;
  appraisalId?: string | null;
}) {
  const [found, setFound] = useState<SignedTerms | null>(null);
  const [tab, setTab] = useState<"terms" | "questions">("terms");
  const [view, setView] = useState<View | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (terms !== undefined) return;
    if (!listingId && !propertyId && !appraisalId) return;
    const qs = new URLSearchParams();
    if (listingId) qs.set("listingId", listingId);
    if (propertyId) qs.set("propertyId", propertyId);
    if (appraisalId) qs.set("appraisalId", appraisalId);
    let gone = false;
    fetch(`/api/terms?${qs}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; terms?: SignedTerms[] }) => {
        if (!gone) setFound((j?.terms ?? []).find((t) => t.status === "signed") ?? null);
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [terms, listingId, propertyId, appraisalId]);

  const t = terms !== undefined ? terms : found;
  const id = t?.status === "signed" ? t.id : null;

  /* Read the first time the tab is opened, and again for a different contract. */
  useEffect(() => {
    setView(null);
    setProblem(null);
  }, [id]);
  useEffect(() => {
    if (!id || tab !== "questions" || view) return;
    let gone = false;
    fetch(`/api/terms/${id}/answers`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; view?: View; error?: string }) => {
        if (gone) return;
        if (j?.ok && j.view) setView(j.view);
        else setProblem(j?.error ?? "The answers couldn't be read just now. Try again in a moment.");
      })
      .catch(() => {
        if (!gone) setProblem("The answers couldn't be read just now. Try again in a moment.");
      });
    return () => {
      gone = true;
    };
  }, [id, tab, view]);

  if (!t || !id) return null;

  const notAsked = view
    ? !view.asksBank && !view.asksQuestions
      ? `These terms went out on the ${view.wording} wording, which asks each landlord for their name, contact details and home address only. It did not ask for bank details or the questions about the home, so none were given.`
      : !view.asksBank
        ? `The ${view.wording} wording did not ask for bank details, so none were given.`
        : !view.asksQuestions
          ? `The ${view.wording} wording did not ask the questions about the home before signing.`
          : null
    : null;

  return (
    <section data-look="new" className="nl-tq" aria-label="Signed Terms of Business">
      <Tabs
        label="Signed Terms of Business"
        value={tab}
        onChange={setTab}
        items={[
          { id: "terms", label: "Terms of Business" },
          { id: "questions", label: "Questionnaire" },
        ]}
      />

      {tab === "terms" ? (
        <div className="nl-tq-pane">
          <ul className="nl-terms-people">
            {t.parties.map((p) => (
              <li key={p.key}>
                <span className="nl-strong">{p.name}</span>
                <span className="nl-meta">{p.email}</span>
                <Badge tone="good">Signed {day(p.signedAt ?? t.completedAt)}</Badge>
              </li>
            ))}
          </ul>
          <div className="nl-tq-acts">
            {t.signedR2Key ? (
              <a className="nl-btn nl-btn--secondary nl-btn--sm" href={`/api/terms/${t.id}/document`} target="_blank" rel="noreferrer" data-label="Terms of Business (signed)">
                View the signed copy
              </a>
            ) : (
              <span className="nl-meta">The signed copy is still being filed.</span>
            )}
          </div>
        </div>
      ) : (
        <div className="nl-tq-pane">
          {problem ? (
            <p className="nl-meta nl-tq-bad" role="alert">{problem}</p>
          ) : !view ? (
            <p className="nl-meta nl-tq-wait" role="status">
              <span className="nl-tq-spin" aria-hidden />
              Reading what they gave…
            </p>
          ) : (
            <>
              {notAsked && (
                <p className="nl-tq-note">
                  <Ico name="lock" size={15} />
                  <span>{notAsked}</span>
                </p>
              )}

              <div className="nl-tq-grid">
                {view.people.map((p, i) => (
                  <div key={p.key} className="nl-tq-block">
                    <h4 className="nl-tq-title">{view.people.length > 1 ? `Landlord ${i + 1}: ${p.name}` : "Landlord Details"}</h4>
                    {p.details.length ? <Rows rows={p.details} /> : <p className="nl-meta">Nothing was asked of them.</p>}
                  </div>
                ))}

                {view.people.some((p) => p.bank.length) && (
                  <div className="nl-tq-block">
                    <h4 className="nl-tq-title">Bank Details</h4>
                    {view.people.filter((p) => p.bank.length).map((p) => (
                      <Rows key={p.key} rows={p.bank} />
                    ))}
                    <p className="nl-meta">The full account number is on the signed contract.</p>
                  </div>
                )}

                {view.home.map((s) => (
                  <div key={s.title} className="nl-tq-block">
                    <h4 className="nl-tq-title">{s.title}</h4>
                    <Rows rows={s.rows} />
                  </div>
                ))}
              </div>

              {view.asksQuestions && !view.home.length && <p className="nl-meta">No answers about the home are on file yet.</p>}

              <div className="nl-tq-acts">
                <a className="nl-btn nl-btn--secondary nl-btn--sm" href={`/api/terms/${t.id}/answers?file=1`} download>
                  <Ico name="download" size={14} /> Download
                </a>
                <span className="nl-meta">One document: who signed and when, these details, and the signed contract. A copy is kept on the home&apos;s Documents.</span>
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
