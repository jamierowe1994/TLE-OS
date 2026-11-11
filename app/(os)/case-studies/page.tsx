"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Mast } from "@/components/new-look/Parts";

/* Case studies (James, 11 Nov 2026): the signed-in agent's own, everyone's
   for the office. Each one is started from a let home's three-dot menu,
   "Use as a case study", so there is no New button here. */

type Row = { id: string; title: string; area: string; status: "draft" | "published"; agentName: string; photos: { url: string }[]; updatedAt: string; publishedAt: string | null; websiteUrl: string };

const when = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function CaseStudies() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/case-studies", { cache: "no-store" })
      .then(async (r) => ({ r, d: (await r.json().catch(() => ({}))) as { ok?: boolean; caseStudies?: Row[]; error?: string } }))
      .then(({ r, d }) => (r.ok && d.caseStudies ? setRows(d.caseStudies) : setError(d.error ?? "Case studies couldn't be loaded.")))
      .catch(() => setError("Case studies couldn't be loaded. Check your connection and try again."));
  }, []);
  const agents = rows ? new Set(rows.map((r) => r.agentName).filter(Boolean)).size : 0;
  return (
    <div data-look="new" className="nl-page cs-list">
      <Mast
        eyebrow="Marketing"
        title="Case Studies"
        blurb="Homes you have let, written up for the website. They show on the case studies page and on your own page. To start one, open a let home and choose Use as a case study from its three-dot menu."
      />
      {error ? (
        <p className="cs-error" role="alert">{error}</p>
      ) : !rows ? (
        <div className="cs-loading"><span className="cs-spin" aria-hidden /> Loading case studies…</div>
      ) : rows.length === 0 ? (
        <div className="nl-card cs-card cs-empty">No case studies yet. Open a home on Portfolio, or a let listing, and choose Use as a case study from the three-dot menu.</div>
      ) : (
        <ul className="cs-grid">
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/case-studies/${r.id}`} className="cs-tile">
                <span className="cs-tile-img">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {r.photos[0] ? <img src={r.photos[0].url} alt="" loading="lazy" /> : null}
                </span>
                <span className="cs-tile-body">
                  <Badge tone={r.status === "published" ? "good" : "neutral"}>{r.status === "published" ? "On the website" : "Draft"}</Badge>
                  <b>{r.title}</b>
                  <span className="nl-meta">{[agents > 1 ? r.agentName : null, r.publishedAt ? `Published ${when(r.publishedAt)}` : `Edited ${when(r.updatedAt)}`].filter(Boolean).join(" · ")}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
