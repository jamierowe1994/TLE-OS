"use client";

import { useEffect, useState } from "react";
import DoodleIcon from "@/components/DoodleIcon";

/**
 * Personal and work calendars, side by side (Amrit's ticket, 14 Oct 2026:
 * "please can we try to sync calendars... personal & lettings"). Profile >
 * Connections, under Microsoft 365. Both read only, both opt-in, both off
 * until the person turns them on - see lib/personal-calendar.
 *
 *   1. Their OS diary in their personal calendar: a private subscribe link.
 *   2. Their personal calendar's busy times in the OS diary and the bookers.
 *
 * Neither writes to anybody's personal calendar.
 */

type Links = {
  feed: { on: boolean; madeAt: string | null; lastCollected: string | null };
  busy: { on: boolean; host: string | null; setAt: string | null; lastRead: string | null; error: string | null; count: number | null };
};

const when = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Europe/London" })
    : null;

const card = "rounded-2xl border border-line/70 bg-card p-4";
const title = "text-[14px] leading-snug";
const body = "mt-1 text-[12px] leading-relaxed text-muted";
const primary = "rounded-full bg-[var(--brown)] px-5 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";
const secondary = "rounded-full border border-line/80 px-4 py-2 text-[12.5px] font-semibold transition-colors hover:border-ink disabled:opacity-40";
const quiet = "text-[12px] text-muted underline underline-offset-2 hover:text-ink disabled:opacity-40";

function Spinner({ text }: { text: string }) {
  return (
    <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
      <span aria-hidden className="h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-line border-t-accent-dark" />
      {text}
    </p>
  );
}

