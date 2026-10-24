"use client";

import Link from "next/link";
import { Badge } from "@/components/new-look/Parts";
import { NlLoading } from "@/components/new-look/admin/ScreenBits";
import { AUDIT_KIND, when, type AdminData } from "@/lib/admin-client";

/**
 * Usage > Activity in the new look (lib/new-look "admin", 24 Oct 2026): the
 * audit trail. Who's been reading the book, and who did what.
 *
 * Each figure lives in one place (James, 24 Oct 2026). How much each person
 * uses the OS is Tracking's, so this links there instead of counting it
 * again; the emails that went out are Emails > Sent now.
 */

export type Reader = {
  userId: string;
  name: string;
  email: string;
  locked: boolean;
  openedHour: number;
  openedDay: number;
  callsDay: number;
  afterHours: number;
  lastAt: string;
  flags: string[];
  pausedAt: string | null;
};

const n = (v: number) => v.toLocaleString("en-GB");

export default function ActivityNew({ d, readers, readersErr }: { d: AdminData; readers: Reader[] | null; readersErr: string | null }) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm nl-adm-p-tab">
      <p className="nl-adm-lead">
        The audit trail: who&apos;s been reading the book, and who did what. How much each person uses the OS is on{" "}
        <Link href="/admin/tracking" className="nl-link">
          Tracking
        </Link>
        , and every email that went out is on{" "}
        <Link href="/admin/emails/sent" className="nl-link">
          Emails, Sent
        </Link>
        .
      </p>

      {/* Who has been reading how much (lib/read-log, 10 Oct 2026): the screen
          that shows somebody copying the book. Most first. */}
      <section className="nl-adm-block is-first">
        <div className="nl-adm-block-head">
          <div>
            <h2 className="nl-section-title">Who&apos;s Been Reading</h2>
            <p className="nl-meta nl-adm-measure">
              The last 24 hours, most first. Records opened are the different records and pages somebody asked for, not every call. Anybody well above the rest is flagged; open their file to see exactly what they opened, and to lock them out.
            </p>
          </div>
        </div>
        {readersErr ? (
          <p className="nl-adm-flash is-bad is-first" role="alert">
            {readersErr}
          </p>
        ) : !readers ? (
          <NlLoading what="Reading the log" />
        ) : readers.length === 0 ? (
          <p className="nl-empty">Nobody has opened anything in the last 24 hours.</p>
        ) : (
          <div className="nl-adm-tablewrap">
            <table className="nl-adm-table min-w-[560px]">
              <thead>
                <tr>
                  <th>Person</th>
                  <th className="is-num">Records, last hour</th>
                  <th className="is-num">Records, 24 hours</th>
                  <th className="is-num">10pm-6am</th>
                  <th className="is-num">Last</th>
                </tr>
              </thead>
              <tbody>
                {readers.map((r) => (
                  <tr key={r.userId} className={r.flags.length || r.pausedAt ? "is-hot" : undefined}>
                    <td>
                      <Link href={`/admin/people/${r.userId}`} className="nl-link">
                        {r.name}
                      </Link>
                      {r.locked && (
                        <>
                          {" "}
                          <Badge tone="accent" bare>Locked out</Badge>
                        </>
                      )}
                      {r.pausedAt && (
                        <>
                          {" "}
                          <Badge tone="warning" bare>Paused {when(r.pausedAt)}</Badge>
                        </>
                      )}
                      {r.flags.length > 0 && <span className="nl-meta nl-adm-bad">{r.flags.join(", ")}</span>}
                    </td>
                    <td className="is-num">{n(r.openedHour)}</td>
                    <td className="is-num">{n(r.openedDay)}</td>
                    <td className="is-num">{n(r.afterHours)}</td>
                    <td className="is-end nl-adm-muted">{when(r.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <h2 className="nl-section-title">
            Who Did What {d.audit.length > 0 && <span className="nl-count">{d.audit.length}</span>}
          </h2>
        </div>
        {d.audit.length === 0 ? (
          <p className="nl-empty">Nothing recorded yet. The log was created today, so it starts from here.</p>
        ) : (
          <ul className="nl-adm-log">
            {d.audit.map((a) => (
              <li key={a.id}>
                <span aria-hidden className={`nl-adm-dot${a.kind === "sign_in_failed" ? " is-hot" : ""}`} />
                <span className="min-w-0 flex-1">
                  <span className="nl-adm-muted">{AUDIT_KIND[a.kind] ?? a.kind.replace(/_/g, " ")}</span> {a.actorEmail || "(unknown)"}
                  {a.subjectEmail ? <span className="nl-adm-muted"> to {a.subjectEmail}</span> : null}
                  {a.detail ? <span className="nl-adm-muted"> · {a.detail}</span> : null}
                </span>
                <span className="nl-mono">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
