"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Mast, Ico } from "@/components/new-look/Parts";
import { fetchMe } from "@/lib/me";
import { can } from "@/lib/roles";
import { AUDIT_KIND, when, type AdminData } from "@/lib/admin-client";
import { areasFor, isAreaId, type AdminArea } from "@/components/new-look/admin/areas";
import LeadsNotBackedUp from "@/components/LeadsNotBackedUp";

/**
 * Admin's home in the new look (lib/new-look "admin"): the design's Admin
 * Centre - four areas, each with an owner, a live figure and its tools - then
 * the team census, the latest activity and the open tickets the old overview
 * carried, so nothing it offered has gone.
 *
 * `/admin?area=<id>` is one area on its own with every tool listed (the
 * design's AdminSection), which is where "+N more" goes.
 */

export type AdminTicket = { id: string; body: string; kind: string; state: string; reporterEmail: string; createdAt: string; priority: "A" | "B" | "C" | null };

const Spin = () => <span className="nl-adm-spin" aria-label="Loading" />;

/** A figure for an area, live. null while it loads, undefined when there is nothing to show. */
type Stat = { n: React.ReactNode; says: string } | "loading" | "error" | undefined;

export default function AdminHomeNew({ d, tickets }: { d: AdminData | null; tickets: AdminTicket[] | null | undefined }) {
  return (
    <Suspense fallback={<Opening />}>
      <Home d={d} tickets={tickets} />
    </Suspense>
  );
}

function Opening() {
  return (
    <div data-look="new" className="nl-page">
      <p className="nl-adm-loading"><Spin /> Opening Admin…</p>
    </div>
  );
}

/** The PLC packs waiting on a check, for the Compliance area. Only asked of somebody who works the queue. */
function usePlcWaiting(role: string | null | undefined): number | "loading" | "error" | undefined {
  const [n, setN] = useState<number | "loading" | "error" | undefined>("loading");
  useEffect(() => {
    if (role === undefined) return;
    if (!can(role, "work:plc")) {
      setN(undefined);
      return;
    }
    let gone = false;
    fetch("/api/plc?queue=1", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j: { cases?: unknown[] }) => !gone && setN(Array.isArray(j.cases) ? j.cases.length : "error"))
      .catch(() => !gone && setN("error"));
    return () => {
      gone = true;
    };
  }, [role]);
  return n;
}

