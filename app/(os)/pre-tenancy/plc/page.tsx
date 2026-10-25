"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import LineIcon from "@/components/LineIcon";
import { ROUND_HELP } from "@/components/GuideButton";
import DoodleIcon from "@/components/DoodleIcon";
import PreTenancyHero from "@/components/pretenancy/Hero";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import { PlcEmails } from "@/components/MailThreads";
import PlcSplitReview, { type SplitSample } from "@/components/PlcSplitReview";
import { api, Note, Pill, prettyDate, prettyWhen, PLC_GREEN, PLC_RED, SentAnywayTag, FinalAskTag, type Loaded } from "@/components/PlcReview";
import type { PlcCase } from "@/lib/plc";

/**
 * The PLC queue: what is with compliance, longest wait first.
 *
 * ── Longest wait first, and it is the only ordering ────────────────────────
 *
 * Every other list in the OS is newest first. This one is the opposite and
 * cannot be sorted any other way, because a queue sorted newest-first starves
 * the pack that has been waiting longest — and that pack is somebody's move-in
 * date. There is deliberately no column to click.
 *
 * ── The age is the whole interface ─────────────────────────────────────────
 *
 * Not a timestamp. "3 days" is a thing a person reacts to; "27 Aug, 14:12" is
 * a thing they have to do arithmetic on, and nobody does it. Past the target
 * the pill turns red and says how far over, because the useful question at
 * that point is not when it arrived but how late it is.
 *
 * ── The review opens in a drawer ───────────────────────────────────────────
 *
 * From the right, the way a deal opens from the board (James, 13 Sep 2026),
 * with the pack's head, the three facts, and the same compliance panel the
 * dry run and the public preview mount. One panel, three doors.
 *
 * ── What it does NOT show ──────────────────────────────────────────────────
 *
 * No agreement rate, no "the scan is right 96% of the time". That lives in
 * admin, away from here, on purpose — see lib/plc-shadow. Somebody told the
 * scan's track record while deciding stops being an independent check.
 */

/**
 * THE STAGES (Susan, 23 Oct 2026: "I sent it back as there was a query... it
 * is not showing anywhere in the PLC queue now? Should we have a Sent back -
 * pending box? and also what has been approved so far"). A pack sent back
 * left the queue and nothing showed it again until the agent re-sent it. Now
 * the page reads every pack and shows it at its stage: waiting on the team
 * (the queue, as before), sent back (with the agent, or being fixed),
 * approved, declined, and everything together.
 */
type Stage = "waiting" | "back" | "approved" | "declined" | "all";
const OPEN_STATES: PlcCase["state"][] = ["submitted", "scanning", "reviewing", "checked"];
/** Sent back: deferred to the agent, or reopened by them and being fixed (the reason stays on it). */
const isBack = (c: PlcCase) => c.state === "deferred" || (c.state === "assembling" && Boolean(c.decidedAt));
/** Ever handed to the team: anything past assembling, or back with the agent after a send-back. */
const handedOver = (c: PlcCase) => c.state !== "assembling" || Boolean(c.decidedAt);
const lastMove = (c: PlcCase) => (OPEN_STATES.includes(c.state) ? c.submittedAt : c.decidedAt) ?? c.submittedAt ?? c.createdAt;

/** What the business currently tells agents. The bar the queue is measured against. */
const TARGET_HOURS = 48;

function ageOf(iso: string | null): { label: string; over: boolean; hours: number } {
  if (!iso) return { label: "not submitted", over: false, hours: 0 };
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const over = hours > TARGET_HOURS;
  if (hours < 1) return { label: `${Math.max(1, Math.round(hours * 60))} min`, over, hours };
  if (hours < 48) return { label: `${Math.round(hours)} hrs`, over, hours };
  const days = hours / 24;
  return { label: `${days.toFixed(days < 10 ? 1 : 0)} days`, over, hours };
}

