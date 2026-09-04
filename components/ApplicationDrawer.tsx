"use client";

import { useEffect, useState } from "react";
import PropertyPhoto from "@/components/PropertyPhoto";
import { Pill } from "@/components/Wire";
import StageSpine, { type SpineStop } from "@/components/StageSpine";
import { eventSentence, eventTone, type DealEvent } from "@/lib/business/deal-events";

type JourneyAction = { id: string; label: string; detail: string; href: string | null; who: "you" | "kirstie" | "landlord" | "tenant" };
type Journey = {
  ok: boolean;
  error?: string;
  stops?: SpineStop[];
  actions?: JourneyAction[];
  flags?: string[];
  deal?: { id: string; stage: string; url: string } | null;
  plc?: { id: string; state: string; who: string } | null;
  history?: DealEvent[];
};

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

/** "Today 14:02", "Tue 2 Sep" - how a comment's time reads in the thread. */
function whenWords(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return sameDay ? `Today ${time}` : `${d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} ${time}`;
}

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
  /* The thread, from the OS. REX gives the milestones above; this is what
     people typed, and it comes back on every open rather than living and
     dying in this component. */
  const [comments, setComments] = useState<AppActivity[] | null>(null);
  /* The journey: REX's three stops then Kirstie's eight, read from where her
     board reads them, with what the agent should do about it. Loads after
     the drawer opens - it touches Propoly and PayProp - so the REX rail
     stands in until it lands. */
  const [journey, setJourney] = useState<Journey | null>(null);

  useEffect(() => {
    let live = true;
    setJourney(null);
    fetch(`/api/applications/${encodeURIComponent(app.id)}/journey`)
      .then((r) => r.json())
      .then((j: Journey) => live && setJourney(j))
      .catch(() => live && setJourney({ ok: false, error: "Couldn't read the journey." }));
    return () => {
      live = false;
    };
  }, [app.id]);
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    setComments(null);
    fetch(`/api/applications/${encodeURIComponent(app.id)}/comments`)
      .then((r) => r.json())
      .then((j: { ok?: boolean; comments?: { body: string; authorName: string; createdAt: string }[] }) => {
        if (!live) return;
        setComments((j.comments ?? []).map((c) => ({ when: whenWords(c.createdAt), what: c.body, by: c.authorName, note: true })));
      })
      .catch(() => live && setComments([]));
    return () => {
      live = false;
    };
  }, [app.id]);

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
  const thread = [...(app.activity ?? []), ...(comments ?? [])];
  const ticked = checklist.filter((c) => c.done).length;
  const outstanding = checklist.length - ticked;

  async function post() {
    const text = draft.trim();
    if (!text || posting) return;
    setPosting(true);
    setPostError(null);
    try {
      const r = await fetch(`/api/applications/${encodeURIComponent(app.id)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const j = (await r.json()) as { ok?: boolean; error?: string; comment?: { body: string; authorName: string; createdAt: string } };
      if (!j.ok || !j.comment) {
        setPostError(j.error ?? "That didn't save.");
        return;
      }
      const c = j.comment;
      setComments((cs) => [...(cs ?? []), { when: whenWords(c.createdAt), what: c.body, by: c.authorName, note: true }]);
      setDraft("");
    } catch {
      setPostError("That didn't save. Try again in a moment.");
    } finally {
      setPosting(false);
    }
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
        className={`absolute inset-y-0 right-0 flex w-full flex-col overflow-hidden rounded-l-2xl bg-page shadow-[-24px_0_60px_-24px_rgba(0,0,0,0.35)] transition-transform duration-[420ms] lg:w-[calc(100%-17rem)] ${
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
            {/* The handover starts HERE, on the record, rather than on a screen
                the agent has to go and find. Everything the wizard needs is on
                this application, so the only honest place to begin is the page
                that already has it open.

                Offered once the landlord has said yes. Before that there is no
                tenancy to be compliant about, and a pack assembled against an
                offer that then falls through is work thrown away. */}
            {(app.stageKey === "accepted" || app.stageKey === "communicated") && (
              <a
                href={`/plc/start?application=${encodeURIComponent(app.id)}`}
                className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
              >
                Start the PLC check
              </a>
            )}
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

              {/* the one thing that matters on opening: what the journey says
                  the agent should do, or REX's stage note until it has loaded */}
              {journey?.ok && journey.actions ? (
                <div className="rounded-2xl border border-line/80 bg-panel p-5">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Needs you
                  </p>
                  {journey.actions.filter((a) => a.who === "you").length === 0 ? (
                    <p className="mt-2.5 text-[13px] leading-relaxed text-muted">
                      Nothing for you right now.
                      {journey.actions[0] ? ` ${journey.actions[0].label} - ${journey.actions[0].detail}` : ""}
                    </p>
                  ) : (
                    <ul className="mt-2.5 space-y-2.5">
                      {journey.actions.map((a) => (
                        <li key={a.id} className="flex items-start gap-2.5">
                          <Pill tone={a.who === "you" ? "accent" : "neutral"}>
                            {a.who === "you" ? "You" : a.who === "kirstie" ? "Kirstie" : a.who === "landlord" ? "Landlord" : "Tenant"}
                          </Pill>
                          <span className="min-w-0 flex-1">
                            {a.href ? (
                              <a href={a.href} className="block text-[13px] font-semibold leading-tight underline-offset-2 hover:underline">
                                {a.label}
                              </a>
                            ) : (
                              <span className="block text-[13px] font-semibold leading-tight">{a.label}</span>
                            )}
                            <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{a.detail}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {journey.flags && journey.flags.length > 0 && (
                    <div className="mt-3.5 border-t border-line/70 pt-3">
                      <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">From Kirstie&apos;s side</p>
                      <ul className="mt-1.5 space-y-1 text-[12px] leading-snug">
                        {journey.flags.map((f) => (
                          <li key={f} className="flex gap-2">
                            <span aria-hidden className="mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {outstanding > 0 && (
                    <p className="mt-3 text-[11px] text-muted">{outstanding} of {checklist.length} checks still to tick</p>
                  )}
                </div>
              ) : action ? (
                <div className="rounded-2xl border border-line/80 bg-panel p-5">
                  <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                    Needs doing now
                  </p>
                  <p className="mt-2.5 text-[13.5px] leading-relaxed">{action.do}</p>
                  <p className="mt-3 flex items-center gap-2 text-[11px] text-muted">
                    Waiting on
                    <Pill tone={action.who === "Us" ? "accent" : "neutral"}>{action.who}</Pill>
                    {journey === null && <span className="ml-auto">Reading the journey…</span>}
                    {outstanding > 0 && journey !== null && (
                      <span className="ml-auto">
                        {outstanding} of {checklist.length} still to tick
                      </span>
                    )}
                  </p>
                </div>
              ) : null}

              <div className="rounded-2xl border border-line/80 bg-panel p-5">
                <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">
                  Where it&apos;s up to
                </p>
                {/* Across, like Kirstie's: REX's three stops, then her eight,
                    read from the same place her board reads them. Until the
                    journey lands, REX's own stages stand in. */}
                <StageSpine
                  compact
                  stops={
                    journey?.ok && journey.stops
                      ? journey.stops
                      : stages.map((s, i) => ({
                          id: s.key,
                          label: s.label,
                          sub: i === cur ? s.blurb : null,
                          tone: "none" as const,
                          state: i < cur ? ("done" as const) : i === cur ? ("current" as const) : ("upcoming" as const),
                        }))
                  }
                />
                {journey?.ok && journey.deal && (
                  <p className="mt-1 text-[11px] text-muted">
                    Kirstie&apos;s deal:{" "}
                    <a href={journey.deal.url} target="_blank" rel="noreferrer" className="underline-offset-2 hover:underline">
                      open in Propoly
                    </a>
                  </p>
                )}
                {/* What moved, on this deal alone. The same rows as Kirstie's
                    feed, so the agent reads "references came back Tuesday"
                    here instead of asking her. Newest first, five by default. */}
                {journey?.ok && journey.history && journey.history.length > 0 && (
                  <details className="mt-3 group">
                    <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wide text-muted">
                      What moved
                      <span className="ml-1.5 font-normal normal-case tracking-normal">
                        · {journey.history.length} {journey.history.length === 1 ? "move" : "moves"}, last {whenWords(journey.history[0].at)}
                      </span>
                    </summary>
                    <ol className="mt-2 space-y-1.5">
                      {journey.history.slice(0, 8).map((e) => {
                        const tone = eventTone(e.event);
                        return (
                          <li key={e.id} className="flex items-start gap-2 text-[12px] leading-snug">
                            <span
                              aria-hidden
                              className={`mt-[6px] h-1.5 w-1.5 shrink-0 rounded-full ${
                                tone === "ok" ? "bg-emerald-600" : tone === "warn" ? "bg-amber-500" : "bg-line"
                              }`}
                            />
                            <span className="min-w-0 flex-1">{eventSentence(e)}</span>
                            <span className="shrink-0 text-[10.5px] tabular-nums text-muted">{whenWords(e.at)}</span>
                          </li>
                        );
                      })}
                    </ol>
                  </details>
                )}
                {journey && !journey.ok && (
                  <p className="mt-2 text-[11px] text-muted">{journey.error ?? "The journey could not be read."} Showing REX&apos;s stages.</p>
                )}
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
                  <p className="text-[11px] text-muted">{comments === null ? "Loading…" : `${thread.length} entries`}</p>
                </div>

                {thread.length === 0 ? (
                  <p className="mt-4 text-[12.5px] text-muted">
                    Nothing recorded yet. A comment here is kept on the application and shows for
                    everyone who opens it.
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
                    <p className="text-[10.5px] text-muted">{postError ? <span className="font-semibold text-accent-dark">{postError}</span> : "⌘↵ to post"}</p>
                    <button
                      type="button"
                      onClick={() => void post()}
                      disabled={!draft.trim() || posting}
                      className="rounded-lg bg-accent-dark px-3.5 py-2 text-[12px] font-semibold text-white transition-opacity disabled:opacity-40"
                    >
                      {posting ? "Posting…" : "Post comment"}
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
