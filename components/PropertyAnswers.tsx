"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import { PROPERTY_QUESTIONS, progress, type Answers } from "@/lib/property-questions";

/**
 * WHAT THE LANDLORD TOLD US, on the agent's side of the glass.
 *
 * They answer seven screens after signing (components/landlord/PropertyQuestions)
 * and until now nobody at The Letting Experts had a screen that showed it. This
 * is that screen, and it is the same panel on the property file and on the
 * landlord's - one place to change the wording, one shape to learn.
 *
 * ── It only appears when there is something to show ───────────────────────
 *
 * No answers, no panel. A permanently empty "What they told us" card teaches
 * agents to stop looking at it, and the day it does have a stopcock in it they
 * will not look either.
 *
 * ── Read only, on purpose ─────────────────────────────────────────────────
 *
 * These are the landlord's own words about their own property. An agent typing
 * over them would be putting their guess in the landlord's mouth, and the one
 * thing this panel is for is being able to say "they told us" and mean it.
 */

export interface AnsweredProperty {
  appraisalId: string;
  landlord: string;
  address: string;
  propertyId: string | null;
  answers: Answers;
  updatedAt: string | null;
}

const labelFor = (questionId: string, value: Answers[string]): string | null => {
  if (value == null) return null;
  const v = Array.isArray(value) ? value.join(", ") : String(value);
  if (!v.trim()) return null;
  for (const step of PROPERTY_QUESTIONS) {
    const q = step.questions.find((x) => x.id === questionId);
    if (!q) continue;
    if (q.kind !== "choice") return v;
    return q.options?.find((o) => o.id === v)?.label ?? v;
  }
  return v;
};

const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }) : null;

export default function PropertyAnswers({
  appraisalId,
  propertyId,
  address,
  /** Several homes at once - the landlord's file passes their whole book. */
  propertyIds,
  title = "What the landlord told us",
  showAddress = false,
}: {
  appraisalId?: string | null;
  propertyId?: string | null;
  address?: string | null;
  propertyIds?: string[];
  title?: string;
  /** On a landlord's file one panel covers several homes, so each needs naming. */
  showAddress?: boolean;
}) {
  const [rows, setRows] = useState<AnsweredProperty[] | null>(null);

  useEffect(() => {
    /* Everything we were told, together - see the route. A home known by its
       property on one screen and by its address on another is the same home. */
    const ids = propertyIds?.length ? propertyIds.join(",") : propertyId ?? "";
    const parts = [
      appraisalId ? `appraisalId=${encodeURIComponent(appraisalId)}` : "",
      ids ? `propertyId=${encodeURIComponent(ids)}` : "",
      address ? `address=${encodeURIComponent(address)}` : "",
    ].filter(Boolean);
    if (!parts.length) return setRows([]);
    const qs = parts.join("&");
    let gone = false;
    void (async () => {
      try {
        const r = await fetch(`/api/property-answers?${qs}`, { cache: "no-store" });
        const j = (await r.json()) as { properties?: AnsweredProperty[] };
        if (!gone) setRows(j.properties ?? []);
      } catch {
        if (!gone) setRows([]);
      }
    })();
    return () => {
      gone = true;
    };
    /* propertyIds is an array literal at most call sites, so it is joined
       rather than depended on by identity - otherwise this refetches forever. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appraisalId, propertyId, address, (propertyIds ?? []).join(",")]);

  /* Nothing to show and nothing to apologise for. */
  if (!rows || rows.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line/70 bg-card p-5" data-search>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="flex items-center gap-2 text-[14px]">
          <DoodleIcon name="key" size={14} className="text-accent-dark" />
          {title}
        </h3>
        <p className="text-[11px] text-muted">In their own words, from the questions after signing.</p>
      </div>

      <div className="mt-4 space-y-6">
        {rows.map((row) => {
          const p = progress(row.answers);
          return (
            <div key={row.appraisalId}>
              {showAddress && (
                <p className="mb-2 text-[12.5px] font-semibold">
                  {row.address}
                  <span className="ml-2 text-[11px] font-normal text-muted">
                    {p.done} of {p.of} sections{row.updatedAt ? ` · last changed ${day(row.updatedAt)}` : ""}
                  </span>
                </p>
              )}
              {!showAddress && (
                <p className="mb-2 text-[11px] text-muted">
                  {p.done} of {p.of} sections answered{row.updatedAt ? ` · last changed ${day(row.updatedAt)}` : ""}
                </p>
              )}

              <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                {PROPERTY_QUESTIONS.map((step) => {
                  const said = step.questions
                    .map((q) => [q.label, labelFor(q.id, row.answers[q.id])] as const)
                    .filter((pair): pair is readonly [string, string] => Boolean(pair[1]));
                  if (!said.length) return null;
                  return (
                    <div key={step.id}>
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-muted">{step.title}</p>
                      <dl className="mt-1.5 space-y-1">
                        {said.map(([label, value]) => (
                          <div key={label} className="text-[12px] leading-snug">
                            <dt className="text-muted">{label}</dt>
                            <dd className="font-medium">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
