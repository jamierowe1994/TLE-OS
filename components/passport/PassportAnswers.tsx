"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import PassportScene from "@/components/PassportScene";
import { PassportRulesContext } from "@/components/PassportBook";
import { EMPTY_PASSPORT, type PassportData } from "@/lib/passport-shape";
import { tenantDocLabel } from "@/lib/tenant-documents-kinds";
import { day, groups, type Answer } from "@/components/passport/answers";
import PassportStage from "@/components/passport/PassportStage";

/**
 * A TENANT'S PASSPORT, AS A LIST (James, 8 Oct 2026).
 *
 * "When the agent views the passport, give it in a nice list format: a
 * pop-out ... the ID at the top, showing the back and forth, and then just a
 * list of all their answers below, rather than having to go through the
 * process as if it's a passport already."
 *
 * The card at the top is the tenant's own passport card - drag it or tap it
 * to turn it over. Below, every answer in plain rows, grouped the way an
 * agent reads a file. Read only, from GET /api/tenant/passport/answers.
 */

export default function PassportAnswers({ email, name, home, onClose, look, onBook, onOpenFile }: {
  email: string | null;
  name?: string;
  /** The home on the agent's screen, when there is one: a Scottish home shows no nationality. */
  home?: string | null;
  onClose: () => void;
  /** The new look: the passport on the dark stage with next steps (components/passport/PassportStage). */
  look?: "new";
  /** Book them a viewing (the new look's next steps). */
  onBook?: () => void;
  /** Open their lead file (the new look's next steps). */
  onOpenFile?: () => void;
}) {
  const [a, setA] = useState<Answer | null>(null);

  useEffect(() => {
    if (!email) return;
    setA(null);
    let live = true;
    fetch(`/api/tenant/passport/answers?email=${encodeURIComponent(email)}${home ? `&home=${encodeURIComponent(home)}` : ""}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Answer) => live && setA(j))
      .catch(() => live && setA({ ok: false, error: "The passport didn't load. Try again." }));
    return () => {
      live = false;
    };
  }, [email, home]);

  useEffect(() => {
    if (!email || look === "new") return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [email, onClose, look]);

  if (!email) return null;
  const d: PassportData = { ...EMPTY_PASSPORT, ...(a?.data ?? {}) };
  if (look === "new") return <PassportStage a={a} d={d} email={email} name={name} home={home ?? null} onClose={onClose} onBook={onBook} onOpenFile={onOpenFile} />;

  return createPortal(
    <div className="fixed inset-0 z-[150]" data-steve-never>
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 cursor-default bg-ink/40" />
      <aside className="fade-up absolute inset-y-0 right-0 flex w-full max-w-[520px] flex-col overflow-hidden bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] sm:rounded-l-[22px]">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-4">
          <div className="min-w-0">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Tenant passport</p>
            <h2 className="mt-0.5 truncate text-[19px] leading-tight">{a?.name || name || email}</h2>
            <p className="mt-0.5 text-[12px]">
              {a?.ok ? (
                a.submittedAt ? (
                  <span className="font-semibold text-accent-dark">Passport done · {day(a.submittedAt)}</span>
                ) : (
                  <span className="text-muted">Not finished yet{a.updatedAt ? ` · last touched ${day(a.updatedAt)}` : ""}</span>
                )
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line/80 text-[12px] text-muted transition-colors hover:text-ink"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {a === null ? (
            <p className="flex items-center gap-2 text-[12.5px] text-muted">
              <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
              Opening their passport…
            </p>
          ) : !a.ok ? (
            <p className="rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12.5px] text-[#9d4340]">{a.error ?? "The passport didn't load."}</p>
          ) : (
            <>
              {/* What they sent in from their tenant area (23 Oct 2026): first,
                  because a file arriving is a thing to act on. Their ID,
                  references and payslips reached nobody's screen before. */}
              {a.documents?.length ? (
                <section className="mb-5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">Sent in by them</p>
                  <ul className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
                    {a.documents.map((f) => (
                      <li key={f.id} className="flex items-center justify-between gap-3 border-b border-line/40 px-4 py-2.5 last:border-b-0">
                        <span className="min-w-0">
                          <span className="block truncate text-[13px] font-semibold">{f.name}</span>
                          <span className="block text-[12px] text-muted">{tenantDocLabel(f.kind)} · {day(f.uploadedAt)}</span>
                        </span>
                        <a
                          href={`/api/r2/file?key=${encodeURIComponent(f.r2Key)}`}
                          target="_blank"
                          rel="noreferrer"
                          className="shrink-0 rounded-full border border-line/80 px-3 py-1.5 text-[11.5px] font-semibold transition-colors hover:border-ink"
                        >
                          Open
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {/* The card, front and back: drag it or tap it to turn it over. */}
              <div className="h-[300px]">
                <PassportRulesContext.Provider value={a.rules ?? {}}>
                  <PassportScene data={d} focus={null} side="front" />
                </PassportRulesContext.Provider>
              </div>
              <p className="-mt-1 text-center text-[11px] text-muted">Drag or tap the card to see the back.</p>

              {groups(d, a.householdIncome ?? null, a.rules ?? {}).map((g) => (
                <section key={g.title} className="mt-5">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{g.title}</p>
                  <dl className="mt-2 overflow-hidden rounded-2xl border border-line/60 bg-white">
                    {g.rows.map(([label, value], i) => (
                      <div key={`${i}-${label}`} className="grid grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] gap-3 border-b border-line/40 px-4 py-2.5 last:border-b-0">
                        <dt className="text-[12.5px] text-muted">{label}</dt>
                        <dd className={`min-w-0 break-words text-[13px] ${value ? "font-semibold" : "text-muted/70"}`}>{value ?? "Not answered"}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </>
          )}
        </div>
      </aside>
    </div>,
    document.body
  );
}
