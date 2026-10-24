"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import AdminLoadFailed from "@/components/AdminLoadFailed";
import { useAdmin, when, AUDIT_KIND } from "@/lib/admin-client";
import { SentEmailDrawerOld, SentEmailsOld, useSentEmails } from "@/components/admin/SentEmails";
import { useNewLook } from "@/lib/use-new-look";
import ActivityNew, { type Reader } from "@/components/new-look/admin/ActivityNew";
import { LookLoading, NlLoading } from "@/components/new-look/admin/ScreenBits";

/**
 * Sign-ins, failed sign-ins, resets, every view-as — and every email that left.
 *
 * ── Why the emails are here rather than in the catalogue ──────────────────
 *
 * James, 29 Aug: "I should be able to click on the email to Francesca and be
 * able to click it to open it to see if it's actually what's been sent."
 *
 * Admin → Emails answers a different question. It shows what a template looks
 * like NOW, rendered from today's code. This shows what a named person
 * actually received on a particular afternoon, which is the only version worth
 * anything when somebody says the invite looked wrong. The two would agree
 * today and disagree by Friday.
 *
 * In the new look (24 Oct 2026) the emails are Emails > Sent instead, and
 * this page keeps to the audit trail (components/new-look/admin/ActivityNew).
 * Both read through components/admin/SentEmails.
 */

export default function AdminActivity() {
  const { d, denied, failed, load } = useAdmin();
  /* The new look (lib/new-look "admin", 24 Oct 2026). Null until known. In
     it the emails sent are Emails > Sent, so only the old look reads them here. */
  const look = useNewLook("admin");
  /* Who has been reading how much (lib/read-log). null while loading. */
  const [readers, setReaders] = useState<Reader[] | null>(null);
  const [readersErr, setReadersErr] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/reading", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; readers?: Reader[]; error?: string }) => {
        if (!j.ok || !j.readers) throw new Error(j.error ?? "We couldn't read the log just now.");
        setReaders(j.readers);
      })
      .catch((e) => setReadersErr(e instanceof Error ? e.message : "We couldn't read the log just now."));
  }, []);

  const sent = useSentEmails(look === false);

  if (denied)
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  if (failed) return <AdminLoadFailed onRetry={load} />;
  if (look === null) return <LookLoading what="Reading the log" />;
  if (look) {
    if (!d) {
      return (
        <div data-look="new" className="nl-page nl-adm nl-adm-tab">
          <NlLoading what="Reading the log" />
        </div>
      );
    }
    return <ActivityNew d={d} readers={readers} readersErr={readersErr} />;
  }
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  return (
    <>
      <PageHeader illustration="/illustrations/people/taking-notes.svg" illustrationAspect={1.0} lineBreak="none"
        title="Activity"
        blurb="Who's been reading how much, who's signed in, who couldn't, every view-as, and every email that went out."
      />

      {/* Who has been reading how much (lib/read-log, 10 Oct 2026): the
          screen that shows somebody copying the book. Most first. */}
      <section className="fade-up mt-8 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Who&apos;s been reading</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          The last 24 hours, most first. &ldquo;Opened&rdquo; is the different records and pages
          somebody asked for, not every call. Anybody well above the rest is flagged; open their
          file to see exactly what they opened, and to lock them out.
        </p>
        {readersErr ? (
          <p className="mt-3 text-[12.5px] text-accent-dark">{readersErr}</p>
        ) : !readers ? (
          <p className="mt-3 text-[12.5px] text-muted">Reading the log…</p>
        ) : readers.length === 0 ? (
          <p className="mt-3 text-[12.5px] text-muted">Nobody has opened anything in the last 24 hours.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[12px]">
              <thead>
                <tr className="border-b border-line/60 text-[10.5px] uppercase tracking-[0.12em] text-muted">
                  <th className="py-2 pr-3 font-semibold">Person</th>
                  <th className="py-2 pr-3 text-right font-semibold">Last hour</th>
                  <th className="py-2 pr-3 text-right font-semibold">24 hours</th>
                  <th className="py-2 pr-3 text-right font-semibold">10pm-6am</th>
                  <th className="py-2 text-right font-semibold">Last</th>
                </tr>
              </thead>
              <tbody>
                {readers.map((r) => (
                  <tr key={r.userId} className={`border-b border-line/40 last:border-0 ${r.flags.length || r.pausedAt ? "bg-accent-soft/40" : ""}`}>
                    <td className="py-2 pr-3">
                      <Link href={`/admin/people/${r.userId}`} className="underline decoration-line hover:decoration-ink">
                        {r.name}
                      </Link>
                      {r.locked && <span className="ml-1.5 text-accent-dark">locked out</span>}
                      {r.pausedAt && <span className="ml-1.5 text-accent-dark">paused {when(r.pausedAt)}</span>}
                      {r.flags.length > 0 && <span className="block text-[11px] text-accent-dark">{r.flags.join(", ")}</span>}
                    </td>
                    <td className="figures py-2 pr-3 text-right">{r.openedHour.toLocaleString("en-GB")}</td>
                    <td className="figures py-2 pr-3 text-right">{r.openedDay.toLocaleString("en-GB")}</td>
                    <td className="figures py-2 pr-3 text-right">{r.afterHours.toLocaleString("en-GB")}</td>
                    <td className="py-2 text-right text-muted">{when(r.lastAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <SentEmailsOld s={sent} />

      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">Who did what</h2>
        {d.audit.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing recorded yet. The log was created today, so it starts from here.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {d.audit.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-2 text-[12px] last:border-0"
              >
                <span>
                  <span className="text-muted">{AUDIT_KIND[a.kind] ?? a.kind}</span>{" "}
                  {a.actorEmail || "(unknown)"}
                  {a.subjectEmail ? ` → ${a.subjectEmail}` : ""}
                  {a.detail ? <span className="text-muted"> · {a.detail}</span> : null}
                </span>
                <span className="shrink-0 text-muted">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <SentEmailDrawerOld s={sent} />
    </>
  );
}