export default function PersonalCalendar() {
  const [links, setLinks] = useState<Links | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  /** The subscribe link, only in the moment it is made: it is never stored. */
  const [made, setMade] = useState<{ link: string; webcal: string } | null>(null);
  const [busy, setBusy] = useState<"" | "feed" | "feed-off" | "busy" | "busy-off">("");
  const [said, setSaid] = useState<{ which: "feed" | "busy"; ok: boolean; text: string } | null>(null);
  const [url, setUrl] = useState("");
  const [editing, setEditing] = useState(false);
  const [howTo, setHowTo] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    fetch("/api/me/calendar", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (j?.ok) setLinks({ feed: j.feed, busy: j.busy });
        else {
          setLinks(null);
          setLoadError(j?.error ?? "Your calendar links couldn't be read.");
        }
      })
      .catch(() => {
        setLinks(null);
        setLoadError("Your calendar links couldn't be read.");
      });
  }, []);

  async function act(action: "feed" | "feed-off" | "busy" | "busy-off", extra: Record<string, string> = {}) {
    setBusy(action);
    setSaid(null);
    const j = await fetch("/api/me/calendar", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy("");
    const which = action.startsWith("feed") ? "feed" : "busy";
    if (!j?.ok) {
      setSaid({ which, ok: false, text: j?.error ?? "That didn't work. Try again in a moment." });
      return;
    }
    setLinks({ feed: j.feed, busy: j.busy });
    if (action === "feed") {
      setMade({ link: j.link, webcal: j.webcal });
      setConfirmReset(false);
    }
    if (action === "feed-off") {
      setMade(null);
      setSaid({ which, ok: true, text: "Stopped. Your personal calendar will drop the OS diary the next time it checks." });
    }
    if (action === "busy") {
      setEditing(false);
      setUrl("");
      setSaid({ which, ok: true, text: `Read it. ${j.upcoming === 1 ? "1 busy time" : `${j.upcoming} busy times`} coming up now show in your diary and when you book.` });
    }
    if (action === "busy-off") setSaid({ which, ok: true, text: "Stopped. Your personal busy times are no longer shown." });
  }

  const copy = () => {
    if (!made) return;
    void navigator.clipboard?.writeText(made.link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  if (links === undefined) {
    return (
      <div className={card}>
        <p className={title}>Your Personal Calendar</p>
        <Spinner text="Checking your calendar links…" />
      </div>
    );
  }
  if (links === null) {
    return (
      <div className={card}>
        <p className={title}>Your Personal Calendar</p>
        <p className="mt-2 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">{loadError}</p>
      </div>
    );
  }

  const feedSaid = said?.which === "feed" ? said : null;
  const busySaid = said?.which === "busy" ? said : null;
  const Said = ({ s }: { s: { ok: boolean; text: string } | null }) =>
    s ? <p className={`mt-2.5 rounded-xl px-3.5 py-2.5 text-[12px] ${s.ok ? "bg-[#f1f4ec] text-[#56634a]" : "bg-[#fdefec] text-[#9d4340]"}`}>{s.text}</p> : null;

  return (
    <>
      {/* ── 1. OUT: the OS diary, subscribed to by their personal calendar ── */}
      <div className={card} data-calendar-feed>
        <div className="flex items-start gap-3">
          <DoodleIcon name="calendar" size={18} className="mt-0.5 shrink-0 text-accent-dark" />
          <div className="min-w-0 flex-1">
            <p className={title}>Add My OS Diary to My Personal Calendar</p>
            <p className={body}>
              A private link your Google, Apple or Outlook calendar subscribes to. It shows your viewings, appraisals,
              inspections and appointments: the time, the address and what kind it is. No names, phone numbers or emails.
              It only goes one way - nothing in your personal calendar can change the OS.
            </p>
          </div>
        </div>

        {made ? (
          <div className="mt-3.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your link</p>
            <div className="mt-1.5 flex flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={made.link}
                onFocus={(e) => e.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-line/80 bg-white px-3.5 py-2.5 font-mono text-[11.5px] outline-none"
                aria-label="Your private calendar link"
              />
              <button type="button" onClick={copy} className={secondary}>
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-2">
              <a href={made.webcal} className={secondary}>Add to Apple Calendar</a>
              <a href={`https://calendar.google.com/calendar/r?cid=${encodeURIComponent(made.webcal)}`} target="_blank" rel="noreferrer" className={secondary}>
                Add to Google Calendar
              </a>
              <a
                href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(made.link)}&name=${encodeURIComponent("TLE OS diary")}`}
                target="_blank"
                rel="noreferrer"
                className={secondary}
              >
                Add to Outlook.com
              </a>
            </div>
            <p className="mt-2.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-accent-dark">
              <DoodleIcon name="lock" size={12} className="mt-0.5 shrink-0" />
              Shown this once and not kept, so add it now. Keep it to yourself: anybody with it can see your diary times. Lost it?
              Make a new one and the old one stops.
            </p>
            <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
              Personal calendars collect it on their own clock - usually within the hour, Google can take up to a day.
            </p>
          </div>
        ) : links.feed.on ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f5ec] px-2.5 py-1 text-[11px] font-semibold text-[#1e7a3c]">On</span>
            <span className="text-muted">
              Link made {when(links.feed.madeAt)}.{" "}
              {links.feed.lastCollected ? `Last collected by your calendar ${when(links.feed.lastCollected)}.` : "Not collected by a calendar yet."}
            </span>
          </p>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!links.feed.on ? (
            <button type="button" onClick={() => act("feed")} disabled={busy !== ""} className={primary}>
              {busy === "feed" ? "Making your link…" : "Make My Link"}
            </button>
          ) : confirmReset ? (
            <>
              <span className="text-[12px]">A new link stops the old one. Any calendar using it stops updating.</span>
              <button type="button" onClick={() => act("feed")} disabled={busy !== ""} className={primary}>
                {busy === "feed" ? "Making it…" : "Make a New Link"}
              </button>
              <button type="button" onClick={() => setConfirmReset(false)} className={quiet}>Keep the old one</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setConfirmReset(true)} disabled={busy !== ""} className={secondary}>
                Make a New Link
              </button>
              <button type="button" onClick={() => act("feed-off")} disabled={busy !== ""} className={quiet}>
                {busy === "feed-off" ? "Stopping…" : "Stop sharing my diary"}
              </button>
            </>
          )}
        </div>
        <Said s={feedSaid} />
      </div>

      {/* ── 2. IN: their personal calendar's busy times, without titles ── */}
      <div className={card} data-calendar-busy>
        <div className="flex items-start gap-3">
          <DoodleIcon name="clock" size={18} className="mt-0.5 shrink-0 text-accent-dark" />
          <div className="min-w-0 flex-1">
            <p className={title}>Show My Personal Calendar&apos;s Busy Times</p>
            <p className={body}>
              Your diary and the booking calendars show your personal plans as Busy (personal), so nothing gets booked over the
              school run. Only the times are read - never what the plans are - and the OS never writes to your personal calendar.
            </p>
          </div>
        </div>

        {links.busy.on && !editing ? (
          <>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
              {links.busy.error ? (
                <span className="inline-flex items-center rounded-full bg-[#fdf3dc] px-2.5 py-1 text-[11px] font-semibold text-[#8a5a00]">Not reading</span>
              ) : (
                <span className="inline-flex items-center rounded-full bg-[#e8f5ec] px-2.5 py-1 text-[11px] font-semibold text-[#1e7a3c]">On</span>
              )}
              <span className="text-muted">
                Reading {links.busy.host ?? "your calendar"}
                {links.busy.lastRead ? `, last read ${when(links.busy.lastRead)}` : ""}.
              </span>
            </p>
            {links.busy.error && <p className="mt-2 rounded-xl bg-[#fdefec] px-3.5 py-2.5 text-[12px] text-[#9d4340]">{links.busy.error}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => { setEditing(true); setSaid(null); }} disabled={busy !== ""} className={secondary}>
                Change the Address
              </button>
              <button type="button" onClick={() => act("busy-off")} disabled={busy !== ""} className={quiet}>
                {busy === "busy-off" ? "Stopping…" : "Stop showing them"}
              </button>
            </div>
          </>
        ) : (
          <form
            className="mt-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (url.trim()) void act("busy", { url: url.trim() });
            }}
          >
            <label className="block">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted">Your personal calendar&apos;s secret address</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://… or webcal://… ending in .ics"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                className="mt-1.5 w-full rounded-xl border border-line/80 bg-white px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-ink"
              />
            </label>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button type="submit" disabled={busy !== "" || !url.trim()} className={primary}>
                {busy === "busy" ? "Reading your calendar…" : "Show My Busy Times"}
              </button>
              {editing && (
                <button type="button" onClick={() => { setEditing(false); setUrl(""); }} className={quiet}>Cancel</button>
              )}
              <button type="button" onClick={() => setHowTo((v) => !v)} className={quiet}>
                {howTo ? "Hide where to find it" : "Where do I find it?"}
              </button>
            </div>
            {howTo && (
              <ul className="mt-3 space-y-2.5 rounded-xl border border-line/60 bg-white/70 p-3.5 text-[12px] leading-relaxed">
                <li>
                  <span className="font-semibold">Google Calendar</span>, on a computer: Settings, pick your calendar under Settings for my
                  calendars, then Integrate calendar. Copy <span className="font-semibold">Secret address in iCal format</span>.
                </li>
                <li>
                  <span className="font-semibold">Outlook.com or Hotmail</span>: Settings, Calendar, Shared calendars. Under Publish a
                  calendar pick your calendar and <span className="font-semibold">Can view when I&apos;m busy</span>, press Publish, and copy
                  the ICS link.
                </li>
                <li>
                  <span className="font-semibold">Apple iCloud</span>: in the Calendar app, press the share button by your calendar, turn
                  on <span className="font-semibold">Public Calendar</span> and copy the link. Anyone with that link can see the calendar, so
                  keep it to yourself.
                </li>
              </ul>
            )}
          </form>
        )}
        <Said s={busySaid} />
      </div>
    </>
  );
}
