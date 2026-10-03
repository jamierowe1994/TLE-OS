"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ErrorLine, Sheet, Spinner, TopBar } from "../bits";

/**
 * TOOLS (James, 3 Oct 2026): the useful little things. For now:
 *
 *   Focus Hour  an hour (or more) to get the work done. The app holds its own
 *               alerts except what landlords and tenants write (lib/push);
 *               on an iPhone, the agent's own "TLE Focus" Shortcut silences
 *               the phone too - no app may switch Focus on by itself, so this
 *               is a one-off setup they do, and the button runs it.
 *   News        from the team (the OS's newsroom) and the industry (Landlord
 *               Today), each with "Write an Article" that hands the story to
 *               Steve, typed in and ready.
 *
 * Invoices and the rest come later (James: "which we will come to").
 */

const SHORTCUT_KEY = "tle-focus-shortcut";
const SHORTCUT = "TLE Focus";

type Post = { id: string; title: string; body: string; kind: string; author: string; publishedAt: string };
type Article = { title: string; link: string; at: string | null; blurb: string };

export default function PhoneTools() {
  return (
    <main>
      <TopBar />
      <section className="relative -mx-4 mt-2 h-[268px] overflow-hidden px-4">
        <img
          src="/illustrations/app/townhouse.webp"
          alt=""
          className="pointer-events-none absolute -right-16 top-0 h-[262px] w-auto max-w-none select-none"
          style={{ maskImage: "linear-gradient(to left, #000 70%, transparent 100%)", WebkitMaskImage: "linear-gradient(to left, #000 70%, transparent 100%)" }}
        />
        <div className="relative w-[56%] pt-4">
          <h1 className="m-title text-[38px] leading-[1.04]">Tools</h1>
          <p className="mt-3 max-w-[170px] text-[14px] leading-snug text-muted">Focus, the news, and handy bits for the day.</p>
        </div>
      </section>
      <Focus />
      <News />
    </main>
  );
}

