"use client";

import { useEffect, useRef, useState } from "react";
import { PLC_CHECKS, type CheckId, type Finding } from "@/lib/plc";

/**
 * The scan bench.
 *
 * Drop a real certificate in, see exactly what compliance would see. Nothing
 * is stored, no case is created, nothing reaches REX - see the route for what
 * that guarantee is worth and where its one unavoidable edge is.
 *
 * The move-in date is asked for and shown back, because every date check is
 * "in date ON the move-in date" and a run without one silently answers a
 * different question from the real scan. Testing against today by accident and
 * concluding the scan works would be worse than not testing at all.
 *
 * Models to compare (20 Oct 2026): tick two or three and each document is
 * read by each of them, side by side, with what each read cost. How the PLC
 * check came to be on the model it is on - see docs/AI-MODELS.md.
 */

type Reason = {
  verdict: "pass" | "fail" | "review";
  rule: string;
  because: string;
};

type Result = {
  verdict: "pass" | "fail" | "review";
  summary: {
    line: string;
    verdict: "pass" | "fail" | "review";
    concerns: Reason[];
  };
  reasons: Reason[];
  findings: Finding[];
  asked: { check: string; address: string; moveInDate: string | null };
  ms: number;
  model: string;
  effort: string;
  cost: number | null;
};

type Choice = { key: string; model: string; effort: string; label: string };

/* Haiku twice: at medium it put an out-of-date CO alarm in a note rather
   than in the defects, at high it did not (20 Oct 2026 comparison). */
const CHOICES: Choice[] = [
  {
    key: "haiku-medium",
    model: "claude-haiku-5-5",
    effort: "medium",
    label: "Haiku 5.5",
  },
  {
    key: "haiku-high",
    model: "claude-haiku-5-5",
    effort: "high",
    label: "Haiku 5.5, high effort",
  },
  {
    key: "sonnet-medium",
    model: "claude-sonnet-5-5",
    effort: "medium",
    label: "Sonnet 5.5",
  },
  {
    key: "opus-medium",
    model: "claude-opus-5-5",
    effort: "medium",
    label: "Opus 5.5",
  },
];

const NAMES: Record<string, string> = {
  "claude-haiku-5-5": "Haiku 5.5",
  "claude-sonnet-5-5": "Sonnet 5.5",
  "claude-opus-5-5": "Opus 5.5",
};

type Run = {
  key: string;
  label: string;
  model: string | null;
  effort: string | null;
  state: "reading" | "done" | "failed";
  result?: Result;
  error?: string;
};

type Row = {
  id: string;
  name: string;
  checkId: CheckId;
  runs: Run[];
};

const COLS: Record<number, string> = {
  2: "lg:grid-cols-2",
  3: "lg:grid-cols-3",
  4: "lg:grid-cols-4",
};

const READABLE = PLC_CHECKS.filter((c) => c.scan !== "none");

