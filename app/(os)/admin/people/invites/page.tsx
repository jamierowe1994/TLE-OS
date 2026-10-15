"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import { ROLES, ROLE_LABEL } from "@/lib/roles";
import { londonDayOffset, londonHHMM } from "@/lib/london-time";
import PeopleTabs from "@/components/admin/PeopleTabs";
import MailboxesCard from "@/components/admin/MailboxesCard";

/**
 * Admin > People > Invites (15 Oct 2026). This was Admin > Launch (James,
 * 12 Oct 2026, for Wednesday 14 Oct): invite everybody at The Letting Experts
 * who has no account, in one press.
 *
 * After launch it is how a new starter is let in: untick anybody, add
 * anybody, pick roles, send to whoever has not had one yet; then watch who
 * signs up and how far each person is through the getting-set checklist.
 * lib/launch has the roster rules; app/api/admin/launch the sending.
 *
 * Pre-launch went the same day. Two of its cards live on here: what a new
 * starter sees (replaying the joining screens), and whose email is connected
 * (components/admin/MailboxesCard). Its roster was this page's list over
 * again, its usage list is Admin > Tracking, and its reports are Tickets.
 */

type Person = {
  email: string;
  name: string;
  emails: string[];
  rexId: string | null;
  role: string;
  sources: string[];
  custom: boolean;
  included: boolean;
  sendable: boolean;
  sentAt: string | null;
  lastError: string | null;
  linkExpiresAt: string | null;
};
type Ready = {
  photo: boolean;
  rex: "live" | "lapsed" | "none";
  email: boolean;
  setup: boolean;
  tour: boolean;
  app: { kind: "ios" | "homescreen" | "browser" | "alerts"; at: string } | null;
  lastSeenAt: string | null;
};

const APP_KIND: Record<string, string> = {
  ios: "the iPhone app",
  homescreen: "the app on their home screen",
  browser: "the app in a phone browser",
  alerts: "phone alerts on",
};
type On = { userId: string; name: string; email: string; role: string; createdAt: string | null; ready: Ready };
type Board = {
  ok: boolean;
  error?: string;
  toInvite: Person[];
  on: On[];
  launchedAt: string | null;
  tourUrl: string;
  linkDays: number;
};

const ROLE_OPTIONS = ROLES.map((r) => (
  <option key={r} value={r}>
    {ROLE_LABEL[r]}
  </option>
));

const SOURCE_LABEL: Record<string, string> = {
  rex: "REX",
  hub: "Team Hub",
  website: "Website",
  added: "Added by you",
  invite: "Pilot invite",
  departed: "Team Hub says they've left",
};

