"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { HealthFinding, HealthKind, HealthReport } from "@/lib/book-health";

/**
 * The weekly book health check, in full (6 Oct 2026).
 *
 * The Monday email carries a handful per kind; this is every line. It reads
 * the last saved run, so it opens at once, and "Check now" runs it again -
 * about a minute and a half, because it asks REX about every postcode we
 * manage. Nothing on this page changes anything: each line is something a
 * person puts right in REX, REX PM or the certificate.
 */

type Answer = {
  ok: boolean;
  error?: string;
  report: HealthReport | null;
  labels: Record<HealthKind, { title: string; fix: string }>;
  order: HealthKind[];
};

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export default function BookHealth() {
  const [data, setData] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [open, setOpen] = useState<HealthKind | null>(null);

  const load = async (fresh = false) => {
    setError(null);
    if (fresh) setRunning(true);
    try {
      const res = await fetch(`/api/book-health/run${fresh ? "?fresh=1" : ""}`, { cache: "no-store" });
      const body = (await res.json()) as Answer;
      if (!res.ok || !body.ok) throw new Error(body.error ?? "Couldn't read the check.");
      setData(body);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);

  const report = data?.report ?? null;
  const by = (k: HealthKind): HealthFinding[] => report?.findings.filter((f) => f.kind === k) ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl tracking-normal text-ink">Book Health</h1>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        Every home REX PM manages, checked against REX and the certificates on file. It runs every Monday morning
        and emails the owners. Nothing here is changed automatically - each line is something to put right.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void load(true)}
          disabled={running}
          className="rounded-lg border border-ink bg-ink px-4 py-2 text-sm text-white transition hover:border-accent hover:bg-accent disabled:opacity-50 disabled:hover:border-ink disabled:hover:bg-ink"
        >
          {running ? "Checking every home…" : "Check now"}
        </button>
        <span className="text-xs text-muted">
          {running
            ? "About a minute and a half."
            : report
              ? `Last checked ${when(report.at)}, ${report.homesChecked} homes.`
              : data
                ? "Not run yet."
                : "Loading…"}
        </span>
      </div>

      {error && <p className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}

      {report && report.failed.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p>Not everything could be checked:</p>
          <ul className="mt-1 list-disc pl-5">
            {report.failed.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {!data && !error && (
        <div className="mt-8 flex items-center gap-3 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
          Reading the last check
        </div>
      )}

      {report && data && (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {data.order.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setOpen((o) => (o === k ? null : k))}
                aria-pressed={open === k}
                className={`rounded-xl border p-3 text-left transition ${
                  open === k ? "border-accent bg-accent-soft" : "border-line hover:bg-box"
                }`}
              >
                <span className={`figures block text-2xl ${by(k).length ? "text-ink" : "text-muted"}`}>{by(k).length}</span>
                <span className="mt-1 block text-xs text-muted">{data.labels[k].title}</span>
              </button>
            ))}
          </div>

          {report.findings.length === 0 && (
            <p className="mt-8 text-sm text-emerald-700">Nothing to put right. Every home checked out.</p>
          )}

          {data.order
            .filter((k) => (open ? k === open : true) && by(k).length > 0)
            .map((k) => (
              <section key={k} className="mt-8">
                <h2 className="text-lg tracking-normal text-ink">
                  {data.labels[k].title} <span className="figures text-sm text-muted">{by(k).length}</span>
                </h2>
                <p className="mt-1 text-sm text-muted">{data.labels[k].fix}</p>
                <ul className="mt-3 divide-y divide-neutral-100 rounded-xl border border-line">
                  {by(k).map((f) => (
                    <li key={f.key} className="px-4 py-3 text-sm">
                      {f.href ? (
                        <Link href={f.href} className="text-ink underline-offset-2 hover:underline">
                          {f.title}
                        </Link>
                      ) : (
                        <span className="text-ink">{f.title}</span>
                      )}
                      <p className="mt-0.5 text-xs text-muted">{f.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
        </>
      )}
    </div>
  );
}
