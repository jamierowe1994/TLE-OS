"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { Pill } from "@/components/Wire";
import { ROLES, ROLE_LABEL } from "@/lib/roles";

/* Both role pickers on this screen used to be a hand-typed list of five
   options. It was already wrong before this change — `pretenancy` existed and
   was not offered, so the one person the role was created for could not be
   invited as it — and adding `marketing` would have made it wrong twice.
   Derived from ROLES now, so a role added in lib/roles.ts appears here. */
const ROLE_OPTIONS = ROLES.map((r) => (
  <option key={r} value={r}>
    {ROLE_LABEL[r]}
  </option>
));

/**
 * The pre-launch pilot.
 *
 * Three questions on one screen, because they are the same question asked
 * three ways: is this thing ready?
 *
 *   who is on it      — pick from REX, invite, watch them accept
 *   what do they use  — and, more usefully, what has nobody EVER opened
 *   what is broken    — straight from the button in their corner
 *
 * Adding somebody and emailing them are deliberately separate acts, so a list
 * can be built up over a week and fired in one go — and so a mis-click adds a
 * row rather than an email somebody has to be told to ignore.
 */

type Candidate = {
  rexId: string;
  name: string;
  email: string;
  invited: boolean;
  sentAt: string | null;
  hasAccount: boolean;
  /** What they were invited as. Null on invites made before roles existed. */
  role: string | null;
};
type Usage = { path: string; label: string; views: number; people: number; lastAt: string | null };
type Mailbox = {
  userId: string;
  name: string;
  email: string;
  role: string;
  connected: boolean;
  /** The mailbox they actually connected, which may not be their OS email. */
  mailbox: string | null;
  connectedAt: string | null;
  /** The other half of being able to send: without it there is no timeline. */
  rexLinked: boolean;
};
type Bug = {
  id: string;
  reporterEmail: string;
  body: string;
  path: string;
  kind: string;
  state: string;
  createdAt: string;
};

