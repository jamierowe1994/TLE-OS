"use client";

import Link from "next/link";
import DoodleIcon from "@/components/DoodleIcon";
import PageHeader from "@/components/PageHeader";
import { SAGE_INK, SAGE_WASH } from "@/components/appraisal/NextUp";
import AdminLoadFailed from "@/components/AdminLoadFailed";
import { useAdmin, when, AUDIT_KIND } from "@/lib/admin-client";
import { useEffect, useState } from "react";
import LaunchClock from "@/components/admin/LaunchClock";

/**
 * The overview, in the same frame as every board in the OS (James, 12 Sep
 * 2026: "bring this into line"): the masthead, the staff census as a row of
 * tiles that go somewhere, then the latest activity beside the open tickets.
 *
 * James, 2 Oct 2026: the launch countdown - the team's flip clock - stands
 * where the illustration was; "What to focus on today" is gone, and Tickets
 * replaced To do. Every figure is the live census from /api/admin, and the
 * clock counts to 9am London on 14 October from the browser's own clock.
 */

const card = "rounded-[22px] border border-line/50 bg-white";
const eyebrow = "text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted";
type Ticket = { id: string; body: string; kind: string; state: string; reporterEmail: string; createdAt: string; priority: "A" | "B" | "C" | null };

/** The open tickets people raised, A first, for the card beside the activity.
    null while loading, undefined when this person cannot see tickets. */
function useOpenTickets(): Ticket[] | null | undefined {
  const [t, setT] = useState<Ticket[] | null | undefined>(null);
  useEffect(() => {
    let gone = false;
    fetch("/api/bugs", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { bugs?: Ticket[] }) => {
        if (gone) return;
        const open = (j.bugs ?? []).filter((b) => b.kind !== "auto" && (b.state === "open" || b.state === "ack"));
        open.sort((a, b) => (a.priority ?? "Z").localeCompare(b.priority ?? "Z") || b.createdAt.localeCompare(a.createdAt));
        setT(open);
      })
      .catch(() => !gone && setT(undefined));
    return () => {
      gone = true;
    };
  }, []);
  return t;
}

export default function AdminOverview() {
  const { d, denied, failed, load } = useAdmin();
  const tickets = useOpenTickets();

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

  return (
    <>
      <PageHeader
        title="Admin"
        blurb="Who's set up, who's been in, what's connected, and what's left before launch."
        illustrationNode={<LaunchClock size={30} />}
        illustrationHeight={118}
        illustrationAspect={3.6}
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

      {/* ── the latest activity, and the open tickets ── */}
      <div className={`mt-6 grid gap-4 ${tickets === undefined ? "" : "lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"}`}>
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

        {/* Tickets, where To do used to be (James, 2 Oct 2026). Hidden for
            anyone who cannot see tickets, rather than shown as a refusal. */}
        {tickets !== undefined && (
          <section className={`fade-up ${card} p-5`}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h3 className="hand flex items-center gap-2.5 text-[15px]">
                <DoodleIcon name="checklist" size={15} className="text-accent-dark" />
                Tickets
                {tickets && <span className="figures text-[12px] text-muted">{tickets.length} open</span>}
              </h3>
              <Link href="/admin/tickets" className="text-[11.5px] font-semibold text-accent-dark hover:underline">See all →</Link>
            </div>
            {!tickets ? (
              <p className="text-[12.5px] text-muted">Reading the tickets…</p>
            ) : tickets.length === 0 ? (
              <p className="text-[12.5px] text-muted">Nothing open. What people report through Steve lands here.</p>
            ) : (
              <ul className="divide-y divide-line/50">
                {tickets.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/tickets?open=${encodeURIComponent(t.id)}`} className="flex items-start gap-2.5 py-2.5 text-[12.5px] hover:text-accent-dark">
                      <span
                        className={`mt-0.5 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold ${
                          t.priority === "A" ? "bg-accent-dark text-white" : t.priority ? "bg-accent-soft text-accent-dark" : "border border-line text-muted"
                        }`}
                      >
                        {t.priority ?? "·"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="line-clamp-2 leading-snug">{t.body}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {(t.reporterEmail || "").split("@")[0].replace(/\./g, " ")} · {when(t.createdAt)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      {/* ── the other people's screens, one door each ── */}
      <section className="mt-6">
        <p className={eyebrow}>Views</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { href: "/company-figures", icon: "analytics", title: "Susan's view", sub: "The business figures, live." },
            { href: "/marketing-hub", icon: "megaphone", title: "Francesca's view", sub: "Marketing, the portals and the posts." },
            { href: "/pre-tenancy/dashboard", icon: "key", title: "Kirstie's view", sub: "Every let on its way to a move-in." },
            { href: "/compliance-desk", icon: "shield", title: "Michael's view", sub: "Certificates, new documents, agents and works orders." },
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
