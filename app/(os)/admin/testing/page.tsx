"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { JOURNEYS, LIGHT_WORDS, lightFor, type Journey, type Light, type TestMark, type TestStep } from "@/lib/testing-journeys";

/**
 * Admin → Testing.
 *
 * One journey at a time, from the dropdown. Every step has a light and,
 * where it is built, the walk: what it does, how to test it, where to start.
 * Tested OK and Failed are the two marks a person can make; both carry their
 * name and the date, and Failed needs a note so it can be fixed.
 *
 * Red and grey have no buttons. There is nothing to walk: red says who has to
 * give us what, grey says what would be built.
 */

const LIGHT_DOT: Record<Light, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-rose-500",
  grey: "bg-neutral-300",
};

const LIGHT_RING: Record<Light, string> = {
  green: "border-emerald-200 bg-emerald-50/40",
  amber: "border-amber-200 bg-amber-50/40",
  red: "border-rose-200 bg-rose-50/40",
  grey: "border-line bg-panel",
};

interface Payload {
  ok: boolean;
  error?: string;
  journeys?: Journey[];
  marks?: TestMark[];
  switches?: Record<string, { on: boolean; label: string }>;
}

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Counts({ steps, marks }: { steps: TestStep[]; marks: Map<string, TestMark> }) {
  const n: Record<Light, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  for (const s of steps) n[lightFor(s, marks.get(s.id) ?? null).light] += 1;
  return (
    <span className="inline-flex items-center gap-2.5 text-[11.5px] text-muted">
      {(["green", "amber", "red", "grey"] as Light[]).map((l) => (
        <span key={l} className="inline-flex items-center gap-1">
          <span className={`inline-block h-2 w-2 rounded-full ${LIGHT_DOT[l]}`} />
          {n[l]}
        </span>
      ))}
    </span>
  );
}

