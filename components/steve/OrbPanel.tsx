"use client";

import { useEffect, useState, type ReactNode } from "react";
import SteveFace from "@/components/SteveFace";
import { whenAgo } from "@/lib/lead-spine";

/**
 * Steve's chat card when he is the orb (lib/new-look "orb"), James 25 Oct
 * 2026, after the Intercom layout he liked: a Home with the coral filling the
 * top, "Chat with Steve" and the News James publishes (Admin > Newsroom),
 * each opening as a short article; Messages listing each conversation by
 * the question that started it, a conversation where he speaks first, and
 * Report. Three tabs along the bottom; the conversation hides them.
 *
 * Layout only. Everything that sends, attaches, renames or reports is
 * HelpDock's own and arrives here as nodes and callbacks, so the orb and the
 * old card can never disagree about what a press does.
 *
 * Styles: app/new-look/steve-panel.css (sv-*; so- is the slide-over drawers).
 */

export type OrbView = "home" | "chats" | "chat" | "report";
export interface OrbNews {
  id: string;
  title: string;
  body: string;
  kind: string;
  link: string;
  author: string;
  publishedAt: string;
}
export interface OrbThread {
  thread: string;
  title: string;
  lastAt: string;
}

function I({ d, size = 18 }: { d: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {d}
    </svg>
  );
}
const ICON = {
  close: <path d="M6 6l12 12M18 6L6 18" />,
  back: <path d="M15 5l-7 7 7 7" />,
  more: (
    <>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" />
    </>
  ),
  send: <path d="M5 12h14M13 6l6 6-6 6" />,
  home: <path d="M4 11l8-6 8 6v8a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  chats: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8l-4 3v-3H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM8 9.5h8M8 12.5h5" />,
  flag: <path d="M6 21V4M6 4h11l-2 4 2 4H6" />,
  expand: <path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7" />,
  shrink: <path d="M20 10h-6V4M4 14h6v6M14 10l7-7M10 14l-7 7" />,
};

/* The newsroom's kinds, in words: lib/news-store NEWS_KIND_LABEL, copied
   because that file reads the database and this one runs in the browser. */
const KIND: Record<string, string> = { announcement: "Announcement", release: "New in the OS", reminder: "Reminder" };
const kindLabel = (kind: string) => KIND[kind] ?? "News";