function Focus() {
  const [until, setUntil] = useState<string | null | undefined>(undefined);
  const [now, setNow] = useState(Date.now());
  const [mins, setMins] = useState(60);
  const [hasShortcut, setHasShortcut] = useState(false);
  const [setup, setSetup] = useState(false);
  const [iphone, setIphone] = useState(false);

  useEffect(() => {
    fetch("/api/m/focus", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { until?: string | null }) => setUntil(j.until ?? null))
      .catch(() => setUntil(null));
    setIphone(/iPhone|iPad/.test(navigator.userAgent));
    try {
      setHasShortcut(localStorage.getItem(SHORTCUT_KEY) === "1");
    } catch {
      /* Asked again next time. */
    }
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const left = until ? Math.max(0, new Date(until).getTime() - now) : 0;
  const running = left > 0;
  const total = mins * 60_000;
  const frac = running ? Math.min(1, left / total) : 1;
  const mm = Math.floor(left / 60_000);
  const ss = Math.floor((left % 60_000) / 1000);

  const start = async () => {
    const j = (await fetch("/api/m/focus", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mins }) })
      .then((r) => r.json())
      .catch(() => ({}))) as { until?: string };
    if (j.until) setUntil(j.until);
    /* Their own Shortcut silences the phone, if they set it up. */
    if (iphone && hasShortcut) window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT)}`;
  };
  const stop = async () => {
    await fetch("/api/m/focus", { method: "DELETE" }).catch(() => null);
    setUntil(null);
  };

  const R = 74;
  const C = 2 * Math.PI * R;

  return (
    <section className="relative z-[1] -mt-5 overflow-hidden rounded-[28px] p-5 text-white shadow-[0_18px_40px_-20px_rgba(150,70,50,0.7)]" style={{ background: "linear-gradient(160deg, #f2b496 0%, #e98a76 100%)" }}>
      <span className="text-[13px] font-semibold uppercase tracking-[0.12em] text-white/85">Focus Hour</span>
      <div className="mt-3 flex items-center gap-5">
        <svg viewBox="0 0 170 170" className="h-[150px] w-[150px] shrink-0" aria-hidden>
          <circle cx="85" cy="85" r={R} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth="10" />
          <circle cx="85" cy="85" r={R} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - frac)} transform="rotate(-90 85 85)" style={{ transition: "stroke-dashoffset 1s linear" }} />
          <text x="85" y="82" textAnchor="middle" fill="#fff" fontSize="34" fontWeight="700" fontFamily="var(--font-bricolage), sans-serif">
            {running ? `${mm}:${String(ss).padStart(2, "0")}` : `${mins}`}
          </text>
          <text x="85" y="108" textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize="14">
            {running ? "left" : "minutes"}
          </text>
        </svg>
        <div className="min-w-0 flex-1">
          <p className="m-title text-[22px] leading-tight">{running ? "Heads Down" : "Get It Done"}</p>
          <p className="mt-1 text-[13.5px] leading-snug text-white/90">
            {running ? "Alerts are held till it ends. Landlords and tenants still get through." : "Your alerts wait for you. Landlords and tenants still get through."}
          </p>
        </div>
      </div>

      {until === undefined ? null : running ? (
        <button type="button" onClick={stop} className="mt-4 h-[52px] w-full rounded-full text-[15.5px] font-semibold" style={{ background: "rgba(255,255,255,0.22)" }}>
          End Early
        </button>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-4 gap-1.5">
            {[30, 60, 90, 120].map((m) => (
              <button key={m} type="button" onClick={() => setMins(m)} aria-pressed={mins === m} className="h-10 rounded-full text-[14px] font-semibold" style={mins === m ? { background: "#fff", color: "var(--m-coral)" } : { background: "rgba(255,255,255,0.2)" }}>
                {m < 60 ? `${m}m` : `${m / 60}h`.replace(".5", "½")}
              </button>
            ))}
          </div>
          <button type="button" onClick={start} className="mt-3 h-[54px] w-full rounded-full text-[16px] font-semibold text-white shadow-[0_14px_26px_-12px_rgba(0,0,0,0.6)]" style={{ background: "#141210" }}>
            Start Focus
          </button>
        </>
      )}
      {iphone && (
        <button type="button" onClick={() => setSetup(true)} className="mt-3 w-full text-center text-[13.5px] font-semibold text-white/90 underline underline-offset-4">
          {hasShortcut ? "Silencing your phone: set up" : "Silence your phone too"}
        </button>
      )}

      {setup && (
        <Sheet label="Silence your phone" onClose={() => setSetup(false)}>
          <h2 className="m-title mb-1 px-1 text-[24px]">Silence Your Phone Too</h2>
          <p className="mb-4 px-1 text-[14px] leading-snug text-muted">An app can&apos;t switch Focus on by itself, so you make a Shortcut once and Start Focus runs it each time.</p>
          <ol className="m-group">
            {[
              "Open the Shortcuts app and tap +.",
              'Add the action "Set Focus". Choose Do Not Disturb, turned On, Until Time - 1 hour.',
              `Name the Shortcut "${SHORTCUT}" exactly, then tap Done.`,
              "In Settings > Focus > Do Not Disturb > People, allow your landlords' numbers (or a Favourites group) so they still ring.",
            ].map((s, i) => (
              <li key={i} className="m-row flex gap-3 px-4 py-3.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold text-white" style={{ background: "var(--m-coral)" }}>
                  {i + 1}
                </span>
                <span className="text-[14.5px] leading-snug">{s}</span>
              </li>
            ))}
          </ol>
          <button
            type="button"
            onClick={() => {
              try {
                localStorage.setItem(SHORTCUT_KEY, hasShortcut ? "0" : "1");
              } catch {
                /* Remembered for this visit only. */
              }
              setHasShortcut(!hasShortcut);
              setSetup(false);
            }}
            className="mt-4 h-[54px] w-full rounded-full text-[16px] font-semibold text-white"
            style={{ background: "#141210" }}
          >
            {hasShortcut ? "Stop Running My Shortcut" : "I've Made It - Run It With Focus"}
          </button>
        </Sheet>
      )}
    </section>
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
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between px-1">
        <h2 className="m-title text-[22px]">News</h2>
        <div className="flex gap-1 rounded-full p-1" style={{ background: "var(--m-card)" }}>
          {(["team", "industry"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t} className="h-8 rounded-full px-3.5 text-[13.5px] font-medium" style={tab === t ? { background: "var(--m-pink-wash)", color: "var(--m-coral)" } : undefined}>
              {t === "team" ? "The Team" : "Industry"}
            </button>
          ))}
        </div>
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
