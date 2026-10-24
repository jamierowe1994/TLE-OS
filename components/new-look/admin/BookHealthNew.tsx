"use client";

import Link from "next/link";
import type { HealthFinding, HealthKind, HealthReport } from "@/lib/book-health";
import { ErrorLine, Loading, Section, Spin, Tab, nd, when } from "@/components/new-look/admin/bits";

/**
 * Admin > Issues > Book health in the new look (24 Oct 2026). The last saved
 * run, every line of it, and Check Now to run it again - the page's own load
 * (app/(os)/admin/book-health). Reports only: nothing here changes anything.
 */

export type BookAnswer = {
  ok: boolean;
  error?: string;
  report: HealthReport | null;
  labels: Record<HealthKind, { title: string; fix: string }>;
  order: HealthKind[];
};

export default function BookHealthNew({
  data,
  error,
  running,
  open,
  setOpen,
  load,
}: {
  data: BookAnswer | null;
  error: string | null;
  running: boolean;
  open: HealthKind | null;
  setOpen: (fn: (o: HealthKind | null) => HealthKind | null) => void;
  load: (fresh?: boolean) => Promise<void>;
}) {
  const report = data?.report ?? null;
  const by = (k: HealthKind): HealthFinding[] => report?.findings.filter((f) => f.kind === k) ?? [];

  return (
    <Tab>
      <p className="nl-meta nl-adm-lede">Every home REX PM manages, checked against REX and the certificates on file. It runs every Monday morning and emails the owners. Nothing here is changed automatically: each line is something to put right.</p>

      <div className="nl-adm-bar">
        <button type="button" onClick={() => void load(true)} disabled={running} className="nl-btn nl-btn--primary nl-btn--sm">
          {running ? "Checking every home…" : "Check Now"}
        </button>
        <span className="nl-meta">
          {running ? (
            <>
              <Spin /> About a minute and a half.
            </>
          ) : report ? (
            `Last checked ${when(report.at, { weekday: "long", month: "long" })}, ${report.homesChecked} homes.`
          ) : data ? (
            "Not run yet."
          ) : null}
        </span>
      </div>

      {error && <ErrorLine onRetry={() => void load()}>{nd(error)}</ErrorLine>}

      {report && report.failed.length > 0 && (
        <div className="nl-adm-panel is-warn nl-adm-gapb">
          <p className="nl-strong">Not everything could be checked</p>
          {report.failed.map((f) => (
            <p key={f}>{nd(f)}</p>
          ))}
        </div>
      )}

      {!data && !error && <Loading what="Reading the last check…" />}

      {report && data && (
        <>
          <ul className="nl-adm-figs" aria-label="What the check found">
            {data.order.map((k) => (
              <li key={k}>
                <button type="button" aria-pressed={open === k} onClick={() => setOpen((o) => (o === k ? null : k))}>
                  <b className={by(k).length ? undefined : "is-quiet"}>{by(k).length}</b>
                  <span>{data.labels[k].title}</span>
                </button>
              </li>
            ))}
          </ul>

          {report.findings.length === 0 && <p className="nl-empty">Nothing to put right. Every home checked out.</p>}

          {data.order
            .filter((k) => (open ? k === open : true) && by(k).length > 0)
            .map((k) => (
              <Section key={k} title={<>{data.labels[k].title} <span className="nl-count">{by(k).length}</span></>}>
                <p className="nl-meta">{nd(data.labels[k].fix)}</p>
                <ul className="nl-adm-rows">
                  {by(k).map((f) => (
                    <li key={f.key}>
                      <div className="nl-adm-row-main">
                        {f.href ? (
                          <Link href={f.href} className="nl-link">
                            {f.title}
                          </Link>
                        ) : (
                          <span className="nl-strong">{f.title}</span>
                        )}
                        <p className="nl-meta">{nd(f.detail)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </Section>
            ))}
        </>
      )}
    </Tab>
  );
}
