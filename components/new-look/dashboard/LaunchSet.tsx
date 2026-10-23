"use client";

import { useEffect, useState } from "react";
import { Ico } from "@/components/new-look/Parts";

/**
 * Get Set for Launch, in the new look: the design's folding bar with a ring.
 *
 * The same checklist as components/LaunchReady, off the same live read
 * (/api/launch/ready) and the same writes (the tour ticked when it is opened
 * from here, "Hide for now"). Gone by itself once all five are done or it has
 * been put away. Every tick is real; nothing here is ticked by pressing it,
 * except the tour, which is ticked by opening it - as before.
 *
 * The second step is worded the design's way ("Bring your book across"): agent
 * screens never name the system behind it.
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

export default function LaunchSet() {
  const [r, setR] = useState<Ready | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let gone = false;
    const load = () =>
      fetch("/api/launch/ready", { cache: "no-store" })
        .then((x) => (x.ok ? x.json() : null))
        .then((j: Ready | null) => { if (!gone && j?.ok) setR(j); })
        .catch(() => {});
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => { gone = true; window.removeEventListener("focus", onFocus); };
  }, []);

  if (!r || r.dismissed) return null;

  const items = [
    { key: "photo", label: "Add Your Photo", done: r.photo, href: "/profile", note: "So landlords and tenants see who you are" },
    {
      key: "rex", label: "Bring Your Book Across", done: r.rex === "live", href: "/profile?tab=connections",
      note: r.rex === "lapsed" ? "Your sign-in has lapsed - connect it again" : "Your own work, pulled through",
    },
    { key: "email", label: "Connect Your Email", done: r.email, href: "/profile?tab=connections", note: "Emails go out in your name" },
    { key: "tour", label: "Take the Tour", done: r.tour, href: r.tourUrl, note: "See how it all fits together" },
    { key: "app", label: "Get the Phone App", done: r.app, href: "/download", note: "Your day and your alerts, on your phone" },
  ];
  const done = items.filter((i) => i.done).length;
  if (done === items.length) return null;

  const put = (body: Record<string, boolean>) =>
    void fetch("/api/launch/ready", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});

  return (
    <section className={`nl-dash-launch${open ? " is-open" : ""}`}>
      <div className="nl-dash-launch-bar">
        <button type="button" className="nl-dash-launch-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <span className="nl-dash-ring" style={{ "--p": done / items.length } as React.CSSProperties} aria-hidden />
          <span className="nl-dash-launch-label">
            <span className="nl-dash-strong">Get Set for Launch</span>
            <span className="nl-meta"><span className="nl-dash-dotsep"> · </span>{done} of {items.length} done</span>
          </span>
          <span className="nl-dash-caret" aria-hidden>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </span>
        </button>
        <button type="button" className="nl-link nl-dash-hide" onClick={() => { put({ dismiss: true }); setR({ ...r, dismissed: true }); }}>
          Hide for now
        </button>
      </div>
      <div className={`nl-collapse${open ? " is-open" : ""}`}>
        <div>
          <div className="nl-dash-launch-grid">
            {items.map((i) => {
              const external = i.key === "tour";
              return (
                <a
                  key={i.key}
                  href={i.href}
                  tabIndex={open ? undefined : -1}
                  target={external ? "_blank" : undefined}
                  rel={external ? "noreferrer" : undefined}
                  onClick={() => {
                    if (i.key === "tour") { put({ tour: true }); setR({ ...r, tour: true }); }
                  }}
                  className={`nl-dash-task${i.done ? " is-done" : ""}`}
                >
                  <span className="nl-dash-tickmark" aria-hidden>{i.done && <Ico name="check" size={12} />}</span>
                  <span className="nl-dash-line-text">
                    <span className="nl-dash-strong">{i.label}</span>
                    <span className="nl-meta">{i.done ? "Done" : i.note}</span>
                  </span>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
