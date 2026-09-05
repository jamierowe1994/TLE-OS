"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { api, ComplianceSide, Note, Pill, prettyWhen, type Loaded } from "@/components/PlcReview";
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
 * the number turns and says how far over, because the useful question at that
 * point is not when it arrived but how late it is.
 *
 * ── What it does NOT show ──────────────────────────────────────────────────
 *
 * No agreement rate, no "the scan is right 96% of the time". That lives in
 * admin, away from here, on purpose — see lib/plc-shadow. Somebody told the
 * scan's track record while deciding stops being an independent check.
 */

/** What the business currently tells agents. The bar the queue is measured against. */
const TARGET_HOURS = 48;

function ageOf(iso: string | null): { label: string; over: boolean } {
  if (!iso) return { label: "not submitted", over: false };
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  const over = hours > TARGET_HOURS;
  if (hours < 1) return { label: `${Math.max(1, Math.round(hours * 60))} min`, over };
  if (hours < 48) return { label: `${Math.round(hours)} hrs`, over };
  const days = hours / 24;
  return { label: `${days.toFixed(days < 10 ? 1 : 0)} days`, over };
}

export default function PlcQueuePage() {
  const [queue, setQueue] = useState<PlcCase[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [open, setOpen] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    try {
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
    try {
      setOpen(await api<Loaded>(`/api/plc/${openId}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [openId]);

  useEffect(() => {
    void loadQueue();
    /* ?case=<id> opens that pack on arrival, from the feed. */
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

  const reload = useCallback(async () => {
    await Promise.all([loadOpen(), loadQueue()]);
  }, [loadOpen, loadQueue]);

  const overdue = (queue ?? []).filter((c) => ageOf(c.submittedAt).over).length;

  return (
    <div className="mx-auto max-w-4xl px-5 pb-16 pt-4 sm:px-8 lg:pt-14">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Pre-tenancy</p>
      <h1 className="mt-1 text-2xl tracking-normal text-ink">PLC Queue</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Packs handed over by agents, longest wait first. The agent is waiting on every one of these.
      </p>

      {error && (
        <div className="mt-4">
          <Note>{error}</Note>
        </div>
      )}

      {queue === null && !error && <p className="mt-6 text-sm text-muted">Reading the queue…</p>}

      {queue?.length === 0 && (
        <p className="mt-6 rounded-xl border border-line p-4 text-sm text-muted">
          Nothing waiting. Every pack an agent has handed over has been decided.
        </p>
      )}

      {queue && queue.length > 0 && (
        <>
          <p className="mt-4 text-sm text-muted">
            {queue.length} waiting
            {overdue > 0 && (
              <span className="text-rose-600">
                {" "}
                · {overdue} past {TARGET_HOURS} hours
              </span>
            )}
          </p>

          <ul className="mt-3 overflow-hidden rounded-xl border border-line">
            {queue.map((c) => {
              const age = ageOf(c.submittedAt);
              const isOpen = c.id === openId;
              return (
                <li key={c.id} className="border-b border-line last:border-0">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : c.id)}
                    className={`flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left transition ${
                      isOpen ? "bg-box" : "hover:bg-box"
                    }`}
                  >
                    {/* The age leads, because it is the only thing that
                        determines what to pick up next. */}
                    <span
                      className={`w-20 shrink-0 text-sm ${age.over ? "text-rose-600" : "text-ink"}`}
                    >
                      {age.label}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-ink">{c.address}</span>
                      <span className="block truncate text-xs text-muted">
                        {c.agentName} · handed over {prettyWhen(c.submittedAt)}
                      </span>
                    </span>
                    <Pill state={c.state} />
                  </button>

                  {isOpen && (
                    <div className="border-t border-line px-4 py-4">
                      {open && open.case.id === c.id ? (
                        <ComplianceSide
                          data={open}
                          reload={reload}
                          say={setError}
                          /* Closing on a decision is the right end to the
                             gesture: the pack has left the queue, so leaving it
                             open would show a panel for something no longer on
                             the list underneath it. */
                          onDecided={() => setOpenId(null)}
                        />
                      ) : (
                        <p className="text-sm text-muted">Opening…</p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}

      <p className="mt-6 text-xs text-muted">
        <Link href="/pre-tenancy" className="underline">
          Back to the board
        </Link>
      </p>
    </div>
  );
}
