"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import WorkspaceLoading from "@/components/WorkspaceLoading";
import PreTenancyHero from "@/components/pretenancy/Hero";
import { GREEN, RED, waited } from "@/components/compliance-desk/CheckRow";
import { useDesk } from "@/components/compliance-desk/useDesk";
import TodoCard from "@/components/compliance-desk/TodoCard";
import type { ChaseRow, TrackerBook } from "@/lib/compliance-tracker";

/**
 * Michael's first screen: his job, in the order he does it.
 *
 * James, 20 Sep 2026: "His main job is to make sure: 1. the properties are all
 * compliant, so anything that's overdue is massively important. 2. All of the
 * new files are onto the systems... verified and taken off the list. 3. All of
 * the agents are compliant." And then works orders, last.
 *
 * So: overdue is the one pink card and it is first. Then the two lists that
 * are waiting on him, then what is coming up and whether the agent has been
 * emailed about it, then the agents. Same frame and the same two colours as
 * Kirstie's dashboard - green is fine, red is late, nothing else is coloured.
 *
 * TWO READS, ON PURPOSE. His own lists are one query and arrive at once. The
 * property figures come from the compliance book, which walks REX and can take
 * a while on the first read of the day - so those cards say they are reading
 * rather than holding the whole page back, and say so plainly if they fail.
 * Nothing here is a second copy of a figure: every card opens the list it counts.
 */

type Tracker = TrackerBook & { ok: boolean; live: boolean; reason?: string; stale?: boolean; error?: string; chases?: { key: string; to: string; at: string }[] | null };

const card = "rounded-[22px] border border-line/70 bg-card";

function greeting(name: string): string {
  const h = new Date().getHours();
  const who = name ? `, ${name}` : "";
  if (h < 12) return `Good morning${who}`;
  if (h < 17) return `Good afternoon${who}`;
  return `Good evening${who}`;
}

function Head({ icon, title, sub, href, tone = "neutral" }: { icon: string; title: string; sub?: string; href?: string; tone?: "neutral" | "pink" }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone === "pink" ? "bg-white/80 text-[#9d4340]" : "bg-accent-soft text-accent-dark"}`}>
          <DoodleIcon name={icon} size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[17px] font-bold leading-tight">{title}</h2>
          {sub && <p className="mt-0.5 text-[12px] text-muted">{sub}</p>}
        </div>
      </div>
      {href && (
        <Link href={href} className="flex shrink-0 items-center gap-1 pt-1 text-[12px] font-semibold text-muted transition-colors hover:text-ink">
          View all <DoodleIcon name="trend-up" size={11} />
        </Link>
      )}
    </div>
  );
}

function Tag({ tone, children }: { tone: "green" | "red"; children: React.ReactNode }) {
  return <span className={`shrink-0 rounded-full px-3 py-1 text-[11.5px] font-semibold ${tone === "green" ? GREEN : RED}`}>{children}</span>;
}

function Row({ href, title, sub, right }: { href: string; title: string; sub: string; right: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl px-1 py-2.5 transition-colors hover:bg-page">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13.5px] font-medium">{title}</span>
          <span className="block truncate text-[12px] leading-snug text-muted">{sub}</span>
        </span>
        {right}
      </Link>
    </li>
  );
}

function AllClear({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-4 flex items-center gap-3">
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${GREEN}`}><span className="h-2 w-2 rounded-full bg-[#56634a]" /></span>
      <p className="text-[13px] text-muted">{children}</p>
    </div>
  );
}

/** While the compliance book is being read. Never a nought standing in for "not known yet". */
function Reading({ label }: { label: string }) {
  return (
    <div className="mt-4 flex items-center gap-3 text-[13px] text-muted" role="status">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" />
      {label}
    </div>
  );
}

const overdueWords = (r: ChaseRow) =>
  r.status === "expired" ? `Expired ${Math.abs(r.daysLeft ?? 0)} days` : r.daysLeft != null ? `Ran out ${Math.abs(r.daysLeft)} days ago` : "No record";

