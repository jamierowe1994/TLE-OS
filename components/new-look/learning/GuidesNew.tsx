"use client";

import { useEffect, useMemo, useState } from "react";
import { Mast } from "@/components/new-look/Parts";
import { BookMotif, coverPattern, TleMark } from "./Covers";
import { Back } from "./LearningHub";

/**
 * Tools > Learning > Guides (James, 26 Oct 2026): "an active library of all of
 * the docs that we've got on the backend... the top 10 guides and all of that
 * kind of stuff." Every file on Francesca's File Store that Steve has read
 * (GET /api/tools/learning/guides), live: a new upload is here once it is
 * read. Most Opened shows only when there are opens to count. Opening one goes
 * through /api/tools/learning/open, which writes it down.
 */

type Guide = { id: string; title: string; what: string; audience: "you" | "landlords" | "tenants"; region: "UK" | "England and Wales" | "Scotland"; file: string | null };
type Who = "all" | Guide["audience"];
type Where = "all" | "England and Wales" | "Scotland";

const WHO: { id: Who; label: string }[] = [
  { id: "all", label: "Everything" },
  { id: "you", label: "For you" },
  { id: "landlords", label: "For landlords" },
  { id: "tenants", label: "For tenants" },
];
const WHERE: { id: Where; label: string }[] = [
  { id: "all", label: "Everywhere" },
  { id: "England and Wales", label: "England and Wales" },
  { id: "Scotland", label: "Scotland" },
];
const AUDIENCE_WORD: Record<Guide["audience"], string> = { you: "For you", landlords: "For landlords", tenants: "For tenants" };
const first = (s: string) => (s.match(/^[\s\S]*?[.!?](\s|$)/)?.[0] ?? s).trim();

export default function GuidesNew() {
  const [d, setD] = useState<{ guides: Guide[]; top: { id: string; n: number }[] } | null | "error">(null);
  const [who, setWho] = useState<Who>("all");
  const [where, setWhere] = useState<Where>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    let gone = false;
    fetch("/api/tools/learning/guides", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => !gone && setD(j?.ok ? { guides: j.guides ?? [], top: j.top ?? [] } : "error"))
      .catch(() => !gone && setD("error"));
    return () => {
      gone = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (!d || d === "error") return [];
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return d.guides.filter(
      (g) =>
        (who === "all" || g.audience === who) &&
        (where === "all" || g.region === where || g.region === "UK") &&
        words.every((w) => `${g.title} ${g.what}`.toLowerCase().includes(w))
    );
  }, [d, who, where, q]);
  const top = d && d !== "error" ? d.top.map((t) => ({ g: d.guides.find((x) => x.id === t.id)!, n: t.n })).filter((t) => t.g) : [];
  const filtering = who !== "all" || where !== "all" || q.trim() !== "";

  return (
    <div data-look="new" className="nl-page nl-rise nl-lr">
      <Back href="/tools/learning" label="Learning" />
      <Mast title="Guides" blurb="Every guide, checklist and playbook we have, in one place. Open one to read it, or save it to send on." />

      {d === null ? (
        <p className="nl-lr-wait">
          <span className="nl-lr-spin" aria-hidden />
          Opening the library…
        </p>
      ) : d === "error" ? (
        <p className="nl-lr-bad">The guides couldn&apos;t be read just now. Try again in a minute.</p>
      ) : (
        <>
          <div className="nl-lr-bar">
            <label className="nl-lr-search">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden>
                <circle cx="11" cy="11" r="6.5" />
                <path d="M20 20l-4.2-4.2" />
              </svg>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${d.guides.length} guides`} aria-label="Search the guides" />
            </label>
            <div className="nl-lr-chips" role="group" aria-label="Who it is for">
              {WHO.map((c) => (
                <button key={c.id} type="button" aria-pressed={who === c.id} className="nl-lr-chip" onClick={() => setWho(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <div className="nl-lr-chips" role="group" aria-label="Where it applies">
              {WHERE.map((c) => (
                <button key={c.id} type="button" aria-pressed={where === c.id} className="nl-lr-chip" onClick={() => setWhere(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {!filtering && top.length > 0 && (
            <section className="nl-lr-sec">
              <h2 className="nl-section-title">Most Opened</h2>
              <ol className="nl-lr-top">
                {top.map(({ g, n }, i) => (
                  <li key={g.id} style={{ animationDelay: `${60 + i * 50}ms` }}>
                    <a href={`/api/tools/learning/open?id=${g.id}`} target="_blank" rel="noreferrer">
                      <b>{i + 1}</b>
                      <span className="min-w-0">
                        <span className="nl-lr-top-name">{g.title}</span>
                        <span className="nl-meta">
                          {AUDIENCE_WORD[g.audience]} · opened {n} {n === 1 ? "time" : "times"}
                        </span>
                      </span>
                    </a>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="nl-lr-sec">
            <h2 className="nl-section-title">{filtering ? `${shown.length} ${shown.length === 1 ? "Guide" : "Guides"}` : "Every Guide"}</h2>
            {shown.length === 0 ? (
              <p className="nl-lr-none">Nothing matches that. Try fewer words, or Everything.</p>
            ) : (
              <div className="nl-lr-shelf">
                {shown.map((g, i) => (
                  <article key={g.id} className={`nl-lr-book is-${g.audience}`} style={{ animationDelay: `${Math.min(i, 12) * 35}ms` }}>
                    <a className="nl-lr-book-main" href={`/api/tools/learning/open?id=${g.id}`} target="_blank" rel="noreferrer">
                      <span className={`nl-lr-cover is-pat${coverPattern(g.id)}`} aria-hidden>
                        <TleMark />
                        <span className="nl-lr-cover-art">
                          <BookMotif audience={g.audience} />
                        </span>
                      </span>
                      <span className="nl-lr-tags">
                        <em>{AUDIENCE_WORD[g.audience]}</em>
                        {g.region !== "UK" && <em>{g.region}</em>}
                      </span>
                      <span className="nl-lr-book-name">{g.title}</span>
                      <span className="nl-lr-book-what">{first(g.what)}</span>
                    </a>
                    <span className="nl-lr-book-acts">
                      <a href={`/api/tools/learning/open?id=${g.id}`} target="_blank" rel="noreferrer" className="nl-lr-open">
                        Read it
                      </a>
                      <a href={`/api/tools/learning/open?id=${g.id}&save=1`} className="nl-link">
                        Save
                      </a>
                    </span>
                  </article>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
