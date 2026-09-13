"use client";

import { useCallback, useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";
import PreTenancyHero from "@/components/pretenancy/Hero";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import { api, ComplianceSide, Note, Pill, prettyDate, prettyWhen, PLC_GREEN, PLC_RED, type Loaded } from "@/components/PlcReview";
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
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* The local preview with nothing in the queue: ?sample=1 draws invented
     packs so the page can be looked at. Never in production. */
  const [sample, setSample] = useState<{ cases: PlcCase[]; loaded: (c: PlcCase) => Loaded } | null>(null);

  const loadQueue = useCallback(async () => {
    try {
      if (process.env.NODE_ENV !== "production" && new URLSearchParams(window.location.search).get("sample") === "1") {
        const { demoCase, DEMO_SCANNED, DEMO_SUMMARY } = await import("@/lib/plc-demo");
        const { missingDocuments, PLC_CHECKS } = await import("@/lib/plc");
        const h = (n: number) => new Date(Date.now() - n * 3_600_000).toISOString();
        const cases: PlcCase[] = [
          { ...DEMO_SCANNED, id: "s1", address: "16 Lord Street, Nottingham NG1 3AA", agentName: "Dan Richards", submittedAt: h(70), moveInDate: "2026-09-18" },
          { ...DEMO_SCANNED, id: "s2", address: "Flat 3, 61 Musters Road, West Bridgford", agentName: "Emily Watson", submittedAt: h(31), moveInDate: "2026-09-25" },
          demoCase({ id: "s3", state: "submitted", address: "27 Lady Bay Road, Lady Bay NG2", agentName: "Sam Whitaker", submittedAt: h(6), moveInDate: "2026-10-02" }),
        ];
        setSample({
          cases,
          loaded: (c) => ({ case: c, checks: PLC_CHECKS, missing: missingDocuments(c).map((x) => x.id), summary: c.scannedAt ? DEMO_SUMMARY : null, scanConfigured: true }),
        });
        setQueue(cases);
        return;
      }
      const res = await api<{ cases: PlcCase[] }>("/api/plc?queue=1");
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

  const list = queue ?? [];
  const overdue = list.filter((c) => ageOf(c.submittedAt).over);
  const soon = list.filter((c) => {
    const d = daysUntil(c.moveInDate);
    return d != null && d <= 7;
  });
  const openCase = open?.case ?? list.find((c) => c.id === openId) ?? null;

  return (
    <div className="space-y-5 pb-8">
      <PreTenancyHero
        title="PLC queue"
        blurb="Packs handed over by agents, longest wait first. The agent is waiting on every one of these, and behind each one is a move-in date."
        photo="/brand/photo/close-door.webp"
        photoPosition="50% 40%"
        line="Compliant homes, confident move-ins"
      />

      {error && <Note>{error}</Note>}

      {/* ── the three numbers ── */}
      <div className="fade-up grid gap-3 sm:grid-cols-3">
        <Tile icon="shield" tone={list.length ? "green" : "green"} value={list.length} label="Waiting on you" note={list.length ? "Longest wait first" : "The queue is clear"} />
        <Tile icon="clock" tone="red" value={overdue.length} label={`Past ${TARGET_HOURS} hours`} note={overdue.length ? "The agent has been told 48" : "Everything inside the target"} />
        <Tile icon="key" tone={soon.length ? "red" : "green"} value={soon.length} label="Moving in this week" note={soon.length ? "Decide these first" : "Nothing this close"} />
      </div>

      {/* ── the queue ── */}
      {list.length === 0 ? (
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
                    <Pill state={c.state} />
                    <span className="text-muted"><DoodleIcon name="trend-up" size={13} /></span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── the review, in a drawer from the right ── */}
      {openId && openCase ? (
        <div className="fixed inset-0 z-50 bg-[#2b201d]/40" onClick={() => setOpenId(null)}>
          <div
            className="drawer-in fixed inset-y-0 right-0 flex w-full max-w-[1040px] flex-col overflow-hidden bg-page shadow-[-20px_0_60px_-30px_rgba(40,25,20,0.5)] lg:w-[72vw] lg:rounded-l-[28px]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-h-0 flex-1 overflow-y-auto">
              <div className="px-5 pb-8 pt-5 sm:px-7">
                <div className="flex items-start gap-4">
                  <span className={`mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${ageOf(openCase.submittedAt).over ? PLC_RED : PLC_GREEN}`}><DoodleIcon name="shield" size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-[28px] font-bold leading-tight">{openCase.address}</h2>
                    <p className="mt-1 text-[13.5px] text-muted">
                      From <span className="font-semibold text-ink">{openCase.agentName}</span>
                      {openCase.moveInDate ? ` · moving in ${prettyDate(openCase.moveInDate)}` : ""}
                      {openCase.submittedAt ? ` · waiting ${ageOf(openCase.submittedAt).label}` : ""}
                    </p>
                    <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                      <Pill state={openCase.state} />
                      {ageOf(openCase.submittedAt).over ? <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${PLC_RED}`}>Past {TARGET_HOURS} hours</span> : null}
                    </div>
                  </div>
                  <button onClick={() => setOpenId(null)} aria-label="Close" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-muted transition hover:bg-card hover:text-ink">
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
                  </button>
                </div>
                <div className="mt-5">
                  {open && open.case.id === openCase.id ? (
                    <ComplianceSide
                      data={open}
                      reload={reload}
                      say={setError}
                      perform={sample ? async (action, extra) => {
                        const c = sample.cases.find((x) => x.id === openCase.id)!;
                        if (action === "scan" || action === "skip-scan") Object.assign(c, { state: "reviewing", scannedAt: new Date().toISOString() });
                        if (action === "decide") Object.assign(c, { state: String(extra.decision ?? "approved"), decidedAt: new Date().toISOString(), decidedBy: "You, in the sample", decisionNote: String(extra.note ?? "") });
                      } : undefined}
                      /* Closing on a decision is the right end to the gesture:
                         the pack has left the queue, so leaving it open would
                         show a panel for something no longer on the list. */
                      onDecided={() => setOpenId(null)}
                    />
                  ) : (
                    <WorkspaceLoading height="min-h-[360px]" label="Opening the pack" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
