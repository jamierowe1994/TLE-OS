"use client";

import { useEffect, useState } from "react";
import { Sheet, TopBar } from "../../bits";

/**
 * FOCUS HOUR (Tools, 3 Oct 2026): an hour (or more) to get the work done.
 * The app holds its own alerts except what landlords and tenants write
 * (lib/push); on an iPhone the agent's own "TLE Focus" Shortcut silences the
 * phone too - no app may switch Focus on by itself, so it is a one-off
 * setup they do and Start Focus runs it.
 */

const SHORTCUT_KEY = "tle-focus-shortcut";
const SHORTCUT = "TLE Focus";

export default function FocusPage() {
  return (
    <main>
      <TopBar back="/agent/tools" />
      <h1 className="m-title mt-3 text-[34px] leading-tight">Focus Hour</h1>
      <p className="mt-1 text-[14px] text-muted">Heads down, alerts held, the important ones still get through.</p>
      <Focus />
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
    <section className="relative mt-3 overflow-hidden rounded-[28px] p-5 text-white shadow-[0_18px_40px_-20px_rgba(150,70,50,0.7)]" style={{ background: "linear-gradient(160deg, #f2b496 0%, #e98a76 100%)" }}>
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