export default function OrbPanel(p: {
  aName: string;
  myFirst: string;
  view: OrbView;
  setView: (v: OrbView) => void;
  wide: boolean;
  setWide: (w: boolean) => void;
  menu: boolean;
  setMenu: (m: boolean) => void;
  opening: boolean;
  naming: boolean;
  namingView: ReactNode;
  onRename: () => void;
  threads: OrbThread[] | null;
  threadsFailed: boolean;
  onThreads: () => void;
  onStart: () => void;
  onOpenThread: (id: string) => void;
  onClose: () => void;
  onEscape: () => void;
  busy: boolean;
  /** The conversation, newest at the bottom, already drawn by HelpDock. */
  conversation: ReactNode;
  /** He is about to speak first: the dots before his hello. */
  greeting: boolean;
  composer: ReactNode;
  note: ReactNode;
  report: ReactNode;
  /** The newsroom's live posts, newest first; null while they load. */
  news: OrbNews[] | null;
  onNewsRead: () => void;
  scroller: (el: HTMLDivElement | null) => void;
}) {
  const { view } = p;
  /* A news article, opened from Home; any tab press closes it. */
  const [article, setArticle] = useState<OrbNews | null>(null);
  useEffect(() => setArticle(null), [view]);
  const tabs: { v: OrbView; label: string; icon: ReactNode }[] = [
    { v: "home", label: "Home", icon: ICON.home },
    { v: "chats", label: "Messages", icon: ICON.chats },
    { v: "report", label: "Report", icon: ICON.flag },
  ];
  const go = (v: OrbView) => {
    p.setMenu(false);
    setArticle(null);
    if (v === "chats") p.onThreads();
    p.setView(v);
  };

  const name = p.naming ? (
    <span className="sv-naming">{p.namingView}</span>
  ) : (
    <button type="button" onClick={p.onRename} title="Call him something else" className="sv-name">
      {p.aName}
    </button>
  );

  const menu = (
    <span className="sv-menu-wrap">
      <button type="button" className="sv-icon" aria-label="More" aria-expanded={p.menu} onClick={() => p.setMenu(!p.menu)}>
        <I d={ICON.more} />
      </button>
      {p.menu && (
        <span className="sv-menu" role="menu">
          <button type="button" role="menuitem" onClick={() => { p.setWide(!p.wide); p.setMenu(false); }}>
            <I d={p.wide ? ICON.shrink : ICON.expand} size={16} />
            {p.wide ? "Make the window smaller" : "Expand the window"}
          </button>
          <button type="button" role="menuitem" onClick={() => go("report")}>
            <I d={ICON.flag} size={16} />
            Report a problem
          </button>
        </span>
      )}
    </span>
  );

  return (
    <div
      data-hide-from-shot
      data-os-steve-bubble
      data-steve-dock
      data-look="new"
      role="dialog"
      aria-label={`Ask ${p.aName}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && !p.naming) {
          e.stopPropagation();
          p.onEscape();
        }
      }}
      className={`os-toast-lift sv-panel${p.wide ? " is-wide" : ""}${p.opening ? " is-opening" : ""}`}
    >
      <div className={`sv-card is-${view}`}>
        {view === "home" && article && (
          <div className="sv-article">
            <div className="sv-bar">
              <button type="button" className="sv-icon" aria-label="Back" onClick={() => setArticle(null)}>
                <I d={ICON.back} />
              </button>
              <h2>News</h2>
              <span className="sv-bar-r">
                <button type="button" onClick={p.onClose} aria-label="Close" className="sv-icon">
                  <I d={ICON.close} />
                </button>
              </span>
            </div>
            <div className="sv-body sv-article-body">
              <p className="sv-news-k">{kindLabel(article.kind)}</p>
              <h3 className="sv-article-h">{article.title}</h3>
              <p className="sv-article-by">
                {whenAgo(article.publishedAt)}
                {article.author ? ` · ${article.author}` : ""}
              </p>
              <div className="sv-article-text">{article.body}</div>
              {article.link && (
                <a href={article.link} className="sv-article-go" target={article.link.startsWith("/") ? undefined : "_blank"} rel="noreferrer">
                  Read more
                  <I d={ICON.send} size={15} />
                </a>
              )}
            </div>
          </div>
        )}

        {view === "home" && !article && (
          <div className="sv-home">
            <div className="sv-wash" aria-hidden />
            <div className="sv-top">
              <span className="sv-mark">OS</span>
              <span className="sv-top-r">
                {menu}
                <button type="button" onClick={p.onClose} aria-label="Close" className="sv-icon">
                  <I d={ICON.close} />
                </button>
              </span>
            </div>
            <div className="sv-hello">
              <p className="sv-hi">Hi{p.myFirst ? ` ${p.myFirst}` : ""}</p>
              <h2 className="sv-lead">If you need anything at all, let&apos;s chat.</h2>
            </div>
            <div className="sv-cards">
              <button type="button" className="sv-start" onClick={p.onStart}>
                <SteveFace size={34} mood="idle" track />
                <span className="sv-start-t">
                  <b>Chat with {p.aName}</b>
                  <span>Ask about the OS, your files or your day</span>
                </span>
                <I d={ICON.send} size={18} />
              </button>
            </div>
            <section className="sv-news" aria-labelledby="sv-news-h">
              <h3 id="sv-news-h">News</h3>
              {p.news === null ? (
                <p className="sv-empty is-tight"><span className="sv-spin" aria-hidden /> Reading the news…</p>
              ) : p.news.length === 0 ? (
                <p className="sv-empty is-tight">Nothing new just now.</p>
              ) : (
                <ul className="sv-news-list">
                  {p.news.slice(0, 4).map((n) => (
                    <li key={n.id}>
                      <button type="button" onClick={() => { setArticle(n); p.onNewsRead(); }}>
                        <span className="sv-news-k">{kindLabel(n.kind)}</span>
                        <span className="sv-news-t">{n.title}</span>
                        <span className="sv-news-w">{whenAgo(n.publishedAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {view === "chats" && (
          <div className="sv-chats">
            <div className="sv-bar is-centred">
              <h2>Messages</h2>
              <button type="button" onClick={p.onClose} aria-label="Close" className="sv-icon sv-bar-x">
                <I d={ICON.close} />
              </button>
            </div>
            <div className="sv-body">
              {p.threadsFailed ? (
                <p className="sv-empty">
                  Your conversations could not be read just now.{" "}
                  <button type="button" onClick={p.onThreads}>Try again</button>
                </p>
              ) : p.threads === null ? (
                <p className="sv-empty"><span className="sv-spin" aria-hidden /> Reading your conversations…</p>
              ) : p.threads.length === 0 ? (
                <p className="sv-empty">Nothing this week. Each conversation you start shows here for seven days.</p>
              ) : (
                <ul className="sv-list">
                  {p.threads.map((t) => (
                    <li key={t.thread}>
                      <button type="button" onClick={() => p.onOpenThread(t.thread)}>
                        <span className="sv-list-t">{t.title || "A file you sent"}</span>
                        <span className="sv-list-w">{whenAgo(t.lastAt)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button type="button" className="sv-float" onClick={p.onStart}>
              Chat with {p.aName}
              <I d={ICON.send} size={15} />
            </button>
          </div>
        )}

        {view === "chat" && (
          <div className="sv-chat">
            <div className="sv-bar">
              <button type="button" className="sv-icon" aria-label="Back" onClick={() => go("home")}>
                <I d={ICON.back} />
              </button>
              <SteveFace size={30} mood={p.busy || p.greeting ? "thinking" : "idle"} track />
              {name}
              <span className="sv-bar-r">
                {!p.naming && menu}
                <button type="button" onClick={p.onClose} aria-label="Close" className="sv-icon">
                  <I d={ICON.close} />
                </button>
              </span>
            </div>
            <div ref={p.scroller} className="sv-body sv-thread" aria-live="polite">
              {p.conversation}
              {p.greeting && (
                <p className="sv-typing" aria-label={`${p.aName} is typing`}>
                  <i />
                  <i />
                  <i />
                </p>
              )}
            </div>
            {p.note}
            <div className="sv-compose">{p.composer}</div>
          </div>
        )}

        {view === "report" && (
          <div className="sv-report">
            <div className="sv-bar is-centred">
              <h2>Report a Problem</h2>
              <button type="button" onClick={p.onClose} aria-label="Close" className="sv-icon sv-bar-x">
                <I d={ICON.close} />
              </button>
            </div>
            <div className="sv-body sv-report-body">{p.report}</div>
          </div>
        )}

        {view !== "chat" && (
          <nav className="sv-tabs" aria-label={`${p.aName}'s card`}>
            {tabs.map((t) => (
              <button key={t.v} type="button" onClick={() => go(t.v)} className={view === t.v ? "is-on" : ""} aria-current={view === t.v ? "page" : undefined}>
                <I d={t.icon} size={20} />
                <span>{t.label}</span>
              </button>
            ))}
          </nav>
        )}
      </div>
    </div>
  );
}
