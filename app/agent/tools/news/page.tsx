"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorLine, Sheet, Spinner, TopBar } from "../../bits";
import SlideTabs from "@/components/app/SlideTabs";

/**
 * NEWS (Tools, 3 Oct 2026): from the team (the OS's newsroom) and the
 * industry (Landlord Today), each industry story with "Write an Article"
 * that hands it to Steve, typed in and ready.
 */

type Post = { id: string; title: string; body: string; kind: string; author: string; publishedAt: string };
type Article = { title: string; link: string; at: string | null; blurb: string };

export default function NewsPage() {
  return (
    <main>
      <TopBar back="/agent/tools" />
      <h1 className="m-title mt-3 text-[34px] leading-tight">News</h1>
      <p className="mt-1 text-[14px] text-muted">From the team, and from the industry.</p>
      <News />
    </main>
  );
}

function News() {
  const [tab, setTab] = useState<"team" | "industry">("team");
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [articles, setArticles] = useState<{ source: string; items: Article[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<Post | null>(null);

  useEffect(() => {
    fetch("/api/news/posts", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; posts?: Post[] }) => setPosts(j.ok ? j.posts ?? [] : []))
      .catch(() => setPosts([]));
    fetch("/api/news", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; source?: string; items?: Article[]; error?: string }) => {
        if (!j.ok) throw new Error(j.error ?? "The industry news did not load.");
        setArticles({ source: j.source ?? "", items: j.items ?? [] });
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const write = (title: string, link: string, blurb: string) =>
    `/agent/steve?ask=${encodeURIComponent(`Write a short article for our landlords about this news, in our voice, UK English, no em dashes:\n\n${title}\n${blurb}\n${link}`)}`;

  return (
    <section className="mt-3">
      <div className="mb-3 flex items-center justify-between px-1">
        <span />
        <SlideTabs
          className="w-[210px]"
          height={32}
          textClass="text-[13.5px]"
          value={tab}
          onChange={setTab}
          options={[
            { id: "team" as const, label: "The Team" },
            { id: "industry" as const, label: "Industry" },
          ]}
        />
      </div>

      {tab === "team" ? (
        posts === null ? (
          <Spinner label="Loading the news" className="py-6" />
        ) : posts.length === 0 ? (
          <p className="rounded-[22px] px-4 py-4 text-[14px] text-muted" style={{ background: "var(--m-card)" }}>
            Nothing from the team just now.
          </p>
        ) : (
          <ul className="grid gap-2.5">
            {posts.slice(0, 12).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => setOpen(p)} className="m-press w-full rounded-[22px] px-4 py-3.5 text-left" style={{ background: "var(--m-card)" }}>
                  <span className="block text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--m-coral)" }}>
                    {p.kind} · {new Date(p.publishedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </span>
                  <span className="m-title mt-1 block text-[17px] leading-snug">{p.title}</span>
                  <span className="mt-1 line-clamp-2 block text-[13.5px] text-muted">{p.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )
      ) : error ? (
        <ErrorLine text={error} />
      ) : !articles ? (
        <Spinner label="Loading the news" className="py-6" />
      ) : (
        <ul className="grid gap-2.5">
          {articles.items.map((a) => (
            <li key={a.link} className="rounded-[22px] px-4 py-3.5" style={{ background: "var(--m-card)" }}>
              <span className="block text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
                {articles.source}
                {a.at ? ` · ${new Date(a.at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}` : ""}
              </span>
              <a href={a.link} target="_blank" rel="noreferrer" className="m-title mt-1 block text-[17px] leading-snug">
                {a.title}
              </a>
              {a.blurb && <span className="mt-1 line-clamp-2 block text-[13.5px] text-muted">{a.blurb}</span>}
              <span className="mt-3 flex gap-2">
                <a href={a.link} target="_blank" rel="noreferrer" className="m-btn m-press !h-9 !px-4 !text-[13.5px]">
                  Read
                </a>
                <Link href={write(a.title, a.link, a.blurb)} className="m-btn m-btn-primary m-press !h-9 !px-4 !text-[13.5px]">
                  Write an Article
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}

      {open && (
        <Sheet label={open.title} onClose={() => setOpen(null)}>
          <span className="block px-1 text-[12px] font-semibold uppercase tracking-[0.1em]" style={{ color: "var(--m-coral)" }}>
            {open.kind} · {open.author}
          </span>
          <h2 className="m-title mt-1 px-1 text-[24px] leading-tight">{open.title}</h2>
          <p className="mt-3 whitespace-pre-wrap px-1 text-[15px] leading-relaxed">{open.body}</p>
        </Sheet>
      )}
    </section>
  );
}
