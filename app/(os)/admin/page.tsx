"use client";

import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { SAGE_INK, SAGE_WASH } from "@/components/appraisal/NextUp";
import AdminLoadFailed from "@/components/AdminLoadFailed";
import { useAdmin, when, AUDIT_KIND } from "@/lib/admin-client";

/**
 * The overview, in the same frame as every board in the OS (James, 12 Sep
 * 2026: "bring this into line"): the masthead with a figure on the rule,
 * the numbers as a row of tiles that go somewhere, what to focus on today
 * as three doors and a sage nudge, then the latest activity beside the
 * to-do list in white cards with hand-drawn titles.
 *
 * Every figure is the live census from /api/admin; the launch countdown is
 * worked out against now() each time the page draws.
 */

const card = "rounded-[22px] border border-line/50 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
const LAUNCH = new Date("2026-10-14T00:00:00");
const PILOT = new Date("2026-09-21T00:00:00");

const daysTo = (d: Date) => Math.ceil((d.getTime() - Date.now()) / 86400000);

export default function AdminOverview() {
  const { d, denied, failed, load } = useAdmin();

  if (denied) return <div className="py-16 text-center"><p className="hand text-[20px]">Nothing here</p></div>;
  if (failed) return <AdminLoadFailed onRetry={load} />;

  const s = d?.summary;
  const tiles = [
    { label: "Staff in REX", n: s?.staff, icon: "user", href: "/admin/people", blurb: "Everyone REX knows as a member of staff" },
    { label: "With accounts", n: s?.withAccounts, icon: "key", href: "/admin/people", blurb: "Set up and able to sign in" },
    { label: "Never signed in", n: s?.neverSignedIn, icon: "clock", href: "/admin/people?filter=stale", blurb: "An account, but no visit yet" },
    { label: "No headshot", n: s?.noPhoto, icon: "doc", href: "/admin/people", blurb: "Blank where their photograph should be" },
    { label: "Not invited", n: s?.notInvited, icon: "mail", href: "/admin/people?filter=none", blurb: "In REX, no account, no invite sent" },
  ];
  const launchDays = daysTo(LAUNCH);
  const pilotDays = daysTo(PILOT);
  const openTodos = (d?.todos ?? []).filter((t) => t.state !== "done");

  return (
    <>
      <PageHeader
        title="Admin"
        blurb="Who's set up, who's been in, what's connected, and what's left before launch."
        illustration="/illustrations/people/team-spirit.svg"
        lineBreak="none"
      />

      {/* ── the census, as tiles that go somewhere ── */}
      <div className="fade-up mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {tiles.map((t) => (
          <Link key={t.label} href={t.href} title={t.blurb} className={`${card} group flex items-start gap-3 p-4 transition-colors hover:border-ink/40`}>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
              <DoodleIcon name={t.icon} size={15} />
            </span>
            <span className="min-w-0">
              <span className="figures block text-[26px] leading-none">{d ? t.n : "•"}</span>
              <span className="mt-1 block text-[12px] font-semibold leading-snug">{t.label}</span>
            </span>
          </Link>
        ))}
      </div>

      {/* ── what to focus on today ── */}
      <section className="mt-6">
        <h2 className="hand mb-3 text-[17px] leading-tight">What to focus on today</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { href: "/admin/people?filter=none", icon: "mail", n: s?.notInvited, title: "Invite the rest", sub: "In REX with no account. One link each, and they are in." },
            { href: "/admin/testing", icon: "checklist", n: null, title: "Walk the processes", sub: "Green is tested, amber is built and waiting for a person." },
            { href: "/admin/pre-launch", icon: "rocket", n: null, title: "Pre-launch", sub: "Who is testing, what they use, and what they have found." },
          ].map((f) => (
            <Link key={f.href} href={f.href} className={`fade-up flex items-start gap-3 ${card} p-4 text-left transition-colors hover:border-ink/40`}>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-dark">
                <DoodleIcon name={f.icon} size={15} />
              </span>
              <span className="min-w-0 flex-1">
                {f.n != null && <span className="figures block text-[24px] leading-none">{d ? f.n : "•"}</span>}
                <span className={`block text-[12.5px] font-semibold leading-snug ${f.n != null ? "mt-1" : ""}`}>{f.title}</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">{f.sub}</span>
              </span>
              <span className="mt-1 text-[13px] text-muted/70">›</span>
            </Link>
          ))}
          <div className="fade-up relative overflow-hidden rounded-[22px] p-4" style={{ background: SAGE_WASH }}>
            <span aria-hidden className="pointer-events-none absolute -bottom-16 -right-10 h-40 w-40 rounded-full bg-white/50" />
            <div className="relative flex h-full flex-col">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold" style={{ color: SAGE_INK }}>
                <DoodleIcon name="calendar" size={14} /> Launch, 14 October
              </p>
              <p className="figures mt-2 text-[30px] leading-none" style={{ color: SAGE_INK }}>
                {launchDays > 0 ? `${launchDays} day${launchDays === 1 ? "" : "s"}` : launchDays === 0 ? "Today" : "Live"}
              </p>
              <p className="mt-1 text-[11px] leading-snug text-muted">
                {pilotDays > 0 ? `Agents start testing in ${pilotDays} day${pilotDays === 1 ? "" : "s"}, on 21 September.` : "The pilot is under way. Agents are testing."}
              </p>
              <Link href="/admin/pre-launch" className="mt-auto inline-flex items-center gap-2 pt-3 text-[12px] font-semibold" style={{ color: SAGE_INK }}>
                The run-up <span aria-hidden>→</span>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── the latest activity, and what is still to build ── */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className={`fade-up ${card} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="hand flex items-center gap-2.5 text-[15px]">
              <DoodleIcon name="list" size={15} className="text-accent-dark" />
              Latest activity
            </h3>
            <Link href="/admin/activity" className="text-[11.5px] font-semibold text-accent-dark hover:underline">See all →</Link>
          </div>
          {!d ? (
            <p className="text-[12.5px] text-muted">Reading the log…</p>
          ) : d.audit.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nothing recorded yet. The log starts from today.</p>
          ) : (
            <ul className="divide-y divide-line/50">
              {d.audit.slice(0, 8).map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5 text-[12.5px]">
                  <span className="flex min-w-0 items-baseline gap-2">
                    <span aria-hidden className={`h-1.5 w-1.5 shrink-0 translate-y-[-2px] rounded-full ${a.kind === "sign_in_failed" ? "bg-accent-dark" : "bg-line"}`} />
                    <span className="min-w-0">
                      <span className="text-muted">{AUDIT_KIND[a.kind] ?? a.kind}</span> {a.actorEmail}
                      {a.subjectEmail ? <span className="text-muted"> → {a.subjectEmail}</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`fade-up ${card} p-5`}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="hand flex items-center gap-2.5 text-[15px]">
              <DoodleIcon name="checklist" size={15} className="text-accent-dark" />
              To do
              {d && <span className="figures text-[12px] text-muted">{openTodos.length}</span>}
            </h3>
            <Link href="/admin/todo" className="text-[11.5px] font-semibold text-accent-dark hover:underline">See all →</Link>
          </div>
          {!d ? (
            <p className="text-[12.5px] text-muted">Reading the list…</p>
          ) : openTodos.length === 0 ? (
            <p className="text-[12.5px] text-muted">Nothing on the list. Add the next thing on the To do page.</p>
          ) : (
            <ul className="divide-y divide-line/50">
              {openTodos.slice(0, 6).map((t) => (
                <li key={t.id} className="flex items-start gap-2.5 py-2.5 text-[12.5px]">
                  <span className={`mt-0.5 flex h-[16px] w-[16px] shrink-0 items-center justify-center rounded-full border-[1.5px] ${t.state === "doing" ? "border-accent-dark bg-accent-soft" : "border-line bg-white"}`} />
                  <span className="min-w-0">
                    <span className="block font-semibold leading-snug">{t.title}</span>
                    {t.detail && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{t.detail}</span>}
                  </span>
                  {t.state === "doing" && <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10.5px] font-semibold text-accent-dark">Doing</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ── the other people's screens, one door each ── */}
      <section className="mt-6">
        <p className={eyebrow}>Views</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          {[
            { href: "/company-figures", icon: "analytics", title: "Susan's view", sub: "The business figures, live." },
            { href: "/marketing-hub", icon: "megaphone", title: "Francesca's view", sub: "Marketing, the portals and the posts." },
            { href: "/pre-tenancy/dashboard", icon: "key", title: "Kirstie's view", sub: "Every let on its way to a move-in." },
          ].map((v) => (
            <Link key={v.href} href={v.href} className={`fade-up flex items-center gap-3 ${card} p-4 transition-colors hover:border-ink/40`}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: SAGE_WASH, color: SAGE_INK }}>
                <DoodleIcon name={v.icon} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold leading-snug">{v.title}</span>
                <span className="block text-[11.5px] text-muted">{v.sub}</span>
              </span>
              <span className="text-[13px] text-muted/70">›</span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
