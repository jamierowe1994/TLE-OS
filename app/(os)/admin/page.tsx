"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { loadAdmin, when, AUDIT_KIND, type AdminData } from "@/lib/admin-client";

/** The overview — the five numbers, and what needs doing about them. */
export default function AdminOverview() {
  const [d, setD] = useState<AdminData | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    loadAdmin().then((x) => (x ? setD(x) : setDenied(true)));
  }, []);

  if (denied) return <div className="py-16 text-center"><p className="hand text-[20px]">Nothing here</p></div>;
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;
  const s = d.summary;

  return (
    <>
      <PageHeader title="Admin" blurb="Who's set up, who's been in, what's connected, and what's left." />
      <div className="fade-up mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ["Staff in REX", s.staff, "/admin/people"],
          ["With accounts", s.withAccounts, "/admin/people"],
          ["Never signed in", s.neverSignedIn, "/admin/people"],
          ["No headshot", s.noPhoto, "/admin/people"],
          ["Not invited", s.notInvited, "/admin/people"],
        ] as const).map(([k, v, href]) => (
          <Link key={k} href={href} className="rounded-2xl border border-line/80 bg-panel p-4 transition-colors hover:border-ink">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</p>
            <p className="figures mt-1.5 text-[24px] leading-none">{v}</p>
          </Link>
        ))}
      </div>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px]">Latest activity</h2>
          <Link href="/admin/activity" className="text-[11.5px] text-muted underline">See all</Link>
        </div>
        {d.audit.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">Nothing recorded yet — the log starts from today.</p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {d.audit.slice(0, 8).map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line/40 py-1.5 text-[11.5px]">
                <span><span className="text-muted">{AUDIT_KIND[a.kind] ?? a.kind}</span> {a.actorEmail}{a.subjectEmail ? ` → ${a.subjectEmail}` : ""}</span>
                <span className="shrink-0 text-muted">{when(a.at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
