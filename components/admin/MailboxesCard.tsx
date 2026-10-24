"use client";

import { useCallback, useEffect, useState } from "react";
import { mailboxProblem } from "@/lib/mailbox-outcome";
import { useNewLook } from "@/lib/use-new-look";

/**
 * Whose Microsoft mailbox is connected (James, 30 Aug 2026: "show whether each
 * person is connected, with a slider, so people can be walked through it one
 * at a time").
 *
 * Moved here from Admin > Pre-launch on 15 Oct 2026, when Pre-launch went: it
 * is part of getting a new starter going, so it sits on People > Invites with
 * the rest of that.
 *
 * Two states are shown, not one. A connected mailbox says an email can LEAVE
 * as them; the REX link says it will also land on the landlord's timeline
 * where a colleague can see it. Showing only the first would read as ready
 * when half the job is missing.
 */

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

export default function MailboxesCard() {
  const [mail, setMail] = useState<{ configured: boolean; people: Mailbox[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  /* The new look (lib/new-look "admin", 24 Oct 2026): the same card, drawn in its kit. */
  const look = useNewLook("admin");

  /* Coming back from Microsoft: the outcome is said out loud once, then taken
     off the address so a refresh does not repeat it. */
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    const outcome = p.get("mail");
    if (!outcome) return;
    const problem = mailboxProblem(outcome);
    setFlash(problem ?? `Mailbox connected${p.get("as") ? ` as ${p.get("as")}` : ""}.`);
    p.delete("mail");
    p.delete("as");
    p.delete("detail");
    const rest = p.toString();
    window.history.replaceState({}, "", window.location.pathname + (rest ? `?${rest}` : ""));
  }, []);

  const load = useCallback(() => {
    fetch("/api/admin/mailboxes", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        if (!j?.ok) throw new Error("no");
        setMail({ configured: j.configured, people: j.people });
        setFailed(false);
      })
      .catch(() => setFailed(true));
  }, []);
  useEffect(load, [load]);

  /* A full-page trip to Microsoft and back: consent is theirs to give in their own browser. */
  function connect() {
    window.location.href = "/api/auth/microsoft/start?from=admin";
  }

  async function disconnect(userId: string, name: string) {
    if (!window.confirm(`Disconnect ${name}'s mailbox? Nothing will be able to send as them until they connect again.`)) return;
    setBusy(userId);
    const r = await fetch("/api/auth/microsoft/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    })
      .then((x) => x.json())
      .catch(() => null);
    setBusy(null);
    setFlash(r?.message ?? r?.error ?? "That didn't work.");
    load();
  }

  if (look) {
    return (
      <section id="mailboxes" className="nl-adm-block nl-adm-anchor">
        <div className="nl-adm-block-head">
          <div>
            <h2 className="nl-section-title">Email Connections</h2>
            <p className="nl-meta nl-adm-measure">
              An email to a landlord goes from the agent&rsquo;s own Microsoft mailbox, so it sits in their Sent Items and the reply threads onto it. It is BCC&rsquo;d to their REX dropbox, so it still shows on the contact&rsquo;s timeline. Nothing sends as somebody who is not connected.
            </p>
          </div>
        </div>

        {flash && (
          <p className="nl-adm-flash is-first" role="status">
            {flash}
          </p>
        )}
        {mail && !mail.configured && (
          <p className="nl-adm-flash is-warn is-first">
            Microsoft isn&rsquo;t configured on this environment yet - AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_CLIENT_SECRET are all needed before anyone can connect.
          </p>
        )}

        {failed ? (
          <div className="nl-adm-flash is-bad is-first" role="alert">
            <p>The connections couldn&rsquo;t be read just now.</p>
            <button type="button" onClick={load} className="nl-btn nl-btn--secondary nl-btn--sm">
              Try again
            </button>
          </div>
        ) : !mail ? (
          <p className="nl-adm-loading" role="status">
            <span className="nl-adm-spin" aria-hidden /> Reading who&rsquo;s connected…
          </p>
        ) : mail.people.length === 0 ? (
          <p className="nl-empty">Nobody has an account yet.</p>
        ) : (
          <ul className="nl-adm-people">
            {mail.people.map((p) => (
              <li key={p.userId} className="nl-adm-mailrow">
                <span>
                  <span className="nl-strong">{p.name}</span>
                  <span className="nl-meta">
                    {p.connected ? p.mailbox : p.email}
                    {p.connected && !p.rexLinked && " · no REX link, so it would not reach the timeline"}
                    {!p.connected && " · not connected"}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => (p.connected ? disconnect(p.userId, p.name) : connect())}
                  disabled={busy === p.userId || !mail.configured}
                  title={p.connected ? "Disconnect this mailbox" : "Only they can connect their own mailbox - this signs YOU in"}
                  className={`nl-switch${p.connected ? " is-on" : ""}`}
                  aria-pressed={p.connected}
                  aria-label={p.connected ? `Disconnect ${p.name}` : `Connect ${p.name}`}
                >
                  <i />
                </button>
              </li>
            ))}
          </ul>
        )}
        <p className="nl-meta nl-adm-foot">
          Connecting is personal: the slider signs YOU in to Microsoft. To set somebody else up, sit with them and have them press it on their own account. Turning it off only stops us sending as them - the permission stays on their Microsoft account until they remove it.
        </p>
      </section>
    );
  }

  return (
    <section id="mailboxes" className="fade-up mt-4 scroll-mt-6 rounded-[22px] border border-line/50 bg-white p-5">
      <h2 className="hand text-[17px] leading-tight">Email Connections</h2>
      <p className="mt-1 max-w-[70ch] text-[11.5px] leading-relaxed text-muted">
        An email to a landlord goes from the agent&rsquo;s own Microsoft mailbox, so it sits in their Sent Items and the reply
        threads onto it. It is BCC&rsquo;d to their REX dropbox, so it still shows on the contact&rsquo;s timeline. Nothing sends as
        somebody who is not connected.
      </p>

      {flash && <p className="mt-3 rounded-lg border border-accent-dark/40 bg-accent-soft/40 px-3 py-2 text-[12px]">{flash}</p>}

      {mail && !mail.configured && (
        <p className="mt-3 rounded-lg bg-accent-soft/60 px-3 py-2 text-[11.5px] text-accent-dark">
          Microsoft isn&rsquo;t configured on this environment yet - AZURE_CLIENT_ID, AZURE_TENANT_ID and AZURE_CLIENT_SECRET are all
          needed before anyone can connect.
        </p>
      )}

      {failed ? (
        <p className="mt-3 text-[12px] text-accent-dark" role="alert">
          The connections couldn&rsquo;t be read just now.{" "}
          <button type="button" onClick={load} className="underline">Try again</button>
        </p>
      ) : !mail ? (
        <p className="mt-3 flex items-center gap-2 text-[12px] text-muted">
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-line border-t-accent-dark" aria-hidden />
          Reading who&rsquo;s connected…
        </p>
      ) : (
        <ul className="mt-3.5 space-y-1">
          {mail.people.map((p) => (
            <li key={p.userId} className="flex items-center justify-between gap-3 border-b border-line/40 py-2 text-[12px]">
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
                onClick={() => (p.connected ? disconnect(p.userId, p.name) : connect())}
                disabled={busy === p.userId || !mail.configured}
                title={p.connected ? "Disconnect this mailbox" : "Only they can connect their own mailbox - this signs YOU in"}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40 ${p.connected ? "bg-accent-dark" : "bg-line"}`}
                aria-pressed={p.connected}
                aria-label={p.connected ? `Disconnect ${p.name}` : `Connect ${p.name}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-page transition-all ${p.connected ? "left-[22px]" : "left-0.5"}`} />
              </button>
            </li>
          ))}
          {mail.people.length === 0 && <li className="py-2 text-[12px] text-muted">Nobody has an account yet.</li>}
        </ul>
      )}
      <p className="mt-2 text-[10.5px] leading-relaxed text-muted">
        Connecting is personal: the slider signs YOU in to Microsoft. To set somebody else up, sit with them and have them press it on
        their own account. Turning it off only stops us sending as them - the permission stays on their Microsoft account until they
        remove it.
      </p>
    </section>
  );
}