export default function TestingPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [journeyId, setJourneyId] = useState<string>(JOURNEYS[0].id);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/testing", { cache: "no-store" });
      const body = (await res.json()) as Payload;
      if (!body.ok) throw new Error(body.error ?? "Could not load.");
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    try {
      const j = new URLSearchParams(window.location.search).get("journey");
      if (j && JOURNEYS.some((x) => x.id === j)) setJourneyId(j);
    } catch {
      /* fine */
    }
  }, [load]);

  const journeys = data?.journeys ?? JOURNEYS;
  const journey = journeys.find((j) => j.id === journeyId) ?? journeys[0];
  const marksByJourney = useMemo(() => {
    const m = new Map<string, Map<string, TestMark>>();
    for (const mk of data?.marks ?? []) {
      if (!m.has(mk.journey)) m.set(mk.journey, new Map());
      m.get(mk.journey)!.set(mk.step, mk);
    }
    return m;
  }, [data?.marks]);
  const marks = marksByJourney.get(journey.id) ?? new Map<string, TestMark>();

  const mark = async (step: TestStep, result: "pass" | "fail" | "clear") => {
    setBusy(step.id);
    setError(null);
    try {
      const res = await fetch("/api/admin/testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          result === "clear"
            ? { journey: journey.id, step: step.id, clear: true }
            : { journey: journey.id, step: step.id, result, note: note[step.id] ?? "" }
        ),
      });
      const body = (await res.json()) as Payload;
      if (!body.ok) throw new Error(body.error ?? "Could not save.");
      setData((d) => (d ? { ...d, marks: body.marks ?? d.marks } : d));
      setNote((n) => ({ ...n, [step.id]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  };

  const total: Record<Light, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  for (const j of journeys) {
    const jm = marksByJourney.get(j.id) ?? new Map<string, TestMark>();
    for (const s of j.steps) total[lightFor(s, jm.get(s.id) ?? null).light] += 1;
  }

  return (
    <>
      <PageHeader
        title="Testing"
        blurb="Every process, walked by a person before agents are let in. Green is tested, amber is built and waiting for a walk, red needs somebody outside the code, grey is not built yet."
      />

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-[13px]">
          <span className="text-muted">Journey</span>
          <select
            value={journey.id}
            onChange={(e) => setJourneyId(e.target.value)}
            className="rounded-full border border-line bg-card px-3 py-1.5 text-[13px] outline-none focus:border-ink"
          >
            {journeys.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
              </option>
            ))}
          </select>
        </label>
        <Counts steps={journey.steps} marks={marks} />
        <span className="ml-auto text-[11.5px] text-muted">
          Across everything:{" "}
          {(["green", "amber", "red", "grey"] as Light[]).map((l) => (
            <span key={l} className="ml-2 inline-flex items-center gap-1">
              <span className={`inline-block h-2 w-2 rounded-full ${LIGHT_DOT[l]}`} />
              {total[l]} {LIGHT_WORDS[l].toLowerCase()}
            </span>
          ))}
        </span>
      </div>

      <p className="mb-4 max-w-2xl text-[13px] text-muted">{journey.blurb}</p>
      {error && <p className="mb-3 text-[12.5px] text-red-600">{error}</p>}

      <ol className="space-y-2.5">
        {journey.steps.map((s, i) => {
          const mk = marks.get(s.id) ?? null;
          const { light, stale } = lightFor(s, mk);
          const sw = s.switchKey ? data?.switches?.[s.switchKey] : null;
          const isOpen = open === s.id;
          return (
            <li key={s.id} className={`rounded-2xl border ${LIGHT_RING[light]}`}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : s.id)}
                className="flex w-full items-start gap-3 px-4 py-3 text-left"
              >
                <span className={`mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full ${LIGHT_DOT[light]}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold leading-tight">
                    {i + 1}. {s.title}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-muted">{s.what}</span>
                </span>
                <span className="shrink-0 text-right text-[11px] text-muted">
                  <span className="block">{LIGHT_WORDS[light]}</span>
                  {mk && (
                    <span className="block">
                      {mk.result === "pass" ? "OK" : "Failed"} · {mk.by}, {when(mk.at)}
                    </span>
                  )}
                  {stale && <span className="block text-amber-700">Rebuilt since. Walk it again.</span>}
                  {sw && (
                    <span className={`block ${sw.on ? "text-emerald-700" : ""}`}>
                      Switch {sw.on ? "on" : "off"}
                    </span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-line/70 px-4 py-3 text-[12.5px]">
                  {s.state === "blocked" && s.blocked && (
                    <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                      <p className="font-semibold">Currently can&apos;t do this.</p>
                      <p className="mt-1">{s.blocked.why}</p>
                      <p className="mt-1">Needs: {s.blocked.who}</p>
                    </div>
                  )}
                  {s.state === "notbuilt" && (
                    <div className="rounded-xl border border-line bg-box px-3 py-2 text-muted">
                      <p className="font-semibold text-ink">Not built yet.</p>
                      <p className="mt-1">{s.todo}</p>
                    </div>
                  )}
                  {s.state === "built" && (
                    <>
                      {mk?.result === "fail" && mk.note && (
                        <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                          Failed last time: {mk.note}
                        </p>
                      )}
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">How to test it</p>
                      <ol className="mt-1.5 list-decimal space-y-1 pl-5">
                        {s.how.map((h, k) => (
                          <li key={k}>{h}</li>
                        ))}
                      </ol>
                      {s.notes && s.notes.length > 0 && (
                        <ul className="mt-3 space-y-1 text-muted">
                          {s.notes.map((n, k) => (
                            <li key={k}>· {n}</li>
                          ))}
                        </ul>
                      )}
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        {s.where && (
                          <Link
                            href={s.where}
                            className="rounded-full border border-line px-3 py-1.5 text-[12px] transition hover:border-ink"
                          >
                            Open {s.where}
                          </Link>
                        )}
                        <input
                          value={note[s.id] ?? ""}
                          onChange={(e) => setNote((n) => ({ ...n, [s.id]: e.target.value }))}
                          placeholder="What you saw (needed for Failed)"
                          className="min-w-[220px] flex-1 rounded-full border border-line bg-white px-3 py-1.5 text-[12px] outline-none focus:border-ink"
                        />
                        <button
                          type="button"
                          disabled={busy === s.id}
                          onClick={() => void mark(s, "pass")}
                          className="rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Tested OK
                        </button>
                        <button
                          type="button"
                          disabled={busy === s.id}
                          onClick={() => void mark(s, "fail")}
                          className="rounded-full border border-rose-300 px-3 py-1.5 text-[12px] font-semibold text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                        >
                          Failed
                        </button>
                        {mk && (
                          <button
                            type="button"
                            disabled={busy === s.id}
                            onClick={() => void mark(s, "clear")}
                            className="text-[11.5px] text-muted underline-offset-2 hover:underline disabled:opacity-50"
                          >
                            Clear the mark
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </>
  );
}