export default function ComplianceDashboard() {
  const { desk, error } = useDesk();
  const [book, setBook] = useState<Tracker | null>(null);
  const [bookError, setBookError] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    fetch("/api/compliance/tracker", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: Tracker) => {
        if (gone) return;
        if (j.ok === false) setBookError(j.error ?? "Could not read the compliance book.");
        else setBook(j);
      })
      .catch(() => !gone && setBookError("Could not read the compliance book."));
    return () => {
      gone = true;
    };
  }, []);

  if (!desk && !error) return <WorkspaceLoading />;

  /* A book with no homes in it is a failed read wearing a success code, and
     the card it would draw is "Nothing overdue" in green. That is the one
     thing this screen must never say by accident, so an empty book is an
     error here, whatever the route called it. */
  const emptyBook = Boolean(book && book.counts.properties === 0);
  const bookProblem = bookError ?? (emptyBook ? "The compliance book came back with no homes in it, which cannot be right." : null);

  const verify = desk?.verify ?? [];
  const works = desk?.works ?? [];
  const agents = desk?.agents ?? null;
  const overdue = book?.outstanding ?? [];
  const upcoming = book?.upcoming ?? [];
  const bookOk = book && !bookProblem ? book : null;
  const sent = book?.chases ? new Set(book.chases.map((c) => c.key)) : null;
  const notEmailed = sent ? upcoming.filter((r) => !sent.has(`${r.propertyId}:${r.cert}:${r.band}`)).length : null;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="space-y-5 pb-8">
      <PreTenancyHero eyebrow="Compliance" title={greeting(desk?.firstName ?? "")} blurb="What is overdue, what has come in for you to check, what is coming up, and where every agent stands.">
        <p className="flex items-center gap-2 text-[13.5px] text-ink"><DoodleIcon name="calendar" size={15} className="text-accent-dark" />{today}</p>
        {error && <p className="w-full text-[12.5px] text-[#9d4340]">{error}</p>}
        {book && !book.live && <p className="w-full text-[12.5px] text-[#9d4340]">Not live: {book.reason} Do not quote the property figures below.</p>}
      </PreTenancyHero>

      {/* ── overdue, to verify, works orders ── */}
      {/* minmax(0,1fr) on a phone: an implicit column grows to its longest
          truncated line and pushes the whole page sideways. */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-3">
        <section className="fade-up flex flex-col rounded-[22px] bg-accent-soft p-5" data-search>
          <Head
            icon="info"
            tone="pink"
            /* Expired and no-record are said apart. "311 overdue" on the live
               book is 42 that have run out and 269 we hold nothing for, and
               those are different mornings' work. */
            title={!bookOk ? "Overdue certificates" : overdue.length ? `${bookOk.counts.expired} expired, ${bookOk.counts.missing} with no record` : "Nothing overdue"}
            sub={bookOk ? `Across the ${bookOk.counts.properties} ${bookOk.counts.properties === 1 ? "home" : "homes"} we manage. Worst first.` : "Expired or missing, across every home we manage."}
          />
          {bookProblem ? (
            <p className="mt-4 rounded-xl bg-white/70 px-4 py-3 text-[13px] text-[#9d4340]">{bookProblem} No figure is shown rather than a wrong one.</p>
          ) : !book ? (
            <Reading label="Reading the compliance book. The first read of the day takes a while." />
          ) : overdue.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-xl bg-white/70 px-4 py-3">
              <span className={`flex h-8 w-8 items-center justify-center rounded-full ${GREEN}`}><span className="h-2 w-2 rounded-full bg-[#56634a]" /></span>
              <p className="text-[13px] text-ink/80">Every required certificate is in date.</p>
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-[#9d4340]/10">
              {overdue.slice(0, 5).map((r) => (
                <Row
                  key={`${r.propertyId}-${r.cert}`}
                  href="/compliance-desk/properties"
                  title={r.property}
                  sub={`${r.certLabel.replace(/\s+[—–]\s+/g, " - ")} · chase via ${r.agent ?? "no agent on record"}`}
                  right={<Tag tone="red">{overdueWords(r)}</Tag>}
                />
              ))}
            </ul>
          )}
          <Link href="/compliance-desk/properties" className="mt-auto inline-flex w-fit items-center gap-2 rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-white" style={{ marginTop: "1.25rem" }}>
            Open the chase list <DoodleIcon name="trend-up" size={13} className="invert" />
          </Link>
        </section>

        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="checklist" title={verify.length ? `${verify.length} to verify` : "To verify"} sub="Uploaded by an agent, a contractor or a landlord. Oldest first." href="/compliance-desk/verify" />
          {verify.length === 0 ? (
            <AllClear>Nothing waiting. Every document that has come in has been checked.</AllClear>
          ) : (
            <ul className="mt-3 divide-y divide-line/50">
              {verify.slice(0, 6).map((v) => {
                const w = waited(v.addedAt);
                return <Row key={`${v.kind}-${v.id}`} href="/compliance-desk/verify" title={`${v.what} - ${v.property}`} sub={`${v.door} · ${v.by}${v.queried ? " · queried" : ""}`} right={<Tag tone={w.days > 7 || v.queried ? "red" : "green"}>{w.label}</Tag>} />;
              })}
            </ul>
          )}
        </section>

        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="setting" title={works.length ? `${works.length} finished ${works.length === 1 ? "job" : "jobs"} to check` : "Works orders"} sub="Finished jobs and what they produced." href="/compliance-desk/works" />
          {works.length === 0 ? (
            <AllClear>Nothing waiting. Every finished job has been checked.</AllClear>
          ) : (
            <ul className="mt-3 divide-y divide-line/50">
              {works.slice(0, 6).map((o) => {
                const w = waited(o.completedAt);
                return <Row key={o.id} href="/compliance-desk/works" title={`#${o.ref} ${o.title}`} sub={`${o.property}${o.contractor ? ` · ${o.contractor}` : ""}`} right={<Tag tone={w.days > 3 || o.queried ? "red" : "green"}>{w.label}</Tag>} />;
              })}
            </ul>
          )}
        </section>
      </div>

      {/* ── his own list: the jobs for a person rather than a queue ── */}
      <TodoCard />

      {/* ── coming up, and the agents ── */}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="clock" title="Coming up for renewal" sub="Inside 30 days. The reminder goes to the agent, who speaks to their landlord." href="/compliance-desk/properties" />
          {bookProblem ? (
            <p className="mt-4 text-[13px] text-[#9d4340]">{bookProblem} No figure is shown rather than a wrong one.</p>
          ) : !book ? (
            <Reading label="Reading the compliance book." />
          ) : (
            <>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {([["7 days", book.counts.band7], ["14 days", book.counts.band14], ["30 days", book.counts.band30]] as const).map(([label, n]) => (
                  <div key={label} className="rounded-2xl bg-page px-4 py-3">
                    <p className="figures text-[24px] font-bold leading-none">{n}</p>
                    <p className="mt-1 text-[12px] text-muted">inside {label}</p>
                  </div>
                ))}
              </div>
              {upcoming.length > 0 && (
                <p className={`mt-3 rounded-xl px-3.5 py-2.5 text-[12.5px] ${notEmailed ? RED : GREEN}`}>
                  {notEmailed === null
                    ? "The send log could not be read, so this cannot say which agents have been emailed."
                    : notEmailed === 0
                      ? "Every one of these has had its reminder emailed to the agent."
                      : `${notEmailed} of ${upcoming.length} have not had a reminder emailed to the agent yet.`}
                </p>
              )}
              {upcoming.length === 0 ? (
                <AllClear>Nothing falls due in the next 30 days.</AllClear>
              ) : (
                <ul className="mt-2 divide-y divide-line/50">
                  {upcoming.slice(0, 6).map((r) => (
                    <Row
                      key={`${r.propertyId}-${r.cert}`}
                      href="/compliance-desk/properties"
                      title={r.property}
                      sub={`${r.certLabel.replace(/\s+[—–]\s+/g, " - ")} · ${r.agent ?? "no agent on record"}`}
                      right={<Tag tone={(r.daysLeft ?? 0) <= 7 ? "red" : "green"}>{r.daysLeft} days</Tag>}
                    />
                  ))}
                </ul>
              )}
            </>
          )}
        </section>

        <section className={`${card} fade-up p-5`} data-search>
          <Head icon="user" title="Agents" sub="Their own compliance: what each holds, and what you have seen." href="/compliance-desk/agents" />
          {!agents ? (
            <p className="mt-5 text-[13px] text-muted">{desk?.reason ?? "Not available here."}</p>
          ) : agents.total === 0 ? (
            <p className="mt-5 text-[13px] text-muted">No agents have an account yet, so there is nobody to check.</p>
          ) : (
            <>
              <div className="mt-4 flex items-baseline gap-2">
                <span className="figures text-[34px] font-bold leading-none">{agents.total - agents.short}</span>
                <span className="text-[13px] text-muted">of {agents.total} agents fully compliant</span>
              </div>
              {agents.short === 0 ? (
                <AllClear>Every agent holds everything on your list, and you have seen it.</AllClear>
              ) : (
                <ul className="mt-2 divide-y divide-line/50">
                  {agents.names.slice(0, 6).map((a) => (
                    <Row key={a.userId} href="/compliance-desk/agents" title={a.name} sub="Missing, run out, or not yet seen by you" right={<Tag tone="red">{a.short} short</Tag>} />
                  ))}
                </ul>
              )}
              {agents.names.length > 6 && <p className="mt-2 text-[11.5px] text-muted">and {agents.names.length - 6} more.</p>}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
