"use client";

import { useCallback, useEffect, useState } from "react";
import { TEST_FILE_SIDES, WHO_WORDS, type TestFileSide, type TestWho } from "@/lib/testing-journeys";

/**
 * Admin → Testing → Test files (James, 17 Sep 2026).
 *
 * "Add more test leads, reset them to certain areas, and test that function
 * over and over, trying different things to make sure we can't break it."
 *
 * Add a landlord, a tenant or a PLC pack. Each file can be put back to a
 * stage - the same person, with everything the flow did to them taken away,
 * including queued emails and diary entries - or deleted. Resetting never
 * sends an email. Owners also get Remove all testing and Ready for launch,
 * which clears every tester's files and stops new ones until reopened.
 */

interface FileLink {
  who: TestWho;
  label: string;
  href: string;
}

interface TestFile {
  id: string;
  side: TestFileSide;
  stage: string;
  stageLabel: string;
  name: string;
  byName: string;
  byEmail: string;
  createdAt: string;
  links: FileLink[];
  said: string;
  canRelink: boolean;
}

interface Payload {
  ok: boolean;
  error?: string;
  files?: TestFile[];
  closed?: { closed: boolean; at?: string; by?: string };
  owner?: boolean;
  me?: string;
}

const SIDE_TONE: Record<TestFileSide, string> = {
  landlord: "border-amber-200 bg-amber-50 text-amber-900",
  tenant: "border-sky-200 bg-sky-50 text-sky-900",
  plc: "border-violet-200 bg-violet-50 text-violet-900",
};

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function TestFilesTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [everyone, setEveryone] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [pick, setPick] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/admin/testing/files${everyone ? "?everyone=1" : ""}`, { cache: "no-store" });
      const j = (await r.json()) as Payload;
      if (!j.ok) throw new Error(j.error ?? "Could not load the test files.");
      setData(j);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the test files.");
    }
  }, [everyone]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(key: string, body: Record<string, unknown>, after?: (j: Record<string, unknown>) => void) {
    setBusy(key);
    setError(null);
    try {
      const r = await fetch("/api/admin/testing/files", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await r.json()) as Record<string, unknown> & { ok?: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "That didn't work.");
      after?.(j);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const files = data?.files ?? [];
  const closed = data?.closed?.closed ?? false;
  const pill = "rounded-full border border-line px-3 py-1.5 text-[12px] transition hover:border-ink/40 disabled:opacity-50";

  return (
    <div className="space-y-5">
      {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-[12.5px] text-rose-900">{error}</p>}

      {closed && (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <h2 className="text-[15px] text-emerald-900">Testing Is Closed for Launch</h2>
          <p className="mt-1 text-[12.5px] text-emerald-900">
            Every test file was removed{data?.closed?.by ? ` by ${data.closed.by}` : ""}
            {data?.closed?.at ? ` on ${when(data.closed.at)}` : ""}, and no new ones can be made.
          </p>
          {data?.owner && (
            <button type="button" disabled={busy !== null} onClick={() => void act("reopen", { action: "reopen" })} className={`${pill} mt-3 bg-white`}>
              {busy === "reopen" ? "Reopening…" : "Reopen testing"}
            </button>
          )}
        </section>
      )}

      {/* ── Add ── */}
      {!closed && (
        <section className="rounded-2xl border border-line/70 bg-card p-4">
          <h2 className="text-[15px]">Add a Test File</h2>
          <p className="mt-0.5 max-w-[75ch] text-[12px] text-muted">
            Each one uses your own email as the customer&apos;s, so every email in the flow comes to you. It is kept out of REX. Add as many as you
            like and walk them in different ways.
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
            {(Object.keys(TEST_FILE_SIDES) as TestFileSide[]).map((side) => (
              <button
                key={side}
                type="button"
                disabled={busy !== null}
                onClick={() => void act(`add:${side}`, { action: "add", side })}
                className="rounded-xl border border-line/70 bg-white p-3 text-left transition hover:border-ink/40 disabled:opacity-50"
              >
                <span className="block text-[13px] font-semibold">{busy === `add:${side}` ? "Adding…" : TEST_FILE_SIDES[side].add}</span>
                <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{TEST_FILE_SIDES[side].stages[0].says}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* ── The files ── */}
      <section>
        <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-line/70 pb-1.5">
          <h2 className="text-[16px]">
            {everyone ? "Everyone's Test Files" : "Your Test Files"}
            <span className="ml-2 text-[12px] tabular-nums text-muted">{data ? files.length : ""}</span>
          </h2>
          {data?.owner && (
            <label className="flex items-center gap-2 text-[12.5px] text-muted">
              <input type="checkbox" checked={everyone} onChange={(e) => setEveryone(e.target.checked)} />
              Show every tester&apos;s
            </label>
          )}
        </div>

        {!data && !error ? (
          <p className="flex items-center gap-2 py-6 text-[12.5px] text-muted">
            <span aria-hidden className="h-3 w-3 animate-spin rounded-full border-[1.5px] border-line border-t-ink" />
            Reading the test files…
          </p>
        ) : files.length === 0 ? (
          <p className="py-6 text-[12.5px] text-muted">{closed ? "No test files." : "No test files yet. Add one above."}</p>
        ) : (
          <ul className="space-y-2">
            {files.map((f) => {
              const stages = TEST_FILE_SIDES[f.side].stages;
              const chosen = pick[f.id] ?? stages[0].id;
              const target = stages.find((s) => s.id === chosen) ?? stages[0];
              const mine = f.byEmail === data?.me;
              return (
                <li key={f.id} className="rounded-2xl border border-line/60 bg-white p-4">
                  <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
                    <div className="min-w-[240px] flex-1">
                      <p className="flex flex-wrap items-center gap-2 text-[13.5px]">
                        <span className="font-semibold">{f.name}</span>
                        <span className={`whitespace-nowrap rounded-full border px-2 py-[1px] text-[10.5px] ${SIDE_TONE[f.side]}`}>{TEST_FILE_SIDES[f.side].label}</span>
                        <span className="whitespace-nowrap rounded-full bg-ink px-2 py-[1px] text-[10.5px] text-page">At: {f.stageLabel}</span>
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-muted">
                        {mine ? "Yours" : f.byName} · made {when(f.createdAt)}
                      </p>
                      <p className="mt-1.5 max-w-[80ch] text-[12px] text-muted">{done[f.id] ?? f.said}</p>
                    </div>
                    {!closed && (
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor={`stage-${f.id}`}>Reset to</label>
                        <select
                          id={`stage-${f.id}`}
                          value={chosen}
                          onChange={(e) => setPick((p) => ({ ...p, [f.id]: e.target.value }))}
                          className="rounded-full border border-line bg-white px-3 py-1.5 text-[12px]"
                        >
                          {stages.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          disabled={busy !== null}
                          title={target.says}
                          onClick={() => {
                            if (!window.confirm(`Reset ${f.name} to "${target.label}"?\n\n${target.says}\n\nEverything done on this file since is taken away, including queued emails and diary entries. Nothing is emailed.`)) return;
                            void act(`reset:${f.id}`, { action: "reset", id: f.id, stage: target.id }, () => setDone((d) => ({ ...d, [f.id]: `Reset to ${target.label}. ${target.says}` })));
                          }}
                          className="rounded-full bg-ink px-3.5 py-1.5 text-[12px] text-page transition hover:opacity-90 disabled:opacity-50"
                        >
                          {busy === `reset:${f.id}` ? "Resetting…" : "Reset"}
                        </button>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            if (!window.confirm(`Delete ${f.name}, and everything done on it?`)) return;
                            void act(`delete:${f.id}`, { action: "delete", id: f.id });
                          }}
                          className="px-1.5 text-[12px] text-muted underline-offset-2 hover:text-rose-700 hover:underline disabled:opacity-50"
                        >
                          {busy === `delete:${f.id}` ? "Deleting…" : "Delete"}
                        </button>
                      </div>
                    )}
                  </div>
                  {(f.links.length > 0 || (f.canRelink && mine)) && (
                    <div className="mt-3 flex flex-wrap gap-2 border-t border-line/50 pt-3">
                      {f.links.map((l) => (
                        <a
                          key={l.href}
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1.5 pr-3 text-[12px] transition hover:border-ink/40"
                        >
                          <span className="rounded-full border border-line/70 px-2 py-[1px] text-[10.5px] text-muted">{WHO_WORDS[l.who]}</span>
                          {l.label}
                        </a>
                      ))}
                      {f.canRelink && mine && (
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() =>
                            void act(`relink:${f.id}`, { action: "relink", id: f.id }, (j) => {
                              if (typeof j.url === "string") window.open(j.url, "_blank", "noreferrer");
                            })
                          }
                          className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1.5 pr-3 text-[12px] transition hover:border-ink/40 disabled:opacity-50"
                        >
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-[1px] text-[10.5px] text-amber-900">{f.side === "tenant" ? "Tenant" : "Landlord"}</span>
                          {busy === `relink:${f.id}` ? "Making a link…" : f.side === "tenant" ? "Open the tenant area as them" : "Open the landlord portal as them"}
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Launch ── */}
      {data?.owner && (
        <section className="rounded-2xl border border-line/70 bg-card p-4">
          <h2 className="text-[15px]">Launch</h2>
          <p className="mt-0.5 max-w-[75ch] text-[12px] text-muted">
            For every tester at once. Test files are deleted with everything done on them. What was tested, and what failed, stays on the Core for
            launch list.
          </p>
          <div className="mt-3 flex flex-wrap gap-2.5">
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (!window.confirm("Remove every tester's test files, and everything done on them? Testing stays open.")) return;
                void act("remove-all", { action: "remove-all" });
              }}
              className={`${pill} bg-white`}
            >
              {busy === "remove-all" ? "Removing…" : "Remove all testing"}
            </button>
            {!closed && (
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => {
                  if (!window.confirm("Ready for launch?\n\nEvery tester's test files are removed, and nobody can make new ones until an owner reopens testing.")) return;
                  void act("ready", { action: "ready" });
                }}
                className="rounded-full bg-emerald-700 px-3.5 py-1.5 text-[12px] text-white transition hover:opacity-90 disabled:opacity-50"
              >
                {busy === "ready" ? "Closing…" : "Ready for launch"}
              </button>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
