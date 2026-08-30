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
 */

type Reason = { verdict: "pass" | "fail" | "review"; rule: string; because: string };

type Result = {
  verdict: "pass" | "fail" | "review";
  reasons: Reason[];
  findings: Finding[];
  asked: { check: string; address: string; moveInDate: string | null };
  ms: number;
};

type Row = {
  id: string;
  name: string;
  checkId: CheckId;
  state: "waiting" | "reading" | "done" | "failed";
  result?: Result;
  error?: string;
};

const READABLE = PLC_CHECKS.filter((c) => c.scan !== "none");

export default function ScanBench() {
  const [available, setAvailable] = useState<{ available: boolean; scanConfigured: boolean } | null>(
    null
  );
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
        state: "waiting" as const,
      };
    });
    setRows((r) => [...r, ...next]);
  };

  const run = async (row: Row) => {
    const file = files.current.get(row.id);
    if (!file) return;
    setRows((r) => r.map((x) => (x.id === row.id ? { ...x, state: "reading" } : x)));
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("checkId", row.checkId);
      form.append("address", address);
      form.append("moveInDate", moveIn);
      const res = await fetch("/api/plc/bench", { method: "POST", body: form });
      const body = await res.json();
      if (!res.ok || !body.ok) throw new Error(body.error ?? `Failed (${res.status}).`);
      setRows((r) =>
        r.map((x) => (x.id === row.id ? { ...x, state: "done", result: body as Result } : x))
      );
    } catch (e) {
      setRows((r) =>
        r.map((x) => (x.id === row.id ? { ...x, state: "failed", error: (e as Error).message } : x))
      );
    }
  };

  const dot = { blocker: "bg-rose-500", query: "bg-amber-500", ok: "bg-emerald-500" };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <p className="text-xs uppercase tracking-[0.18em] text-neutral-500">Bench</p>
      <h1 className="mt-1 text-2xl tracking-normal text-neutral-900 dark:text-neutral-100">
        Try the Scan on a Real Document
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-neutral-500">
        The same prompt, model and rules the compliance team will see. Nothing here is stored: no
        file goes to the bucket, no handover is created, nothing reaches REX. The document is read
        out of the upload and gone when the answer comes back.
      </p>

      {available && !available.available && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200">
          The bench does not run on the live system. Use it locally or on a preview.
        </p>
      )}
      {available && available.available && !available.scanConfigured && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
          ANTHROPIC_API_KEY is not set here, so there is nothing to test yet.
        </p>
      )}

      <section className="mt-6 rounded-xl border border-neutral-200 p-4 dark:border-neutral-800">
        <h2 className="text-base tracking-normal">What the Scan Is Told</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Every date check is measured against the move-in date, not against today. Leave it blank
          and you are testing something the real scan never does.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Property address
            </span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="As it should read on the certificate"
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wide text-neutral-500">Move-in date</span>
            <input
              type="date"
              value={moveIn}
              onChange={(e) => setMoveIn(e.target.value)}
              className="mt-1 w-full rounded-lg border border-neutral-300 bg-transparent px-3 py-2 text-sm dark:border-neutral-700"
            />
          </label>
        </div>
      </section>

      <div
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          add(Array.from(e.dataTransfer.files ?? []));
        }}
        className="mt-6 flex min-h-[10rem] cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-neutral-300 px-6 py-8 text-center transition hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-900"
      >
        <p className="text-base text-neutral-900 dark:text-neutral-100">Drop a certificate here</p>
        <p className="mt-1 text-sm text-neutral-500">
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
          <li key={row.id} className="rounded-xl border border-neutral-200 dark:border-neutral-800">
            <div className="flex flex-wrap items-center gap-3 border-b border-neutral-100 px-4 py-3 dark:border-neutral-900">
              <span className="min-w-0 flex-1 truncate text-sm">{row.name}</span>
              <select
                value={row.checkId}
                disabled={row.state === "reading"}
                onChange={(e) =>
                  setRows((r) =>
                    r.map((x) =>
                      x.id === row.id ? { ...x, checkId: e.target.value as CheckId } : x
                    )
                  )
                }
                className="rounded-lg border border-neutral-300 bg-transparent px-2 py-1 text-sm dark:border-neutral-700"
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
                disabled={row.state === "reading" || !available?.available || !available?.scanConfigured}
                className="rounded-lg border border-neutral-900 bg-neutral-900 px-3.5 py-1.5 text-sm text-white disabled:opacity-40 dark:border-white dark:bg-white dark:text-neutral-900"
              >
                {row.state === "reading" ? "Reading…" : row.state === "done" ? "Read it again" : "Read it"}
              </button>
            </div>

            {row.state === "failed" && (
              <p className="px-4 py-3 text-sm text-rose-700 dark:text-rose-300">{row.error}</p>
            )}

            {row.result && (
              <div>
                <p className="px-4 pt-3 text-xs text-neutral-500">
                  Read against {row.result.asked.check} at {row.result.asked.address}, moving in{" "}
                  {row.result.asked.moveInDate ?? "— no date given"} · {(row.result.ms / 1000).toFixed(1)}s
                </p>
                {/* The recommendation, and every rule that produced it. The
                    wording is deliberately not "PASS" on its own - a rule
                    result is a recommendation and the screen has to keep
                    saying so, because nothing in the product lets it decide. */}
                <div className="mx-4 mt-2 rounded-lg border border-neutral-200 p-3 dark:border-neutral-800">
                  <p className="text-sm">
                    <span
                      className={`mr-2 rounded px-2 py-0.5 text-xs uppercase tracking-wide ${
                        row.result.verdict === "fail"
                          ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200"
                          : row.result.verdict === "review"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                            : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                      }`}
                    >
                      {row.result.verdict === "fail"
                        ? "Would fail"
                        : row.result.verdict === "review"
                          ? "Needs a person"
                          : "Rules passed"}
                    </span>
                    <span className="text-neutral-500">
                      {row.result.verdict === "pass"
                        ? "Every rule passed. Still a recommendation, not a decision."
                        : "Decided by the rules, not by the model."}
                    </span>
                  </p>
                  <ul className="mt-2 space-y-1">
                    {row.result.reasons.map((r, i) => (
                      <li key={i} className="flex gap-2 text-xs">
                        <span
                          className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${
                            r.verdict === "fail"
                              ? "bg-rose-500"
                              : r.verdict === "review"
                                ? "bg-amber-500"
                                : "bg-emerald-500"
                          }`}
                        />
                        <span>
                          <span className="text-neutral-900 dark:text-neutral-100">{r.rule}</span>
                          <span className="text-neutral-500"> — {r.because}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                {row.result.findings.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-neutral-500">
                    It reported nothing. That is not a pass, it is an empty answer, and worth a look
                    at the document.
                  </p>
                ) : (
                  <ul className="px-4 py-2">
                    {row.result.findings.map((f, i) => (
                      <li key={i} className="flex gap-3 py-1.5">
                        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${dot[f.level]}`} />
                        <span className="text-sm">
                          {f.message}
                          {f.foundDate && (
                            <span className="ml-2 text-xs text-neutral-400">{f.foundDate}</span>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {rows.length > 0 && (
        <p className="mt-6 text-xs text-neutral-500">
          Nothing on this page has been saved. Close it and it is gone.
        </p>
      )}
    </div>
  );
}
