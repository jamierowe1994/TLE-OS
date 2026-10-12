"use client";

import { useEffect, useState } from "react";
import LineIcon from "@/components/LineIcon";

/**
 * Get Set for Launch - the pre-start checklist on the agent's own dashboard
 * (James, 12 Oct 2026): "a pre-start checklist so that it will tick off all of
 * the things that they need to do ... to make sure that they're live on the
 * system".
 *
 * Every tick is read live (/api/launch/ready): a photo on their account, a
 * REX session, a connected mailbox, the tour opened from here, and the
 * phone app opened (components/app/AppSeen). It goes away by itself once
 * all five are done, and can be put away sooner. Admin > Launch shows the
 * same for everybody, with setup as a sixth.
 */

type Ready = {
  ok: boolean;
  photo: boolean;
  rex: "live" | "lapsed" | "none";
  email: boolean;
  tour: boolean;
  app: boolean;
  dismissed: boolean;
  tourUrl: string;
};

export default function LaunchReady() {
  const [r, setR] = useState<Ready | null>(null);

  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch("/api/launch/ready", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((j: Ready | null) => { if (!gone && j?.ok) setR(j); })
        .catch(() => {});
    load();
    /* Back from Profile or Microsoft in another tab: tick what they just did. */
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { gone = true; window.removeEventListener("focus", onFocus); };
  }, []);

  if (!r || r.dismissed) return null;

  const items = [
    { key: "photo", icon: "user", label: "Add Your Photo", done: r.photo, href: "/profile", note: "So landlords and tenants see who you are" },
    {
      key: "rex", icon: "key", label: "Connect Your REX", done: r.rex === "live", href: "/profile?tab=connections",
      note: r.rex === "lapsed" ? "Your REX sign-in has lapsed - connect it again" : "Your own work, pulled through",
    },
    { key: "email", icon: "mail", label: "Connect Your Email", done: r.email, href: "/profile?tab=connections", note: "Emails go out in your name" },
    { key: "tour", icon: "rocket", label: "Take the Tour", done: r.tour, href: r.tourUrl, note: "See how it all fits together" },
    { key: "app", icon: "bell", label: "Get the Phone App", done: r.app, href: "/download", note: "Your day and your alerts, on your phone" },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;

  function put(body: Record<string, boolean>) {
    void fetch("/api/launch/ready", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  return (
    <section className="fade-up mb-4 rounded-[22px] border border-line/50 bg-white p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="hand text-[17px] leading-tight">Get Set for Launch</h2>
          <p className="mt-1 text-[11.5px] text-muted">
            {done} of {items.length} done. A few quick things so you&rsquo;re live on TLE OS.
          </p>
        </div>
        <button
          type="button"
          onClick={() => { put({ dismiss: true }); setR({ ...r, dismissed: true }); }}
          className="text-[11px] font-semibold text-muted hover:text-ink"
        >
          Hide for now
        </button>
      </div>

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line/50">
        <div className="h-full rounded-full bg-accent-dark transition-[width] duration-500" style={{ width: `${(done / items.length) * 100}%` }} />
      </div>

      <div className="mt-3.5 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {items.map((i) => {
          const external = i.key === "tour";
          return (
            <a
              key={i.key}
              href={i.href}
              target={external ? "_blank" : undefined}
              rel={external ? "noreferrer" : undefined}
              onClick={() => {
                if (i.key === "tour") { put({ tour: true }); setR({ ...r, tour: true }); }
              }}
              className={`flex min-w-0 items-start gap-3 rounded-xl border p-3 transition-colors ${
                i.done ? "border-line/50 bg-box/40" : "border-line/80 hover:border-ink/40"
              }`}
            >
              <span
                className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  i.done ? "bg-accent-dark text-page" : "bg-accent-soft/60 text-accent-dark"
                }`}
              >
                {i.done ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                ) : (
                  <LineIcon name={i.icon} size={15} />
                )}
              </span>
              <span className="min-w-0">
                <span className={`block text-[12.5px] ${i.done ? "text-muted line-through decoration-line" : ""}`}>{i.label}</span>
                <span className="block text-[11px] leading-snug text-muted">{i.done ? "Done" : i.note}</span>
              </span>
            </a>
          );
        })}
      </div>
    </section>
  );
}
