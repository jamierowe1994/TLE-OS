"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "@/components/new-look/Parts";

/* The agent's case studies as tiles (James, 11 Nov 2026): on Settings > Your
   page, and on /case-studies. The office sees every agent's. Each one is
   started from a let home's three-dot menu, so there is no New button. */

type Row = { id: string; title: string; area: string; status: "draft" | "published"; agentName: string; photos: { url: string }[]; updatedAt: string; publishedAt: string | null; websiteUrl: string };

const when = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function CaseStudyList() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/case-studies", { cache: "no-store" })
      .then(async (r) => ({ r, d: (await r.json().catch(() => ({}))) as { ok?: boolean; caseStudies?: Row[]; error?: string } }))
      .then(({ r, d }) => (r.ok && d.caseStudies ? setRows(d.caseStudies) : setError(d.error ?? "Case studies couldn't be loaded.")))
      .catch(() => setError("Case studies couldn't be loaded. Check your connection and try again."));
  }, []);
  const agents = rows ? new Set(rows.map((r) => r.agentName).filter(Boolean)).size : 0;
  if (error) return <p className="cs-error" role="alert">{error}</p>;
  if (!rows) return <div className="cs-loading"><span className="cs-spin" aria-hidden /> Loading case studies…</div>;
  if (rows.length === 0) return <div className="nl-card cs-card cs-empty">No case studies yet. Open a let home on Portfolio, or a let listing, and choose Use as a case study from its three-dot menu.</div>;
  return (
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
  );
}
