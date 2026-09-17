"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import TestFilesTab from "@/components/testing/TestFilesTab";
import {
  JOURNEYS,
  KITS,
  LIGHT_WORDS,
  TEST_AREAS,
  WHO_WORDS,
  lightFor,
  placeOf,
  type Journey,
  type KitId,
  type Light,
  type TestAreaId,
  type TestMark,
  type TestRun,
  type TestStep,
  type TestWho,
} from "@/lib/testing-journeys";

/**
 * Admin → Testing, as a list (Howard, 15 Sep 2026).
 *
 * Every step of every journey, down one page, grouped by the area it belongs
 * to - the same areas the switches turn on. Core first; everything that waits
 * for after launch is one press away rather than in the way.
 *
 * A step that starts from a record has a Create a test button. It makes that
 * record with the tester's own email as the customer's (lib/test-kits), so
 * whatever the flow sends lands in their inbox, and it opens the agent,
 * landlord or tenant side from there. Then the same two marks as before:
 * Tested OK, or Failed with what they saw.
 */

const LIGHT_DOT: Record<Light, string> = {
  green: "bg-emerald-500",
  amber: "bg-amber-400",
  red: "bg-rose-500",
  grey: "bg-neutral-300",
};

const WHO_TONE: Record<TestWho, string> = {
  agent: "border-line bg-white text-ink",
  landlord: "border-amber-200 bg-amber-50 text-amber-900",
  tenant: "border-sky-200 bg-sky-50 text-sky-900",
  compliance: "border-violet-200 bg-violet-50 text-violet-900",
  office: "border-line bg-box text-muted",
};

interface Payload {
  ok: boolean;
  error?: string;
  journeys?: Journey[];
  marks?: TestMark[];
  /** Every occasion anybody walked a step, newest first. The marks are the newest of these. */
  runs?: TestRun[];
  switches?: Record<string, { on: boolean; label: string }>;
}

interface KitLink {
  who: TestWho;
  label: string;
  href: string;
}

interface KitRun {
  id: string;
  kit: KitId;
  createdAt: string;
  byName: string;
  links: KitLink[];
  said: string;
  canRelink: boolean;
}

interface Row {
  journey: Journey;
  step: TestStep;
  area: TestAreaId;
  who: TestWho[];
  kit?: KitId;
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function Dots({ counts }: { counts: Record<Light, number> }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[11.5px] tabular-nums text-muted">
      {(["green", "amber", "red", "grey"] as Light[]).map((l) => (
        <span key={l} className="inline-flex items-center gap-1" title={LIGHT_WORDS[l]}>
          <span className={`inline-block h-2 w-2 rounded-full ${LIGHT_DOT[l]}`} />
          {counts[l]}
        </span>
      ))}
    </span>
  );
}