const when = (iso: string | null) =>
  !iso
    ? "—"
    : new Date(iso).toLocaleString("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });

export default function PreLaunch() {
  const [d, setD] = useState<{ candidates: Candidate[]; usage: Usage[]; bugs: Bug[] } | null>(null);
  const [denied, setDenied] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /* The generated link lives ONLY here, in the browser of the owner who asked
     for it. It is a credential for a day, so it is never put in the flash
     message, the URL or anywhere it could be shoulder-read off a shared
     screen without being asked for. */
  const [magic, setMagic] = useState<{ email: string; url: string } | null>(null);
  /* What each person will BE when they redeem, keyed by address.
     Held per row rather than as one setting because a pilot list is mixed —
     Susan runs the business, Kirstie is pre-tenancy, the partners are agents —
     and one shared dropdown would quietly apply the last choice to everybody. */
  const [roles, setRoles] = useState<Record<string, string>>({});

  /* Somebody who is not a lettings agent. The candidate list is built from
     REX, so marketing, ops and anyone at head office simply never appear in
     it — and the first person we actually wanted to invite, Francesca in
     marketing, could not be reached from this screen at all. The API already
     accepted any address; only the UI insisted on a roster. */
  /* Defaults to `agent`, the role that grants nothing, so a mis-click on a
     half-filled row cannot invite somebody as something. It used to default to
     `support` — which was the fullest role in the list after super_admin, and
     the one nobody was ever deliberately choosing. */
  const [manual, setManual] = useState({ name: "", email: "", role: "agent" });

  /* The screen as it looked when a report was filed. Fetched one at a time,
     on demand: every report carries a JPEG and pulling them all to draw a list
     of sentences would be most of a megabyte to read a paragraph. */
  const [shots, setShots] = useState<Record<string, string | null>>({});
  /* Mailboxes load separately from the pilot board: it is a different question
     with a different permission, and a slow Graph-backed list should not hold
     up the page that tells James who has found a bug. */
  const [mail, setMail] = useState<{ configured: boolean; people: Mailbox[] } | null>(null);

  async function loadShot(id: string) {
    if (id in shots) return;
    setShots((m) => ({ ...m, [id]: null }));
    const j = await fetch(`/api/admin/bug-shot?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    setShots((m) => ({ ...m, [id]: j?.shot ?? null }));
  }

  const loadMail = useCallback(() => {
    fetch("/api/admin/mailboxes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setMail(j?.ok ? { configured: j.configured, people: j.people } : null))
      .catch(() => {});
  }, []);
  useEffect(loadMail, [loadMail]);

  /* Connecting is a full-page trip to Microsoft and back — it cannot be an
     XHR, because consent is theirs to give in their own browser. */
  function connectMailbox() {
    window.location.href = "/api/auth/microsoft/start";
  }

  async function disconnectMailbox(userId: string, name: string) {
    if (!window.confirm(`Disconnect ${name}'s mailbox? Nothing will be able to send as them until they connect again.`)) return;
    setBusy(userId);
    const r = await fetch("/api/auth/microsoft/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(null);
    setFlash(r?.message ?? r?.error ?? "That didn't work.");
    loadMail();
  }

  const load = useCallback(() => {
    fetch("/api/admin/pilot")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("no"))))
      .then(setD)
      .catch(() => setDenied(true));
  }, []);
  useEffect(load, [load]);

  async function invite(c: Candidate, send: boolean) {
    setBusy(c.email);
    const r = await fetch("/api/admin/pilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: c.email, name: c.name, rexUserId: c.rexId,
        role: roles[c.email] ?? "agent", send,
      }),
    });
    const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Done.") : (j.error ?? "That didn't work."));
    load();
  }

  async function inviteManual(send: boolean) {
    const email = manual.email.trim();
    if (!email.includes("@")) return setFlash("That doesn't look like an email address.");
    setBusy(email);
    const r = await fetch("/api/admin/pilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email, name: manual.name.trim(), role: manual.role, send,
      }),
    });
    const j = (await r.json()) as { ok?: boolean; message?: string; error?: string };
    setBusy(null);
    setFlash(j.ok ? (j.message ?? "Done.") : (j.error ?? "That didn't work."));
    if (j.ok) setManual({ name: "", email: "", role: "agent" });
    load();
  }

  /**
   * A link to hand over, because our email is not arriving.
   *
   * Same one-time token the invite email would have carried. Copied to the
   * clipboard immediately, because the whole point is to paste it somewhere
   * that DOES reach them.
   */
  async function makeLink(c: Candidate) {
    setBusy(c.email);
    setMagic(null);
    const r = await fetch("/api/admin/pilot", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: c.email, name: c.name, rexUserId: c.rexId,
        role: roles[c.email] ?? "agent", link: true,
      }),
    });
    const j = (await r.json()) as { ok?: boolean; url?: string; error?: string };
    setBusy(null);
    if (!j.ok || !j.url) return setFlash(j.error ?? "Couldn't make a link.");
    setMagic({ email: c.email, url: j.url });
    try {
      await navigator.clipboard.writeText(j.url);
      setFlash(`Link copied. It works once and lasts 24 hours.`);
    } catch {
      // Clipboard refused (Safari without a user gesture, an insecure origin).
      // The link is on screen either way, so this is a nudge and not a failure.
      setFlash("Link ready below - copy it by hand.");
    }
    load();
  }

  async function setBug(id: string, state: string) {
    await fetch("/api/bugs", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id, state }),
    });
    load();
  }

  if (denied) {
    return (
      <div className="py-16 text-center">
        <p className="hand text-[20px]">Nothing here</p>
      </div>
    );
  }
  if (!d) return <p className="text-[12.5px] text-muted">Loading…</p>;

  const unused = d.usage.filter((u) => u.views === 0);
  const onPilot = d.candidates.filter((c) => c.invited);

  return (
    <>
      <PageHeader title="Pre-launch" blurb="Who's testing, what they use, and what they've found." />

      {flash && (
        <p className="fade-up mt-8 rounded-2xl border border-accent-dark/40 bg-accent-soft/40 p-4 text-[12.5px]">
          {flash}
        </p>
      )}

      <div className="fade-up mt-8 grid gap-3 sm:grid-cols-4">
        {(
          [
            ["On the pilot", onPilot.length],
            ["Signed up", d.candidates.filter((c) => c.hasAccount).length],
            ["Tabs never opened", unused.length],
            ["Open reports", d.bugs.length],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line/80 bg-panel p-4">
            <p className="text-[9.5px] font-bold uppercase tracking-wider text-muted">{k}</p>
            <p className="figures mt-1.5 text-[24px] leading-none">{v}</p>
          </div>
        ))}
      </div>

      {/* Seeing what a new starter sees, without spending a magic link.
          Every invite is single use, so the only way to review the joining
          flow used to be to burn one - or to make a throwaway account, which
          then sits in the roster forever. These two links replay the same
          screens against your own account. */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What a new starter sees</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          Replays the joining screens against your own account. Setting up again
          will not undo your REX or email connection, and running the walkthrough
          changes nothing at all.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href="/setup?replay=1"
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
          >
            Set up an account
          </a>
          <a
            href="/dashboard?tour=choose"
            className="rounded-full border border-line/80 px-3.5 py-1.5 text-[11.5px] transition-colors hover:border-ink/40"
          >
            Show me round
          </a>
        </div>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Who&apos;s on it</h2>
        <p className="mt-1 text-[11.5px] text-muted">
          Adding somebody doesn&apos;t email them. Send the invite when you&apos;re ready.
        </p>
        {magic && (
          <div className="mt-3.5 rounded-xl border border-accent-dark/40 bg-accent-soft/40 p-3.5">
            <p className="text-[12px]">
              <span className="font-semibold">Link for {magic.email}</span> - works once,
              expires in 24 hours. Send it however actually reaches them.
            </p>
            <p className="mt-2 break-all rounded-lg border border-line/70 bg-card px-3 py-2 font-mono text-[11px]">
              {magic.url}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(magic.url)}
                className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px]"
              >
                Copy again
              </button>
              <button
                type="button"
                onClick={() => setMagic(null)}
                className="text-[11px] font-semibold text-muted hover:text-ink"
              >
                Hide it
              </button>
            </div>
          </div>
        )}

        {/* Anyone not in REX. Same endpoint, same role rules, same one-time
            link — the roster is a convenience, not the gate. */}
        <div className="mt-3.5 rounded-xl border border-dashed border-line/70 p-3.5">
          <p className="text-[12px] font-semibold">Someone not on the roster</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            The list above comes from REX, so it is lettings agents only. Marketing, ops and
            head office are invited from here.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
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
              className="min-w-[220px] flex-[2] rounded-lg border border-line bg-card px-2.5 py-1.5 text-[12px] outline-none focus:border-accent"
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
              onClick={() => void inviteManual(false)}
              className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
            >
              Add
            </button>
            <button
              type="button"
              disabled={busy !== null || !manual.email.trim()}
              onClick={() => void inviteManual(true)}
              className="rounded-lg border border-accent-dark/50 px-3 py-1.5 text-[11.5px] font-semibold text-accent-dark disabled:opacity-40"
            >
              Add and send
            </button>
          </div>
        </div>

        <ul className="mt-3.5 space-y-2">
          {d.candidates.map((c) => (
            <li
              key={c.email}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line/70 p-3"
            >
              <span className="min-w-0">
                <span className="text-[13px]">{c.name}</span>
                <span className="ml-2 text-[11.5px] text-muted">{c.email}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {c.hasAccount ? (
                  <Pill tone="accent">Signed up</Pill>
                ) : c.sentAt ? (
                  <Pill tone="neutral">Invited {when(c.sentAt)}</Pill>
                ) : c.invited ? (
                  <Pill tone="neutral">On the list</Pill>
                ) : null}
                {!c.hasAccount && (
                  /* Chosen BEFORE the invite goes, because it takes effect the
                     moment they redeem. Setting it afterwards means somebody
                     has to remember, and the person who forgets finds out when
                     the MD opens the OS and can see nothing. */
                  <select
                    value={roles[c.email] ?? c.role ?? "agent"}
                    onChange={(e) => setRoles((r) => ({ ...r, [c.email]: e.target.value }))}
                    disabled={busy !== null}
                    title="What they can see once they join"
                    className="rounded-lg border border-line bg-card px-2 py-1.5 text-[11.5px] outline-none focus:border-accent disabled:opacity-40"
                  >
                    {ROLE_OPTIONS}
                  </select>
                )}
                {!c.hasAccount && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => invite(c, c.invited)}
                    className="rounded-lg border border-line/80 px-3 py-1.5 text-[11.5px] disabled:opacity-40"
                  >
                    {c.invited ? "Send invite" : "Add to pilot"}
                  </button>
                )}
                {!c.hasAccount && (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => makeLink(c)}
                    className="rounded-lg border border-accent-dark/50 px-3 py-1.5 text-[11.5px] font-semibold text-accent-dark disabled:opacity-40"
                  >
                    Copy link
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* ── EMAILS ─────────────────────────────────────────────────────────
          James, 30 Aug: show whether each person is connected, with a slider,
          so people can be walked through it one at a time.

          Two states are shown, not one. A connected mailbox says an email can
          LEAVE as them; the REX link says it will also land on the landlord's
          timeline where a colleague can see it. Showing only the first would
          read as ready when half the job is missing. */}
      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">Emails</h2>
        <p className="mt-1 max-w-[70ch] text-[11.5px] leading-relaxed text-muted">
          An email to a landlord goes from the agent&rsquo;s own Microsoft mailbox, so it sits in
          their Sent Items and the reply threads onto it. It is BCC&rsquo;d to their REX dropbox, so
          it still shows on the contact&rsquo;s timeline. Nothing sends as somebody who is not
          connected.
        </p>

        {mail && !mail.configured && (
          <p className="mt-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">
            Microsoft isn&rsquo;t configured on this environment yet — AZURE_CLIENT_ID,
            AZURE_TENANT_ID and AZURE_CLIENT_SECRET are all needed before anyone can connect.
          </p>
        )}

        <ul className="mt-3.5 space-y-1">
          {(mail?.people ?? []).map((p) => (
            <li
              key={p.userId}
              className="flex items-center justify-between gap-3 border-b border-line/40 py-2 text-[12px]"
            >
              <span className="min-w-0">
                <span className="block truncate">{p.name}</span>
                <span className="block truncate text-[11px] text-muted">
                  {p.connected ? p.mailbox : p.email}
                  {p.connected && !p.rexLinked && " · no REX link, so it would not reach the timeline"}
                  {!p.connected && " · not connected"}
                </span>
              </span>
              <button
                type="button"
                onClick={() => (p.connected ? disconnectMailbox(p.userId, p.name) : connectMailbox())}
                disabled={busy === p.userId || (mail ? !mail.configured : true)}
                title={
                  p.connected
                    ? "Disconnect this mailbox"
                    : "Only they can connect their own mailbox — this signs YOU in"
                }
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${
                  p.connected ? "bg-accent-dark" : "bg-line"
                }`}
                aria-pressed={p.connected}
                aria-label={p.connected ? `Disconnect ${p.name}` : `Connect ${p.name}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-page transition-all ${
                    p.connected ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </button>
            </li>
          ))}
          {mail && mail.people.length === 0 && (
            <li className="py-2 text-[12px] text-muted">Nobody has an account yet.</li>
          )}
        </ul>
        <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
          Connecting is personal: the slider signs YOU in to Microsoft. To set somebody else up,
          sit with them and have them press it on their own account. Turning it off only stops us
          sending as them — the permission stays on their Microsoft account until they remove it.
        </p>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What they actually use</h2>
        <p className="mt-1 text-[11.5px] leading-relaxed text-muted">
          The zeroes are the point. A tab nobody has opened is either a feature nobody needs or
          one nobody can find — and both are worth knowing before launch.
        </p>
        <ul className="mt-3.5 space-y-1">
          {d.usage.map((u) => (
            <li
              key={u.path}
              className="flex items-baseline justify-between gap-3 border-b border-line/40 py-1.5 text-[12px]"
            >
              <span className={u.views === 0 ? "text-accent-dark" : ""}>{u.label}</span>
              <span className="shrink-0 text-muted">
                {u.views === 0
                  ? "never opened"
                  : `${u.views} views · ${u.people} ${u.people === 1 ? "person" : "people"} · ${when(u.lastAt)}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fade-up mt-4 rounded-2xl border border-line/80 bg-panel p-5">
        <h2 className="text-[15px]">What they&apos;ve found</h2>
        {d.bugs.length === 0 ? (
          <p className="mt-2 text-[12.5px] text-muted">
            Nothing reported yet. Steve sits in the bottom-right of every screen; feedback given through him lands here.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {d.bugs.map((b) => (
              <li key={b.id} className="rounded-xl border border-line/70 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[12.5px]">
                    {/* Questions do NOT appear here — they go to the assistant
                        log, which is a different thing from a defect and has
                        its own screen. This list is what is broken. */}
                    <Pill tone={b.kind === "bug" ? "accent" : "neutral"}>{b.kind}</Pill>
                    <span className="ml-2 text-muted">
                      {b.reporterEmail} on {b.path || "—"}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] text-muted">{when(b.createdAt)}</span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">{b.body}</p>
                {/* What they were looking at. Not every report has one — it
                    only started being captured on 29 Aug, and a browser that
                    refuses to draw the canvas still files the words. */}
                {b.id in shots ? (
                  shots[b.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={shots[b.id]!}
                      alt={`Screen when ${b.reporterEmail} reported this`}
                      className="mt-2 w-full rounded-lg border border-line/70"
                    />
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">No picture with this one.</p>
                  )
                ) : (
                  <button
                    type="button"
                    onClick={() => void loadShot(b.id)}
                    className="mt-2 text-[11px] text-muted underline hover:text-ink"
                  >
                    See their screen
                  </button>
                )}

                <div className="mt-2 flex gap-2">
                  {(["ack", "fixed", "wontfix"] as const)
                    .filter((s) => s !== b.state)
                    .map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setBug(b.id, s)}
                        className="rounded-lg border border-line/80 px-2.5 py-1 text-[11px]"
                      >
                        {s === "ack" ? "Seen it" : s === "fixed" ? "Fixed" : "Won't fix"}
                      </button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