function Home({ d, tickets }: { d: AdminData | null; tickets: AdminTicket[] | null | undefined }) {
  const params = useSearchParams();
  const [role, setRole] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let gone = false;
    fetchMe()
      .then((j) => !gone && setRole(j?.role ?? null))
      .catch(() => !gone && setRole(null));
    return () => {
      gone = true;
    };
  }, []);
  const plc = usePlcWaiting(role);

  if (role === undefined) return <Opening />;
  const areas = areasFor(role);
  const wanted = params?.get("area");
  const area = isAreaId(wanted) ? areas.find((a) => a.id === wanted) : undefined;
  if (area) return <Area area={area} />;

  const s = d?.summary;
  const statFor = (a: AdminArea): Stat => {
    if (a.id === "overall") {
      if (!s) return "loading";
      return { n: s.withAccounts, says: `of ${s.staff} staff have an account` };
    }
    if (a.id === "compliance") {
      if (plc === undefined) return undefined;
      if (plc === "loading" || plc === "error") return plc;
      return { n: plc, says: plc === 1 ? "PLC pack waiting" : "PLC packs waiting" };
    }
    if (a.id === "systems") {
      if (tickets === undefined) return undefined;
      if (tickets === null) return "loading";
      return tickets.length === 0 ? { n: "All clear", says: "no tickets open" } : { n: tickets.length, says: tickets.length === 1 ? "ticket open" : "tickets open" };
    }
    return undefined;
  };

  const census = s
    ? [
        { label: "Staff in REX", n: s.staff, href: "/admin/people", says: "Everyone REX knows as a member of staff" },
        { label: "With accounts", n: s.withAccounts, href: "/admin/people", says: "Set up and able to sign in" },
        { label: "Never signed in", n: s.neverSignedIn, href: "/admin/people?filter=stale", says: "An account, but no visit yet" },
        { label: "No headshot", n: s.noPhoto, href: "/admin/people", says: "Blank where their photograph should be" },
        { label: "Not invited", n: s.notInvited, href: "/admin/people?filter=none", says: "In REX, no account, no invite sent" },
      ]
    : null;

  return (
    <div data-look="new" className="nl-page nl-rise nl-adm">
      <Mast eyebrow="Admin" title="Admin Centre" blurb="Each area has an owner. Who's set up, who's been in, and what they've reported." />

      {areas.length > 0 && (
        <div className="nl-adm-grid">
          {areas.map((a) => {
            const st = statFor(a);
            return (
              <section key={a.id} className="nl-adm-sec">
                <div className="nl-adm-sec-head">
                  <div className="min-w-0">
                    <h2 className="nl-adm-sec-title">{a.name}</h2>
                    <div className="nl-meta">{a.owner}</div>
                  </div>
                  {st !== undefined && (
                    <div className="nl-adm-stat">
                      {st === "loading" ? (
                        <Spin />
                      ) : st === "error" ? (
                        <span className="nl-meta">Couldn&apos;t read this just now</span>
                      ) : (
                        <>
                          <b>{st.n}</b>
                          <span className="nl-meta">{st.says}</span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <p className="nl-adm-blurb">{a.blurb}</p>
                <ul className="nl-adm-links">
                  {a.tools.slice(0, 4).map((t) => (
                    <li key={t.href}>
                      <Link href={t.href}>
                        <span className="nl-strong">{t.label}</span>
                        <span className="nl-meta">{t.says}</span>
                        <Ico name="arrow" size={14} />
                      </Link>
                    </li>
                  ))}
                  {a.tools.length > 4 && (
                    <li>
                      <Link href={`/admin?area=${a.id}`}>
                        <span className="nl-meta">
                          +{a.tools.length - 4} more in {a.name}
                        </span>
                        <span className="nl-adm-gap" />
                        <Ico name="arrow" size={14} />
                      </Link>
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {/* Leads added here that haven't reached REX (James, 24 Oct 2026). Nothing when there are none. */}
      <LeadsNotBackedUp look="new" />

      {/* The census the old overview opened with, each figure going to the people it counts. */}
      <section className="nl-adm-block">
        <div className="nl-adm-block-head">
          <h2 className="nl-section-title">The Team</h2>
          <Link href="/admin/people" className="nl-link">
            Everyone <Ico name="arrow" size={14} />
          </Link>
        </div>
        {!census ? (
          <p className="nl-adm-loading"><Spin /> Counting the team…</p>
        ) : (
          <ul className="nl-adm-census">
            {census.map((c) => (
              <li key={c.label}>
                <Link href={c.href} title={c.says}>
                  <b>{c.n}</b>
                  <span>{c.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className={`nl-adm-two${tickets === undefined ? " is-one" : ""}`}>
        <section className="nl-adm-block">
          <div className="nl-adm-block-head">
            <h2 className="nl-section-title">Latest Activity</h2>
            <Link href="/admin/activity" className="nl-link">
              See all <Ico name="arrow" size={14} />
            </Link>
          </div>
          {!d ? (
            <p className="nl-adm-loading"><Spin /> Reading the log…</p>
          ) : d.audit.length === 0 ? (
            <p className="nl-empty">Nothing recorded yet. The log starts from today.</p>
          ) : (
            <ul className="nl-adm-log">
              {d.audit.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <span aria-hidden className={`nl-adm-dot${a.kind === "sign_in_failed" ? " is-hot" : ""}`} />
                  <span className="min-w-0 flex-1">
                    <span className="nl-adm-muted">{AUDIT_KIND[a.kind] ?? a.kind.replace(/_/g, " ")}</span> {a.actorEmail}
                    {a.subjectEmail ? <span className="nl-adm-muted"> to {a.subjectEmail}</span> : null}
                  </span>
                  <span className="nl-mono">{when(a.at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Hidden for anyone who cannot see tickets, rather than shown as a refusal. */}
        {tickets !== undefined && (
          <section className="nl-adm-block">
            <div className="nl-adm-block-head">
              <h2 className="nl-section-title">
                Tickets {tickets && <span className="nl-count">{tickets.length} open</span>}
              </h2>
              <Link href="/admin/tickets" className="nl-link">
                See all <Ico name="arrow" size={14} />
              </Link>
            </div>
            {!tickets ? (
              <p className="nl-adm-loading"><Spin /> Reading the tickets…</p>
            ) : tickets.length === 0 ? (
              <p className="nl-empty">Nothing open. What people report through Steve lands here.</p>
            ) : (
              <ul className="nl-adm-log">
                {tickets.slice(0, 6).map((t) => (
                  <li key={t.id}>
                    <Link href={`/admin/tickets?open=${encodeURIComponent(t.id)}`} className="nl-adm-ticket">
                      <span className={`nl-adm-prio${t.priority === "A" ? " is-a" : t.priority ? " is-set" : ""}`}>{t.priority ?? "·"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="nl-adm-clamp">{t.body}</span>
                        <span className="nl-meta block">
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
    </div>
  );
}

/** One area with every tool in it (the design's AdminSection). */
function Area({ area }: { area: AdminArea }) {
  return (
    <div data-look="new" className="nl-page nl-rise nl-adm">
      <div className="nl-crumbs">
        <Link href="/admin" className="nl-crumb">
          <Ico name="back" size={14} /> Admin Centre
        </Link>
      </div>
      <Mast eyebrow={`Admin · ${area.owner}`} title={area.name} blurb={area.blurb} />
      <ul className="nl-adm-links is-big">
        {area.tools.map((t) => (
          <li key={t.href}>
            <Link href={t.href}>
              <span className="nl-strong">{t.label}</span>
              <span className="nl-meta">{t.says}</span>
              <Ico name="arrow" size={14} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