function Who({ who }: { who: TestWho }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-[1px] text-[10.5px] leading-4 ${WHO_TONE[who]}`}>
      {WHO_WORDS[who]}
    </span>
  );
}

/**
 * WHAT HAPPENED ON THIS STEP, EVERY TIME.
 *
 * The newest run is already on the row above as the mark, so this starts at
 * the second: the point of it is the run BEFORE the one showing - the failure
 * that got fixed, or the person who could not make it work when somebody else
 * could. One run and there is nothing to add, so it draws nothing.
 */
function History({ runs }: { runs: TestRun[] }) {
  if (runs.length < 2) return null;
  const older = runs.slice(1);
  return (
    <div className="mt-4 border-t border-line/60 pt-3">
      <p className="text-[11px] uppercase tracking-wide text-muted">
        Walked {runs.length} times · before this
      </p>
      <ul className="mt-1.5 space-y-1">
        {older.map((r) => (
          <li key={r.id} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
            <span className={r.result === "fail" ? "font-semibold text-rose-700" : "font-semibold text-emerald-700"}>
              {r.result === "pass" ? "OK" : "Failed"}
            </span>
            <span className="text-muted">
              {r.by}, {when(r.at)}
            </span>
            {r.note && <span className="min-w-0 basis-full text-muted">&ldquo;{r.note}&rdquo;</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * WHAT THE TESTERS FOUND, in the order they found it.
 *
 * The board answers "where are we"; this answers "what came out of it", which
 * is the question after a testing session and the one a board of last states
 * could never answer. Failures only, newest first: an OK needs no follow-up.
 */
function Found({ runs, journeys, onOpen }: { runs: TestRun[]; journeys: Journey[]; onOpen: (key: string) => void }) {
  const fails = runs.filter((r) => r.result === "fail").slice(0, 40);
  if (fails.length === 0) return null;
  const titleOf = (r: TestRun) => {
    const j = journeys.find((x) => x.id === r.journey);
    return { journey: j?.title ?? r.journey, step: j?.steps.find((s) => s.id === r.step)?.title ?? r.step };
  };
  return (
    <section className="mb-6 rounded-2xl border border-rose-200 bg-rose-50/60 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-[14px]">What the testers found</h2>
        <span className="text-[11.5px] tabular-nums text-rose-900">{fails.length} reported, newest first</span>
      </div>
      <ul className="mt-2.5 space-y-2">
        {fails.map((r) => {
          const t = titleOf(r);
          return (
            <li key={r.id} className="text-[12.5px]">
              <button
                type="button"
                onClick={() => onOpen(`${r.journey}/${r.step}`)}
                className="text-left font-semibold underline-offset-2 hover:underline"
              >
                {t.step}
              </button>
              <span className="text-muted">
                {" "}
                · {t.journey} · {r.by}, {when(r.at)}
              </span>
              {r.note && <p className="text-rose-900">&ldquo;{r.note}&rdquo;</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Links({ links }: { links: KitLink[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1.5 pr-3 text-[12px] transition hover:border-ink/40"
        >
          <Who who={l.who} />
          {l.label}
        </a>
      ))}
    </div>
  );
}

export default function TestingPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [kits, setKits] = useState<KitRun[]>([]);
  const [fresh, setFresh] = useState<Record<string, KitRun>>({});
  const [scope, setScope] = useState<"core" | "all" | "files">("core");
  const [leftOnly, setLeftOnly] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [res, kitRes] = await Promise.all([
        fetch("/api/admin/testing", { cache: "no-store" }),
        fetch("/api/admin/testing/kit", { cache: "no-store" }),
      ]);
      const body = (await res.json()) as Payload;
      if (!body.ok) throw new Error(body.error ?? "Could not load.");
      setData(body);
      const k = (await kitRes.json().catch(() => ({}))) as { kits?: KitRun[] };
      setKits(k.kits ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    }
  }, []);

  useEffect(() => {
    void load();
    try {
      const s = new URLSearchParams(window.location.search).get("step");
      if (s) setOpen(s);
    } catch {
      /* fine */
    }
  }, [load]);

  const journeys = data?.journeys ?? JOURNEYS;
  const marks = useMemo(() => {
    const m = new Map<string, TestMark>();
    for (const mk of data?.marks ?? []) m.set(`${mk.journey}/${mk.step}`, mk);
    return m;
  }, [data?.marks]);

  /* Every occasion a step was walked, newest first, so a step can say "run
     three times" and show all three rather than only the survivor. */
  const runsByStep = useMemo(() => {
    const m = new Map<string, TestRun[]>();
    for (const r of data?.runs ?? []) {
      const key = `${r.journey}/${r.step}`;
      const held = m.get(key);
      if (held) held.push(r);
      else m.set(key, [r]);
    }
    return m;
  }, [data?.runs]);

  const rows: Row[] = useMemo(
    () => journeys.flatMap((j) => j.steps.map((s) => ({ journey: j, step: s, ...placeOf(j.id, s.id) }))),
    [journeys]
  );

  const latestKit = useMemo(() => {
    const m = new Map<KitId, KitRun>();
    for (const k of kits) if (!m.has(k.kit)) m.set(k.kit, k);
    return m;
  }, [kits]);

  const lightOf = (r: Row) => lightFor(r.step, marks.get(`${r.journey.id}/${r.step.id}`) ?? null);

  const mark = async (r: Row, result: "pass" | "fail" | "clear") => {
    const key = `${r.journey.id}/${r.step.id}`;
    setBusy(key);
    setError(null);
    try {
      const res = await fetch("/api/admin/testing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          result === "clear"
            ? { journey: r.journey.id, step: r.step.id, clear: true }
            : { journey: r.journey.id, step: r.step.id, result, note: note[key] ?? "" }
        ),
      });
      const body = (await res.json()) as Payload;
      if (!body.ok) throw new Error(body.error ?? "Could not save.");
      setData((d) => (d ? { ...d, marks: body.marks ?? d.marks, runs: body.runs ?? d.runs } : d));
      setNote((n) => ({ ...n, [key]: "" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  };

  const createKit = async (r: Row) => {
    if (!r.kit) return;
    const key = `${r.journey.id}/${r.step.id}`;
    setBusy(`kit:${key}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/testing/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kit: r.kit }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string; run?: KitRun; kits?: KitRun[] };
      if (!body.ok || !body.run) throw new Error(body.error ?? "The test could not be made.");
      setFresh((f) => ({ ...f, [key]: body.run! }));
      if (body.kits) setKits(body.kits);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The test could not be made.");
    } finally {
      setBusy(null);
    }
  };

  const relink = async (run: KitRun, key: string) => {
    setBusy(`relink:${run.id}`);
    setError(null);
    try {
      const res = await fetch("/api/admin/testing/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relink: run.id }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string; url?: string };
      if (!body.ok || !body.url) throw new Error(body.error ?? "No link could be made.");
      const link: KitLink = { who: "landlord", label: "Open the landlord portal as them", href: body.url };
      setFresh((f) => ({ ...f, [key]: { ...run, links: [...run.links.filter((l) => l.who !== "landlord"), link], said: "A fresh landlord portal link: it works once and lasts 24 hours. Open it in a private window." } }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No link could be made.");
    } finally {
      setBusy(null);
    }
  };

  const clearAll = async () => {
    if (!window.confirm("Delete every lead, appraisal, passport and PLC pack your tests made? Your Tested OK and Failed marks stay.")) return;
    setBusy("clear");
    setError(null);
    try {
      const res = await fetch("/api/admin/testing/kit", { method: "DELETE" });
      const body = (await res.json()) as { ok: boolean; error?: string };
      if (!body.ok) throw new Error(body.error ?? "Could not clear.");
      setKits([]);
      setFresh({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not clear.");
    } finally {
      setBusy(null);
    }
  };

  const areas = TEST_AREAS.filter((a) => scope === "all" || a.core);
  const inScope = rows.filter((r) => areas.some((a) => a.id === r.area));
  const total: Record<Light, number> = { green: 0, amber: 0, red: 0, grey: 0 };
  for (const r of inScope) total[lightOf(r).light] += 1;
  const tested = total.green;
  const testable = total.green + total.amber;

  return (
    <>
      <PageHeader
        illustration="/illustrations/people/checking-in.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="Testing"
        blurb="Go down the list. Where there is a Create a test button, press it: it makes a test record with your own email as the customer's, so every email comes to you. Open it, check it works and looks right, then mark it."
      />

      <div className="mb-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <div role="radiogroup" aria-label="Which tests" className="flex overflow-hidden rounded-lg border border-line/80">
          {(
            [
              ["core", "Core for launch"],
              ["all", "Everything"],
              ["files", "Test files"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={scope === id}
              onClick={() => setScope(id)}
              className={`border-l border-line/80 px-3 py-1.5 text-[12px] first:border-l-0 ${
                scope === id ? "bg-ink text-page" : "bg-white text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {scope !== "files" && (
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <input id="testing-left-only" type="checkbox" checked={leftOnly} onChange={(e) => setLeftOnly(e.target.checked)} />
          Only what is left to test
        </label>
        )}
        {scope !== "files" && (
        <span className="ml-auto flex items-center gap-4 text-[12px] text-muted">
          <span className="tabular-nums">
            {tested} of {testable} tested
          </span>
          <Dots counts={total} />
        </span>
        )}
      </div>

      {error && <p className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-900">{error}</p>}

      {scope === "files" ? (
        <TestFilesTab />
      ) : (
      <>
      {!data && !error && <p className="mb-4 text-[12.5px] text-muted">Reading the marks…</p>}

      <Found runs={data?.runs ?? []} journeys={journeys} onOpen={setOpen} />

      {kits.length > 0 && (
        <section className="mb-6 rounded-2xl border border-line/70 bg-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px]">Your Tests</h2>
              <p className="mt-0.5 text-[12px] text-muted">
                {kits.length} made and not cleared. They are yours alone, kept out of REX, and every email on them goes to you.
              </p>
            </div>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => void clearAll()}
              className="rounded-full border border-line px-3 py-1.5 text-[12px] transition hover:border-ink/40 disabled:opacity-50"
            >
              {busy === "clear" ? "Clearing…" : "Clear my tests"}
            </button>
          </div>
          <ul className="mt-3 divide-y divide-line/60">
            {kits.map((k) => (
              <li key={k.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-2.5">
                <span className="min-w-[180px] text-[12.5px]">
                  {KITS[k.kit].label.replace(/^Create an? /, "").replace(/^./, (c) => c.toUpperCase())}
                  <span className="ml-2 text-[11px] text-muted">{when(k.createdAt)}</span>
                </span>
                <Links links={k.links} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="space-y-7">
        {areas.map((area) => {
          const list = rows
            .filter((r) => r.area === area.id)
            .filter((r) => !leftOnly || (() => { const l = lightOf(r); return l.light === "amber" || l.stale; })());
          const counts: Record<Light, number> = { green: 0, amber: 0, red: 0, grey: 0 };
          for (const r of rows.filter((x) => x.area === area.id)) counts[lightOf(r).light] += 1;
          if (!list.length && leftOnly) return null;
          return (
            <section key={area.id}>
              <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-line/70 pb-1.5">
                <h2 className="text-[16px]">
                  {area.label}
                  {!area.core && <span className="ml-2 text-[10.5px] uppercase tracking-wider text-muted">After launch</span>}
                </h2>
                <Dots counts={counts} />
              </div>

              <ol className="space-y-1.5">
                {list.map((r) => {
                  const key = `${r.journey.id}/${r.step.id}`;
                  const mk = marks.get(key) ?? null;
                  const { light, stale } = lightFor(r.step, mk);
                  const sw = r.step.switchKey ? data?.switches?.[r.step.switchKey] : null;
                  const isOpen = open === key || open === r.step.id;
                  const kit = r.kit ? KITS[r.kit] : null;
                  const run = fresh[key] ?? (r.kit ? latestKit.get(r.kit) : undefined);
                  return (
                    <li key={key} className="rounded-2xl border border-line/60 bg-white">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() => setOpen(isOpen ? null : key)}
                        className="flex w-full items-start gap-3 px-4 py-2.5 text-left"
                      >
                        <span className={`mt-[6px] h-2.5 w-2.5 shrink-0 rounded-full ${LIGHT_DOT[light]}`} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13.5px] leading-snug">{r.step.title}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5">
                            {r.who.map((w) => (
                              <Who key={w} who={w} />
                            ))}
                            {kit && light !== "red" && light !== "grey" && (
                              <span className="text-[11px] text-muted">· has a test to create</span>
                            )}
                          </span>
                        </span>
                        <span className="shrink-0 text-right text-[11px] leading-snug text-muted">
                          <span className="block">{LIGHT_WORDS[light]}</span>
                          {mk && (
                            <span className={`block ${mk.result === "fail" ? "text-rose-700" : ""}`}>
                              {mk.result === "pass" ? "OK" : "Failed"} · {mk.by}, {when(mk.at)}
                            </span>
                          )}
                          {stale && <span className="block text-amber-700">Rebuilt since. Test it again.</span>}
                          {sw && <span className={`block ${sw.on ? "text-emerald-700" : ""}`}>Switch {sw.on ? "on" : "off"}</span>}
                        </span>
                      </button>

                      {isOpen && (
                        <div className="border-t border-line/60 px-4 py-3 text-[12.5px]">
                          <p className="mb-3 max-w-[70ch] text-muted">{r.step.what}</p>

                          {r.step.state === "blocked" && r.step.blocked && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-rose-900">
                              <p>Currently can&apos;t do this.</p>
                              <p className="mt-1">{r.step.blocked.why}</p>
                              <p className="mt-1">Needs: {r.step.blocked.who}</p>
                            </div>
                          )}
                          {r.step.state === "notbuilt" && (
                            <div className="rounded-xl border border-line bg-box px-3 py-2 text-muted">
                              <p className="text-ink">Not built yet.</p>
                              <p className="mt-1">{r.step.todo}</p>
                            </div>
                          )}

                          {r.step.state === "built" && (
                            <>
                              {kit && (
                                <div className="mb-4 rounded-xl border border-line/70 bg-box/60 p-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <button
                                      type="button"
                                      disabled={busy !== null}
                                      onClick={() => void createKit(r)}
                                      className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-page transition hover:opacity-90 disabled:opacity-50"
                                    >
                                      {busy === `kit:${key}` ? "Making it…" : run ? kit.label.replace(/^Create an? /, "Create another ") : kit.label}
                                    </button>
                                    <span className="max-w-[60ch] text-[12px] text-muted">{kit.makes}</span>
                                  </div>
                                  {run && (
                                    <div className="mt-3 space-y-2 border-t border-line/60 pt-3">
                                      <p className="text-[12px]">
                                        {fresh[key] ? run.said : `Your test from ${when(run.createdAt)}.`}
                                      </p>
                                      <Links links={run.links} />
                                      {run.canRelink && !run.links.some((l) => l.who === "landlord") && (
                                        <button
                                          type="button"
                                          disabled={busy !== null}
                                          onClick={() => void relink(run, key)}
                                          className="text-[12px] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-50"
                                        >
                                          {busy === `relink:${run.id}` ? "Making a link…" : "Get a landlord portal link"}
                                        </button>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}

                              {mk?.result === "fail" && mk.note && (
                                <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                                  Failed last time: {mk.note}
                                </p>
                              )}
                              <p className="text-[11px] uppercase tracking-wide text-muted">How to test it</p>
                              <ol className="mt-1.5 max-w-[75ch] list-decimal space-y-1 pl-5">
                                {r.step.how.map((h, k) => (
                                  <li key={k}>{h}</li>
                                ))}
                              </ol>
                              {r.step.notes && r.step.notes.length > 0 && (
                                <ul className="mt-3 max-w-[75ch] space-y-1 text-muted">
                                  {r.step.notes.map((n, k) => (
                                    <li key={k}>· {n}</li>
                                  ))}
                                </ul>
                              )}
                              <div className="mt-4 flex flex-wrap items-center gap-2">
                                {r.step.where && !r.step.where.includes("{") && (
                                  <a
                                    href={r.step.where}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="rounded-full border border-line px-3 py-1.5 text-[12px] transition hover:border-ink/40"
                                  >
                                    Open the screen
                                  </a>
                                )}
                                <input
                                  id={`testing-note-${key.replace(/\W+/g, "-")}`}
                                  value={note[key] ?? ""}
                                  onChange={(e) => setNote((n) => ({ ...n, [key]: e.target.value }))}
                                  placeholder="What you saw (needed for Failed)"
                                  className="min-w-0 flex-1 basis-[220px] rounded-full border border-line bg-white px-3 py-1.5 text-[12px] outline-none focus:border-ink"
                                />
                                <button
                                  type="button"
                                  disabled={busy === key}
                                  onClick={() => void mark(r, "pass")}
                                  className="rounded-full bg-emerald-600 px-3 py-1.5 text-[12px] text-white transition hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  Tested OK
                                </button>
                                <button
                                  type="button"
                                  disabled={busy === key}
                                  onClick={() => void mark(r, "fail")}
                                  className="rounded-full border border-rose-300 px-3 py-1.5 text-[12px] text-rose-700 transition hover:bg-rose-50 disabled:opacity-50"
                                >
                                  Failed
                                </button>
                                {mk && (
                                  <button
                                    type="button"
                                    disabled={busy === key}
                                    onClick={() => void mark(r, "clear")}
                                    className="text-[11.5px] text-muted underline-offset-2 hover:underline disabled:opacity-50"
                                  >
                                    Take back my mark
                                  </button>
                                )}
                              </div>

                              {/* Every time it was walked, not just the last. A step
                                  somebody fixed shows the failure it used to have. */}
                              <History runs={runsByStep.get(key) ?? []} />
                            </>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </div>
      </>
      )}
    </>
  );
}