function daysUntil(ymd: string | null): number | null {
  if (!ymd) return null;
  const d = new Date(`${ymd.slice(0, 10)}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

function Tile({ icon, tone, value, label, note }: { icon: string; tone: "green" | "red"; value: number | string; label: string; note?: string }) {
  return (
    <div className="flex items-center gap-4 rounded-[18px] border border-line/70 bg-card px-4 py-3.5">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${tone === "green" ? PLC_GREEN : PLC_RED}`}><DoodleIcon name={icon} size={18} /></span>
      <span className="min-w-0">
        <span className="figures block text-[24px] font-bold leading-none">{value}</span>
        <span className={`mt-1 block text-[12px] leading-tight ${tone === "red" && typeof value === "number" && value > 0 ? "text-[#9d4340]" : "text-muted"}`}>{label}</span>
        {note && <span className="block text-[11px] text-muted">{note}</span>}
      </span>
    </div>
  );
}

export default function PlcQueuePage() {
  const [queue, setQueue] = useState<PlcCase[] | null>(null);
  const [stage, setStage] = useState<Stage>("waiting");
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The local preview with nothing in the queue: ?sample=1 draws invented
     packs so the page can be looked at. Never in production. */
  const [sample, setSample] = useState<{ cases: PlcCase[]; loaded: (c: PlcCase) => Loaded } | null>(null);
  const sampleRef = useRef<{ cases: PlcCase[]; loaded: (c: PlcCase) => Loaded } | null>(null);
  /* The full-screen review's own sample: people, answers and the AI summary, invented. */
  const [splitSample, setSplitSample] = useState<SplitSample | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("sample") === "1") {
        /* Built once: a decision in the sample changes the case in place,
           and rebuilding on every reload would put it back. */
        if (sampleRef.current) {
          setQueue([...sampleRef.current.cases]);
          return;
        }
        const { demoCase, DEMO_SCANNED, DEMO_SUMMARY } = await import("@/lib/plc-demo");
        const { missingDocuments, PLC_CHECKS } = await import("@/lib/plc");
        const h = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
        const cases: PlcCase[] = [
          { ...DEMO_SCANNED, id: "s1", address: "16 Lord Street, Nottingham NG1 3AA", agentName: "Dan Richards", submittedAt: h(70), moveInDate: "2026-09-18" },
          { ...DEMO_SCANNED, id: "s2", address: "Flat 3, 61 Musters Road, West Bridgford", agentName: "Emily Watson", submittedAt: h(31), moveInDate: "2026-09-25" },
          demoCase({ id: "s3", state: "submitted", address: "27 Lady Bay Road, Lady Bay NG2", agentName: "Sam Whitaker", submittedAt: h(6), moveInDate: "2026-10-02" }),
          /* One at each later stage, so every tab has something on it. */
          demoCase({ id: "s4", state: "deferred", address: "9 Trent Boulevard, West Bridgford", agentName: "Dan Richards", submittedAt: h(30), decidedAt: h(4), decidedBy: "Susan Liles", decisionNote: "The gas certificate is a screenshot of an email. Please attach the certificate itself." }),
          demoCase({ id: "s5", state: "assembling", address: "4 Mona Street, Beeston", agentName: "Emily Watson", submittedAt: h(50), decidedAt: h(20), decidedBy: "Kirstie Mulholland", decisionNote: "Guarantor ID missing." }),
          demoCase({ id: "s6", state: "approved", address: "12 Musters Road, West Bridgford", agentName: "Sam Whitaker", submittedAt: h(28), decidedAt: h(2), decidedBy: "Susan Liles" }),
        ];
        const built = {
          cases,
          loaded: (c: PlcCase): Loaded => ({ case: c, checks: PLC_CHECKS, missing: missingDocuments(c).map((x) => x.id), summary: c.scannedAt ? DEMO_SUMMARY : null, scanConfigured: true }),
        };
        sampleRef.current = built;
        const { DEMO_PEOPLE, DEMO_ANSWERS, DEMO_AI_SUMMARY } = await import("@/lib/plc-demo");
        setSplitSample({
          people: DEMO_PEOPLE,
          answers: DEMO_ANSWERS,
          summary: DEMO_AI_SUMMARY,
          /* A pretend file in place of an upload, on the open sample pack. */
          attach: (caseId, checkId, name, replaceKey) => {
            const c = cases.find((x) => x.id === caseId);
            if (!c) return;
            const now = new Date().toISOString();
            const old = replaceKey ? c.documents.find((d) => d.key === replaceKey) : null;
            const doc = { checkId: old?.checkId ?? checkId, name, key: `documents/sample/${Date.now()}-${name}`, url: "#", addedAt: now, addedBy: "You, in the sample", placeholder: true as const, byCompliance: true, ...(old ? { replaces: { name: old.name, key: old.key, addedBy: old.addedBy, addedAt: old.addedAt, at: now, by: "You, in the sample" } } : {}) };
            c.documents = old ? c.documents.map((d) => (d.key === old.key ? doc : d)) : [...c.documents, doc];
          },
        });
        setSample(built);
        setQueue([...cases]);
        return;
      }
      /* Every pack, so the page can show each stage, not just the queue (23 Oct 2026). */
      const res = await api<{ cases: PlcCase[] }>("/api/plc");
      setQueue(res.cases);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadOpen = useCallback(async () => {
    if (!openId) {
      setOpen(null);
      return;
    }
    if (sample) {
      const c = sample.cases.find((x) => x.id === openId);
      setOpen(c ? sample.loaded(c) : null);
      return;
    }
    try {
      setOpen(await api<Loaded>(`/api/plc/${openId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [openId, sample]);

  useEffect(() => {
    void loadQueue();
    /* ?case=<id> opens that pack on arrival, from the feed and the dashboard. */
    try {
      const asked = new URLSearchParams(window.location.search).get("case");
      if (asked) setOpenId(asked);
    } catch {
      /* fine */
    }
  }, [loadQueue]);
  useEffect(() => {
    void loadOpen();
  }, [loadOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenId(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reload = useCallback(async () => {
    await Promise.all([loadOpen(), loadQueue()]);
  }, [loadOpen, loadQueue]);

  if (queue === null && !error) return <WorkspaceLoading />;

  const every = (queue ?? []).filter(handedOver);
  /* The queue: what is with the team, longest wait first, as it always was. */
  const list = every
    .filter((c) => OPEN_STATES.includes(c.state))
    .sort((a, b) => (a.submittedAt ?? a.createdAt).localeCompare(b.submittedAt ?? b.createdAt));
  const byLatest = (xs: PlcCase[]) => [...xs].sort((a, b) => lastMove(b).localeCompare(lastMove(a)));
  const back = byLatest(every.filter(isBack));
  const approved = byLatest(every.filter((c) => c.state === "approved"));
  const declined = byLatest(every.filter((c) => c.state === "declined"));
  const all = byLatest(every);
  const stages: { id: Stage; label: string; n: number }[] = [
    { id: "waiting", label: "Waiting on you", n: list.length },
    { id: "back", label: "Sent back", n: back.length },
    { id: "approved", label: "Approved", n: approved.length },
    { id: "declined", label: "Declined", n: declined.length },
    { id: "all", label: "Everything", n: all.length },
  ];
  const shown = stage === "back" ? back : stage === "approved" ? approved : stage === "declined" ? declined : stage === "all" ? all : list;
  /* Not read is not empty (Rig run 4, P-075): with the queue unread the tiles
     said 0 and "The queue is clear" under the error. */
  const unread = queue === null && Boolean(error);
  const overdue = list.filter((c) => ageOf(c.submittedAt).over);
  const soon = list.filter((c) => {
    const d = daysUntil(c.moveInDate);
    return d != null && d <= 7;
  });
  const openCase = open?.case ?? every.find((c) => c.id === openId) ?? null;

  return (
    <div className="space-y-5 pb-8">
      <PreTenancyHero
        title="PLC queue"
        blurb="Packs handed over by agents, longest wait first. The agent is waiting on every one of these, and behind each one is a move-in date."
        photo="/brand/photo/close-door.webp"
        photoPosition="50% 40%"
        line="Compliant homes, confident move-ins"
      >
        {/* The round How this works, as on every screen (components/GuideButton). */}
        <Link href="/pre-tenancy/knowledge?guide=plc" className={ROUND_HELP} title="How this works" aria-label="How this works">
          <LineIcon name="help" size={17} />
        </Link>
      </PreTenancyHero>

      {error && <Note>{error}</Note>}

      {/* ── the three numbers ── */}
      <div className="fade-up grid gap-3 sm:grid-cols-3">
        <Tile icon="shield" tone={list.length ? "green" : "green"} value={unread ? "—" : list.length} label="Waiting on you" note={unread ? "Couldn't read the queue" : list.length ? "Longest wait first" : "The queue is clear"} />
        <Tile icon="clock" tone="red" value={unread ? "—" : overdue.length} label={`Past ${TARGET_HOURS} hours`} note={unread ? "Couldn't read the queue" : overdue.length ? "The agent has been told 48" : "Everything inside the target"} />
        <Tile icon="key" tone={soon.length ? "red" : "green"} value={unread ? "—" : soon.length} label="Moving in this week" note={unread ? "Couldn't read the queue" : soon.length ? "Decide these first" : "Nothing this close"} />
      </div>

      {/* ── the stages ── */}
      {!unread && (
        <div className="fade-up flex flex-wrap gap-2" role="tablist" aria-label="PLC stages">
          {stages.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={stage === t.id}
              onClick={() => setStage(t.id)}
              className={`rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition ${stage === t.id ? "border-ink bg-ink text-white" : "border-line/80 bg-card text-ink hover:border-ink/40"}`}
            >
              {t.label} <span className={stage === t.id ? "text-white/70" : "text-muted"}>{t.n}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── the other stages: newest move first, each opening the same review ── */}
      {!unread && stage !== "waiting" && (
        shown.length === 0 ? (
          <section className="fade-up rounded-[22px] border border-line/70 bg-card p-6 text-[13px] text-muted">
            {stage === "back" ? "Nothing sent back at the moment." : stage === "approved" ? "Nothing approved yet." : stage === "declined" ? "Nothing declined." : "No packs handed over yet."}
          </section>
        ) : (
          <section className="fade-up rounded-[22px] border border-line/70 bg-card p-2">
            <ul className="divide-y divide-line/50">
              {shown.map((c) => {
                const fixing = c.state === "assembling";
                const when = OPEN_STATES.includes(c.state) ? c.submittedAt : c.decidedAt;
                return (
                  <li key={c.id}>
                    <button type="button" onClick={() => setOpenId(c.id)} className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3.5 text-left transition hover:bg-page">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold">{c.address}</span>
                        <span className="block truncate text-[12.5px] text-muted">
                          {c.agentName}
                          {OPEN_STATES.includes(c.state)
                            ? ` · handed over ${prettyWhen(c.submittedAt)}`
                            : c.state === "approved"
                              ? ` · approved ${prettyWhen(when)}${c.decidedBy ? ` by ${c.decidedBy}` : ""}`
                              : c.state === "declined"
                                ? ` · declined ${prettyWhen(when)}${c.decidedBy ? ` by ${c.decidedBy}` : ""}`
                                : ` · sent back ${prettyWhen(when)}${c.decidedBy ? ` by ${c.decidedBy}` : ""}`}
                          {c.moveInDate ? ` · moving in ${prettyDate(c.moveInDate)}` : ""}
                        </span>
                        {isBack(c) && c.decisionNote && <span className="mt-1 block text-[12.5px] text-ink">&ldquo;{c.decisionNote}&rdquo;</span>}
                      </span>
                      {isBack(c) ? (
                        <span className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold ${fixing ? "bg-page text-muted" : "bg-[#f5e3c7] text-[#8a5a1c]"}`}>
                          {fixing ? "Sent back · agent fixing" : "Sent back · with the agent"}
                        </span>
                      ) : (
                        <Pill state={c.state} />
                      )}
                      <span className="text-muted"><DoodleIcon name="trend-up" size={13} /></span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )
      )}

      {/* ── the queue ── */}
      {unread || stage !== "waiting" ? null : list.length === 0 ? (
        <section className="fade-up flex items-center gap-4 rounded-[22px] border border-line/70 bg-card p-6">
          <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${PLC_GREEN}`}>✓</span>
          <div>
            <h2 className="text-[17px] font-bold">Nothing waiting</h2>
            <p className="mt-0.5 text-[13px] text-muted">Every pack an agent has handed over has been decided.</p>
          </div>
        </section>
      ) : (
        <section className="fade-up rounded-[22px] border border-line/70 bg-card p-2">
          <ul className="divide-y divide-line/50">
            {list.map((c) => {
              const age = ageOf(c.submittedAt);
              const d = daysUntil(c.moveInDate);
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setOpenId(c.id)}
                    className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl px-4 py-3.5 text-left transition hover:bg-page"
                  >
                    {/* The age leads, because it is the only thing that
                        determines what to pick up next. */}
                    <span className={`w-28 shrink-0 rounded-full px-3 py-1.5 text-center text-[12px] font-semibold ${age.over ? PLC_RED : PLC_GREEN}`}>
                      {age.over ? `${age.label} · over` : age.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14.5px] font-semibold">{c.address}</span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {c.agentName} · handed over {prettyWhen(c.submittedAt)}
                        {c.moveInDate ? ` · moving in ${prettyDate(c.moveInDate)}${d != null && d <= 7 ? ` (${d <= 0 ? "today" : `${d} days`})` : ""}` : ""}
                      </span>
                    </span>
                    <SentAnywayTag c={c} />
                    <FinalAskTag c={c} />
                    {/* Sent back once and handed over again: the old reason is still on it. */}
                    {c.decidedAt && <span className="shrink-0 whitespace-nowrap rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-muted" title={c.decisionNote ? `Sent back: ${c.decisionNote}` : undefined}>Resent after a send-back</span>}
                    <Pill state={c.state} />
                    <span className="text-muted"><DoodleIcon name="trend-up" size={13} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── the review, opened out on the screen (James, 23 Oct 2026) ──
          Was a drawer from the right. Full screen now: the landlord and the
          tenants with their documents on the left, the AI summary and the
          decision on the right (components/PlcSplitReview). */}
      {openId && openCase ? (
        <div className="drawer-in fixed inset-0 z-50 flex flex-col bg-page" role="dialog" aria-modal="true" aria-label={openCase.address}>
          {open && open.case.id === openCase.id ? (
            <PlcSplitReview
              data={open}
              reload={reload}
              say={setError}
              sample={sample ? splitSample : null}
              perform={sample ? async (action, extra) => {
                const c = sample.cases.find((x) => x.id === openCase.id)!;
                if (action === "scan" || action === "skip-scan") Object.assign(c, { state: "reviewing", scannedAt: new Date().toISOString() });
                if (action === "check") Object.assign(c, { state: "checked", checkedAt: new Date().toISOString(), checkedBy: "You, in the sample", checkNote: String(extra.note ?? "") });
                if (action === "decide") Object.assign(c, { state: String(extra.decision ?? "approved"), decidedAt: new Date().toISOString(), decidedBy: "You, in the sample", decisionNote: String(extra.note ?? "") });
              } : undefined}
              /* Closing on a decision is the right end to the gesture:
                 the pack has left the queue, so leaving it open would
                 show a panel for something no longer on the list. */
              onDecided={() => setOpenId(null)}
              head={
                <div className="flex items-start gap-4">
                  <span className={`mt-0.5 hidden h-11 w-11 shrink-0 items-center justify-center rounded-full sm:flex ${ageOf(openCase.submittedAt).over ? PLC_RED : PLC_GREEN}`}><DoodleIcon name="shield" size={18} /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[22px] font-normal leading-tight tracking-normal sm:text-[26px]">{openCase.address}</h2>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-muted">
                      <span>
                        From <span className="font-semibold text-ink">{openCase.agentName}</span>
                        {openCase.moveInDate ? ` · moving in ${prettyDate(openCase.moveInDate)}` : ""}
                        {openCase.submittedAt ? ` · waiting ${ageOf(openCase.submittedAt).label}` : ""}
                      </span>
                      <Pill state={openCase.state} />
                      <SentAnywayTag c={openCase} />
                      <FinalAskTag c={openCase} />
                      {ageOf(openCase.submittedAt).over ? <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PLC_RED}`}>Past {TARGET_HOURS} hours</span> : null}
                    </div>
                  </div>
                  <button onClick={() => setOpenId(null)} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
              }
              after={
                /* Email replies on the pack's threads (James, 21 Oct 2026). Not on the sample. */
                !sample ? <div className="mt-4"><PlcEmails key={`${open.case.state}:${open.case.finalAsks?.length ?? 0}:${open.case.rlpRequest?.at ?? ""}:${open.case.decidedAt ?? ""}`} caseId={openCase.id} /></div> : null
              }
            />
          ) : (
            <WorkspaceLoading height="min-h-[360px]" label="Opening the pack" />
          )}
        </div>
      ) : null}
    </div>
  );
}
