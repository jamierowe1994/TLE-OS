"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Ico } from "@/components/new-look/Parts";

/* Automate Passport in the new look (25 Oct 2026, James): the same floating
   stage as the landlord and the portals. The title on the dark, a small box
   with what turning it on does, the reminder full size so it reads in one go,
   and the buttons floating apart across the bottom. Same calls as the old
   pop-up; ListingEnquiries owns them. */

const beat = (i: number) => ({ animationDelay: `${120 + i * 90}ms` });

export default function AutoPassportStage({
  home,
  reminder,
  note,
  busy,
  onBack,
  onToMe,
  onTurnOn,
}: {
  home?: string | null;
  reminder: { subject: string; html: string } | null;
  note: string | null;
  busy: boolean;
  onBack: () => void;
  onToMe: () => void;
  onTurnOn: () => void;
}) {
  const [shown, setShown] = useState(false);
  const [tall, setTall] = useState<number | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onBack();
    };
    window.addEventListener("keydown", onKey);
    const was = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      cancelAnimationFrame(t);
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = was;
    };
  }, [busy, onBack]);

  /* The email at its own height: no box to scroll inside, the stage scrolls as one page. */
  const fit = () => {
    const doc = frame.current?.contentDocument;
    if (!doc?.body) return;
    const h = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
    if (h > 0) setTall(h);
  };
  useEffect(() => {
    setTall(null);
  }, [reminder?.html]);
  useEffect(() => {
    const on = () => fit();
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div data-look="new" className="nl-po nl-ap" data-shown={shown} role="dialog" aria-modal="true" aria-label="Automate Passport" data-steve-never>
      <button type="button" className="nl-po-scrim" aria-label="Close" onClick={() => !busy && onBack()} />
      <div className="nl-po-card nl-ap-card">
        <div className="nl-po-head nl-po-in" style={{ animationDelay: "40ms" }}>
          <div className="min-w-0 flex-1">
            {home && <p className="nl-eyebrow">{home}</p>}
            <h2 className="nl-po-title">Automate Passport</h2>
            <p className="nl-ap-lede">For this home only. Turn it off here any time.</p>
          </div>
          <button type="button" className="nl-iconbtn" aria-label="Close" disabled={busy} onClick={onBack}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <section className="nl-ap-why nl-po-in" style={beat(1)} aria-label="What turning it on does">
          <div className="nl-ap-reason">
            <span className="nl-ap-ico"><Ico name="mail" size={15} /></span>
            <p>
              Every <b>new</b> enquiry from now on gets the passport within five minutes, from you. The same email as Send passports. Nobody who has already enquired is sent one.
            </p>
          </div>
          <div className="nl-ap-reason">
            <span className="nl-ap-ico"><Ico name="calendar" size={15} /></span>
            <p>
              If they haven&apos;t finished it a day later, <b>one</b> reminder goes, also from you. If they finish first, it doesn&apos;t.
            </p>
          </div>
        </section>

        <div className="nl-ap-mailhead nl-po-in" style={beat(2)}>
          <span className="nl-ap-kicker">The reminder</span>
          {reminder && (
            <span className="nl-ap-subject">
              Subject: <b>{reminder.subject}</b>
            </span>
          )}
        </div>
        {reminder ? (
          <div className="nl-ap-mail nl-po-in" style={beat(3)}>
            <iframe
              ref={frame}
              title="The passport reminder"
              srcDoc={reminder.html}
              // Same origin so its height can be read; still no scripts.
              sandbox="allow-same-origin"
              onLoad={fit}
              style={{ height: tall ?? 640 }}
            />
          </div>
        ) : (
          <p className="nl-po-wait nl-po-in" style={beat(3)}>
            <span className="nl-po-spin" aria-hidden />
            Getting the email ready…
          </p>
        )}
        {note && <p className="nl-ap-note nl-po-in">{note}</p>}
      </div>

      <div className="nl-ap-bar" role="group" aria-label="Automate Passport">
        <button type="button" className="nl-ap-btn is-back" aria-label="Back" disabled={busy} onClick={onBack}>
          <Ico name="back" size={15} />
          <span className="nl-ap-wide">Back</span>
        </button>
        <span className="nl-ap-bar-end">
          <button type="button" className="nl-ap-btn is-quiet" disabled={busy} onClick={onToMe}>
            <Ico name="mail" size={15} />
            <span>
              Send <span className="nl-ap-wide">the reminder </span>to me
            </span>
          </button>
          <button type="button" className="nl-ap-btn is-go" disabled={busy} onClick={onTurnOn}>
            {busy ? <span className="nl-ap-spin" aria-hidden /> : <Ico name="auto" size={15} />}
            {busy ? "One moment…" : "Turn on"}
          </button>
        </span>
      </div>
    </div>,
    document.body
  );
}
