"use client";

import { useEffect, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";

/**
 * An application, opened out.
 *
 * It replaces the narrow column that used to sit beside the table. A pre-tenancy
 * deal is the most crowded record in the business — eight stages, nine ticks,
 * a chain of chasing, and the reason it has stalled is usually in the comments
 * rather than the fields. A third of the screen could not hold that, so this
 * takes the same full pop-out the viewings and leads already use.
 *
 * Laid out around the question Kirstie actually asks, which is never "what are
 * this deal's attributes" but "what is holding it up and who touched it last":
 *   left   — where it is, and the one thing to do next
 *   right  — activity and comments, the running account of the deal
 *
 * Comments are the staple. This is the surface that has to join up to the
 * back office, so the composer is real and the thread is ordered newest-last,
 * the way a conversation reads rather than the way a log prints.
 */

export interface AppActivity {
  when: string;
  what: string;
  by: string;
  /** A typed note from a person, rather than something the system did. */
  note?: boolean;
}

export interface AppRecord {
  id: string;
  tenant: string;
  property: string;
  locality: string;
  image: string | null;
  rent: string;
  moveIn: string;
  stageKey: string;
  ticked: number;
  agent: string;
  flag?: string;
  activity?: AppActivity[];
}

export interface Stage {
  key: string;
  label: string;
  blurb: string;
}

/**
 * A checklist item carries its own state.
 *
 * It used to be a bare string plus a count, which only works when the items
 * are done in order. The four checks on an application — right to rent,
 * landlord reference, guarantor, credit — are answered independently, and a
 * count of three would have silently ticked the wrong three.
 */
export interface Check {
  label: string;
  done: boolean;
  /** Why it isn't ticked, when that's worth saying. */
  note?: string;
}

/**
 * What the application is waiting on — the answer to "do I need to act?"
 *
 * Keyed on REX's OWN application statuses, because that is the record this
 * drawer opens. The eight pre-tenancy stages (holding fee, referencing, PLC,
 * deposit, move day) belong to the Propoly deal that gets created once an
 * application is accepted — a different record, not joined in yet.
 */
const NEXT_ACTION: Record<string, { do: string; who: string }> = {
  received: { do: "Put it to the landlord — offer, income, and anything they've disclosed.", who: "Us" },
  communicated: { do: "The landlord has it. Chase for a decision if it's been more than a day.", who: "Landlord" },
  accepted: { do: "Take the holding deposit and open the deal. Let the other applicants know.", who: "Us" },
  unsuccessful: { do: "Nothing outstanding. Tell them why if they haven't been told.", who: "—" },
};

export default function ApplicationDrawer({
  app,
  stages,
  checklist,
  aside,
  onClose,
}: {
  app: AppRecord;
  stages: Stage[];
  checklist: Check[];
  /** Anything the stage itself calls for — the handover packet, once accepted. */
  aside?: React.ReactNode;
  onClose: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [draft, setDraft] = useState("");
  const [added, setAdded] = useState<AppActivity[]>([]);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const cur = stages.findIndex((s) => s.key === app.stageKey);
  const action = NEXT_ACTION[app.stageKey];
  const thread = [...(app.activity ?? []), ...added];
  const ticked = checklist.filter((c) => c.done).length;
  const outstanding = checklist.length - ticked;

  function post() {
    const text = draft.trim();
    if (!text) return;
    setAdded((a) => [...a, { when: "just now", what: text, by: "You", note: true }]);
    setDraft("");
  }

  return (
    <div className="fixed inset-0 z-[130]">
      <button
        aria-label="Close"
        onClick={onClose}
        className={`absolute inset-0 cursor-default bg-ink/35 transition-opacity duration-300 ${
          shown ? "opacity-100" : "opacity-0"
        }`}
      />
      <aside
        role="dialog"
        aria-label={`Application — ${app.tenant}`}
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[76%] xl:w-[68%] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        {/* ── who and what ── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line/70 px-6 py-5">
          <div className="flex min-w-0 items-start gap-3.5">
            <PropertyPhoto src={app.image} className="h-14 w-16 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">
                Application — stage {cur + 1} of {stages.length}
              </p>
              <p className="hand mt-1 truncate text-[20px] leading-tight">{app.tenant}</p>
              <p className="mt-1 truncate text-[12px] text-muted">
                {app.property} · {app.locality}
              </p>
              <p className="truncate text-[12px] text-muted">
                {app.rent} · moves {app.moveIn} · with {app.agent}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2.5">
            {app.flag && <Pill tone="accent">{app.flag}</Pill>}
            <button
              type="button"
              onClick={onClose}
              className="text-[18px] leading-none text-muted transition-colors hover:text-ink"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-5 p-6 xl:grid-cols-[1fr_1fr]">
            {/* ══ left: where it is, and what to do ══ */}
            <div className="flex flex-col gap-5">
              {/* Above the next action, deliberately: once a deal is accepted
                  the handover IS the next action, and burying it under the
                  stage rail would put the work below the description. */}
              {aside}

              {/* the one thing that matters on opening */}
              {action && (
                <div className="rounded-2xl border border-line/80 bg-panel p-5">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Needs doing now
                  </p>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed">{action.do}</p>
                  <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                    Waiting on
                    <Pill tone={action.who === "Us" ? "accent" : "neutral"}>{action.who}</Pill>
                    {outstanding > 0 && (
                      <span className="ml-auto">
                        {outstanding} of {checklist.length} still to tick
                      </span>
                    )}
                  </p>
                </div>
              )}

              <div className="rounded-2xl border border-line/80 bg-panel p-5">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  Where it&apos;s up to
                </p>
                <ol className="mt-3.5 space-y-2.5">
                  {stages.map((s, i) => {
                    const done = i < cur;
                    const here = i === cur;
                    return (
                      <li key={s.key} className="flex items-start gap-2.5">
                        <span
                          className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[9px] ${
                            done
                              ? "border-accent-dark bg-accent-soft text-accent-dark"
                              : here
                                ? "border-accent-dark bg-accent-dark text-white"
                                : "border-line text-muted"
                          }`}
                        >
                          {done ? "✓" : i + 1}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={`block text-[12.5px] leading-tight ${
                              here ? "font-semibold" : done ? "text-muted" : "text-muted"
                            }`}
                          >
                            {s.label}
                          </span>
                          {here && (
                            <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                              {s.blurb}
                            </span>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </div>

              <div className="rounded-2xl border border-line/80 bg-panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Checklist
                  </p>
                  <p className="figures text-[11px] text-muted">
                    {ticked}/{checklist.length}
                  </p>
                </div>
                <ul className="mt-3.5 space-y-2">
                  {checklist.map((c) => (
                    <li key={c.label} className="flex items-start gap-2.5 text-[12.5px]">
                      <span
                        className={`mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-[5px] border-[1.5px] text-[8px] ${
                          c.done
                            ? "border-accent-dark bg-accent-dark text-white"
                            : "border-line text-muted"
                        }`}
                      >
                        {c.done ? "✓" : ""}
                      </span>
                      <span className="min-w-0">
                        <span className={c.done ? "text-muted line-through" : ""}>{c.label}</span>
                        {c.note && (
                          <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                            {c.note}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* ══ right: the running account of the deal ══ */}
            <div className="flex min-h-0 flex-col gap-5">
              <div className="flex min-h-0 flex-col rounded-2xl border border-line/80 bg-panel p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Activity &amp; comments
                  </p>
                  <p className="text-[11px] text-muted">{thread.length} entries</p>
                </div>

                {thread.length === 0 ? (
                  <p className="mt-4 text-[12.5px] text-muted">
                    Nothing recorded yet. Anything typed here stays on the deal.
                  </p>
                ) : (
                  <ul className="mt-4 space-y-3.5">
                    {thread.map((a, i) => (
                      <li key={i} className="flex gap-3">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            a.note ? "bg-accent-dark" : "bg-line"
                          }`}
                        />
                        <span className="min-w-0 flex-1">
                          <span
                            className={`block text-[12.5px] leading-snug ${
                              a.note ? "" : "text-muted"
                            }`}
                          >
                            {a.what}
                          </span>
                          <span className="mt-0.5 block text-[10.5px] text-muted">
                            {a.by} · {a.when}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* The composer. A comment is the fastest thing anyone does on a
                    stalled deal, so it is always in reach, not behind a button. */}
                <div className="mt-5 border-t border-line/70 pt-4">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) post();
                    }}
                    placeholder="Add a comment — chased the tenant, spoke to the landlord…"
                    rows={2}
                    className="w-full resize-y rounded-xl border border-line bg-page px-3 py-2.5 text-[12.5px] text-ink placeholder:text-muted focus:border-accent-dark focus:outline-none"
                  />
                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <p className="text-[10.5px] text-muted">⌘↵ to post</p>
                    <button
                      type="button"
                      onClick={post}
                      disabled={!draft.trim()}
                      className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                    >
                      Post comment
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