/** "11:31 today", "11:31 tomorrow", or a date - London time. */
function at(iso: string): string {
  const d = londonDayOffset(iso);
  if (d === 0) return `${londonHHMM(iso)} today`;
  if (d === 1) return `${londonHHMM(iso)} tomorrow`;
  if (d === -1) return `${londonHHMM(iso)} yesterday`;
  return new Date(iso).toLocaleString("en-GB", {
    timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Photo, REX, email, setup, tour, phone app. */
const CHECKS = 6;

function readyCount(r: Ready): number {
  return [r.photo, r.rex === "live", r.email, r.setup, r.tour, Boolean(r.app)].filter(Boolean).length;
}

export default function InvitesPage() {
  const [d, setD] = useState<Board | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; failed: Array<{ name: string; error: string }> } | null>(null);
  const [preview, setPreview] = useState(false);
  const [manual, setManual] = useState({ name: "", email: "", role: "agent" });
  const [onlyNotReady, setOnlyNotReady] = useState(false);
  const [magic, setMagic] = useState<{ email: string; url: string } | null>(null);

  const load = useCallback(() => {
    fetch("/api/admin/launch", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "This page is for owners." : "The invite list didn't load.");
        return r.json() as Promise<Board>;
      })
      .then((j) => {
        if (!j.ok) throw new Error(j.error ?? "The invite list didn't load.");
        setD(j);
        setFailed(null);
      })
      .catch((e: Error) => setFailed(e.message));
  }, []);
  useEffect(load, [load]);
  /* On the day, sign-ups arrive while the page is open. */
  useEffect(() => {
    const t = setInterval(() => { if (!progress || progress.done === progress.total) load(); }, 60_000);
    return () => clearInterval(t);
  }, [load, progress]);

  async function post(body: Record<string, unknown>) {
    const r = await fetch("/api/admin/launch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    /* A 404 here is the route refusing somebody who is no longer signed in
       as an owner - a session that ran out mid-launch. Said as that. */
    if (r.status === 404 || r.status === 401) {
      return { ok: false, signedOut: true, error: "You've been signed out. Sign in again and press the button to send the rest." };
    }
    return (await r.json().catch(() => ({ ok: false, error: "That didn't work." }))) as {
      ok?: boolean; message?: string; error?: string; signedOut?: boolean;
    };
  }

  /* Ticks and roles show straight away and save behind. */
  function patch(email: string, change: Partial<Person>) {
    setD((b) => b && { ...b, toInvite: b.toInvite.map((p) => (p.email === email ? { ...p, ...change } : p)) });
  }
  async function toggle(p: Person, included: boolean) {
    patch(p.email, { included });
    const j = await post({ action: "toggle", email: p.email, name: p.name, included });
    if (!j.ok) { patch(p.email, { included: !included }); setFlash(j.error ?? "That didn't save."); }
  }
  async function setAll(included: boolean) {
    if (!d) return;
    const change = d.toInvite.filter((p) => !p.sentAt && p.sendable && p.included !== included);
    setD({ ...d, toInvite: d.toInvite.map((p) => (change.includes(p) ? { ...p, included } : p)) });
    for (const p of change) await post({ action: "toggle", email: p.email, name: p.name, included });
  }
  async function setRole(p: Person, role: string) {
    patch(p.email, { role });
    const j = await post({ action: "role", email: p.email, name: p.name, role });
    if (!j.ok) setFlash(j.error ?? "That didn't save.");
  }

  async function addManual() {
    const email = manual.email.trim();
    if (!email.includes("@")) return setFlash("That doesn't look like an email address.");
    setBusy("add");
    const j = await post({ action: "add", name: manual.name.trim(), email, role: manual.role });
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Added.") : (j.error ?? "That didn't work."));
    if (j.ok) setManual({ name: "", email: "", role: "agent" });
    load();
  }

  async function remove(p: Person) {
    setBusy(p.email);
    await post({ action: "remove", email: p.email });
    setBusy(null);
    load();
  }

  const queue = useMemo(
    () => (d?.toInvite ?? []).filter((p) => p.included && p.sendable && !p.sentAt),
    [d]
  );

  /**
   * The button. One person at a time, in turn, so the count can be watched
   * going up and one refusal cannot stop the rest. A short gap between each
   * keeps well inside the email service's rate limit.
   */
  async function launch() {
    setConfirming(false);
    const list = queue;
    const state = { done: 0, total: list.length, failed: [] as Array<{ name: string; error: string }> };
    setProgress({ ...state });
    for (const p of list) {
      const j = await post({ action: "send", email: p.email, name: p.name, role: p.role, rexId: p.rexId });
      /* Signed out: stop rather than fail everybody left. They stay "not
         invited yet", and the button offers to finish the job. */
      if (j.signedOut) {
        setProgress({ ...state, total: state.done, failed: [...state.failed] });
        setFlash(j.error ?? "You've been signed out.");
        return;
      }
      if (!j.ok) state.failed.push({ name: p.name, error: j.error ?? "Didn't send." });
      else patch(p.email, { sentAt: new Date().toISOString(), lastError: null });
      state.done += 1;
      setProgress({ ...state, failed: [...state.failed] });
      await sleep(450);
    }
    load();
  }

  async function resend(p: Person) {
    if (!window.confirm(`Send ${p.name} a fresh invite? Their earlier link stops working.`)) return;
    setBusy(p.email);
    const j = await post({ action: "send", email: p.email, name: p.name, role: p.role, rexId: p.rexId });
    setBusy(null);
    setFlash(j.ok ? `New invite sent to ${p.email}. The old link no longer works.` : (j.error ?? "That didn't send."));
    load();
  }

  /* A link to hand over, for when the email is stuck in quarantine. The same
     one-time join link (Pre-launch's Copy link), lasting 24 hours. */
  async function copyLink(p: Person) {
    setBusy(p.email);
    setMagic(null);
    const r = await fetch("/api/admin/pilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: p.email, name: p.name, rexUserId: p.rexId, role: p.role, link: true }),
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string };
    setBusy(null);
    if (!j.ok || !j.url) return setFlash(j.error ?? "Couldn't make a link.");
    setMagic({ email: p.email, url: j.url });
    try {
      await navigator.clipboard.writeText(j.url);
      setFlash("Link copied. It works once and lasts 24 hours; their emailed link no longer works.");
    } catch {
      setFlash("Link ready below - copy it by hand.");
    }
    load();
  }

  async function sendTest() {
    setBusy("test");
    const j = await post({ action: "test" });
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Test sent.") : (j.error ?? "That didn't send."));
  }

  if (failed && !d) {
    return (
      <div className="py-16 text-center">
        <p className="text-[13px] text-accent-dark">{failed}</p>
        <button type="button" onClick={load} className="mt-3 rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px]">
          Try again
        </button>
      </div>
    );
  }

  const sending = progress !== null && progress.done < progress.total;
  const invited = d ? d.toInvite.filter((p) => p.sentAt) : [];
  const fullyReady = d ? d.on.filter((o) => readyCount(o.ready) === CHECKS) : [];
  const onShown = d ? (onlyNotReady ? d.on.filter((o) => readyCount(o.ready) < CHECKS) : d.on) : [];

  return (
    <>
      <PageHeader
        illustration="/illustrations/people/team-spirit.svg"
        illustrationAspect={1.0}
        lineBreak="none"
        title="People"
        blurb="Invite new starters, then watch them get set up."
      />
      <PeopleTabs />

      {flash && (
        <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">{flash}</p>
      )}

      {!d ? (
        <div className="mt-8 flex items-center gap-2.5 text-[12.5px] text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden />
          Loading the invite list…
        </div>
      ) : (
        <>
          <div className="fade-up mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {(
              [
                ["Ready to invite", queue.length],
                ["Invited, not in yet", invited.length],
                ["On the OS", d.on.length],
                ["Fully set up", fullyReady.length],
                ["Using the phone app", d.on.filter((o) => o.ready.app).length],
              ] as const
            ).map(([k, v]) => (
              <div key={k} className="rounded-[22px] border border-line/50 bg-white p-4">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted">{k}</p>
                <p className="figures mt-1.5 text-[24px] leading-none">{v}</p>
              </div>
            ))}
          </div>

          {/* ── THE BUTTON ─────────────────────────────────────────────── */}
          <section className="fade-up mt-4 rounded-[22px] border border-accent-dark/30 bg-accent-soft/30 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-[60ch]">
                <h2 className="hand text-[19px] leading-tight">
                  {d.launchedAt ? "Invite New Starters" : "Launch TLE OS"}
                </h2>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {d.launchedAt
                    ? `Launched ${at(d.launchedAt)}. Anybody ticked below who hasn't had an invite yet goes with the button: their own welcome email, with a one-time link to set up their account and a link to the TLE OS tour.`
                    : "Sends everybody ticked below their own welcome email: a one-time link to set up their account, and a link to the TLE OS tour."}{" "}
                  Each link lasts {d.linkDays} days.
                </p>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {sending ? null : confirming ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void launch()}
                      className="rounded-full bg-accent-dark px-5 py-2.5 text-[13px] font-semibold text-page"
                    >
                      Yes, send {queue.length} invite{queue.length === 1 ? "" : "s"} now
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      className="rounded-full border border-line/80 bg-white px-4 py-2.5 text-[12px]"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={queue.length === 0 || busy !== null}
                    onClick={() => setConfirming(true)}
                    className="rounded-full bg-accent-dark px-6 py-2.5 text-[14px] font-semibold text-page transition-transform hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-40"
                  >
                    {queue.length === 0
                      ? "Nobody left to invite"
                      : d.launchedAt
                        ? `Send to the ${queue.length} not invited yet`
                        : `Launch: invite ${queue.length}`}
                  </button>
                )}
              </div>
            </div>

            {progress && (
              <div className="mt-4">
                <p className="text-[12px]">
                  {sending
                    ? `Sending ${progress.done + 1} of ${progress.total}… keep this page open.`
                    : `Done: ${progress.total - progress.failed.length} of ${progress.total} sent.`}
                </p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-white">
                  <div
                    className="h-full rounded-full bg-accent-dark transition-[width] duration-300"
                    style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
                  />
                </div>
                {progress.failed.length > 0 && (
                  <ul className="mt-2 space-y-0.5 text-[11.5px] text-accent-dark">
                    {progress.failed.map((f) => (
                      <li key={f.name}>{f.name}: {f.error}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-accent-dark/15 pt-3.5">
              <button
                type="button"
                onClick={() => setPreview((v) => !v)}
                className="rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[11.5px] hover:border-ink/40"
              >
                {preview ? "Hide the email" : "See the email"}
              </button>
              <button
                type="button"
                disabled={busy !== null}
                onClick={() => void sendTest()}
                className="rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[11.5px] hover:border-ink/40 disabled:opacity-40"
              >
                {busy === "test" ? "Sending…" : "Send me a test"}
              </button>
              <a
                href={d.tourUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-full border border-line/80 bg-white px-3.5 py-1.5 text-[11.5px] hover:border-ink/40"
              >
                Open the tour
              </a>
            </div>
            {preview && (
              <iframe
                title="The launch email"
                src="/api/admin/launch?preview=1"
                className="mt-3 h-[760px] w-full rounded-xl border border-line/60 bg-white"
              />
            )}
          </section>

          {magic && (
            <div className="mt-4 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3.5">
              <p className="text-[12px]">
                <span className="font-semibold">Link for {magic.email}</span> - works once, expires in 24 hours.
              </p>
              <p className="mt-2 break-all rounded-lg border border-line/70 bg-card px-3 py-2 font-mono text-[11px]">{magic.url}</p>
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => navigator.clipboard?.writeText(magic.url)} className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px]">
                  Copy again
                </button>
                <button type="button" onClick={() => setMagic(null)} className="text-[11px] font-semibold text-muted hover:text-ink">
                  Hide it
                </button>
              </div>
            </div>
          )}

          {/* ── WHO GETS ONE ───────────────────────────────────────────── */}
          <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="hand text-[17px] leading-tight">Who Gets an Invite</h2>
                <p className="mt-1 text-[11.5px] text-muted">
                  Everybody at The Letting Experts without an account, from REX, the Team Hub and the
                  website. Untick anybody you don&apos;t want on it.
                </p>
              </div>
              <span className="flex gap-3 text-[11px] font-semibold text-muted">
                <button type="button" onClick={() => void setAll(true)} className="hover:text-ink">Tick all</button>
                <button type="button" onClick={() => void setAll(false)} className="hover:text-ink">Untick all</button>
              </span>
            </div>

            <div className="mt-3.5 rounded-xl border border-dashed border-line/70 p-3.5">
              <p className="text-[12px] font-semibold">Add Someone</p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  value={manual.name}
                  onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
                  placeholder="Name"
                  className="min-w-[140px] flex-1 rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
                />
                <input
                  value={manual.email}
                  onChange={(e) => setManual((m) => ({ ...m, email: e.target.value }))}
                  placeholder="name@thelettingexperts.co.uk"
                  className="min-w-[200px] flex-[2] rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
                />
                <select
                  value={manual.role}
                  onChange={(e) => setManual((m) => ({ ...m, role: e.target.value }))}
                  className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11.5px] outline-none focus:border-accent"
                >
                  {ROLE_OPTIONS}
                </select>
                <button
                  type="button"
                  disabled={busy !== null || !manual.email.trim()}
                  onClick={() => void addManual()}
                  className="rounded-lg border border-accent-dark/50 px-3 py-1.5 text-[11.5px] font-semibold text-accent-dark disabled:opacity-40"
                >
                  Add to the list
                </button>
              </div>
            </div>

            {d.toInvite.length === 0 ? (
              <p className="mt-3.5 text-[12.5px] text-muted">Everybody has an account.</p>
            ) : (
              <ul className="mt-3.5 space-y-1.5">
                {d.toInvite.map((p) => {
                  const linkLive = p.linkExpiresAt && Date.parse(p.linkExpiresAt) > Date.now();
                  return (
                    <li
                      key={p.email}
                      className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3 ${
                        p.included && p.sendable ? "border-line/70" : "border-line/40 bg-box/30"
                      }`}
                    >
                      <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                        <input
                          type="checkbox"
                          checked={p.included && p.sendable}
                          disabled={!p.sendable || sending}
                          onChange={(e) => void toggle(p, e.target.checked)}
                          className="h-4 w-4 shrink-0 accent-[#a85a51]"
                        />
                        <span className="min-w-0">
                          <span className={`block text-[13px] ${p.included ? "" : "text-muted"}`}>{p.name}</span>
                          <span className="block truncate text-[11px] text-muted" title={p.emails.join(", ")}>
                            {p.email}
                            {p.sources.length > 0 && ` · ${p.sources.map((s) => SOURCE_LABEL[s] ?? s).join(", ")}`}
                          </span>
                        </span>
                      </label>
                      <span className="flex w-full flex-wrap items-center gap-2 pl-7 sm:w-auto sm:shrink-0 sm:pl-0">
                        {!p.sendable ? (
                          <span title="The OS only emails our own domains. Add them by hand on their TLE address.">
                            <Pill tone="accent">Can&apos;t email this address</Pill>
                          </span>
                        ) : p.lastError && !p.sentAt ? (
                          <span title={p.lastError}><Pill tone="accent">Didn&apos;t send</Pill></span>
                        ) : p.sentAt ? (
                          <span title={`Invite sent ${at(p.sentAt)}`}>
                            <Pill tone={linkLive ? "neutral" : "accent"}>
                              {linkLive ? `Invited · link live until ${at(p.linkExpiresAt as string)}` : "Invited · link expired"}
                            </Pill>
                          </span>
                        ) : null}
                        <select
                          value={p.role}
                          onChange={(e) => void setRole(p, e.target.value)}
                          disabled={sending}
                          title="What they can see once they join"
                          className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11.5px] outline-none focus:border-accent disabled:opacity-40"
                        >
                          {ROLE_OPTIONS}
                        </select>
                        {p.sentAt && (
                          <button
                            type="button"
                            disabled={busy !== null || sending}
                            onClick={() => void resend(p)}
                            className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                          >
                            Resend
                          </button>
                        )}
                        {p.sendable && (
                          <button
                            type="button"
                            disabled={busy !== null || sending}
                            onClick={() => void copyLink(p)}
                            title="A one-time link to send them yourself, if the email doesn't arrive"
                            className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                          >
                            Copy link
                          </button>
                        )}
                        {p.custom && !p.sentAt && (
                          <button
                            type="button"
                            disabled={busy !== null || sending}
                            onClick={() => void remove(p)}
                            className="text-[11px] font-semibold text-muted hover:text-ink disabled:opacity-40"
                          >
                            Remove
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── ALREADY ON: THE CHECKLIST ──────────────────────────────── */}
          <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <h2 className="hand text-[17px] leading-tight">Signed Up and Getting Set</h2>
                <p className="mt-1 text-[11.5px] text-muted">
                  Everybody with an account, and the six things that make them live: photo, REX,
                  email, setup, the tour and the phone app. Each one is also on their own dashboard
                  until it&apos;s done.
                </p>
              </div>
              <label className="flex items-center gap-2 text-[11.5px] text-muted">
                <input type="checkbox" checked={onlyNotReady} onChange={(e) => setOnlyNotReady(e.target.checked)} className="accent-[#a85a51]" />
                Only people not ready
              </label>
            </div>

            <ul className="mt-3.5 divide-y divide-line/40">
              {onShown.map((o) => {
                const n = readyCount(o.ready);
                const app = o.ready.app;
                const ticks: Array<[string, boolean, string?, string?]> = [
                  ["Photo", o.ready.photo],
                  ["REX", o.ready.rex === "live", o.ready.rex === "lapsed" ? "REX sign-in has lapsed" : undefined],
                  ["Email", o.ready.email],
                  ["Setup", o.ready.setup],
                  ["Tour", o.ready.tour],
                  ["App", Boolean(app), undefined, app ? `Phone app: ${APP_KIND[app.kind]}, last ${at(app.at)}` : "Phone app: not opened yet"],
                ];
                return (
                  <li key={o.userId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2.5">
                    <span className="min-w-0 flex-1 basis-[220px]">
                      <span className="block text-[13px]">{o.name}</span>
                      <span className="block truncate text-[11px] text-muted">
                        {ROLE_LABEL[o.role as keyof typeof ROLE_LABEL] ?? o.role}
                        {o.createdAt && ` · joined ${at(o.createdAt)}`}
                        {` · ${o.ready.lastSeenAt ? `last in ${at(o.ready.lastSeenAt)}` : "not been in yet"}`}
                        {app && app.kind !== "alerts" && ` · app ${at(app.at)}`}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      {ticks.map(([label, ok, why, hover]) => (
                        <span
                          key={label}
                          title={why ?? hover ?? (ok ? `${label}: done` : `${label}: not yet`)}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${
                            ok ? "bg-[#e8f5ec] text-[#1e7a3c]" : why ? "bg-accent-soft text-accent-dark" : "bg-page text-muted"
                          }`}
                        >
                          {ok ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <path d="m5 12.5 4.5 4.5L19 7.5" />
                            </svg>
                          ) : (
                            <span className="h-1.5 w-1.5 rounded-full bg-current opacity-50" aria-hidden />
                          )}
                          {label}
                        </span>
                      ))}
                      <span className={`ml-1 w-9 text-right text-[11.5px] tabular-nums ${n === CHECKS ? "text-[#1e7a3c]" : "text-muted"}`}>{n}/{CHECKS}</span>
                    </span>
                  </li>
                );
              })}
              {onShown.length === 0 && (
                <li className="py-2.5 text-[12px] text-muted">
                  {onlyNotReady ? "Everybody signed up is fully set." : "Nobody has an account yet."}
                </li>
              )}
            </ul>
          </section>
        </>
      )}

      {/* From Pre-launch (15 Oct 2026): seeing what a new starter sees,
          without spending a magic link. Every invite is single use, so these
          replay the same screens against your own account. */}
      <section className="fade-up mt-4 rounded-[22px] border border-line/50 bg-white p-5">
        <h2 className="hand text-[17px] leading-tight">What a New Starter Sees</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          Replays the joining screens against your own account. Setting up again will not undo your REX or email
          connection, and running the walkthrough changes nothing at all.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a href="/setup?replay=1" className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40">
            Set up an account
          </a>
          <a href="/dashboard?tour=choose" className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40">
            Show me round
          </a>
        </div>
      </section>

      <MailboxesCard />
    </>
  );
}
