"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Passport from "@/components/passport-book/Passport";
import { percent, stepOk, stepsFor, type Ctx } from "@/components/passport-book/model";
import { WhatsAppButton } from "@/components/WhatsAppQr";
import EmailPerson from "@/components/EmailPerson";
import { Ico } from "@/components/new-look/Parts";
import { groups, day, type Answer } from "@/components/passport/answers";
import { tenantDocLabel } from "@/lib/tenant-documents-kinds";
import type { PassportData } from "@/lib/passport-shape";

/**
 * A tenant's passport in the new look (James, 25 Oct 2026): "their actual
 * passport visual that they've filled out on the left-hand side, and then on
 * the right-hand side all the information that they've filled out, with
 * actionable steps." The same floating stage as the landlord and the portals.
 *
 * Left: the passport as the tenant now sees it (components/passport-book),
 * stamped for every step they finished, with the next steps under it - book a
 * viewing, email, WhatsApp, call, open their file. Right: every answer in
 * boxes that sit side by side, so it all reads from one screen. Read only;
 * PassportAnswers fetches it.
 */

const beat = (i: number) => ({ animationDelay: `${120 + i * 70}ms` });
const UI = { howlong: "", rtrPick: "", petPick: "" };

export default function PassportStage({
  a,
  d,
  email,
  name,
  home,
  onClose,
  onBook,
  onOpenFile,
}: {
  a: Answer | null;
  d: PassportData;
  email: string;
  name?: string;
  home: string | null;
  onClose: () => void;
  onBook?: () => void;
  onOpenFile?: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [said, setSaid] = useState<string | null>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // The email window or the WhatsApp sheet open over it close first.
      if (document.querySelector(".z-\\[150\\], [data-wa-sheet]")) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    const was = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = was;
    };
  }, [onClose]);

  const rules = useMemo(() => a?.rules ?? {}, [a?.rules]);
  const steps = useMemo(() => stepsFor(rules), [rules]);
  const done = Boolean(a?.ok && a.submittedAt);
  const ctx: Ctx = { d, rules, questions: [], answers: {}, ui: UI };
  const stamped = steps.map((s, i) => (i > 0 && (done || stepOk(s.id, ctx)) ? i : -1)).filter((i) => i > 0);
  const pct = done ? 100 : percent(steps, ctx);

  const who = a?.name || name || d.legalName || email;
  const first = (d.knownAs.trim() || who).split(/\s+/)[0] || who;
  const phone = d.mobile.trim();
  const mail = (d.email.trim() || email).trim();

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-look="new" className="nl-po nl-pp" data-shown={shown} role="dialog" aria-modal="true" aria-label={`${who}'s tenant passport`} data-steve-never>
      <button type="button" className="nl-po-scrim" aria-label="Close" onClick={onClose} />
      <div className="nl-po-card nl-pp-card">
        <div className="nl-po-head nl-po-in" style={{ animationDelay: "40ms" }}>
          <div className="min-w-0 flex-1">
            <p className="nl-eyebrow">Tenant passport{home ? ` · ${home}` : ""}</p>
            <h2 className="nl-po-title">{who}</h2>
            {a?.ok && (
              <p className={`nl-pp-state${done ? " is-done" : ""}`}>
                <i aria-hidden />
                {done ? `Passport done · ${day(a.submittedAt!)}` : `Not finished yet${a.updatedAt ? ` · last touched ${day(a.updatedAt)}` : ""}`}
              </p>
            )}
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {a === null ? (
          <p className="nl-po-wait">
            <span className="nl-po-spin" aria-hidden />
            Opening their passport…
          </p>
        ) : !a.ok ? (
          <p className="nl-pp-bad nl-po-in">{a.error ?? "The passport didn't load."}</p>
        ) : (
          <div className="nl-pp-grid">
            <aside className="nl-pp-left">
              <div className="nl-pp-pass nl-po-in" style={beat(1)}>
                <div className="tpx tpx-agent">
                  <Passport d={d} pct={pct} steps={steps} stamped={stamped} cleared={done} fresh={null} home={home} />
                </div>
                <p className="nl-pp-hint">Tap the passport to turn it over.</p>
              </div>

              <div className="nl-pp-acts nl-po-in" style={beat(2)} role="group" aria-label="Next steps">
                {onBook && (
                  <button type="button" className="nl-pp-act is-go" onClick={onBook}>
                    <Ico name="calendar" size={16} />
                    Book a viewing
                  </button>
                )}
                {mail && (
                  <EmailPerson email={mail} name={who} role="tenant" address={home} className="nl-pp-act" onSent={(subject) => setSaid(`Sent to ${mail}${subject ? `: ${subject}` : ""}.`)}>
                    <Ico name="mail" size={16} />
                    Email {first}
                  </EmailPerson>
                )}
                {phone && (
                  <WhatsAppButton phone={phone} name={who} className="nl-pp-act">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M4 20l1.3-3.9A8 8 0 1 1 8 18.7z" />
                    </svg>
                    WhatsApp
                  </WhatsAppButton>
                )}
                {phone && (
                  <a className="nl-pp-act" href={`tel:${phone.replace(/\s+/g, "")}`}>
                    <Ico name="phone" size={16} />
                    Call {phone}
                  </a>
                )}
                {onOpenFile && (
                  <button type="button" className="nl-pp-act is-quiet" onClick={onOpenFile}>
                    <Ico name="arrow" size={16} />
                    Open their file
                  </button>
                )}
                {said && <p className="nl-pp-said">{said}</p>}
              </div>
            </aside>

            <div className="nl-pp-answers">
              {a.documents?.length ? (
                <section className="nl-pp-box is-wide nl-po-in" style={beat(3)}>
                  <h3>Sent in by them</h3>
                  <ul className="nl-pp-docs">
                    {a.documents.map((f) => (
                      <li key={f.id}>
                        <span className="min-w-0">
                          <b>{f.name}</b>
                          <span>{tenantDocLabel(f.kind)} · {day(f.uploadedAt)}</span>
                        </span>
                        <a href={`/api/r2/file?key=${encodeURIComponent(f.r2Key)}`} target="_blank" rel="noreferrer" className="nl-pp-open">
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
              {groups(d, a.householdIncome ?? null, rules, a.custom ?? []).map((g, i) => (
                <section key={g.title} className="nl-pp-box nl-po-in" style={beat(4 + i)}>
                  <h3>{g.title}</h3>
                  <dl>
                    {g.rows.map(([label, value], k) => (
                      <div key={`${k}-${label}`} className={value ? undefined : "is-none"}>
                        <dt>{label}</dt>
                        <dd>{value ?? "Not answered"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