export default function ScanBench() {
  const [available, setAvailable] = useState<{
    available: boolean;
    scanConfigured: boolean;
    live?: { model: string; effort: string };
  } | null>(null);
  const [compare, setCompare] = useState<string[]>([]);
  const [address, setAddress] = useState("");
  const [moveIn, setMoveIn] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const files = useRef<Map<string, File>>(new Map());
  const input = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch("/api/plc/bench")
      .then((r) => r.json())
      .then(setAvailable)
      .catch(() => setAvailable({ available: false, scanConfigured: false }));
  }, []);

  const add = (chosen: File[]) => {
    const next = chosen.map((f, i) => {
      const id = `${f.name}-${Date.now()}-${i}`;
      files.current.set(id, f);
      return {
        id,
        name: f.name,
        /* Not guessed from the filename here, on purpose. The bench is for
           finding out whether the model reads a document correctly, and
           starting from a guess about what it is muddles two questions. */
        checkId: "gas-safety" as CheckId,
        runs: [] as Run[],
      };
    });
    setRows((r) => [...r, ...next]);
  };

  const run = async (row: Row) => {
    const file = files.current.get(row.id);
    if (!file) return;
    const live = available?.live;
    const asked: Run[] = (
      compare.length ? CHOICES.filter((c) => compare.includes(c.key)) : [null]
    ).map((c) => ({
      key: c?.key ?? "live",
      label:
        c?.label ??
        (live
          ? `${NAMES[live.model] ?? live.model} (what the PLC check uses)`
          : "What the PLC check uses"),
      model: c?.model ?? null,
      effort: c?.effort ?? null,
      state: "reading",
    }));
    const set = (key: string, patch: Partial<Run>) =>
      setRows((r) =>
        r.map((x) =>
          x.id === row.id
            ? {
                ...x,
                runs: x.runs.map((u) =>
                  u.key === key ? { ...u, ...patch } : u,
                ),
              }
            : x,
        ),
      );
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, runs: asked } : x)));
    await Promise.all(
      asked.map(async (u) => {
        try {
          const form = new FormData();
          form.append("file", file);
          form.append("checkId", row.checkId);
          form.append("address", address);
          form.append("moveInDate", moveIn);
          if (u.model) form.append("model", u.model);
          if (u.effort) form.append("effort", u.effort);
          const res = await fetch("/api/plc/bench", {
            method: "POST",
            body: form,
          });
          const body = await res.json();
          if (!res.ok || !body.ok)
            throw new Error(body.error ?? `Failed (${res.status}).`);
          set(u.key, { state: "done", result: body as Result });
        } catch (e) {
          set(u.key, { state: "failed", error: (e as Error).message });
        }
      }),
    );
  };

  const dot = {
    blocker: "bg-rose-500",
    query: "bg-amber-500",
    ok: "bg-emerald-500",
  };

  return (
    <div
      className={`mx-auto px-4 py-8 sm:px-6 ${compare.length > 1 ? "max-w-6xl" : "max-w-3xl"}`}
    >
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Bench</p>
      <h1 className="mt-1 text-2xl tracking-normal text-ink">
        Try the Scan on a Real Document
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The same prompt, model and rules the compliance team will see. Nothing
        here is stored: no file goes to the bucket, no handover is created,
        nothing reaches REX. The document is read out of the upload and gone
        when the answer comes back.
      </p>

      {available && !available.available && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          The bench does not run on the live system. Use it locally or on a
          preview.
        </p>
      )}
      {available && available.available && !available.scanConfigured && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          ANTHROPIC_API_KEY is not set here, so there is nothing to test yet.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-line p-4">
        <h2 className="text-base tracking-normal">What the Scan Is Told</h2>
        <p className="mt-1 text-sm text-muted">
          Every date check is measured against the move-in date, not against
          today. Leave it blank and you are testing something the real scan
          never does.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">
              Property address
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="As it should read on the certificate"
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-muted">
              Move-in date
            </span>
            <input
              type="date"
              value={moveIn}
              onChange={(e) => setMoveIn(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
            />
          </label>
        </div>
      </section>

      <section className="mt-4 rounded-xl border border-line p-4">
        <h2 className="text-base tracking-normal">Models to Compare</h2>
        <p className="mt-1 text-sm text-muted">
          Leave them all unticked to read with what the PLC check uses
          {available?.live
            ? ` now (${NAMES[available.live.model] ?? available.live.model}, ${available.live.effort} effort)`
            : ""}
          . Tick two or more to read each document with each of them, side by
          side.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
          {CHOICES.map((c) => (
            <label key={c.key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={compare.includes(c.key)}
                onChange={(e) =>
                  setCompare((k) =>
                    e.target.checked
                      ? [...k, c.key]
                      : k.filter((x) => x !== c.key),
                  )
                }
              />
              {c.label}
            </label>
          ))}
        </div>
      </section>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) =>
          (e.key === "Enter" || e.key === " ") && input.current?.click()
        }
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(Array.from(e.dataTransfer.files ?? []));
        }}
        className="mt-6 flex min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line px-6 py-8 text-center transition hover:bg-box"
      >
        <p className="text-base text-ink">Drop a certificate here</p>
        <p className="mt-1 text-sm text-muted">
          PDF or a photograph. Try a good one and a wrong one.
        </p>
        <input
          ref={input}
          type="file"
          multiple
          accept="application/pdf,image/*"
          className="hidden"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      </div>

      <ul className="mt-6 space-y-4">
        {rows.map((row) => (
          <li key={row.id} className="rounded-xl border border-line">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
              <span className="min-w-0 flex-1 truncate text-sm">
                {row.name}
              </span>
              <select
                value={row.checkId}
                disabled={row.runs.some((u) => u.state === "reading")}
                onChange={(e) =>
                  setRows((r) =>
                    r.map((x) =>
                      x.id === row.id
                        ? { ...x, checkId: e.target.value as CheckId }
                        : x,
                    ),
                  )
                }
                className="rounded-lg border border-line bg-transparent px-2 py-1 text-sm"
              >
                {READABLE.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => run(row)}
                disabled={
                  row.runs.some((u) => u.state === "reading") ||
                  !available?.available ||
                  !available?.scanConfigured
                }
                className="rounded-lg border border-ink bg-ink px-3.5 py-1.5 text-sm text-page disabled:opacity-40"
              >
                {row.runs.some((u) => u.state === "reading")
                  ? "Reading…"
                  : row.runs.length
                    ? "Read it again"
                    : "Read it"}
              </button>
            </div>

            <div
              className={`grid ${COLS[row.runs.length] ?? ""} ${row.runs.length > 1 ? "divide-y divide-line lg:divide-x lg:divide-y-0" : ""}`}
            >
              {row.runs.map((u) => (
                <div key={u.key} className="min-w-0 pb-2">
                  {row.runs.length > 1 && (
                    <p className="px-4 pt-3 text-sm text-ink">
                      {u.label}
                      {u.result && (
                        <span className="ml-2 text-xs text-muted">
                          {(u.result.ms / 1000).toFixed(1)}s
                          {u.result.cost != null
                            ? ` · $${u.result.cost.toFixed(3)}`
                            : ""}
                        </span>
                      )}
                    </p>
                  )}
                  {u.state === "reading" && (
                    <p className="flex items-center gap-2 px-4 py-3 text-sm text-muted">
                      <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-ink" />
                      Reading
                    </p>
                  )}
                  {u.state === "failed" && (
                    <p className="px-4 py-3 text-sm text-rose-700">{u.error}</p>
                  )}

                  {u.result && (
                    <div>
                      <p className="px-4 pt-3 text-xs text-muted">
                        Read against {u.result.asked.check} at{" "}
                        {u.result.asked.address}, moving in{" "}
                        {u.result.asked.moveInDate ?? "— no date given"} ·{" "}
                        {(u.result.ms / 1000).toFixed(1)}s
                      </p>
                      {/* ── The recommendation ──────────────────────────────────

                    One line, in the words somebody would use, then only the
                    things worth raising. Never the word "passed": the scan is
                    recommending, and the person reading is about to put their
                    name to a legal judgement. "Passed" invites them to agree;
                    "looks fine" invites them to check. */}
                      <div className="mx-4 mt-2 rounded-lg border border-line p-3">
                        <div className="flex items-start gap-2">
                          <span
                            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                              u.result.verdict === "fail"
                                ? "bg-rose-500"
                                : u.result.verdict === "review"
                                  ? "bg-amber-500"
                                  : "bg-emerald-500"
                            }`}
                          />
                          <p className="text-sm text-ink">
                            {u.result.summary.line}
                          </p>
                        </div>

                        {u.result.summary.concerns.length > 0 && (
                          <ul className="mt-2 space-y-1 pl-4">
                            {u.result.summary.concerns.slice(1).map((r, i) => (
                              <li key={i} className="text-xs text-muted">
                                {r.rule} — {r.because}
                              </li>
                            ))}
                          </ul>
                        )}

                        <p className="mt-2 text-xs text-muted">
                          A recommendation from the rules. The decision is a
                          person&apos;s.
                        </p>
                      </div>

                      {u.result.findings.length === 0 ? (
                        <p className="px-4 py-3 text-sm text-muted">
                          It reported nothing. That is not a pass, it is an
                          empty answer, and worth a look at the document.
                        </p>
                      ) : (
                        <ul className="px-4 py-2">
                          {u.result.findings.map((f, i) => (
                            <li key={i} className="flex gap-3 py-1.5">
                              <span
                                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[f.level]}`}
                              />
                              <span className="text-sm">
                                {f.message}
                                {f.foundDate && (
                                  <span className="ml-2 text-xs text-muted">
                                    {f.foundDate}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>

      {rows.length > 0 && (
        <p className="mt-6 text-xs text-muted">
          Nothing on this page has been saved. Close it and it is gone.
        </p>
      )}
    </div>
  );
}
