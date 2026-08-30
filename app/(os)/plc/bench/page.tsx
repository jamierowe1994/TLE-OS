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
  summary: { line: string; verdict: "pass" | "fail" | "review"; concerns: Reason[] };
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
      <p className="text-xs uppercase tracking-[0.18em] text-muted">Bench</p>
      <h1 className="mt-1 text-2xl tracking-normal text-ink">
        Try the Scan on a Real Document
      </h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The same prompt, model and rules the compliance team will see. Nothing here is stored: no
        file goes to the bucket, no handover is created, nothing reaches REX. The document is read
        out of the upload and gone when the answer comes back.
      </p>

      {available && !available.available && (
        <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
          The bench does not run on the live system. Use it locally or on a preview.
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
          Every date check is measured against the move-in date, not against today. Leave it blank
          and you are testing something the real scan never does.
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
            <span className="text-xs uppercase tracking-wide text-muted">Move-in date</span>
            <input
              type="date"
              value={moveIn}
              onChange={(e) => setMoveIn(e.target.value)}
              className="mt-1 w-full rounded-lg border border-line bg-transparent px-3 py-2 text-sm"
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
                disabled={row.state === "reading" || !available?.available || !available?.scanConfigured}
                className="rounded-lg border border-ink bg-ink px-3.5 py-1.5 text-sm text-page disabled:opacity-40"
              >
                {row.state === "reading" ? "Reading…" : row.state === "done" ? "Read it again" : "Read it"}
              </button>
            </div>

            {row.state === "failed" && (
              <p className="px-4 py-3 text-sm text-rose-700">{row.error}</p>
            )}

            {row.result && (
              <div>
                <p className="px-4 pt-3 text-xs text-muted">
                  Read against {row.result.asked.check} at {row.result.asked.address}, moving in{" "}
                  {row.result.asked.moveInDate ?? "— no date given"} · {(row.result.ms / 1000).toFixed(1)}s
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
                        row.result.verdict === "fail"
                          ? "bg-rose-500"
                          : row.result.verdict === "review"
                            ? "bg-amber-500"
                            : "bg-emerald-500"
                      }`}
                    />
                    <p className="text-sm text-ink">
                      {row.result.summary.line}
                    </p>
                  </div>

                  {row.result.summary.concerns.length > 0 && (
                    <ul className="mt-2 space-y-1 pl-4">
                      {row.result.summary.concerns.slice(1).map((r, i) => (
                        <li key={i} className="text-xs text-muted">
                          {r.rule} — {r.because}
                        </li>
                      ))}
                    </ul>
                  )}

                  <p className="mt-2 text-xs text-muted">
                    A recommendation from the rules. The decision is a person&apos;s.
                  </p>
                </div>

                {row.result.findings.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-muted">
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
                            <span className="ml-2 text-xs text-muted">{f.foundDate}</span>
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
        <p className="mt-6 text-xs text-muted">
          Nothing on this page has been saved. Close it and it is gone.
        </p>
      )}
    </div>
  );
}
